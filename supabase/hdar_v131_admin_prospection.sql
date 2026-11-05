-- v131 (PRÊTE, NON APPLIQUÉE) : admin Prospection — compteurs, filtres, export sûr
-- - Colonnes lot / country / Resend / last_activity / refused
-- - Liste admin : jamais de jeton ni d'e-mail complet (domaine seulement)
-- - Stats agrégées + jointure places (inscrit / publié)
-- Ne pas appliquer en prod sans accord explicite.

---------------------------------------------------------------- Colonnes
alter table hdar.outreach add column if not exists lot text;
alter table hdar.outreach add column if not exists country text;
alter table hdar.outreach add column if not exists resend_id text;
alter table hdar.outreach add column if not exists resend_status text;
alter table hdar.outreach add column if not exists delivered_at timestamptz;
alter table hdar.outreach add column if not exists refused_at timestamptz;
alter table hdar.outreach add column if not exists last_activity_at timestamptz;

create index if not exists outreach_lot on hdar.outreach (lot) where lot is not null;
create index if not exists outreach_country on hdar.outreach (country) where country is not null;
create index if not exists outreach_resend on hdar.outreach (resend_id) where resend_id is not null;

-- Statuts étendus (garder les anciens)
do $$ begin
  alter table hdar.outreach drop constraint if exists outreach_status_check;
exception when undefined_object then null;
end $$;
alter table hdar.outreach drop constraint if exists outreach_status_check;
-- le nom exact du check peut varier : on recrée via validate
alter table hdar.outreach
  add constraint outreach_status_check
  check (status in ('ready', 'sent', 'delivered', 'opened', 'claimed', 'published', 'refused', 'suppressed', 'bounced'));

-- Kinds : sex-shop / cruising stockés souvent en 'other' côté places ; on assouplit outreach.kind
do $$ begin
  alter table hdar.outreach drop constraint if exists outreach_kind_check;
exception when undefined_object then null;
end $$;
alter table hdar.outreach drop constraint if exists outreach_kind_check;
alter table hdar.outreach
  add constraint outreach_kind_check
  check (kind in ('bar', 'club', 'sauna', 'other', 'sex-shop', 'cruising-bar', 'boite', 'club-echange'));

---------------------------------------------------------------- Helpers
create or replace function hdar.outreach_email_domain(p_email text) returns text
language sql immutable parallel safe set search_path to '' as $$
  select nullif(lower(split_part(btrim(coalesce(p_email, '')), '@', 2)), '');
$$;

create or replace function hdar.outreach_last_activity(
  p_created timestamptz, p_sent timestamptz, p_opened timestamptz,
  p_claimed timestamptz, p_suppressed timestamptz, p_delivered timestamptz, p_refused timestamptz,
  p_last timestamptz
) returns timestamptz
language sql immutable parallel safe set search_path to '' as $$
  select greatest(
    coalesce(p_last, p_created),
    coalesce(p_sent, p_created),
    coalesce(p_opened, p_created),
    coalesce(p_claimed, p_created),
    coalesce(p_suppressed, p_created),
    coalesce(p_delivered, p_created),
    coalesce(p_refused, p_created),
    p_created
  );
$$;

---------------------------------------------------------------- Stats
create or replace function public.hdar_admin_outreach_stats(p_key text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  r jsonb;
begin
  perform hdar.admin_check(p_key);
  select jsonb_build_object(
    'envoyes', count(*) filter (where o.status in ('sent','delivered','opened','claimed','published','bounced','refused') or o.sent_at is not null),
    'delivres', count(*) filter (
      where o.resend_status in ('delivered','opened') or o.status = 'delivered' or o.delivered_at is not null
    ),
    'bounces', count(*) filter (where o.status = 'bounced' or o.resend_status = 'bounced'),
    'fiches_ouvertes', count(*) filter (where o.opened_at is not null or o.status = 'opened'),
    'inscrits', count(*) filter (
      where o.status in ('claimed','published') or o.claimed_at is not null or p.claimed_at is not null or p.owner_id is not null
    ),
    'publiees', count(*) filter (
      where o.status = 'published' or (p.status = 'approved' and p.claimed_at is not null)
    ),
    'refus', count(*) filter (where o.status = 'refused' or o.refused_at is not null),
    'desinscrits', count(*) filter (where o.status = 'suppressed'),
    'en_attente', count(*) filter (
      where o.status in ('ready','sent','delivered','opened')
        and o.claimed_at is null and p.claimed_at is null
        and o.suppressed_at is null and o.refused_at is null
        and o.status not in ('bounced','suppressed','refused','claimed','published')
    ),
    'total', count(*)
  ) into r
  from hdar.outreach o
  join hdar.places p on p.id = o.place_id;
  return coalesce(r, '{}'::jsonb);
end $$;

---------------------------------------------------------------- Liste (sans jetons / sans e-mail complet)
drop function if exists public.hdar_admin_outreach_list(text, text, text, int);
create or replace function public.hdar_admin_outreach_list(
  p_key text,
  p_status text default null,
  p_city text default null,
  p_limit int default 500,
  p_country text default null,
  p_kind text default null,
  p_lot text default null
) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  st text := nullif(btrim(coalesce(p_status, '')), '');
  city_f text := nullif(btrim(coalesce(p_city, '')), '');
  country_f text := nullif(btrim(coalesce(p_country, '')), '');
  kind_f text := nullif(btrim(coalesce(p_kind, '')), '');
  lot_f text := nullif(btrim(coalesce(p_lot, '')), '');
  lim int := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  perform hdar.admin_check(p_key);
  return coalesce((
    select jsonb_agg(to_jsonb(x) - 'sort_at' order by x.sort_at desc)
    from (
      select
        o.id,
        o.place_id,
        o.kind,
        o.name,
        o.city,
        o.country,
        o.lot,
        hdar.outreach_email_domain(o.email) as email_domain,
        o.status,
        o.resend_status,
        o.sent_at,
        o.opened_at,
        o.claimed_at,
        o.suppressed_at,
        o.delivered_at,
        o.refused_at,
        o.created_at,
        hdar.outreach_last_activity(
          o.created_at, o.sent_at, o.opened_at, o.claimed_at, o.suppressed_at, o.delivered_at, o.refused_at, o.last_activity_at
        ) as last_activity_at,
        o.note,
        p.status as place_status,
        (p.claimed_at is not null or p.owner_id is not null) as place_claimed,
        (p.status = 'approved' and p.claimed_at is not null) as place_published,
        hdar.outreach_last_activity(
          o.created_at, o.sent_at, o.opened_at, o.claimed_at, o.suppressed_at, o.delivered_at, o.refused_at, o.last_activity_at
        ) as sort_at
      from hdar.outreach o
      join hdar.places p on p.id = o.place_id
      where (st is null or o.status = st)
        and (city_f is null or lower(o.city) = lower(city_f))
        and (country_f is null or lower(o.country) = lower(country_f))
        and (kind_f is null or o.kind = kind_f)
        and (lot_f is null or o.lot = lot_f)
      order by sort_at desc nulls last
      limit lim
    ) x
  ), '[]'::jsonb);
end $$;

---------------------------------------------------------------- Mark refused (optionnel admin)
create or replace function public.hdar_admin_outreach_mark_refused(p_key text, p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.outreach set
    status = 'refused',
    refused_at = now(),
    last_activity_at = now(),
    note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
  where id = p_id and status not in ('suppressed', 'claimed', 'published');
end $$;

---------------------------------------------------------------- Touche last_activity sur mark_sent / suppress (réécritures légères)
create or replace function public.hdar_admin_outreach_mark_sent(p_key text, p_ids uuid[]) returns int
language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  perform hdar.admin_check(p_key);
  update hdar.outreach set status = 'sent', sent_at = coalesce(sent_at, now()), last_activity_at = now()
    where id = any (p_ids) and status = 'ready';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.hdar_admin_outreach_suppress(p_key text, p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.outreach set
    status = 'suppressed',
    suppressed_at = now(),
    last_activity_at = now(),
    note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
  where id = p_id;
end $$;

revoke all on function public.hdar_admin_outreach_stats(text) from public, anon;
revoke all on function public.hdar_admin_outreach_list(text, text, text, int, text, text, text) from public, anon;
revoke all on function public.hdar_admin_outreach_mark_refused(text, uuid, text) from public, anon;
revoke all on function public.hdar_admin_outreach_mark_sent(text, uuid[]) from public, anon;
revoke all on function public.hdar_admin_outreach_suppress(text, uuid, text) from public, anon;

grant execute on function public.hdar_admin_outreach_stats(text) to authenticated;
grant execute on function public.hdar_admin_outreach_list(text, text, text, int, text, text, text) to authenticated;
grant execute on function public.hdar_admin_outreach_mark_refused(text, uuid, text) to authenticated;
grant execute on function public.hdar_admin_outreach_mark_sent(text, uuid[]) to authenticated;
grant execute on function public.hdar_admin_outreach_suppress(text, uuid, text) to authenticated;
