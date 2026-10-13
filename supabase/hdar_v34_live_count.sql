-- v34 — Nombre de personnes dans le Live (global, pour la pastille de la carte).
create or replace function public.hdar_live_count() returns integer
language sql stable security definer set search_path to '' as $$
  select count(*)::int from hdar.live_queue where seen_at > now() - interval '15 seconds';
$$;
revoke all on function public.hdar_live_count() from public;
grant execute on function public.hdar_live_count() to anon, authenticated;
