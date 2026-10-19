-- v67 : nombre total de personnes avec l'appli ouverte (battement hdar_hit toutes les 2 min,
-- appli visible) dans les 5 dernières minutes. Total anonyme uniquement.
create or replace function public.hdar_online_count()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int from hdar.devices d where d.last_seen > now() - interval '5 minutes';
$$;
revoke all on function public.hdar_online_count() from public;
grant execute on function public.hdar_online_count() to anon, authenticated;
