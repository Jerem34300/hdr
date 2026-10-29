-- v101 — Tableau de gare : nombre de membres à bord par salon de trajet (clé = même calcul que hdar_trip_join).
-- Lecture seule, aucune position, aucun membre nommé ; 60 clés max par appel.
create or replace function public.hdar_trip_counts(p_keys text[])
returns table(key text, id uuid, aboard bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(array_length(p_keys, 1), 0) > 60 then raise exception 'Trop de trajets'; end if;
  return query
    select x.trip_key, x.id, (select count(*) from hdar.trip_members t where t.salon_id = x.id and t.joined_at > now() - interval '12 hours')
    from hdar.salons x
    where x.trip_key = any (p_keys) and not x.removed and x.expires_at > now();
end $$;
revoke execute on function public.hdar_trip_counts(text[]) from public, anon;
grant execute on function public.hdar_trip_counts(text[]) to authenticated;
