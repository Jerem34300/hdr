-- hdar v72 — Alertes annonces. Additif.
-- Un profil enregistre des alertes (portée + catégorie/tags optionnels). À la publication (ou ré-affichage)
-- d'une annonce correspondante : notification in-app (hits) + Web Push si abonné. Jamais l'auteur,
-- dédoublonné par (user, annonce), max 10 notifs d'alerte / 24 h / utilisateur. Supprimé avec le profil.
create table if not exists hdar.ad_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  scope text not null check (scope in ('quartier','ville','region','france','monde')),
  region text check (region is null or region ~ '^[a-z-]{2,40}$'),
  city text check (city is null or length(city) <= 60),
  city_slug text check (city_slug is null or city_slug ~ '^[a-z0-9-]{1,60}$'),
  lat double precision, lng double precision,
  category text check (category is null or category in ('rencontre','sortie','kink','exhib','autre')),
  tags text[] not null default '{}' check (cardinality(tags) <= 3),
  created_at timestamptz not null default now()
);
create index if not exists ad_alerts_user_idx on hdar.ad_alerts (user_id);
create index if not exists ad_alerts_scope_idx on hdar.ad_alerts (scope, region, city_slug);
alter table hdar.ad_alerts enable row level security;
revoke all on hdar.ad_alerts from anon, authenticated;

create table if not exists hdar.ad_alert_hits (
  user_id text not null,
  ad_id uuid not null references hdar.ads(id) on delete cascade,
  alert_id uuid references hdar.ad_alerts(id) on delete set null,
  at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (user_id, ad_id)
);
create index if not exists ad_alert_hits_recent_idx on hdar.ad_alert_hits (user_id, at desc);
alter table hdar.ad_alert_hits enable row level security;
revoke all on hdar.ad_alert_hits from anon, authenticated;

create or replace function hdar.ad_alert_limit(p_user text) returns int language sql stable security definer set search_path to '' as $$
  select case when hdar.is_premium(p_user) then 10 else 1 end $$;

create or replace function public.hdar_ad_alerts_mine() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('limit', hdar.ad_alert_limit(hdar.self_id()), 'alerts', coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'scope', scope, 'region', region, 'city', city, 'category', category, 'tags', to_jsonb(tags), 'created_at', created_at)
    order by created_at) from hdar.ad_alerts where user_id = hdar.self_id()), '[]'::jsonb)) $$;

create or replace function public.hdar_ad_alert_save(p_id uuid, p_scope text, p_region text, p_city text, p_city_slug text,
  p_lat double precision, p_lng double precision, p_category text, p_tags text[]) returns uuid
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); nid uuid; la double precision := p_lat; lo double precision := p_lng; tg text[];
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'adalert', 30, interval '1 hour');
  p_scope := lower(coalesce(p_scope, ''));
  if p_scope not in ('quartier','ville','region','france','monde') then raise exception 'Portée invalide'; end if;
  if p_scope = 'quartier' then
    if la is null or lo is null then select lat, lng into la, lo from hdar.profiles where user_id = s; end if;
    if la is null or lo is null or la not between -90 and 90 or lo not between -180 and 180 then
      raise exception 'Active ta position pour une alerte « quartier »'; end if;
    la := round(la::numeric, 2); lo := round(lo::numeric, 2);  -- ~1 km, jamais la position exacte
  else la := null; lo := null; end if;
  if p_scope = 'ville' and nullif(p_city_slug, '') is null then raise exception 'Choisis une ville'; end if;
  if p_scope in ('ville','region') and nullif(p_region, '') is null then raise exception 'Choisis une région'; end if;
  if coalesce(cardinality(p_tags), 0) > 3 then raise exception '3 tags maximum'; end if;
  tg := coalesce(hdar.ad_tags_clean(p_tags), '{}');
  if p_id is null then
    if (select count(*) from hdar.ad_alerts where user_id = s) >= hdar.ad_alert_limit(s) then
      raise exception '%', case when hdar.is_premium(s) then '10 alertes maximum : supprimes-en une d''abord'
        else 'premium_required: 1 alerte en gratuit, jusqu''à 10 avec hdar+' end;
    end if;
    insert into hdar.ad_alerts (user_id, scope, region, city, city_slug, lat, lng, category, tags)
    values (s, p_scope, case when p_scope in ('ville','region') then lower(p_region) end,
      case when p_scope = 'ville' then left(btrim(p_city), 60) end, case when p_scope = 'ville' then lower(left(p_city_slug, 60)) end,
      la, lo, nullif(lower(p_category), ''), tg) returning id into nid;
  else
    update hdar.ad_alerts set scope = p_scope, region = case when p_scope in ('ville','region') then lower(p_region) end,
      city = case when p_scope = 'ville' then left(btrim(p_city), 60) end, city_slug = case when p_scope = 'ville' then lower(left(p_city_slug, 60)) end,
      lat = la, lng = lo, category = nullif(lower(p_category), ''), tags = tg
    where id = p_id and user_id = s returning id into nid;
    if nid is null then raise exception 'Alerte introuvable'; end if;
  end if;
  return nid;
end $$;

create or replace function public.hdar_ad_alert_delete(p_id uuid) returns void
language sql security definer set search_path to '' as $$ delete from hdar.ad_alerts where id = p_id and user_id = hdar.self_id() $$;

-- Hits non lus (badge/son in-app). p_seen = true : les marque lus.
create or replace function public.hdar_ad_alert_hits(p_seen boolean default false) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('ad_id', a.id, 'title', a.title, 'city', a.city, 'at', h.at) order by h.at desc), '[]'::jsonb) into r
    from hdar.ad_alert_hits h join hdar.ads a on a.id = h.ad_id
    where h.user_id = s and h.seen_at is null and a.expires_at > now() and not a.hidden;
  if p_seen then update hdar.ad_alert_hits set seen_at = now() where user_id = s and seen_at is null; end if;
  return r;
end $$;

create or replace function hdar.ad_alert_trg() returns trigger language plpgsql security definer set search_path to '' as $$
declare al record; ok int;
begin
  if new.hidden or new.expires_at <= now() then return new; end if;
  if tg_op = 'UPDATE' and not (old.hidden and not new.hidden) then return new; end if;
  for al in
    select distinct on (x.user_id) x.id, x.user_id from hdar.ad_alerts x
    where x.user_id <> new.user_id
      and (x.category is null or x.category = new.category)
      and (cardinality(x.tags) = 0 or x.tags && new.tags)
      and case x.scope
        when 'quartier' then new.lat is not null and x.lat is not null and hdar.km(x.lat, x.lng, new.lat, new.lng) <= 5
        when 'ville' then x.city_slug = new.city_slug and x.region = new.region
        when 'region' then x.region = new.region
        else true end
    order by x.user_id, x.created_at limit 2000
  loop
    begin
      if hdar.is_blocked(al.user_id, new.user_id) then continue; end if;
      if (select count(*) from hdar.ad_alert_hits where user_id = al.user_id and at > now() - interval '24 hours') >= 10 then continue; end if;
      insert into hdar.ad_alert_hits (user_id, ad_id, alert_id) values (al.user_id, new.id, al.id) on conflict do nothing;
      get diagnostics ok = row_count;
      if ok > 0 then
        perform hdar.push_to(al.user_id, 'adalert', new.id::text, interval '7 days', jsonb_build_object(
          'type', 'ad-alert', 'title', '🔔 Nouvelle annonce · ' || new.city, 'body', new.title,
          'tag', 'adalert-' || new.id, 'url', '/?annonce=' || new.id));
      end if;
    exception when others then null;  -- une alerte ne doit jamais bloquer une annonce
    end;
  end loop;
  return new;
end $$;
drop trigger if exists ads_alert_notify on hdar.ads;
create trigger ads_alert_notify after insert or update of hidden on hdar.ads for each row execute function hdar.ad_alert_trg();

-- RGPD : suppression du profil → alertes et hits supprimés.
create or replace function hdar.ad_alerts_profile_gone() returns trigger language plpgsql security definer set search_path to '' as $$
begin delete from hdar.ad_alerts where user_id = old.user_id; delete from hdar.ad_alert_hits where user_id = old.user_id; return old; end $$;
drop trigger if exists ad_alerts_profile_gone on hdar.profiles;
create trigger ad_alerts_profile_gone after delete on hdar.profiles for each row execute function hdar.ad_alerts_profile_gone();

revoke all on function hdar.ad_alert_limit(text), hdar.ad_alert_trg(), hdar.ad_alerts_profile_gone() from public, anon, authenticated;
revoke all on function public.hdar_ad_alerts_mine(), public.hdar_ad_alert_save(uuid,text,text,text,text,double precision,double precision,text,text[]),
  public.hdar_ad_alert_delete(uuid), public.hdar_ad_alert_hits(boolean) from public, anon;
grant execute on function public.hdar_ad_alerts_mine(), public.hdar_ad_alert_save(uuid,text,text,text,text,double precision,double precision,text,text[]),
  public.hdar_ad_alert_delete(uuid), public.hdar_ad_alert_hits(boolean) to authenticated;
