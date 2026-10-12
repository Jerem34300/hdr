-- hdar v25b — client Stripe de l'utilisateur (pour le portail de gestion d'abonnement). Applied as migration hdar_v25b_portal.
create or replace function public.hdar_my_stripe_customer() returns text
language sql stable security definer set search_path = '' as $$
  select stripe_customer from hdar.payments where user_id = hdar.self_id() and stripe_customer is not null order by created_at desc limit 1;
$$;
revoke execute on function public.hdar_my_stripe_customer() from public, anon;
grant execute on function public.hdar_my_stripe_customer() to authenticated;
