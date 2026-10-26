-- hdar v84 — « Couple » dans Je suis / Je cherche (code 'c', à côté de h, f, x). Seule hdar_identity_set limitait les valeurs ;
-- carte (p.iam = any(p_iam)), Live (position(me.iam in p.seeking)) et affichage acceptent déjà un nouveau code d'une lettre.
create or replace function public.hdar_identity_set(p_iam text, p_seeking text[]) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); ok text[] := array['h', 'f', 'x', 'c'];
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
revoke all on function public.hdar_identity_set(text, text[]) from public, anon;
grant execute on function public.hdar_identity_set(text, text[]) to authenticated;
