-- hdar v78 — Liens suivis (?ref=) créés depuis l'admin « Provenance » : nom, note, avec ou sans &code=FIRST,
-- archivage. Chiffres agrégés seulement (hdar.ref_daily, hdar.profile_refs), aucune donnée personnelle. Additif.

create table if not exists hdar.ref_links (
  ref text primary key check (ref ~ '^[a-z0-9_-]{1,32}$'),
  label text not null default '' check (length(label) <= 120),
  with_code boolean not null default false,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);
alter table hdar.ref_links enable row level security;
revoke all on hdar.ref_links from anon, authenticated;

insert into hdar.ref_links (ref, label, with_code, created_at) values
  ('next1', 'Partenaire Telegram (lien 1)', false, '2026-10-23 14:00+00'),
  ('next2', 'Partenaire Telegram (lien 2, code FIRST)', true, '2026-10-23 14:00+00'),
  ('reddit', 'Reddit', false, now()),
  ('telegram', 'Telegram', false, now()),
  ('annonces', 'Petites annonces', false, now()),
  ('tiktok', 'TikTok', false, now()),
  ('instagram', 'Instagram', false, now()),
  ('x', 'X (Twitter)', false, now()),
  ('bouche-a-oreille', 'Bouche-à-oreille', false, now())
on conflict (ref) do nothing;

-- Liste : liens créés + toute ref vue dans les stats sans lien enregistré.
create or replace function public.hdar_admin_ref_links(p_key text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(t order by t.archived, t.profiles desc, t.visits desc, t.created_at desc) from (
    select r.ref, coalesce(l.label, '') label, coalesce(l.with_code, false) with_code, coalesce(l.archived, false) archived,
           coalesce(l.created_at, (select min(day)::timestamptz from hdar.ref_daily d where d.ref = r.ref)) created_at,
           coalesce((select sum(visits)::int from hdar.ref_daily d where d.ref = r.ref), 0) visits,
           (select count(*)::int from hdar.profile_refs p where p.ref = r.ref) profiles
    from (select ref from hdar.ref_links union select ref from hdar.ref_daily union select ref from hdar.profile_refs) r
    left join hdar.ref_links l on l.ref = r.ref) t), '[]'::jsonb);
end $$;

create or replace function public.hdar_admin_ref_link_save(p_key text, p_ref text, p_label text, p_with_code boolean) returns void
language plpgsql security definer set search_path to '' as $$
declare r text := lower(trim(coalesce(p_ref, '')));
begin
  perform hdar.admin_check(p_key);
  if r !~ '^[a-z0-9_-]{1,32}$' then raise exception 'Nom invalide : lettres, chiffres, - ou _ (32 max)'; end if;
  insert into hdar.ref_links (ref, label, with_code) values (r, left(trim(coalesce(p_label, '')), 120), coalesce(p_with_code, false))
  on conflict (ref) do update set label = excluded.label, with_code = excluded.with_code, archived = false;
end $$;

create or replace function public.hdar_admin_ref_link_archive(p_key text, p_ref text, p_archived boolean) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  insert into hdar.ref_links (ref, archived) values (lower(p_ref), coalesce(p_archived, true))
  on conflict (ref) do update set archived = coalesce(p_archived, true);
end $$;

revoke all on function public.hdar_admin_ref_links(text) from public, anon;
revoke all on function public.hdar_admin_ref_link_save(text, text, text, boolean) from public, anon;
revoke all on function public.hdar_admin_ref_link_archive(text, text, boolean) from public, anon;
grant execute on function public.hdar_admin_ref_links(text) to authenticated;
grant execute on function public.hdar_admin_ref_link_save(text, text, text, boolean) to authenticated;
grant execute on function public.hdar_admin_ref_link_archive(text, text, boolean) to authenticated;
