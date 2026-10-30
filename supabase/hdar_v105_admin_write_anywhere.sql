-- v105 : les admins écrivent dans tous les chats de lieux et de spots sans limite de distance ni position.
-- Les autres restent soumis à v104 (profil requis, 300 m gares/métro/bus, 1 km sinon).
create or replace function hdar.place_write_check(p_kind text, p_plat double precision, p_plng double precision, p_lat double precision, p_lng double precision)
returns void language plpgsql stable set search_path to '' as $$
declare lim double precision := hdar.place_write_km(p_kind);
begin
  if hdar.is_admin_user(hdar.self_id()) then return; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Active ta position pour écrire ici';
  end if;
  if hdar.km(p_lat, p_lng, p_plat, p_plng) > lim then
    raise exception '%', case when lim < 1 then 'Tu dois être à moins de ' || round(lim * 1000)::int || ' m du lieu pour écrire'
                              else 'Tu dois être à moins de ' || lim::int || ' km du lieu pour écrire' end;
  end if;
end $$;
revoke all on function hdar.place_write_check(text, double precision, double precision, double precision, double precision) from public, anon, authenticated;
