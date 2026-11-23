-- v146 : lieux à découvrir sur la carte + preuve de propriété
-- NON appliquée en prod tant que Jérémie n'a pas validé.
-- Aucun e-mail n'est envoyé automatiquement : les codes sont écrits dans
-- hdar.mail_outbox avec status = 'hold'. Un flush séparé (jamais appelé ici)
-- pourrait les envoyer plus tard, uniquement après accord.

---------------------------------------------------------------- Colonnes publiques / preuve
alter table hdar.places add column if not exists city text;
alter table hdar.places add column if not exists address text;
alter table hdar.places add column if not exists hours text;
alter table hdar.places add column if not exists tags text[] not null default '{}';
alter table hdar.places add column if not exists country text;
alter table hdar.places add column if not exists map_listing text not null default 'hidden';
alter table hdar.places add column if not exists verified boolean not null default false;
alter table hdar.places add column if not exists verified_at timestamptz;
alter table hdar.places add column if not exists verify_method text;
alter table hdar.places add column if not exists cover_credit text;
alter table hdar.places add column if not exists pending_photos text[] not null default '{}';

do $$ begin
  alter table hdar.places drop constraint if exists places_map_listing_check;
  alter table hdar.places add constraint places_map_listing_check
    check (map_listing in ('hidden', 'discover', 'partner'));
  alter table hdar.places drop constraint if exists places_verify_method_check;
  alter table hdar.places add constraint places_verify_method_check
    check (verify_method is null or verify_method in ('email_official', 'email_domain', 'admin_manual'));
end $$;

create index if not exists places_map_listing on hdar.places (map_listing) where map_listing <> 'hidden';

---------------------------------------------------------------- Files d'attente (preuves, e-mails, photos)
create table if not exists hdar.place_verify_codes (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  user_id text not null,
  method text not null check (method in ('email_official', 'email_domain')),
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists place_verify_codes_place on hdar.place_verify_codes (place_id, created_at desc);
alter table hdar.place_verify_codes enable row level security;
revoke all on hdar.place_verify_codes from public, anon, authenticated;

create table if not exists hdar.place_claim_requests (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  user_id text not null,
  email text,
  justification text not null,
  proof text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists place_claim_requests_status on hdar.place_claim_requests (status, created_at desc);
alter table hdar.place_claim_requests enable row level security;
revoke all on hdar.place_claim_requests from public, anon, authenticated;

create table if not exists hdar.mail_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  to_email text not null,
  subject text not null,
  body text not null,
  meta jsonb not null default '{}',
  status text not null default 'hold' check (status in ('hold', 'pending', 'sent', 'cancelled')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists mail_outbox_status on hdar.mail_outbox (status, created_at);
alter table hdar.mail_outbox enable row level security;
revoke all on hdar.mail_outbox from public, anon, authenticated;

---------------------------------------------------------------- Remplir listing / ville depuis l'existant
-- Partenaires déjà en ligne.
update hdar.places p
  set map_listing = 'partner'
  where p.status = 'approved'
    and p.kind in ('bar', 'club', 'sauna', 'other')
    and (not p.partner or coalesce(p.partner_until > now(), false))
    and p.map_listing = 'hidden';

-- Lieux de prospection affichables : pas refus / désinscrit / rebond, avec coordonnées.
update hdar.places p
  set
    map_listing = 'discover',
    city = coalesce(p.city, o.city),
    country = coalesce(p.country, o.country)
  from hdar.outreach o
  where o.place_id = p.id
    and p.lat is not null and p.lng is not null
    and coalesce(o.status, '') not in ('refused', 'suppressed', 'bounced')
    and o.refused_at is null
    and o.suppressed_at is null
    and p.map_listing = 'hidden';

---------------------------------------------------------------- Visibilité
create or replace function hdar.place_visible(p hdar.places) returns boolean
language sql stable set search_path to '' as $$
  select
    p.map_listing = 'discover'
    or (p.status = 'approved' and (not p.partner or coalesce(p.partner_until > now(), false)));
$$;
revoke execute on function hdar.place_visible(hdar.places) from public, anon, authenticated;

create or replace function hdar.risk_country(p_cc text) returns boolean
language sql immutable set search_path to '' as $$
  select lower(coalesce(p_cc, '')) in ('dz', 'ma', 'tn', 'sn', 'cm');
$$;
revoke execute on function hdar.risk_country(text) from public, anon, authenticated;

create or replace function hdar.mask_email(p_email text) returns text
language plpgsql immutable set search_path to '' as $$
declare e text := lower(btrim(coalesce(p_email, ''))); a text; d text;
begin
  if e !~ '@' then return null; end if;
  a := split_part(e, '@', 1);
  d := split_part(e, '@', 2);
  if a = '' or d = '' then return null; end if;
  return left(a, 1) || '***@' || d;
end $$;
revoke execute on function hdar.mask_email(text) from public, anon, authenticated;

create or replace function hdar.email_domain(p_email text) returns text
language sql immutable set search_path to '' as $$
  select nullif(lower(split_part(btrim(coalesce(p_email, '')), '@', 2)), '');
$$;

create or replace function hdar.website_domain(p_url text) returns text
language plpgsql immutable set search_path to '' as $$
declare u text := lower(btrim(coalesce(p_url, ''))); host text;
begin
  if u = '' then return null; end if;
  if u !~* '^https?://' then u := 'https://' || u; end if;
  host := substring(u from '^https?://([^/]+)');
  if host is null then return null; end if;
  host := regexp_replace(host, '^www\.', '');
  return host;
end $$;
revoke execute on function hdar.website_domain(text) from public, anon, authenticated;

create or replace function hdar.public_place_description(p hdar.places) returns text
language sql stable set search_path to '' as $$
  select case
    when hdar.risk_country(p.country) then left(regexp_replace(coalesce(p.description, ''), '(?i)gay|lgbt|cruising|sauna gay|bar gay', '', 'g'), 600)
    else left(coalesce(p.description, ''), 600)
  end;
$$;

---------------------------------------------------------------- Carte
create or replace function hdar.places_map_build(p_s double precision, p_w double precision, p_n double precision, p_e double precision) returns jsonb
language sql stable set search_path to '' as $$
  select coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'kind', x.kind, 'name', x.name, 'lat', x.lat, 'lng', x.lng,
      'partner', x.listing = 'partner', 'pro_boost', x.pro_boost,
      'listing', x.listing, 'verified', x.verified
    ) order by x.pro_boost desc, (x.listing = 'partner') desc)
    from (
      select p.id, p.kind, p.name, p.lat, p.lng,
        case when p.map_listing = 'partner'
              and p.status = 'approved'
              and (not p.partner or coalesce(p.partner_until > now(), false))
             then 'partner'
             when p.map_listing = 'discover' then 'discover'
             else 'hidden' end as listing,
        coalesce(p.verified, false) as verified,
        coalesce(p.map_listing = 'partner' and p.partner and p.partner_until > now() and p.pro_boost_until > now(), false) as pro_boost
      from hdar.places p
      where p.kind not in ('toilets','station','metro','bus','airport')
        and not (p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade'))
        and p.lat between p_s and p_n
        and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
        and (
          p.map_listing = 'discover'
          or (p.status = 'approved' and (not p.partner or coalesce(p.partner_until > now(), false)))
        )
      order by 7 desc, (p.map_listing = 'partner') desc
      limit 5000) x
    where x.listing <> 'hidden'), '[]'::jsonb)
$$;
revoke all on function hdar.places_map_build(double precision, double precision, double precision, double precision) from public, anon, authenticated;

---------------------------------------------------------------- Fiche publique (sans e-mail, sans jeton)
drop function if exists public.hdar_place_get(uuid);
create or replace function public.hdar_place_get(p_id uuid)
returns table (
  id uuid, kind text, name text, description text, lat double precision, lng double precision,
  source text, source_ref text, partner boolean, city text, address text, hours text,
  tags text[], website text, listing text, verified boolean, cover_credit text, photos text[]
)
language plpgsql volatile security definer set search_path to '' as $$
declare s text := hdar.self_id(); p hdar.places;
begin
  select * into p from hdar.places where hdar.places.id = p_id;
  if p.id is null or not hdar.place_visible(p) then return; end if;
  insert into hdar.place_daily (day, place_id, views) values (current_date, p_id, 1)
    on conflict (day, place_id) do update set views = hdar.place_daily.views + 1;
  insert into hdar.place_visitors values (current_date, p_id, s) on conflict do nothing;
  id := p.id; kind := p.kind; name := p.name;
  description := hdar.public_place_description(p);
  lat := p.lat; lng := p.lng; source := p.source; source_ref := p.source_ref;
  partner := (p.map_listing = 'partner');
  city := p.city; address := p.address; hours := p.hours;
  tags := case when hdar.risk_country(p.country) then '{}'::text[] else coalesce(p.tags, '{}') end;
  website := p.website;
  listing := case when p.map_listing = 'partner' then 'partner' else 'discover' end;
  verified := coalesce(p.verified, false);
  cover_credit := p.cover_credit;
  -- Photos : seulement si partenaire déjà en ligne ou lieu vérifié (pas de photos d'origine incertaine).
  photos := case when p.map_listing = 'partner' or p.verified then coalesce(p.photos, '{}') else '{}'::text[] end;
  return next;
end $$;
revoke all on function public.hdar_place_get(uuid) from public, anon;
grant execute on function public.hdar_place_get(uuid) to authenticated, anon;

create or replace function public.hdar_place_info(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); p hdar.places; own boolean; pub boolean; r jsonb;
  public_photos text[];
begin
  select * into p from hdar.places where id = p_id;
  if p.id is null then return null; end if;
  own := p.owner_id = s;
  if not hdar.place_visible(p) and not own then return null; end if;
  pub := not p.partner or p.comments_public;
  public_photos := case
    when own or p.map_listing = 'partner' or p.verified then coalesce(p.photos, '{}')
    else '{}'::text[]
  end;
  select jsonb_build_object(
    'website', p.website,
    'contact', case when own then p.contact else null end,
    'photos', to_jsonb(public_photos),
    'pending_photos', case when own then to_jsonb(coalesce(p.pending_photos, '{}')) else '[]'::jsonb end,
    'owner', own,
    'ratings_on', case when p.map_listing = 'discover' and not p.verified then false else (not p.partner or p.ratings_on) end,
    'comments_on', case when p.map_listing = 'discover' and not p.verified then false else (not p.partner or p.comments_on) end,
    'comments_public', pub,
    'city', p.city, 'address', p.address, 'hours', p.hours,
    'tags', to_jsonb(case when hdar.risk_country(p.country) then '{}'::text[] else coalesce(p.tags, '{}') end),
    'listing', case when p.map_listing = 'partner' then 'partner' else 'discover' end,
    'verified', coalesce(p.verified, false),
    'cover_credit', p.cover_credit,
    'claimable', p.map_listing = 'discover' and p.owner_id is null and not coalesce(p.verified, false),
    'avg', (select round(avg(stars)::numeric, 1) from hdar.place_ratings where place_id = p_id),
    'count', (select count(*) from hdar.place_ratings where place_id = p_id),
    'mine', (select stars from hdar.place_ratings where place_id = p_id and user_id = s),
    'comments', case when pub or own then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at,
        'pseudo', coalesce(pr.pseudo, 'Anonyme'), 'mine', c.user_id = s,
        'stars', (select stars from hdar.place_ratings x where x.place_id = p_id and x.user_id = c.user_id)) order by c.created_at desc)
      from (select * from hdar.place_comments where place_id = p_id and not hidden order by created_at desc limit 100) c
      left join hdar.profiles pr on pr.user_id = c.user_id), '[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at, 'pseudo', 'Toi', 'mine', true, 'stars', null))
        from hdar.place_comments c where c.place_id = p_id and c.user_id = s and not c.hidden), '[]'::jsonb) end
  ) into r;
  return r;
end $$;

---------------------------------------------------------------- Méthodes de preuve disponibles (aucun envoi)
create or replace function public.hdar_discover_methods(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); p hdar.places; official text;
begin
  perform hdar.require_profile(s);
  select * into p from hdar.places where id = p_id;
  if p.id is null or p.map_listing <> 'discover' then raise exception 'Lieu introuvable'; end if;
  if p.owner_id is not null or p.verified then raise exception 'Cette fiche a déjà un propriétaire'; end if;
  official := coalesce(
    (select o.email from hdar.outreach o where o.place_id = p.id and o.email ~ '@' limit 1),
    case when p.contact ~ '@' then p.contact end
  );
  return jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'kind', p.kind,
    'city', p.city,
    'website', p.website,
    'website_domain', hdar.website_domain(p.website),
    'official_masked', hdar.mask_email(official),
    'has_official', official is not null,
    'has_website', hdar.website_domain(p.website) is not null
  );
end $$;

---------------------------------------------------------------- Envoi de code : écrit l'outbox en hold, n'envoie rien
create or replace function public.hdar_discover_send_code(p_id uuid, p_method text, p_email text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  s text := hdar.self_id();
  p hdar.places;
  official text;
  dest text;
  method text := btrim(coalesce(p_method, ''));
  code text;
  site text;
begin
  perform hdar.require_profile(s);
  if method not in ('email_official', 'email_domain') then raise exception 'Méthode inconnue'; end if;
  perform hdar.rate_check(s, 'discover_code', 5, interval '1 hour');
  select * into p from hdar.places where id = p_id for update;
  if p.id is null or p.map_listing <> 'discover' then raise exception 'Lieu introuvable'; end if;
  if p.owner_id is not null or p.verified then raise exception 'Cette fiche a déjà un propriétaire'; end if;
  if (select count(*) from hdar.place_verify_codes c where c.place_id = p.id and c.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Trop de tentatives, réessaie plus tard';
  end if;

  official := coalesce(
    (select o.email from hdar.outreach o where o.place_id = p.id and o.email ~ '@' limit 1),
    case when p.contact ~ '@' then p.contact end
  );

  if method = 'email_official' then
    if official is null then raise exception 'Aucun e-mail officiel n''est enregistré pour ce lieu'; end if;
    dest := official;
  else
    dest := lower(btrim(coalesce(p_email, '')));
    if dest !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Indique un e-mail professionnel'; end if;
    site := hdar.website_domain(p.website);
    if site is null then raise exception 'Ce lieu n''a pas de site web en base'; end if;
    if hdar.email_domain(dest) is null
       or not (
         hdar.email_domain(dest) = site
         or hdar.email_domain(dest) like '%.' || site
         or site like '%.' || hdar.email_domain(dest)
       ) then
      raise exception 'L''e-mail doit être sur le même domaine que le site du lieu';
    end if;
  end if;

  code := lpad((100000 + floor(random() * 900000))::int::text, 6, '0');
  insert into hdar.place_verify_codes (place_id, user_id, method, email, code_hash, expires_at)
    values (p.id, s, method, dest, encode(sha256(convert_to(code || p.id::text, 'utf8')), 'hex'), now() + interval '15 minutes');

  -- Jamais d'envoi direct. status hold = en attente d'un flush manuel / validé.
  insert into hdar.mail_outbox (kind, to_email, subject, body, meta, status)
    values (
      'discover_code',
      dest,
      'Code pour réclamer la fiche « ' || left(p.name, 80) || ' »',
      'Voici votre code hdar : ' || code || ' (valable 15 minutes). Si vous n''êtes pas le propriétaire, ignorez ce message.',
      jsonb_build_object('place_id', p.id, 'method', method, 'user_id', s),
      'hold'
    );

  return jsonb_build_object(
    'ok', true,
    'masked', hdar.mask_email(dest),
    'expires_in', 15,
    'sent', false,
    'held', true
  );
end $$;

create or replace function public.hdar_discover_confirm_code(p_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  s text := hdar.self_id();
  p hdar.places;
  c hdar.place_verify_codes;
  given text := btrim(coalesce(p_code, ''));
  h text;
begin
  perform hdar.require_profile(s);
  if given !~ '^\d{6}$' then raise exception 'Code invalide'; end if;
  select * into p from hdar.places where id = p_id for update;
  if p.id is null or p.map_listing <> 'discover' then raise exception 'Lieu introuvable'; end if;
  if p.owner_id is not null or p.verified then raise exception 'Cette fiche a déjà un propriétaire'; end if;

  select * into c from hdar.place_verify_codes
    where place_id = p.id and user_id = s and used_at is null
    order by created_at desc limit 1;
  if c.id is null then raise exception 'Demande d''abord un code'; end if;
  if c.expires_at < now() then raise exception 'Ce code a expiré'; end if;
  if c.attempts >= 5 then raise exception 'Trop d''essais, demande un nouveau code'; end if;

  h := encode(sha256(convert_to(given || p.id::text, 'utf8')), 'hex');
  if h <> c.code_hash then
    update hdar.place_verify_codes set attempts = attempts + 1 where id = c.id;
    raise exception 'Code incorrect';
  end if;

  update hdar.place_verify_codes set used_at = now() where id = c.id;
  update hdar.places set
    owner_id = s,
    claimed_at = now(),
    claim_token = null,
    verified = true,
    verified_at = now(),
    verify_method = c.method
  where id = p.id;
  update hdar.outreach set status = 'claimed', claimed_at = now()
    where place_id = p.id and status in ('ready', 'sent', 'delivered', 'opened');

  return jsonb_build_object('ok', true, 'id', p.id, 'name', p.name, 'verified', true, 'method', c.method);
end $$;

---------------------------------------------------------------- Demande manuelle + justificatif
create or replace function public.hdar_discover_request_manual(p_id uuid, p_email text, p_justification text, p_proof text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  s text := hdar.self_id();
  p hdar.places;
  j text := left(btrim(coalesce(p_justification, '')), 1000);
  e text := lower(left(btrim(coalesce(p_email, '')), 200));
  pr text := p_proof;
  rid uuid;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'discover_manual', 3, interval '1 day');
  if length(j) < 20 then raise exception 'Explique en quelques phrases pourquoi tu représentes ce lieu'; end if;
  if e <> '' and e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail invalide'; end if;
  if pr is not null then
    if pr !~ '^data:image/(jpeg|png|webp);base64,' or length(pr) > 400000 then raise exception 'Justificatif photo invalide'; end if;
  end if;
  select * into p from hdar.places where id = p_id for update;
  if p.id is null or p.map_listing <> 'discover' then raise exception 'Lieu introuvable'; end if;
  if p.owner_id is not null or p.verified then raise exception 'Cette fiche a déjà un propriétaire'; end if;
  if exists (select 1 from hdar.place_claim_requests r where r.place_id = p.id and r.user_id = s and r.status = 'pending') then
    raise exception 'Une demande est déjà en attente pour ce lieu';
  end if;
  insert into hdar.place_claim_requests (place_id, user_id, email, justification, proof)
    values (p.id, s, nullif(e, ''), j, pr)
    returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'status', 'pending');
end $$;

---------------------------------------------------------------- Édition propriétaire (photos → modération)
create or replace function public.hdar_discover_owner_save(
  p_id uuid,
  p_description text default null,
  p_hours text default null,
  p_address text default null,
  p_website text default null,
  p_tags text[] default null,
  p_photos text[] default null
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  s text := hdar.self_id();
  p hdar.places;
  w text := btrim(coalesce(p_website, ''));
  ph text[] := coalesce(p_photos, '{}');
begin
  perform hdar.require_profile(s);
  select * into p from hdar.places where id = p_id and owner_id = s for update;
  if p.id is null then raise exception 'Lieu introuvable'; end if;
  if not p.verified then raise exception 'La fiche doit d''abord être vérifiée'; end if;
  if w <> '' and w !~* '^https?://[^\s]+$' then w := 'https://' || w; end if;
  if w <> '' and w !~* '^https?://[a-z0-9.-]+\.[a-z]{2,}(/\S*)?$' then raise exception 'Site web invalide'; end if;
  if cardinality(ph) > 8 then raise exception '8 photos maximum'; end if;
  if exists (select 1 from unnest(ph) x where x !~ '^data:image/(jpeg|png|webp);base64,' or length(x) > 400000) then
    raise exception 'Photo invalide';
  end if;
  update hdar.places set
    description = left(btrim(coalesce(p_description, description, '')), 1000),
    hours = nullif(left(btrim(coalesce(p_hours, '')), 200), ''),
    address = nullif(left(btrim(coalesce(p_address, '')), 200), ''),
    website = coalesce(nullif(w, ''), website),
    tags = coalesce(p_tags, tags),
    pending_photos = case when cardinality(ph) > 0 then ph else pending_photos end
  where id = p.id;
  return jsonb_build_object('ok', true, 'id', p.id, 'pending_photos', cardinality(ph) > 0);
end $$;

---------------------------------------------------------------- Admin : demandes + photos
create or replace function public.hdar_admin_claim_requests(p_key text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'place_id', r.place_id,
      'name', p.name,
      'city', p.city,
      'kind', p.kind,
      'email', r.email,
      'justification', r.justification,
      'has_proof', r.proof is not null,
      'status', r.status,
      'admin_note', r.admin_note,
      'created_at', r.created_at,
      'reviewed_at', r.reviewed_at
    ) order by r.created_at desc)
    from hdar.place_claim_requests r
    join hdar.places p on p.id = r.place_id
  ), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_claim_review(p_key text, p_id uuid, p_ok boolean, p_note text default null) returns void
language plpgsql security definer set search_path to '' as $$
declare r hdar.place_claim_requests; p hdar.places;
begin
  perform hdar.admin_check(p_key);
  select * into r from hdar.place_claim_requests where id = p_id for update;
  if r.id is null then raise exception 'Demande introuvable'; end if;
  if r.status <> 'pending' then raise exception 'Cette demande a déjà été traitée'; end if;
  select * into p from hdar.places where id = r.place_id for update;
  update hdar.place_claim_requests set
    status = case when p_ok then 'approved' else 'rejected' end,
    admin_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
    reviewed_at = now(),
    proof = case when p_ok then proof else null end
  where id = r.id;
  if p_ok then
    update hdar.places set
      owner_id = r.user_id,
      claimed_at = coalesce(claimed_at, now()),
      claim_token = null,
      verified = true,
      verified_at = now(),
      verify_method = 'admin_manual',
      contact = coalesce(contact, r.email)
    where id = p.id and (owner_id is null or owner_id = r.user_id);
    update hdar.outreach set status = 'claimed', claimed_at = now()
      where place_id = p.id and status in ('ready', 'sent', 'delivered', 'opened');
  end if;
end $$;

create or replace function public.hdar_admin_pending_photos(p_key text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'city', p.city, 'kind', p.kind,
      'pending_n', cardinality(p.pending_photos),
      'pending_photos', to_jsonb(p.pending_photos),
      'photos_n', cardinality(p.photos)
    ) order by p.verified_at desc nulls last)
    from hdar.places p
    where cardinality(coalesce(p.pending_photos, '{}')) > 0
  ), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_photos_review(p_key text, p_id uuid, p_ok boolean) returns void
language plpgsql security definer set search_path to '' as $$
declare p hdar.places;
begin
  perform hdar.admin_check(p_key);
  select * into p from hdar.places where id = p_id for update;
  if p.id is null then raise exception 'Lieu introuvable'; end if;
  if p_ok then
    update hdar.places set
      photos = (coalesce(photos, '{}') || coalesce(pending_photos, '{}'))[1:8],
      pending_photos = '{}'
    where id = p.id;
  else
    update hdar.places set pending_photos = '{}' where id = p.id;
  end if;
end $$;

revoke all on function public.hdar_discover_methods(uuid) from public, anon;
revoke all on function public.hdar_discover_send_code(uuid, text, text) from public, anon;
revoke all on function public.hdar_discover_confirm_code(uuid, text) from public, anon;
revoke all on function public.hdar_discover_request_manual(uuid, text, text, text) from public, anon;
revoke all on function public.hdar_discover_owner_save(uuid, text, text, text, text, text[], text[]) from public, anon;
revoke all on function public.hdar_admin_claim_requests(text) from public, anon;
revoke all on function public.hdar_admin_claim_review(text, uuid, boolean, text) from public, anon;
revoke all on function public.hdar_admin_pending_photos(text) from public, anon;
revoke all on function public.hdar_admin_photos_review(text, uuid, boolean) from public, anon;
revoke all on function public.hdar_place_info(uuid) from public, anon;

grant execute on function public.hdar_discover_methods(uuid) to authenticated;
grant execute on function public.hdar_discover_send_code(uuid, text, text) to authenticated;
grant execute on function public.hdar_discover_confirm_code(uuid, text) to authenticated;
grant execute on function public.hdar_discover_request_manual(uuid, text, text, text) to authenticated;
grant execute on function public.hdar_discover_owner_save(uuid, text, text, text, text, text[], text[]) to authenticated;
grant execute on function public.hdar_admin_claim_requests(text) to authenticated;
grant execute on function public.hdar_admin_claim_review(text, uuid, boolean, text) to authenticated;
grant execute on function public.hdar_admin_pending_photos(text) to authenticated;
grant execute on function public.hdar_admin_photos_review(text, uuid, boolean) to authenticated;
grant execute on function public.hdar_place_info(uuid) to authenticated, anon;
grant execute on function public.hdar_place_get(uuid) to authenticated, anon;

-- Le cache carte sera reconstruit seulement quand cette migration sera appliquée en prod.
-- On le laisse dans le fichier pour le jour J, mais ce fichier ne doit pas être exécuté maintenant.
-- select hdar.places_map_refresh(true);
