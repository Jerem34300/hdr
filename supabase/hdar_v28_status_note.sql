-- v28 — « Un mot » (statut du moment saisi à la Connexion) : enregistré et affiché sur le profil tant que la personne est visible.
alter table hdar.profiles add column if not exists note text;

create or replace function public.hdar_pulse(p_self text, p_lat double precision, p_lng double precision, p_pseudo text, p_desires text, p_hours integer, p_note text)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  perform public.hdar_pulse(p_self, p_lat, p_lng, p_pseudo, p_desires, p_hours);
  update hdar.profiles set note = nullif(left(trim(coalesce(p_note, '')), 60), '') where user_id = s;
end $$;
revoke all on function public.hdar_pulse(text, double precision, double precision, text, text, integer, text) from public, anon;
grant execute on function public.hdar_pulse(text, double precision, double precision, text, text, integer, text) to authenticated, service_role;

drop function if exists public.hdar_profile_get(text, text);
create function public.hdar_profile_get(p_self text, p_id text)
returns table(id text, pseudo text, age integer, bio text, tags text, desires text, photo text, online boolean, lat double precision, lng double precision, note text)
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); o text := lower(left(coalesce(p_id, ''), 80));
begin
  if hdar.is_blocked(s, o) then return; end if;
  if o <> s and exists (select 1 from hdar.profiles p where p.user_id = o) then
    perform hdar.bump_user(o, 'views');
  end if;
  return query
    select p.user_id, p.pseudo, p.age, p.bio, p.tags, p.desires,
      case when p.user_id = s or p.photo_status = 'approved' then p.photo end,
      coalesce(p.visible_until > now(), false),
      case when p.visible_until > now() then hdar.round_coord(p.lat) end,
      case when p.visible_until > now() then hdar.round_coord(p.lng) end,
      case when p.visible_until > now() then p.note end
    from hdar.profiles p where p.user_id = o;
end $$;
revoke all on function public.hdar_profile_get(text, text) from public, anon;
grant execute on function public.hdar_profile_get(text, text) to authenticated, service_role;
