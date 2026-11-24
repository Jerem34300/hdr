-- v147 : onglet admin « Fiches lieux »
-- Suivi des fiches (vues, avis, chat, photos, réclamations, modifications).
-- NON appliquée en prod tant que Jérémie n'a pas validé.
-- Pas dans supabase/data. Aucun e-mail envoyé.
-- Lecture et actions réservées aux comptes dans hdar.admins (hdar.admin_check).
-- Données sensibles : le justificatif n'est renvoyé que pour une demande en
-- attente, et il est effacé dès qu'elle est traitée. Les codes de vérification
-- et les e-mails de contact des lieux ne sont pas exposés dans la liste.

---------------------------------------------------------------- Photos avec source + historique propriétaire
create table if not exists hdar.place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  url text not null,
  url_hash text not null,
  source_url text,
  credit text,
  hidden boolean not null default false,
  hidden_at timestamptz,
  hidden_reason text,
  created_at timestamptz not null default now()
);
create unique index if not exists place_photos_place_hash on hdar.place_photos (place_id, url_hash);
create index if not exists place_photos_place on hdar.place_photos (place_id, created_at);
alter table hdar.place_photos enable row level security;
revoke all on hdar.place_photos from public, anon, authenticated;

create table if not exists hdar.place_owner_edits (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  user_id text,
  actor text not null default 'system' check (actor in ('owner', 'admin', 'system')),
  changes jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists place_owner_edits_place on hdar.place_owner_edits (place_id, at desc);
create index if not exists place_owner_edits_at on hdar.place_owner_edits (at desc);
alter table hdar.place_owner_edits enable row level security;
revoke all on hdar.place_owner_edits from public, anon, authenticated;

alter table hdar.place_claim_requests add column if not exists method text;
do $$ begin
  alter table hdar.place_claim_requests drop constraint if exists place_claim_requests_method_check;
  alter table hdar.place_claim_requests add constraint place_claim_requests_method_check
    check (method is null or method in ('email_official', 'email_domain', 'admin_manual'));
end $$;
update hdar.place_claim_requests set method = 'admin_manual' where method is null;

---------------------------------------------------------------- Remplissage photos existantes (source = crédit déjà connu, souvent le site)
insert into hdar.place_photos (place_id, url, url_hash, source_url, credit)
select p.id,
       x,
       encode(sha256(convert_to(x, 'utf8')), 'hex'),
       case when coalesce(p.cover_credit, '') ~* '^https?://' then p.cover_credit end,
       nullif(btrim(coalesce(p.cover_credit, '')), '')
from hdar.places p
cross join lateral unnest(coalesce(p.photos, '{}'::text[])) as x
where x <> ''
on conflict (place_id, url_hash) do nothing;

---------------------------------------------------------------- Statut lisible d'une fiche
create or replace function hdar.fiche_status(p hdar.places) returns text
language sql stable set search_path to '' as $$
  select case
    when p.map_listing = 'partner' then 'partner'
    when coalesce(p.verified, false) then 'verified'
    when p.owner_id is not null
      or p.claimed_at is not null
      or exists (
        select 1 from hdar.place_claim_requests r
        where r.place_id = p.id and r.status = 'pending'
      ) then 'claimed'
    else 'discover'
  end
$$;
revoke all on function hdar.fiche_status(hdar.places) from public, anon, authenticated;

---------------------------------------------------------------- Triggers : historique, photos, preuves e-mail (sans toucher aux codes)
create or replace function hdar.on_place_fiche_edit() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  s text;
  actor text := 'system';
  changes jsonb := '{}'::jsonb;
begin
  begin
    s := hdar.self_id();
  exception when others then
    s := null;
  end;
  if s is not null and new.owner_id is not null and new.owner_id = s then
    actor := 'owner';
  elsif exists (select 1 from hdar.admins a where a.auth_user_id = auth.uid()) then
    actor := 'admin';
  end if;

  if old.description is distinct from new.description then
    changes := changes || jsonb_build_object('description', jsonb_build_object(
      'from', left(coalesce(old.description, ''), 200),
      'to', left(coalesce(new.description, ''), 200)
    ));
  end if;
  if old.hours is distinct from new.hours then
    changes := changes || jsonb_build_object('hours', jsonb_build_object('from', old.hours, 'to', new.hours));
  end if;
  if old.address is distinct from new.address then
    changes := changes || jsonb_build_object('address', jsonb_build_object('from', old.address, 'to', new.address));
  end if;
  if old.website is distinct from new.website then
    changes := changes || jsonb_build_object('website', jsonb_build_object('from', old.website, 'to', new.website));
  end if;
  if old.tags is distinct from new.tags then
    changes := changes || jsonb_build_object('tags', jsonb_build_object('from', to_jsonb(old.tags), 'to', to_jsonb(new.tags)));
  end if;
  if old.photos is distinct from new.photos then
    changes := changes || jsonb_build_object('photos', jsonb_build_object(
      'from_n', cardinality(coalesce(old.photos, '{}')),
      'to_n', cardinality(coalesce(new.photos, '{}'))
    ));
  end if;
  if cardinality(coalesce(old.pending_photos, '{}')) is distinct from cardinality(coalesce(new.pending_photos, '{}')) then
    changes := changes || jsonb_build_object('pending_photos', jsonb_build_object(
      'from_n', cardinality(coalesce(old.pending_photos, '{}')),
      'to_n', cardinality(coalesce(new.pending_photos, '{}'))
    ));
  end if;

  if changes <> '{}'::jsonb then
    insert into hdar.place_owner_edits (place_id, user_id, actor, changes)
    values (new.id, s, actor, changes);
  end if;
  return new;
end $$;
revoke all on function hdar.on_place_fiche_edit() from public, anon, authenticated;
drop trigger if exists place_fiche_edit on hdar.places;
create trigger place_fiche_edit after update on hdar.places
  for each row execute function hdar.on_place_fiche_edit();

create or replace function hdar.on_place_photos_sync() returns trigger
language plpgsql security definer set search_path to '' as $$
declare x text;
begin
  if new.photos is not null then
    foreach x in array new.photos loop
      if x is not null and x <> '' then
        insert into hdar.place_photos (place_id, url, url_hash, source_url, credit)
        values (
          new.id,
          x,
          encode(sha256(convert_to(x, 'utf8')), 'hex'),
          case when coalesce(new.cover_credit, '') ~* '^https?://' then new.cover_credit end,
          nullif(btrim(coalesce(new.cover_credit, '')), '')
        )
        on conflict (place_id, url_hash) do nothing;
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function hdar.on_place_photos_sync() from public, anon, authenticated;
drop trigger if exists place_photos_sync on hdar.places;
create trigger place_photos_sync after insert or update of photos, cover_credit on hdar.places
  for each row execute function hdar.on_place_photos_sync();

-- Quand un code e-mail est validé, on enregistre la réclamation (déjà acceptée).
-- On ne copie jamais le code ni le hash.
create or replace function hdar.on_verify_code_used() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.used_at is not null and old.used_at is null then
    insert into hdar.place_claim_requests (place_id, user_id, email, justification, proof, status, method, reviewed_at)
    values (
      new.place_id,
      new.user_id,
      new.email,
      'Preuve par code e-mail',
      null,
      'approved',
      new.method,
      new.used_at
    );
  end if;
  return new;
end $$;
revoke all on function hdar.on_verify_code_used() from public, anon, authenticated;
drop trigger if exists place_verify_code_used on hdar.place_verify_codes;
create trigger place_verify_code_used after update of used_at on hdar.place_verify_codes
  for each row execute function hdar.on_verify_code_used();

---------------------------------------------------------------- RPC : liste filtrable
create or replace function public.hdar_admin_fiches(
  p_key text,
  p_city text default null,
  p_country text default null,
  p_kind text default null,
  p_status text default null,
  p_q text default null,
  p_offset int default 0,
  p_limit int default 80
) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
declare
  off int := greatest(coalesce(p_offset, 0), 0);
  lim int := least(greatest(coalesce(p_limit, 80), 1), 200);
  filter_q text := nullif(btrim(coalesce(p_q, '')), '');
  filter_city text := nullif(btrim(coalesce(p_city, '')), '');
  filter_country text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  filter_kind text := nullif(btrim(coalesce(p_kind, '')), '');
  st text := nullif(btrim(coalesce(p_status, '')), '');
  total int := 0;
  pending int := 0;
  rows jsonb := '[]'::jsonb;
begin
  perform hdar.admin_check(p_key);
  if st is not null and st not in ('discover', 'claimed', 'verified', 'partner') then
    raise exception 'Statut inconnu';
  end if;

  select count(*) into pending from hdar.place_claim_requests r where r.status = 'pending';

  with base as (
    select p.*, hdar.fiche_status(p) as fiche_status
    from hdar.places p
    where (
      p.map_listing in ('discover', 'partner')
      or coalesce(p.verified, false)
      or p.owner_id is not null
      or exists (select 1 from hdar.place_claim_requests r where r.place_id = p.id)
    )
  ),
  ratings as (
    select place_id, count(*)::int as n, round(avg(stars)::numeric, 1) as avg
    from hdar.place_ratings group by 1
  ),
  comments as (
    select place_id,
           count(*) filter (where not hidden)::int as n,
           max(created_at) as last_at
    from hdar.place_comments group by 1
  ),
  msgs as (
    select place_id,
           count(*) filter (where not removed)::int as n,
           max(created_at) as last_at
    from hdar.place_messages group by 1
  ),
  daily as (
    select place_id,
           coalesce(sum(views), 0)::int as views,
           coalesce(sum(messages), 0)::int as messages,
           max(day) as last_day
    from hdar.place_daily group by 1
  ),
  claims as (
    select place_id, max(created_at) as last_at,
           count(*) filter (where status = 'pending')::int as pending
    from hdar.place_claim_requests group by 1
  ),
  edits as (
    select place_id, max(at) as last_at from hdar.place_owner_edits group by 1
  ),
  filtered as (
    select b.*,
           coalesce(d.views, 0) as views,
           coalesce(r.n, 0) as ratings,
           r.avg as avg_stars,
           coalesce(c.n, 0) as comments,
           coalesce(d.messages, 0) as messages,
           coalesce(m.n, 0) as messages_now,
           coalesce(cl.pending, 0) as pending_claims,
           greatest(
             b.verified_at,
             b.claimed_at,
             b.reviewed_at,
             c.last_at,
             m.last_at,
             cl.last_at,
             e.last_at,
             case when d.last_day is not null then d.last_day::timestamptz end
           ) as last_activity
    from base b
    left join ratings r on r.place_id = b.id
    left join comments c on c.place_id = b.id
    left join msgs m on m.place_id = b.id
    left join daily d on d.place_id = b.id
    left join claims cl on cl.place_id = b.id
    left join edits e on e.place_id = b.id
    where (filter_city is null or b.city ilike filter_city)
      and (filter_country is null or upper(coalesce(b.country, '')) = filter_country)
      and (filter_kind is null or coalesce(b.venue_kind, b.kind) = filter_kind)
      and (st is null or b.fiche_status = st)
      and (filter_q is null or b.name ilike '%' || filter_q || '%' or coalesce(b.city, '') ilike '%' || filter_q || '%')
  ),
  page as (
    select f.name as place_name, f.last_activity, jsonb_build_object(
      'id', f.id,
      'name', f.name,
      'city', f.city,
      'country', f.country,
      'kind', coalesce(f.venue_kind, f.kind),
      'status', f.fiche_status,
      'views', f.views,
      'ratings', f.ratings,
      'avg_stars', f.avg_stars,
      'comments', f.comments,
      'messages', f.messages,
      'messages_now', f.messages_now,
      'pending_claims', f.pending_claims,
      'pending_photos', cardinality(coalesce(f.pending_photos, '{}')),
      'has_owner', f.owner_id is not null,
      'last_activity', f.last_activity,
      'photos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ph.id,
          'url', ph.url,
          'source_url', ph.source_url,
          'credit', ph.credit,
          'hidden', ph.hidden
        ) order by ph.created_at, ph.id)
        from hdar.place_photos ph
        where ph.place_id = f.id
      ), '[]'::jsonb)
    ) as row
    from filtered f
    order by f.last_activity desc nulls last, f.name
    offset off limit lim
  )
  select
    (select count(*) from filtered),
    coalesce((select jsonb_agg(page.row order by page.last_activity desc nulls last, page.place_name) from page), '[]'::jsonb)
  into total, rows;

    return jsonb_build_object(
    'total', total,
    'pending_claims', pending,
    'offset', off,
    'limit', lim,
    'rows', rows,
    'cities', coalesce((
      select jsonb_agg(c order by c)
      from (select distinct city as c from hdar.places where city is not null and map_listing in ('discover', 'partner') order by 1) q
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(c order by c)
      from (select distinct upper(country) as c from hdar.places where country is not null and map_listing in ('discover', 'partner') order by 1) q
    ), '[]'::jsonb)
  );
end $$;

---------------------------------------------------------------- RPC : détail d'une fiche (modération + historique)
create or replace function public.hdar_admin_fiche(p_key text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare p hdar.places;
begin
  perform hdar.admin_check(p_key);
  select * into p from hdar.places where id = p_id;
  if p.id is null then raise exception 'Lieu introuvable'; end if;
  return jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'city', p.city,
    'country', p.country,
    'address', p.address,
    'hours', p.hours,
    'website', p.website,
    'kind', coalesce(p.venue_kind, p.kind),
    'status', hdar.fiche_status(p),
    'verified', coalesce(p.verified, false),
    'verify_method', p.verify_method,
    'has_owner', p.owner_id is not null,
    'owner_pseudo', (select pr.pseudo from hdar.profiles pr where pr.user_id = p.owner_id),
    'claimed_at', p.claimed_at,
    'verified_at', p.verified_at,
    'description', p.description,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ph.id, 'url', ph.url, 'source_url', ph.source_url,
        'credit', ph.credit, 'hidden', ph.hidden, 'hidden_reason', ph.hidden_reason,
        'hidden_at', ph.hidden_at, 'created_at', ph.created_at
      ) order by ph.created_at, ph.id)
      from hdar.place_photos ph where ph.place_id = p.id
    ), '[]'::jsonb),
    'pending_photos_n', cardinality(coalesce(p.pending_photos, '{}')),
    'avis', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'body', c.body,
        'at', c.created_at,
        'hidden', c.hidden,
        'pseudo', coalesce(pr.pseudo, 'Profil effacé'),
        'stars', (select r.stars from hdar.place_ratings r where r.place_id = p.id and r.user_id = c.user_id)
      ) order by c.created_at desc)
      from hdar.place_comments c
      left join hdar.profiles pr on pr.user_id = c.user_id
      where c.place_id = p.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_build_object(
        'count', count(*)::int,
        'avg', round(avg(stars)::numeric, 1)
      )
      from hdar.place_ratings where place_id = p.id
    ), jsonb_build_object('count', 0, 'avg', null)),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'body', m.body,
        'at', m.created_at,
        'hidden', m.removed,
        'pseudo', coalesce(nullif(m.pseudo, ''), 'Anonyme')
      ) order by m.created_at desc)
      from (
        select * from hdar.place_messages
        where place_id = p.id
        order by created_at desc
        limit 100
      ) m
    ), '[]'::jsonb),
    'edits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'at', e.at,
        'actor', e.actor,
        'pseudo', case
          when e.actor = 'owner' then coalesce(pr.pseudo, 'Propriétaire')
          when e.actor = 'admin' then 'Administration'
          else 'Système'
        end,
        'changes', e.changes
      ) order by e.at desc)
      from (
        select * from hdar.place_owner_edits
        where place_id = p.id
        order by at desc
        limit 50
      ) e
      left join hdar.profiles pr on pr.user_id = e.user_id
    ), '[]'::jsonb)
  );
end $$;

---------------------------------------------------------------- RPC : file des réclamations
create or replace function public.hdar_admin_fiche_claims(p_key text, p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare st text := nullif(btrim(coalesce(p_status, '')), '');
begin
  perform hdar.admin_check(p_key);
  if st is not null and st not in ('pending', 'approved', 'rejected', 'all') then
    raise exception 'Statut inconnu';
  end if;
  if st = 'all' then st := null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'place_id', r.place_id,
      'name', p.name,
      'city', p.city,
      'kind', coalesce(p.venue_kind, p.kind),
      'status', r.status,
      'method', coalesce(r.method, 'admin_manual'),
      'email', r.email,
      'justification', r.justification,
      'has_proof', r.proof is not null,
      'proof', case when r.status = 'pending' then r.proof else null end,
      'requester_pseudo', coalesce(pr.pseudo, 'Profil effacé'),
      'admin_note', r.admin_note,
      'created_at', r.created_at,
      'reviewed_at', r.reviewed_at
    ) order by r.created_at desc)
    from hdar.place_claim_requests r
    join hdar.places p on p.id = r.place_id
    left join hdar.profiles pr on pr.user_id = r.user_id
    where st is null or r.status = st
  ), '[]'::jsonb);
end $$;

-- Valider / refuser. Le justificatif est effacé après décision (RGPD).
create or replace function public.hdar_admin_fiche_claim_review(p_key text, p_id uuid, p_ok boolean, p_note text default null) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform public.hdar_admin_claim_review(p_key, p_id, p_ok, p_note);
  update hdar.place_claim_requests set proof = null where id = p_id;
end $$;

---------------------------------------------------------------- RPC : historique global des modifications propriétaires
create or replace function public.hdar_admin_fiche_edits(p_key text, p_limit int default 80) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare lim int := least(greatest(coalesce(p_limit, 80), 1), 200);
begin
  perform hdar.admin_check(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'place_id', e.place_id,
      'name', p.name,
      'city', p.city,
      'at', e.at,
      'actor', e.actor,
      'pseudo', case
        when e.actor = 'owner' then coalesce(pr.pseudo, 'Propriétaire')
        when e.actor = 'admin' then 'Administration'
        else 'Système'
      end,
      'changes', e.changes
    ) order by e.at desc)
    from (
      select * from hdar.place_owner_edits
      where actor = 'owner'
      order by at desc
      limit lim
    ) e
    join hdar.places p on p.id = e.place_id
    left join hdar.profiles pr on pr.user_id = e.user_id
  ), '[]'::jsonb);
end $$;

---------------------------------------------------------------- Modération : masquer un avis, un message, retirer une photo
create or replace function public.hdar_admin_fiche_hide_avis(p_key text, p_id uuid, p_hide boolean default true) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.place_comments set hidden = coalesce(p_hide, true) where id = p_id;
  if not found then raise exception 'Avis introuvable'; end if;
end $$;

create or replace function public.hdar_admin_fiche_hide_message(p_key text, p_id uuid, p_hide boolean default true) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.place_messages set removed = coalesce(p_hide, true) where id = p_id;
  if not found then raise exception 'Message introuvable'; end if;
end $$;

create or replace function public.hdar_admin_fiche_remove_photo(p_key text, p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path to '' as $$
declare ph hdar.place_photos;
  why text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
begin
  perform hdar.admin_check(p_key);
  select * into ph from hdar.place_photos where id = p_id for update;
  if ph.id is null then raise exception 'Photo introuvable'; end if;
  update hdar.place_photos set
    hidden = true,
    hidden_at = now(),
    hidden_reason = coalesce(why, 'Retrait demandé')
  where id = ph.id;
  update hdar.places set
    photos = array(select x from unnest(coalesce(photos, '{}')) x where x is distinct from ph.url)
  where id = ph.place_id;
end $$;

---------------------------------------------------------------- Droits
revoke all on function public.hdar_admin_fiches(text, text, text, text, text, text, int, int) from public, anon;
revoke all on function public.hdar_admin_fiche(text, uuid) from public, anon;
revoke all on function public.hdar_admin_fiche_claims(text, text) from public, anon;
revoke all on function public.hdar_admin_fiche_claim_review(text, uuid, boolean, text) from public, anon;
revoke all on function public.hdar_admin_fiche_edits(text, int) from public, anon;
revoke all on function public.hdar_admin_fiche_hide_avis(text, uuid, boolean) from public, anon;
revoke all on function public.hdar_admin_fiche_hide_message(text, uuid, boolean) from public, anon;
revoke all on function public.hdar_admin_fiche_remove_photo(text, uuid, text) from public, anon;

grant execute on function public.hdar_admin_fiches(text, text, text, text, text, text, int, int) to authenticated;
grant execute on function public.hdar_admin_fiche(text, uuid) to authenticated;
grant execute on function public.hdar_admin_fiche_claims(text, text) to authenticated;
grant execute on function public.hdar_admin_fiche_claim_review(text, uuid, boolean, text) to authenticated;
grant execute on function public.hdar_admin_fiche_edits(text, int) to authenticated;
grant execute on function public.hdar_admin_fiche_hide_avis(text, uuid, boolean) to authenticated;
grant execute on function public.hdar_admin_fiche_hide_message(text, uuid, boolean) to authenticated;
grant execute on function public.hdar_admin_fiche_remove_photo(text, uuid, text) to authenticated;
