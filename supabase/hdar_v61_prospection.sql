-- v61 — Prospection automatique des établissements (bars, clubs, saunas gays et clubs libertins de France).
-- Chaîne : collecte OpenStreetMap / import admin → recherche de l'email sur le site → fiche lieu pré-créée (non visible,
-- jeton de revendication) → séquence de 3 emails (J0, J+4, J+10) → page /pro/invitation/<jeton> → revendication
-- (/pro?claim=) → paiement Stripe → fiche en ligne sur la carte. Tout est piloté par la fonction edge hdar-prospect
-- (pg_cron, clé x-cron-key) ; l'envoi reste coupé tant que l'admin ne l'a pas activé (onglet « Prospection »).
-- Désinscription définitive : empreinte md5 de l'email dans hdar.prospect_optout (gardée même si le prospect est supprimé).

alter table hdar.places drop constraint if exists places_source_check;
alter table hdar.places add constraint places_source_check check (source in ('osm','user','admin','ambassador','prospect'));

create table if not exists hdar.prospects (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('osm','manual')),
  source_ref text unique,
  segment text not null check (segment in ('gay','libertin')),
  kind text not null check (kind in ('bar','club','sauna','other')),
  name text not null,
  city text, postcode text, address text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  website text, phone text, instagram text,
  email text, email_source text,
  status text not null default 'new' check (status in ('new','ready','contacted','clicked','claimed','paid','done','optout','bounced','skip')),
  step int not null default 0,
  next_at timestamptz,
  last_sent_at timestamptz,
  clicked_at timestamptz,
  enrich_tries int not null default 0,
  priority int not null default 0,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  place_id uuid references hdar.places(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create index if not exists prospects_due on hdar.prospects (priority desc, created_at) where status in ('ready','contacted','clicked');
create index if not exists prospects_place on hdar.prospects (place_id) where place_id is not null;
create table if not exists hdar.prospect_optout (email_md5 text primary key, at timestamptz not null default now());
create table if not exists hdar.prospect_log (
  id bigserial primary key, prospect_id uuid references hdar.prospects(id) on delete cascade,
  at timestamptz not null default now(), event text not null, detail text);
create index if not exists prospect_log_sent on hdar.prospect_log (at) where event = 'sent';
create table if not exists hdar.prospect_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  daily_cap int not null default 30 check (daily_cap between 0 and 500),
  updated_at timestamptz not null default now());
insert into hdar.prospect_settings (id) values (true) on conflict do nothing;
alter table hdar.prospects enable row level security;
alter table hdar.prospect_optout enable row level security;
alter table hdar.prospect_log enable row level security;
alter table hdar.prospect_settings enable row level security;
revoke all on hdar.prospects, hdar.prospect_optout, hdar.prospect_log, hdar.prospect_settings from public, anon, authenticated;

create or replace function hdar.prospect_email_ok(p_email text) returns boolean language sql immutable set search_path to '' as $$
  select p_email ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' and length(p_email) <= 200 $$;
create or replace function hdar.prospect_optout_has(p_email text) returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from hdar.prospect_optout where email_md5 = md5(lower(btrim(p_email)))) $$;
revoke all on function hdar.prospect_email_ok(text), hdar.prospect_optout_has(text) from public, anon, authenticated;

-- Ajout / mise à jour en masse depuis la collecte (OSM) ou l'import admin. Ne remplace jamais un email ou un statut existant.
create or replace function public.hdar_prospect_upsert(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r jsonb; seen int := 0; e text; ref text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if nullif(btrim(r->>'name'), '') is null or (r->>'lat') is null or (r->>'lng') is null
       or coalesce(r->>'segment', '') not in ('gay','libertin') then continue; end if;
    e := lower(nullif(btrim(r->>'email'), ''));
    if e is not null and not hdar.prospect_email_ok(e) then e := null; end if;
    ref := coalesce(nullif(r->>'source_ref', ''), 'manual:' || md5(lower(btrim(r->>'name')) || round((r->>'lat')::numeric, 3) || round((r->>'lng')::numeric, 3)));
    seen := seen + 1;
    insert into hdar.prospects (source, source_ref, segment, kind, name, city, postcode, address, lat, lng, website, phone, instagram, email, email_source, status, next_at, priority)
    values (case when r->>'source' = 'osm' then 'osm' else 'manual' end, ref, r->>'segment',
      case when r->>'kind' in ('bar','club','sauna','other') then r->>'kind' else 'bar' end,
      left(btrim(r->>'name'), 80), left(nullif(btrim(r->>'city'), ''), 80), left(nullif(btrim(r->>'postcode'), ''), 10),
      left(nullif(btrim(r->>'address'), ''), 200), (r->>'lat')::double precision, (r->>'lng')::double precision,
      left(nullif(btrim(r->>'website'), ''), 200), left(nullif(btrim(r->>'phone'), ''), 40), left(nullif(btrim(r->>'instagram'), ''), 120),
      e, case when e is not null then coalesce(r->>'email_source', r->>'source') end,
      case when e is null then 'new' when hdar.prospect_optout_has(e) then 'optout' else 'ready' end, now(), coalesce((r->>'priority')::int, 0))
    on conflict (source_ref) do update set
      website = coalesce(hdar.prospects.website, excluded.website), phone = coalesce(hdar.prospects.phone, excluded.phone),
      instagram = coalesce(hdar.prospects.instagram, excluded.instagram), city = coalesce(hdar.prospects.city, excluded.city),
      postcode = coalesce(hdar.prospects.postcode, excluded.postcode),
      email = coalesce(hdar.prospects.email, excluded.email), email_source = coalesce(hdar.prospects.email_source, excluded.email_source),
      status = case when hdar.prospects.status = 'new' and excluded.email is not null then excluded.status else hdar.prospects.status end,
      updated_at = now();
  end loop;
  return jsonb_build_object('seen', seen, 'total', (select count(*) from hdar.prospects));
end $$;

-- Sites à fouiller pour trouver un email (2 essais max par établissement).
create or replace function public.hdar_prospect_enrich_list(p_n int) returns table (id uuid, website text)
language sql security definer set search_path to '' as $$
  update hdar.prospects p set enrich_tries = p.enrich_tries + 1, updated_at = now()
  where p.id in (select x.id from hdar.prospects x where x.status = 'new' and x.website is not null and x.enrich_tries < 2
                 order by x.priority desc, x.enrich_tries, x.created_at limit greatest(1, least(p_n, 50)))
  returning p.id, p.website $$;

create or replace function public.hdar_prospect_enriched(p_id uuid, p_email text, p_instagram text) returns void
language plpgsql security definer set search_path to '' as $$
declare e text := lower(nullif(btrim(p_email), ''));
begin
  if e is not null and not hdar.prospect_email_ok(e) then e := null; end if;
  update hdar.prospects set email = coalesce(email, e), email_source = coalesce(email_source, case when e is not null then 'site' end),
    instagram = coalesce(instagram, left(nullif(btrim(p_instagram), ''), 120)),
    status = case when status = 'new' and e is not null then case when hdar.prospect_optout_has(e) then 'optout' else 'ready' end else status end,
    next_at = coalesce(next_at, now()), updated_at = now()
  where id = p_id;
end $$;

-- Prépare l'envoi : crée la fiche lieu cachée (status pending, partner, jeton = jeton du prospect) si besoin.
create or replace function public.hdar_prospect_prepare(p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare p hdar.prospects; pl uuid; label text;
begin
  select * into p from hdar.prospects where id = p_id for update;
  if p.id is null then raise exception 'Prospect introuvable'; end if;
  if p.place_id is null or not exists (select 1 from hdar.places where id = p.place_id) then
    label := case p.kind when 'club' then 'Club' when 'sauna' then 'Sauna' when 'other' then 'Établissement' else 'Bar' end
      || case p.segment when 'libertin' then ' libertin' else ' gay' end || coalesce(' à ' || p.city, '') || '.';
    insert into hdar.places (kind, name, description, lat, lng, source, source_ref, status, partner, website, contact, claim_token)
    values (p.kind, p.name, label, p.lat, p.lng, 'prospect', 'prospect:' || p.id, 'pending', true,
      case when p.website ~* '^https?://[a-z0-9.-]+\.[a-z]{2,}(/\S*)?$' then p.website end, coalesce(p.phone, p.instagram), p.token)
    on conflict (source_ref) do update set claim_token = coalesce(hdar.places.claim_token, case when hdar.places.claimed_at is null then excluded.claim_token end)
    returning id into pl;
    update hdar.prospects set place_id = pl where id = p.id;
  end if;
  return (select jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind, 'segment', x.segment, 'city', x.city, 'email', x.email,
      'step', x.step, 'status', x.status, 'token', x.token, 'clicked', x.clicked_at is not null,
      'price_from', (select min(price_cents) from hdar.pricing where kind = 'listing' and active))
    from hdar.prospects x where x.id = p.id);
end $$;

-- Prochains envois dus, dans la limite du plafond journalier (heure de Paris). Rien si l'envoi est désactivé.
create or replace function public.hdar_prospect_due(p_n int) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare st hdar.prospect_settings; left_today int; ids uuid[];
begin
  select * into st from hdar.prospect_settings;
  if not coalesce(st.enabled, false) then return '[]'::jsonb; end if;
  left_today := st.daily_cap - (select count(*) from hdar.prospect_log where event = 'sent'
    and at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'));
  if left_today <= 0 then return '[]'::jsonb; end if;
  select array_agg(id) into ids from (
    select p.id from hdar.prospects p
    where p.status in ('ready','contacted','clicked') and p.step < 3 and p.email is not null
      and coalesce(p.next_at, now()) <= now() and not hdar.prospect_optout_has(p.email)
    -- étalé sur la journée : ~1/8 du plafond par passage horaire
    order by p.step, p.priority desc, p.created_at limit least(greatest(p_n, 0), left_today, greatest(1, ceil(st.daily_cap / 8.0)::int))) s;
  return coalesce((select jsonb_agg(public.hdar_prospect_prepare(i)) from unnest(ids) i), '[]'::jsonb);
end $$;

create or replace function public.hdar_prospect_sent(p_id uuid, p_step int, p_ok boolean, p_error text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if p_ok then
    update hdar.prospects set step = p_step + 1, last_sent_at = now(),
      next_at = now() + case p_step when 0 then interval '4 days' when 1 then interval '6 days' else null end,
      status = case when p_step >= 2 and status in ('ready','contacted','clicked') then 'done' when status = 'ready' then 'contacted' else status end,
      updated_at = now()
    where id = p_id;
    insert into hdar.prospect_log (prospect_id, event, detail) values (p_id, 'sent', 'email ' || (p_step + 1));
  else
    update hdar.prospects set status = case when p_error ilike '%invalid%' or p_error ilike '%bounce%' then 'bounced' else status end,
      next_at = now() + interval '1 day', updated_at = now() where id = p_id;
    insert into hdar.prospect_log (prospect_id, event, detail) values (p_id, 'error', left(p_error, 300));
  end if;
end $$;

create or replace function public.hdar_prospect_optout(p_token text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare p hdar.prospects;
begin
  select * into p from hdar.prospects where token = p_token;
  if p.id is null then return false; end if;
  if p.email is not null then insert into hdar.prospect_optout (email_md5) values (md5(lower(btrim(p.email)))) on conflict do nothing; end if;
  update hdar.prospects set status = case when status in ('claimed','paid') then status else 'optout' end, next_at = null, updated_at = now()
    where id = p.id or (email is not null and lower(email) = lower(p.email));
  insert into hdar.prospect_log (prospect_id, event) values (p.id, 'optout');
  return true;
end $$;

-- Page publique /pro/invitation/<jeton> : aperçu de la fiche pré-remplie + tarifs ; note le clic (sauf aperçu admin, p_track = false).
create or replace function public.hdar_prospect_preview(p_token text, p_track boolean default true) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare p hdar.prospects; pl hdar.places;
begin
  select * into p from hdar.prospects where token = p_token and length(p_token) >= 24;
  if p.id is null then return null; end if;
  select * into pl from hdar.places where id = p.place_id;
  if p.clicked_at is null and coalesce(p_track, true) then
    update hdar.prospects set clicked_at = now(), status = case when status in ('ready','contacted','done') then 'clicked' else status end, updated_at = now() where id = p.id;
    insert into hdar.prospect_log (prospect_id, event) values (p.id, 'clicked');
  end if;
  return jsonb_build_object('name', coalesce(pl.name, p.name), 'kind', p.kind, 'segment', p.segment, 'city', p.city,
    'lat', p.lat, 'lng', p.lng, 'description', coalesce(pl.description, ''), 'website', coalesce(pl.website, p.website),
    'contact', coalesce(pl.contact, p.phone, p.instagram), 'claimable', pl.claim_token is not null and pl.claimed_at is null,
    'claimed', pl.claimed_at is not null, 'active', coalesce(pl.partner_until > now(), false), 'optout', p.status = 'optout',
    'prices', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'price_cents', price_cents) order by sort)
                        from hdar.pricing where kind = 'listing' and active), '[]'::jsonb),
    'boost_from', (select min(price_cents) from hdar.pricing where kind = 'pro_boost' and active));
end $$;

-- Suivi automatique : fiche revendiquée puis payée.
create or replace function hdar.prospect_place_sync() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.source = 'prospect' then
    if new.partner_until is not null and new.partner_until > now() then
      update hdar.prospects set status = 'paid', next_at = null, updated_at = now() where place_id = new.id and status <> 'paid';
      if found then insert into hdar.prospect_log (prospect_id, event) select id, 'paid' from hdar.prospects where place_id = new.id; end if;
    elsif new.claimed_at is not null and old.claimed_at is null then
      update hdar.prospects set status = 'claimed', next_at = null, updated_at = now() where place_id = new.id and status not in ('paid','optout');
      insert into hdar.prospect_log (prospect_id, event) select id, 'claimed' from hdar.prospects where place_id = new.id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists places_prospect_sync on hdar.places;
create trigger places_prospect_sync after update of claimed_at, partner_until on hdar.places
  for each row execute function hdar.prospect_place_sync();
revoke all on function hdar.prospect_place_sync() from public, anon, authenticated;

---------------------------------------------------------------- admin
-- Les fiches pré-créées pour la prospection (cachées, en attente de paiement) ne vont pas dans la file de modération.
create or replace function public.hdar_admin_places(p_key text)
returns table (id uuid, kind text, name text, description text, lat double precision, lng double precision, submitted_by text, at text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return query select p.id, p.kind, p.name, p.description, p.lat, p.lng, p.submitted_by, p.created_at::text
    from hdar.places p where p.status = 'pending' and p.source <> 'prospect' order by p.created_at limit 200;
end $$;

create or replace function public.hdar_admin_prospects(p_key text, p_status text default null, p_q text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'settings', (select to_jsonb(s) from hdar.prospect_settings s),
    'sent_today', (select count(*) from hdar.prospect_log where event = 'sent'
                   and at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')),
    'counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from hdar.prospects group by status) c), '{}'::jsonb),
    'segments', coalesce((select jsonb_object_agg(segment, n) from (select segment, count(*) n from hdar.prospects group by segment) c), '{}'::jsonb),
    'funnel', jsonb_build_object(
      'total', (select count(*) from hdar.prospects),
      'with_email', (select count(*) from hdar.prospects where email is not null),
      'contacted', (select count(*) from hdar.prospects where step > 0),
      'clicked', (select count(*) from hdar.prospects where clicked_at is not null),
      'claimed', (select count(*) from hdar.prospects where status in ('claimed','paid')),
      'paid', (select count(*) from hdar.prospects where status = 'paid')),
    'rows', coalesce((select jsonb_agg(r) from (
      select p.id, p.name, p.kind, p.segment, p.city, p.email, p.website, p.phone, p.status, p.step, p.next_at, p.last_sent_at,
        p.clicked_at, p.priority, p.token, p.source, p.note, p.created_at
      from hdar.prospects p
      where (p_status is null or p_status = '' or p.status = p_status)
        and (q is null or p.name ilike '%' || q || '%' or p.city ilike '%' || q || '%' or p.email ilike '%' || q || '%')
      order by p.updated_at desc limit 300) r), '[]'::jsonb));
end $$;

create or replace function public.hdar_admin_prospect_settings(p_key text, p_enabled boolean, p_cap int) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.prospect_settings set enabled = coalesce(p_enabled, enabled), daily_cap = coalesce(p_cap, daily_cap), updated_at = now();
  insert into hdar.admin_audit (admin_uid, action, detail) values (auth.uid(), 'prospect_settings', jsonb_build_object('enabled', p_enabled, 'cap', p_cap));
end $$;

create or replace function public.hdar_admin_prospect_edit(p_key text, p_id uuid, p_email text, p_status text, p_priority int, p_note text) returns void
language plpgsql security definer set search_path to '' as $$
declare e text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  perform hdar.admin_check(p_key);
  if e is not null and not hdar.prospect_email_ok(e) then raise exception 'Email invalide'; end if;
  if p_status is not null and p_status not in ('new','ready','contacted','clicked','claimed','paid','done','optout','bounced','skip') then raise exception 'Statut invalide'; end if;
  update hdar.prospects set
    email = case when p_email is null then email else e end,
    status = coalesce(p_status, case when p_email is not null and e is not null and status in ('new','bounced') then 'ready' else status end),
    priority = coalesce(p_priority, priority), note = coalesce(p_note, note), next_at = coalesce(next_at, now()), updated_at = now()
  where id = p_id;
  if p_status = 'optout' then perform public.hdar_prospect_optout((select token from hdar.prospects where id = p_id)); end if;
end $$;

revoke all on function public.hdar_prospect_upsert(jsonb), public.hdar_prospect_enrich_list(int), public.hdar_prospect_enriched(uuid, text, text),
  public.hdar_prospect_prepare(uuid), public.hdar_prospect_due(int), public.hdar_prospect_sent(uuid, int, boolean, text),
  public.hdar_prospect_optout(text), public.hdar_prospect_preview(text, boolean),
  public.hdar_admin_prospects(text, text, text), public.hdar_admin_prospect_settings(text, boolean, int),
  public.hdar_admin_prospect_edit(text, uuid, text, text, int, text) from public, anon, authenticated;
grant execute on function public.hdar_prospect_upsert(jsonb), public.hdar_prospect_enrich_list(int), public.hdar_prospect_enriched(uuid, text, text),
  public.hdar_prospect_prepare(uuid), public.hdar_prospect_due(int), public.hdar_prospect_sent(uuid, int, boolean, text),
  public.hdar_prospect_optout(text) to service_role;
grant execute on function public.hdar_prospect_preview(text, boolean) to anon, authenticated, service_role;
grant execute on function public.hdar_admin_prospects(text, text, text), public.hdar_admin_prospect_settings(text, boolean, int),
  public.hdar_admin_prospect_edit(text, uuid, text, text, int, text) to authenticated;

---------------------------------------------------------------- planification
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hdar_prospect_cron_key')
  where not exists (select 1 from vault.secrets where name = 'hdar_prospect_cron_key');
create or replace function public.hdar_prospect_cron_key() returns text language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'hdar_prospect_cron_key' $$;
revoke all on function public.hdar_prospect_cron_key() from public, anon, authenticated;
grant execute on function public.hdar_prospect_cron_key() to service_role;

-- Collecte OSM chaque lundi 4 h ; recherche d'emails + envois en semaine, chaque heure de 9 h à 17 h (heure de Paris, été).
select cron.unschedule(jobname) from cron.job where jobname in ('hdar-prospect-source', 'hdar-prospect-tick');
select cron.schedule('hdar-prospect-source', '7 2 * * 1', $c$
  select net.http_post(url := 'https://hoomzhgqzwuystwburfa.supabase.co/functions/v1/hdar-prospect',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'hdar_prospect_cron_key')),
    body := '{"action":"source"}'::jsonb, timeout_milliseconds := 120000) $c$);
select cron.schedule('hdar-prospect-tick', '13 7-15 * * 1-5', $c$
  select net.http_post(url := 'https://hoomzhgqzwuystwburfa.supabase.co/functions/v1/hdar-prospect',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'hdar_prospect_cron_key')),
    body := '{"action":"tick"}'::jsonb, timeout_milliseconds := 120000) $c$);
