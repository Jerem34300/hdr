-- v130 (appliquée en prod) : parcours revendication pro
-- 1) Aperçu enrichi sans rattachement (hdar_place_claim_info)
-- 2) Claim = ownership seulement (pas de mise en ligne automatique)
-- 3) Publication explicite (hdar_place_publish) : 90 j offerts pendant le lancement
-- 4) Prospection bars/clubs/saunas : jetons en lot + suivi outreach / suppression
-- Remplace l'effet « gratuit 90 j à la réclamation » de v107 : il passe à la validation explicite.

---------------------------------------------------------------- Prospection (tables d'abord)
create table if not exists hdar.outreach (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  kind text not null check (kind in ('bar', 'club', 'sauna', 'other')),
  name text not null,
  city text,
  email text,
  claim_token text,
  status text not null default 'ready'
    check (status in ('ready', 'sent', 'opened', 'claimed', 'suppressed', 'bounced')),
  sent_at timestamptz,
  opened_at timestamptz,
  claimed_at timestamptz,
  suppressed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (place_id)
);
create index if not exists outreach_status on hdar.outreach (status, created_at desc);
create index if not exists outreach_city on hdar.outreach (city) where city is not null;
alter table hdar.outreach enable row level security;
revoke all on hdar.outreach from public, anon, authenticated;


---------------------------------------------------------------- Ville approximative (même logique que l'admin, rayon ~25 km)
create or replace function hdar.nearest_city(p_lat double precision, p_lng double precision) returns text
language plpgsql stable parallel safe set search_path to '' as $$
declare
  best text := null;
  bd double precision := 1e9;
  d double precision;
  r record;
begin
  if p_lat is null or p_lng is null then return null; end if;
  for r in
    select * from (values
      ('Paris', 48.857::float8, 2.352::float8), ('Marseille', 43.296, 5.37), ('Lyon', 45.764, 4.836),
      ('Toulouse', 43.605, 1.444), ('Nice', 43.71, 7.262), ('Nantes', 47.218, -1.554),
      ('Montpellier', 43.611, 3.877), ('Strasbourg', 48.573, 7.752), ('Bordeaux', 44.838, -0.579),
      ('Lille', 50.629, 3.057), ('Rennes', 48.117, -1.678), ('Reims', 49.258, 4.032),
      ('Toulon', 43.124, 5.928), ('Grenoble', 45.188, 5.724), ('Dijon', 47.322, 5.041),
      ('Nîmes', 43.837, 4.36), ('Clermont-Ferrand', 45.777, 3.087), ('Aix-en-Provence', 43.529, 5.447),
      ('Perpignan', 42.699, 2.895), ('Avignon', 43.949, 4.806), ('Béziers', 43.344, 3.215),
      ('Sète', 43.403, 3.697), ('Cannes', 43.552, 7.017), ('Bruxelles', 50.85, 4.352)
    ) as c(name, lat, lng)
  loop
    d := (r.lat - p_lat)^2 + ((r.lng - p_lng) * cos(radians(p_lat)))^2;
    if d < bd then bd := d; best := r.name; end if;
  end loop;
  if best is null then return null; end if;
  if sqrt(bd) * 111 > 25 then return null; end if;
  return best;
end $$;

---------------------------------------------------------------- Aperçu (aucun side-effect)
create or replace function public.hdar_place_claim_info(p_token text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'id', id,
    'name', name,
    'kind', kind,
    'description', left(coalesce(description, ''), 600),
    'lat', round(lat::numeric, 3),
    'lng', round(lng::numeric, 3),
    'city', hdar.nearest_city(lat, lng),
    'website', website,
    'has_contact', contact is not null and length(btrim(contact)) > 0,
    'photos', to_jsonb(coalesce(photos[1:4], '{}'::text[])),
    'promo', case when promo_status = 'approved' then promo end,
    'free_days', 90
  )
  from hdar.places
  where claim_token = p_token and claimed_at is null;
$$;

---------------------------------------------------------------- Claim = devenir admin, sans publier
drop function if exists public.hdar_place_claim(text);
create or replace function public.hdar_place_claim(p_token text, p_contact text default null, p_manager text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  s text := hdar.self_id();
  p hdar.places;
  c text := nullif(left(btrim(coalesce(p_contact, '')), 200), '');
  m text := nullif(left(btrim(coalesce(p_manager, '')), 80), '');
  desc_out text;
begin
  select * into p from hdar.places where claim_token = p_token and claimed_at is null for update;
  if p.id is null then raise exception 'Lien invalide ou déjà utilisé'; end if;
  if p.amb = s then raise exception 'L''ambassadeur ne peut pas réclamer sa propre fiche'; end if;
  if p.kind not in ('bar', 'club', 'sauna', 'other') then raise exception 'Cette fiche ne peut pas être réclamée comme partenaire'; end if;

  desc_out := coalesce(p.description, '');
  update hdar.places set
    owner_id = s,
    claimed_at = now(),
    claim_token = null,
    contact = coalesce(c, contact)
  where id = p.id
  returning description into desc_out;

  update hdar.outreach set status = 'claimed', claimed_at = now()
    where place_id = p.id and status in ('ready', 'sent', 'opened');

  return jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'kind', p.kind,
    'description', desc_out,
    'lat', p.lat,
    'lng', p.lng,
    'website', p.website,
    'contact', coalesce(c, p.contact),
    'photos', to_jsonb(coalesce(p.photos, '{}'::text[])),
    'ratings_on', coalesce(p.ratings_on, true),
    'comments_on', coalesce(p.comments_on, true),
    'comments_public', coalesce(p.comments_public, true),
    'manager', m,
    'promo', case when p.promo_status = 'approved' then p.promo end,
    'published', false
  );
end $$;

---------------------------------------------------------------- Publication explicite (après modification)
create or replace function public.hdar_place_publish(p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  s text := hdar.self_id();
  p hdar.places;
  until_at timestamptz;
begin
  select * into p from hdar.places where id = p_id and owner_id = s for update;
  if p.id is null then raise exception 'Lieu introuvable'; end if;
  if length(btrim(coalesce(p.name, ''))) < 2 then raise exception 'Indiquez le nom de l''établissement'; end if;
  if p.lat is null or p.lng is null then raise exception 'Indiquez la position de l''établissement'; end if;

  until_at := greatest(coalesce(p.partner_until, now()), now() + interval '90 days');
  update hdar.places set
    status = 'approved',
    partner = true,
    partner_until = until_at,
    reviewed_at = coalesce(reviewed_at, now())
  where id = p.id;

  return jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'free', true,
    'until', until_at,
    'promo', case when p.promo_status = 'approved' then p.promo end
  );
end $$;

---------------------------------------------------------------- Admin : préparer jetons / lister / supprimer / marquer envoyé
create or replace function public.hdar_admin_outreach_prepare(
  p_key text,
  p_city text default null,
  p_kinds text[] default array['bar', 'club', 'sauna'],
  p_limit int default 50
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  n int := 0;
  r record;
  t text;
  city_f text := nullif(btrim(coalesce(p_city, '')), '');
  kinds text[] := coalesce(p_kinds, array['bar', 'club', 'sauna']);
  lim int := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  perform hdar.admin_check(p_key);
  for r in
    select p.id, p.kind, p.name, p.claim_token, p.contact, p.lat, p.lng
    from hdar.places p
    where p.kind = any (kinds)
      and p.claimed_at is null
      and p.owner_id is null
      and p.status in ('pending', 'approved')
      and (city_f is null
        or p.name ilike '%' || city_f || '%'
        or coalesce(p.description, '') ilike '%' || city_f || '%'
        or coalesce(p.contact, '') ilike '%' || city_f || '%')
      and not exists (
        select 1 from hdar.outreach o where o.place_id = p.id and o.status = 'suppressed'
      )
    order by p.partner desc, p.created_at desc
    limit lim
  loop
    t := r.claim_token;
    if t is null then
      loop
        t := substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
        exit when not exists (select 1 from hdar.places where claim_token = t);
      end loop;
      update hdar.places set claim_token = t, partner = true where id = r.id;
    end if;
    insert into hdar.outreach (place_id, kind, name, city, email, claim_token, status)
    values (
      r.id, r.kind, r.name, coalesce(city_f, hdar.nearest_city(r.lat, r.lng)),
      case when r.contact ~* '@' then left(r.contact, 200) end,
      t, 'ready'
    )
    on conflict (place_id) do update set
      claim_token = excluded.claim_token,
      kind = excluded.kind,
      name = excluded.name,
      city = coalesce(excluded.city, hdar.outreach.city),
      email = coalesce(excluded.email, hdar.outreach.email),
      status = case when hdar.outreach.status = 'suppressed' then hdar.outreach.status else 'ready' end;
    n := n + 1;
  end loop;
  return jsonb_build_object('prepared', n, 'city', city_f, 'kinds', to_jsonb(kinds));
end $$;

create or replace function public.hdar_admin_outreach_list(
  p_key text,
  p_status text default null,
  p_city text default null,
  p_limit int default 100
) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  st text := nullif(btrim(coalesce(p_status, '')), '');
  city_f text := nullif(btrim(coalesce(p_city, '')), '');
  lim int := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform hdar.admin_check(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id,
      'place_id', o.place_id,
      'kind', o.kind,
      'name', o.name,
      'city', o.city,
      'email', o.email,
      'claim_token', o.claim_token,
      'claim_url', case when o.claim_token is not null then '/pro?claim=' || o.claim_token end,
      'status', o.status,
      'sent_at', o.sent_at,
      'claimed_at', o.claimed_at,
      'suppressed_at', o.suppressed_at,
      'note', o.note,
      'created_at', o.created_at
    ) order by o.created_at desc)
    from (
      select * from hdar.outreach o
      where (st is null or o.status = st)
        and (city_f is null or o.city ilike city_f or o.name ilike '%' || city_f || '%')
      order by o.created_at desc
      limit lim
    ) o
  ), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_outreach_suppress(p_key text, p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.outreach set
    status = 'suppressed',
    suppressed_at = now(),
    note = coalesce(nullif(left(btrim(coalesce(p_note, '')), 200), ''), note)
  where id = p_id;
end $$;

create or replace function public.hdar_admin_outreach_mark_sent(p_key text, p_ids uuid[]) returns int
language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  perform hdar.admin_check(p_key);
  update hdar.outreach set status = 'sent', sent_at = now()
    where id = any (p_ids) and status = 'ready';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.hdar_place_claim_info(text) from public, anon;
revoke all on function public.hdar_place_claim(text, text, text) from public, anon;
revoke all on function public.hdar_place_publish(uuid) from public, anon;
revoke all on function public.hdar_admin_outreach_prepare(text, text, text[], int) from public, anon;
revoke all on function public.hdar_admin_outreach_list(text, text, text, int) from public, anon;
revoke all on function public.hdar_admin_outreach_suppress(text, uuid, text) from public, anon;
revoke all on function public.hdar_admin_outreach_mark_sent(text, uuid[]) from public, anon;

grant execute on function public.hdar_place_claim_info(text) to anon, authenticated;
grant execute on function public.hdar_place_claim(text, text, text) to authenticated;
grant execute on function public.hdar_place_publish(uuid) to authenticated;
grant execute on function public.hdar_admin_outreach_prepare(text, text, text[], int) to authenticated;
grant execute on function public.hdar_admin_outreach_list(text, text, text, int) to authenticated;
grant execute on function public.hdar_admin_outreach_suppress(text, uuid, text) to authenticated;
grant execute on function public.hdar_admin_outreach_mark_sent(text, uuid[]) to authenticated;
