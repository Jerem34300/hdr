-- hdar v9 — favoris (privés : personne ne sait qui l'a mis en favori)
create table if not exists hdar.favorites (
  user_id text not null,
  fav_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, fav_id)
);
alter table hdar.favorites enable row level security;

create or replace function public.hdar_fav_toggle(p_self text, p_id text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); t text := lower(left(coalesce(p_id, ''), 80));
begin
  if t = '' or t = s then return false; end if;
  perform hdar.rate_check(s, 'fav', 60, interval '1 minute');
  if exists (select 1 from hdar.favorites f where f.user_id = s and f.fav_id = t) then
    delete from hdar.favorites f where f.user_id = s and f.fav_id = t;
    return false;
  end if;
  if (select count(*) from hdar.favorites f where f.user_id = s) >= 200 then
    raise exception 'Maximum 200 favoris';
  end if;
  insert into hdar.favorites (user_id, fav_id) values (s, t);
  return true;
end $$;

create or replace function public.hdar_favorites(p_self text)
returns table (id text, pseudo text, live boolean, photo boolean)
language plpgsql stable security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  return query
    select f.fav_id, coalesce(p.pseudo, 'Anonyme'),
      coalesce(p.visible_until > now() and p.lat is not null, false),
      p.photo is not null
    from hdar.favorites f
    left join hdar.profiles p on p.user_id = f.fav_id
    where f.user_id = s and not hdar.is_blocked(s, f.fav_id)
    order by f.created_at desc;
end $$;

revoke execute on function public.hdar_fav_toggle(text, text), public.hdar_favorites(text) from public, anon;
grant execute on function public.hdar_fav_toggle(text, text), public.hdar_favorites(text) to authenticated;
