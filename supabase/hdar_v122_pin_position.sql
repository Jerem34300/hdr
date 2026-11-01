-- v122 : « Place-toi sur la carte » quand la géolocalisation est refusée.
-- Épingle arrondie côté serveur (~1 km), badge « position choisie » visible des autres,
-- interdite si une vraie position est active, déplacements limités. Préparé, NON appliqué.

create table if not exists hdar.pos_meta (
  user_id text primary key,
  pin_lat double precision,
  pin_lng double precision,
  pin_at timestamptz,
  real_at timestamptz,          -- dernier pulse issu d'une vraie géolocalisation
  chosen boolean not null default false
);
alter table hdar.pos_meta enable row level security; -- aucune policy : accès via les RPC uniquement
revoke all on hdar.pos_meta from anon, authenticated;

-- Pose / déplace l'épingle. Renvoie la position arrondie retenue.
create or replace function public.hdar_pin_set(p_lat double precision, p_lng double precision)
returns table(lat double precision, lng double precision)
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); m hdar.pos_meta; la double precision; lo double precision;
begin
  if s is null or s = '' then raise exception 'auth'; end if;
  if p_lat is null or p_lng is null or p_lat not between -85 and 85 or p_lng not between -180 and 180 then raise exception 'pin_invalid'; end if;
  select * into m from hdar.pos_meta where user_id = s;
  if m.real_at is not null and m.real_at > now() - interval '30 minutes' then raise exception 'pin_real_active'; end if;
  if m.pin_at is not null and m.pin_at > now() - interval '2 minutes' then raise exception 'pin_too_soon'; end if;
  perform hdar.rate_check(s, 'pin', 12, interval '1 day');
  la := round(p_lat * 100) / 100;   -- grille ~1,1 km
  lo := round(p_lng * 100) / 100;
  insert into hdar.pos_meta (user_id, pin_lat, pin_lng, pin_at, chosen) values (s, la, lo, now(), true)
    on conflict (user_id) do update set pin_lat = la, pin_lng = lo, pin_at = now(), chosen = true;
  update hdar.profiles p set lat = la, lng = lo, updated_at = now() where p.user_id = s and p.visible_until > now();
  return query select la, lo;
end $$;
revoke execute on function public.hdar_pin_set(double precision, double precision) from public, anon;
grant execute on function public.hdar_pin_set(double precision, double precision) to authenticated;

-- Retire l'épingle (la vraie géolocalisation la remplace).
create or replace function public.hdar_pin_clear()
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  update hdar.pos_meta set chosen = false, pin_lat = null, pin_lng = null where user_id = s;
end $$;
revoke execute on function public.hdar_pin_clear() from public, anon;
grant execute on function public.hdar_pin_clear() to authenticated;

-- Pulse avec drapeau : une épingle ne peut être « pulsée » qu'à sa position enregistrée ;
-- un pulse réel note real_at et efface le badge.
create or replace function public.hdar_pulse(p_self text, p_lat double precision, p_lng double precision, p_pseudo text, p_desires text, p_hours integer, p_note text, p_chosen boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); m hdar.pos_meta;
begin
  if coalesce(p_chosen, false) then
    select * into m from hdar.pos_meta where user_id = s;
    if m.user_id is null or not m.chosen or m.pin_lat is null then raise exception 'pin_missing'; end if;
    if m.real_at is not null and m.real_at > now() - interval '30 minutes' then raise exception 'pin_real_active'; end if;
    perform public.hdar_pulse(p_self, m.pin_lat, m.pin_lng, p_pseudo, p_desires, p_hours, p_note);
  else
    perform public.hdar_pulse(p_self, p_lat, p_lng, p_pseudo, p_desires, p_hours, p_note);
    insert into hdar.pos_meta (user_id, real_at, chosen) values (s, now(), false)
      on conflict (user_id) do update set real_at = now(), chosen = false, pin_lat = null, pin_lng = null;
  end if;
end $$;
revoke execute on function public.hdar_pulse(text, double precision, double precision, text, text, integer, text, boolean) from public, anon;
grant execute on function public.hdar_pulse(text, double precision, double precision, text, text, integer, text, boolean) to authenticated;

-- Badges : parmi ces identifiants, lesquels ont une position choisie (hors bloqués).
create or replace function public.hdar_pos_chosen(p_ids text[])
returns setof text language sql stable security definer set search_path to '' as $$
  select m.user_id from hdar.pos_meta m
  where m.chosen and m.user_id = any (p_ids[1:300])
    and not hdar.is_blocked(hdar.self_id(), m.user_id);
$$;
revoke execute on function public.hdar_pos_chosen(text[]) from public;
grant execute on function public.hdar_pos_chosen(text[]) to anon, authenticated;
