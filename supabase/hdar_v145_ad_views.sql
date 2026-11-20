-- v145 : vues uniques des petites annonces (une personne / un appareil, une fois par annonce).
-- Identifiant = hdar.self_id() (déjà utilisé partout : session liée à l'appareil).
-- Pas d'IP, pas d'user-agent, pas de position. L'auteur ne compte pas.
-- Le compteur n'est renvoyé que par hdar_ads_mine (onglet Mes annonces).

create table if not exists hdar.ad_views (
  ad_id uuid not null references hdar.ads(id) on delete cascade,
  viewer_id text not null,
  at timestamptz not null default now(),
  primary key (ad_id, viewer_id)
);
create index if not exists ad_views_viewer_idx on hdar.ad_views (viewer_id);
alter table hdar.ad_views enable row level security;
revoke all on hdar.ad_views from public, anon, authenticated;

-- Enregistre une vue (ouverture du détail, lien /annonces/<id>, ou carte visible à l'écran).
-- Idempotent : la clé primaire empêche les doublons. Silencieux si l'annonce n'est
-- plus en ligne, si c'est la sienne, ou si les deux comptes se sont bloqués.
create or replace function public.hdar_ad_view(p_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a hdar.ads;
begin
  perform hdar.rate_check(s, 'adview', 80, interval '1 hour');
  select * into a from hdar.ads where id = p_id and expires_at > now() and not hidden;
  if a.id is null or a.user_id = s then return; end if;
  if hdar.is_blocked(s, a.user_id) then return; end if;
  insert into hdar.ad_views (ad_id, viewer_id) values (a.id, s) on conflict do nothing;
end $$;
revoke all on function public.hdar_ad_view(uuid) from public, anon;
grant execute on function public.hdar_ad_view(uuid) to authenticated;

create or replace function public.hdar_ads_mine() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  return coalesce((select jsonb_agg(hdar.ad_json(a, s, null, null) || jsonb_build_object('hidden', a.hidden,
      'replies', (select count(*) from hdar.ad_replies r where r.ad_id = a.id),
      'views', (select count(*) from hdar.ad_views v where v.ad_id = a.id)) order by a.created_at desc)
    from hdar.ads a where a.user_id = s and a.expires_at > now() - interval '7 days'), '[]'::jsonb);
end $$;

-- RGPD : si le profil part, on enlève aussi les vues laissées par cette personne
-- (les vues sur ses propres annonces partent déjà avec le cascade sur hdar.ads).
create or replace function hdar.ads_profile_gone() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  delete from hdar.ad_views where viewer_id = old.user_id;
  delete from hdar.ads where user_id = old.user_id;
  return old;
end $$;
