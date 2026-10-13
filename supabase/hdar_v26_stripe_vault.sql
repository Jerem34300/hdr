-- Stripe secrets live in Supabase Vault (never in git). Insert once:
--   select vault.create_secret('<sk_live_...>', 'stripe_secret_key');
--   select vault.create_secret('<whsec_...>', 'stripe_webhook_secret');
-- Edge functions read them via this service_role-only RPC when env vars are missing.
create or replace function public.hdar_stripe_secret(p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if p_name not in ('stripe_secret_key','stripe_webhook_secret') then raise exception 'forbidden'; end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = p_name;
  return v;
end $$;
revoke all on function public.hdar_stripe_secret(text) from public, anon, authenticated;
grant execute on function public.hdar_stripe_secret(text) to service_role;
