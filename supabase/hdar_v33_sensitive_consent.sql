-- hdar v33 — Consentement explicite (art. 9 RGPD) pour Je suis / Je cherche, horodaté en base
alter table hdar.profiles add column if not exists sensitive_consent_at timestamptz;

create or replace function public.hdar_sensitive_consent(p_on boolean)
returns timestamptz language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); t timestamptz;
begin
  perform hdar.require_profile(s);
  if p_on then
    update hdar.profiles set sensitive_consent_at = coalesce(sensitive_consent_at, now()) where user_id = s returning sensitive_consent_at into t;
  else
    update hdar.profiles set sensitive_consent_at = null, iam = null, seeking = null where user_id = s;
  end if;
  return t;
end $$;
revoke all on function public.hdar_sensitive_consent(boolean) from public, anon;
grant execute on function public.hdar_sensitive_consent(boolean) to authenticated, service_role;

create or replace function public.hdar_sensitive_consent_get()
returns timestamptz language sql stable security definer set search_path to '' as $$
  select sensitive_consent_at from hdar.profiles where user_id = hdar.self_id() $$;
revoke all on function public.hdar_sensitive_consent_get() from public, anon;
grant execute on function public.hdar_sensitive_consent_get() to authenticated, service_role;

create or replace function public.hdar_identity_set(p_iam text, p_seeking text[])
returns void language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); ok text[] := array['h', 'f', 'x'];
begin
  perform hdar.require_profile(s);
  if (coalesce(p_iam, '') <> '' or coalesce(array_length(p_seeking, 1), 0) > 0)
     and not exists (select 1 from hdar.profiles where user_id = s and sensitive_consent_at is not null) then
    raise exception 'Consentement requis';
  end if;
  update hdar.profiles set
    iam = case when p_iam = any(ok) then p_iam end,
    seeking = nullif(array_to_string(array(select distinct x from unnest(coalesce(p_seeking, '{}')) x where x = any(ok) order by 1), ','), '')
  where user_id = s;
end $$;
