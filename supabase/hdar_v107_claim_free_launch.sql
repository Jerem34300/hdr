-- v107 (NON appliquée) : pendant le lancement (paiements suspendus), une fiche réclamée passe directement
-- en ligne, gratuitement, pour 90 jours (au lieu de rester « réclamée, en attente de paiement »).
create or replace function public.hdar_place_claim(p_token text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); p hdar.places;
begin
  select * into p from hdar.places where claim_token = p_token and claimed_at is null for update;
  if p.id is null then raise exception 'Lien invalide ou déjà utilisé'; end if;
  if p.amb = s then raise exception 'L''ambassadeur ne peut pas réclamer sa propre fiche'; end if;
  update hdar.places set owner_id = s, claimed_at = now(), claim_token = null,
    status = 'approved', partner = true,
    partner_until = greatest(coalesce(partner_until, now()), now() + interval '90 days')
  where id = p.id;
  return jsonb_build_object('id', p.id, 'name', p.name, 'free', true, 'until', greatest(coalesce(p.partner_until, now()), now() + interval '90 days'),
    'promo', case when p.promo_status = 'approved' then p.promo end);
end $$;
