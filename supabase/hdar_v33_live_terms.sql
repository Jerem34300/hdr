-- v33 — Acceptation des règles du Live (horodatée, versionnée). Exigée par hdar_live_next.
create table if not exists hdar.live_terms (
  user_id text not null, version int not null, accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table hdar.live_terms enable row level security;
revoke all on hdar.live_terms from public, anon, authenticated;

create or replace function public.hdar_live_accept(p_version int) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  insert into hdar.live_terms (user_id, version) values (s, p_version) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.hdar_live_accept(int) from public, anon;
grant execute on function public.hdar_live_accept(int) to authenticated;

create or replace function hdar.live_require(s text) returns void
language plpgsql stable security definer set search_path to '' as $$
begin
  perform hdar.require_profile(s);
  if not exists (select 1 from hdar.profiles where user_id = s and photo_status = 'approved' and photo is not null) then
    raise exception 'live_photo: le Live est réservé aux profils avec une photo validée';
  end if;
  if not exists (select 1 from hdar.live_terms where user_id = s and version >= 1) then
    raise exception 'live_terms: accepte les règles du Live';
  end if;
end $$;
