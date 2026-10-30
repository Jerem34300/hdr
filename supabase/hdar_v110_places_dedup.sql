-- v110 : doublons de lieux (même endroit importé plusieurs fois, surtout les tronçons OSM de promenades/points de vue).
-- Règle : même nom (normalisé, ou l'un contient l'autre) ET moins de 100 m du lieu gardé.
-- On garde, dans l'ordre : partenaire > réclamé > créé à la main (non OSM) > le plus complet (photos, description, contact) > le plus ancien.
-- Rien n'est effacé : les doublons passent en status 'rejected' (cachés, et l'import OSM ne les recrée pas grâce à source_ref),
-- leurs avis/commentaires/messages/vidéos/annonces sont rattachés au lieu gardé, et tout est noté dans hdar.place_merges (réversible).
-- Les stations/métros/aéroports et les toilettes ne sont pas concernés.

create table if not exists hdar.place_merges (
  drop_id uuid primary key,
  keep_id uuid not null,
  dist_m int not null,
  prev_status text not null,
  at timestamptz not null default now()
);
alter table hdar.place_merges enable row level security;
revoke all on hdar.place_merges from anon, authenticated;

create or replace function hdar.place_norm(t text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(translate(coalesce(t, ''),
    'ÀÂÄÁÉÈÊËÎÏÍÔÖÓÙÛÜÚÇàâäáéèêëîïíôöóùûüúçœ''’-',
    'AAAAEEEEIIIOOOUUUUCaaaaeeeeiiiooouuuucoe   ')), '[^a-z0-9]+', '', 'g')
$$;

create or replace function hdar.places_dedup(p_radius_m int default 100, p_dry boolean default true)
returns table (keep_id uuid, keep_name text, drop_id uuid, drop_name text, dist_m int)
language plpgsql security definer set search_path = '' as $fn$
#variable_conflict use_column
declare k record;
begin
  create temp table if not exists _pd (id uuid primary key, name text, n text, lat float8, lng float8, cy int, cx int, score int, created timestamptz, gone boolean default false, kept boolean default false) on commit drop;
  truncate _pd;
  insert into _pd (id, name, n, lat, lng, cy, cx, score, created)
  select p.id, p.name, hdar.place_norm(p.name), p.lat, p.lng, floor(p.lat / 0.001)::int, floor(p.lng / 0.0015)::int,
         (case when p.partner then 1000 else 0 end) + (case when p.owner_id is not null or p.claimed_at is not null then 500 else 0 end)
       + (case when coalesce(p.source, '') <> 'osm' then 50 else 0 end) + least(coalesce(array_length(p.photos, 1), 0), 5) * 10
       + (case when length(coalesce(p.description, '')) > 0 then 5 else 0 end) + (case when p.website is not null or p.contact is not null then 3 else 0 end),
         p.created_at
  from hdar.places p
  where p.status = 'approved' and p.kind not in ('station', 'metro', 'bus', 'airport', 'toilets') and length(hdar.place_norm(p.name)) >= 3;
  create index if not exists _pd_cell on _pd (cy, cx);
  create temp table if not exists _pm (drop_id uuid primary key, keep_id uuid, dist_m int) on commit drop;
  truncate _pm;

  -- Gourmand : du meilleur au moins bon, chaque lieu gardé absorbe ses doublons proches (pas d'effet chaîne le long d'une rue).
  for k in
    select a.* from _pd a
    where exists (select 1 from _pd b where b.id <> a.id and b.cy between a.cy - 1 and a.cy + 1 and b.cx between a.cx - 1 and a.cx + 1
                    and (a.n = b.n or strpos(a.n, b.n) > 0 or strpos(b.n, a.n) > 0))
    order by a.score desc, a.created, a.id
  loop
    continue when (select gone from _pd where id = k.id);
    with c as (
      select b.id, round(111320 * sqrt((k.lat - b.lat) ^ 2 + ((k.lng - b.lng) * cos(radians(k.lat))) ^ 2))::int d
      from _pd b
      where b.id <> k.id and not b.gone and not b.kept and b.cy between k.cy - 1 and k.cy + 1 and b.cx between k.cx - 1 and k.cx + 1
        and (k.n = b.n or strpos(k.n, b.n) > 0 or strpos(b.n, k.n) > 0)
    ), ins as (
      insert into _pm select c.id, k.id, c.d from c where c.d < p_radius_m returning _pm.drop_id
    )
    update _pd set gone = true from ins where _pd.id = ins.drop_id;
    update _pd set kept = true where id = k.id;
  end loop;

  if not p_dry then
    insert into hdar.place_merges (drop_id, keep_id, dist_m, prev_status)
    select m.drop_id, m.keep_id, m.dist_m, p.status from _pm m join hdar.places p on p.id = m.drop_id
    on conflict (drop_id) do nothing;
    -- Contenus des membres rattachés au lieu gardé (les clés uniques évitent les doublons d'avis / d'étapes).
    update hdar.place_comments t set place_id = m.keep_id from _pm m where t.place_id = m.drop_id;
    update hdar.place_messages t set place_id = m.keep_id from _pm m where t.place_id = m.drop_id;
    update hdar.place_videos t set place_id = m.keep_id from _pm m where t.place_id = m.drop_id;
    update hdar.partner_listings t set place_id = m.keep_id from _pm m where t.place_id = m.drop_id;
    update hdar.payments t set place_id = m.keep_id from _pm m where t.place_id = m.drop_id;
    update hdar.pro_gifts t set place_id = m.keep_id from _pm m where t.place_id = m.drop_id;
    update hdar.pro_live_views t set place_id = m.keep_id from _pm m where t.place_id = m.drop_id;
    update hdar.place_ratings t set place_id = m.keep_id from _pm m
      where t.place_id = m.drop_id and not exists (select 1 from hdar.place_ratings r where r.place_id = m.keep_id and r.user_id = t.user_id);
    update hdar.trip_stops t set place_id = m.keep_id from _pm m
      where t.place_id = m.drop_id and not exists (select 1 from hdar.trip_stops r where r.place_id = m.keep_id and r.salon_id = t.salon_id);
    update hdar.places p set status = 'rejected', reviewed_at = now() from _pm m where p.id = m.drop_id;
  end if;

  return query select m.keep_id, a.name, m.drop_id, b.name, m.dist_m from _pm m join _pd a on a.id = m.keep_id join _pd b on b.id = m.drop_id order by a.name;
end $fn$;
revoke all on function hdar.places_dedup(int, boolean) from public, anon, authenticated;

-- Annuler : update hdar.places p set status = m.prev_status from hdar.place_merges m where p.id = m.drop_id;
--           (les avis/commentaires déplacés restent sur le lieu gardé.)

-- 1) Aperçu (ne modifie rien) :  select count(*) from hdar.places_dedup(100, true);
-- 2) Appliquer :                 select count(*) from hdar.places_dedup(100, false);
