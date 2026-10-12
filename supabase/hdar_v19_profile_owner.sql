-- Profiles are bound to the auth user that created them; private sends require that binding.
update hdar.profiles p set auth_user_id = i.auth_user_id
  from hdar.identities i where i.user_id = p.user_id and p.auth_user_id is distinct from i.auth_user_id;

create or replace function hdar.require_profile(p_user text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from hdar.profiles p
    where p.user_id = p_user and p.profile_at is not null
      and p.auth_user_id = auth.uid()
      and nullif(btrim(coalesce(p.pseudo, '')), '') is not null
  ) then
    raise exception 'Crée ton profil pour envoyer un message privé';
  end if;
end $$;
revoke execute on function hdar.require_profile(text) from public, anon, authenticated;

-- A new auth user may only adopt its device id if nothing (identity or profile) exists under it.
create or replace function public.hdar_claim(p_device text)
returns text language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); s text;
begin
  if u is null then raise exception 'Non connecté'; end if;
  select i.user_id into s from hdar.identities i where i.auth_user_id = u;
  if s is not null then return s; end if;
  if p_device ~* '^[0-9a-f-]{36}$'
     and not exists (select 1 from hdar.identities i where i.user_id = lower(p_device))
     and not exists (select 1 from hdar.profiles p where p.user_id = lower(p_device)) then
    s := lower(p_device);
  else
    s := gen_random_uuid()::text;
  end if;
  insert into hdar.identities (auth_user_id, user_id) values (u, s);
  return s;
end $$;

create or replace function hdar.profile_owner_trg() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then new.auth_user_id := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists profile_owner on hdar.profiles;
create trigger profile_owner before insert or update of profile_at on hdar.profiles
  for each row execute function hdar.profile_owner_trg();

create or replace function public.hdar_delete_me()
returns void language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); u uuid := auth.uid();
begin
  delete from hdar.live_messages where from_id = s
    or split_part(thread_id, ':', 1) = s or split_part(thread_id, ':', 2) = s;
  delete from hdar.favorites where user_id = s or fav_id = s;
  delete from hdar.hidden_threads where user_id = s or other_id = s;
  delete from hdar.live_blocks where user_id = s;
  delete from hdar.live_reports where reporter_id = s;
  delete from hdar.rtc_signals where from_id = s or to_id = s;
  delete from hdar.area_messages where from_id = s;
  delete from hdar.spot_messages where from_id = s;
  delete from hdar.spots where creator_id = s;
  delete from hdar.rate_limits where user_id = s;
  delete from hdar.push_subs where user_id = s;
  delete from hdar.push_sent where user_id = s;
  delete from hdar.daily_visits where device = s;
  delete from hdar.devices where id = s;
  delete from hdar.profiles where user_id = s or auth_user_id = u;
  delete from hdar.identities where user_id = s or auth_user_id = u;
  delete from auth.users where id = u;
end $$;
revoke execute on function public.hdar_delete_me() from public, anon;
grant execute on function public.hdar_delete_me() to authenticated;
