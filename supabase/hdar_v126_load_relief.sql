-- hdar v126 — Tenue de charge (incident du 1er novembre 2026, 18:40-19:00 et 20:02-20:05, heure de Paris).
-- Preuves : PostgREST « Timed out acquiring connection from connection pool » (PGRST003), statement timeouts,
-- base arrêtée puis redémarrée ; hdar_places (carte « monde » : tri + jsonb de ~97 000 lieux, 1,3 s en moyenne,
-- jusqu'à 7 s, 500 en timeout) appelée par chaque client à l'ouverture ; hdar_conversations (1re en temps total :
-- parcours complet de live_messages avec split_part) appelée toutes les 4 s par chaque client.

-- 1) Carte des lieux « monde » : calculée une fois toutes les 5 min (cron), servie telle quelle à tout le monde.
create table if not exists hdar.places_map_cache (id boolean primary key default true check (id), data jsonb not null, at timestamptz not null default now());
alter table hdar.places_map_cache enable row level security;
revoke all on hdar.places_map_cache from public, anon, authenticated;

create or replace function hdar.places_map_build(p_s double precision, p_w double precision, p_n double precision, p_e double precision) returns jsonb
language sql stable set search_path to '' as $$
  select coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.name, 'lat', x.lat, 'lng', x.lng,
      'partner', x.partner, 'pro_boost', x.pro_boost) order by x.pro_boost desc, x.partner desc)
    from (
      select p.id, p.kind, p.name, p.lat, p.lng, p.partner,
        coalesce(p.partner and p.partner_until > now() and p.pro_boost_until > now(), false) as pro_boost
      from hdar.places p
      where p.status = 'approved' and p.kind not in ('toilets','station','metro','bus','airport')
        and not (p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade'))
        and (not p.partner or coalesce(p.partner_until > now(), false))
        and p.lat between p_s and p_n
        and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
      order by 7 desc, p.partner desc
      limit 5000) x), '[]'::jsonb) $$;
revoke all on function hdar.places_map_build(double precision, double precision, double precision, double precision) from public, anon, authenticated;

create or replace function hdar.places_map_refresh() returns void
language plpgsql security definer set search_path to '' as $$
begin
  insert into hdar.places_map_cache (id, data, at) values (true, hdar.places_map_build(-90, -180, 90, 180), now())
  on conflict (id) do update set data = excluded.data, at = excluded.at;
end $$;
revoke all on function hdar.places_map_refresh() from public, anon, authenticated;

-- Même signature, même résultat ; la requête « monde » lit le cache (repli sur le calcul direct si le cache manque).
create or replace function public.hdar_places(p_s double precision, p_w double precision, p_n double precision, p_e double precision)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare c jsonb;
begin
  perform hdar.self_id();
  if p_s <= -89 and p_n >= 89 and p_w <= -179 and p_e >= 179 then
    select data into c from hdar.places_map_cache where id and at > now() - interval '15 minutes';
    if c is not null then return c; end if;
  end if;
  return hdar.places_map_build(p_s, p_w, p_n, p_e);
end $$;

select hdar.places_map_refresh();
select cron.unschedule('hdar_places_map') where exists (select 1 from cron.job where jobname = 'hdar_places_map');
select cron.schedule('hdar_places_map', '*/5 * * * *', 'select hdar.places_map_refresh()');

-- 2) Boîte de réception : index sur chacun des deux participants (la fonction filtre sur split_part 1 OU 2).
create index if not exists live_messages_a_idx on hdar.live_messages (split_part(thread_id, ':', 1), thread_id, created_at desc);
create index if not exists live_messages_b_idx on hdar.live_messages (split_part(thread_id, ':', 2), thread_id, created_at desc);
analyze hdar.live_messages;
