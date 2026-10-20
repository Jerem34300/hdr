-- hdar v69 — Tags sur les petites annonces (5 max, suggérés ou libres, nettoyés côté serveur).
-- Additif : colonne tags + index ; fonctions remplacées avec un paramètre optionnel en plus (anciens appels toujours valides).
alter table hdar.ads add column if not exists tags text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ads_tags_max') then
    alter table hdar.ads add constraint ads_tags_max check (cardinality(tags) <= 5);
  end if;
end $$;
create index if not exists ads_tags_idx on hdar.ads using gin (tags);

-- Un tag : minuscules, lettres/chiffres/espaces/tirets, 2 à 20 caractères. Refus de tout ce qui évoque des mineurs.
create or replace function hdar.ad_tag_clean(p text) returns text
language sql immutable set search_path to '' as $$
  select case when t is null or length(t) < 2
      or t ~ '(mineur|minor|enfant|child|kid|\mados?\M|teen|lyc[eé]en|coll[eé]gien|[eé]coli[eè]r|jeunot|\m1[0-7]\s*ans|\m-?18\M|underage|loli|shota|pedo|p[eé]do|incest)'
    then null else t end
  from (select nullif(left(btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9àâäçéèêëîïôöùûüÿœæ -]', '', 'g'), '\s+', ' ', 'g')), 20), '') t) x
$$;
create or replace function hdar.ad_tags_clean(p text[]) returns text[]
language sql immutable set search_path to '' as $$
  select coalesce((select array_agg(t order by o) from (
    select t, min(o) o from (select hdar.ad_tag_clean(v) t, o from unnest(coalesce(p, '{}')) with ordinality u(v, o)) z
    where t is not null group by t order by min(o) limit 5) y), '{}')
$$;

create or replace function hdar.ad_json(a hdar.ads, s text, p_city text, p_region text) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_build_object('id', a.id, 'user_id', a.user_id, 'pseudo', a.pseudo, 'title', a.title, 'body', a.body,
    'category', a.category, 'region', a.region, 'city', a.city, 'city_slug', a.city_slug, 'photos', to_jsonb(a.photos),
    'created_at', a.created_at, 'expires_at', a.expires_at, 'mine', a.user_id = s, 'premium', a.premium,
    'lat', a.lat, 'lng', a.lng, 'tags', to_jsonb(a.tags),
    'boost_scope', case when a.boost_until > now() then a.boost_scope end,
    'boost_until', case when a.boost_until > now() then a.boost_until end)
$$;

drop function if exists public.hdar_ad_create(text,text,text,text,text,text,int,text[],double precision,double precision);
create or replace function public.hdar_ad_create(p_title text, p_body text, p_category text, p_region text, p_city text,
  p_city_slug text, p_hours int, p_photos text[], p_lat double precision default null, p_lng double precision default null,
  p_tags text[] default null) returns uuid
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); ps text; ph text[] := '{}'; x text; nid uuid; prem boolean;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'ad', 6, interval '1 hour');
  prem := hdar.is_premium(s);
  if p_hours not in (24, 72, 168) and not (prem and p_hours in (336, 720)) then
    raise exception '%', case when p_hours in (336, 720) then 'premium_required: 14 et 30 jours sont réservés à hdar+' else 'Durée invalide' end;
  end if;
  if (select count(*) from hdar.ads where user_id = s and expires_at > now()) >= hdar.ad_limit(s) then
    raise exception '%', case when prem then 'Tu as déjà 10 annonces en ligne : supprimes-en une d''abord'
      else 'Tu as déjà 3 annonces en ligne : supprimes-en une, ou passe à hdar+ pour en avoir 10' end;
  end if;
  if coalesce(cardinality(p_photos), 0) > 3 then raise exception '3 photos maximum'; end if;
  if coalesce(cardinality(p_tags), 0) > 5 then raise exception '5 tags maximum'; end if;
  if (p_lat is null) <> (p_lng is null) or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Position invalide';
  end if;
  foreach x in array coalesce(p_photos, '{}') loop ph := ph || hdar.own_media(x, 'image'); end loop;
  select pseudo into ps from hdar.profiles where user_id = s;
  insert into hdar.ads (user_id, pseudo, title, body, category, region, city, city_slug, photos, expires_at, lat, lng, premium, tags)
  values (s, left(ps, 24), left(btrim(coalesce(p_title, '')), 60), left(btrim(coalesce(p_body, '')), 1000), lower(p_category),
    lower(p_region), left(btrim(coalesce(p_city, '')), 60), lower(left(p_city_slug, 60)), ph, now() + make_interval(hours => p_hours),
    hdar.ad_fuzz(p_lat), hdar.ad_fuzz(p_lng), prem, hdar.ad_tags_clean(p_tags))
  returning id into nid;
  return nid;
end $$;

drop function if exists public.hdar_ads_list(text,text,text,int,double precision,double precision,boolean);
create or replace function public.hdar_ads_list(p_region text, p_city text, p_category text, p_offset int default 0,
  p_lat double precision default null, p_lng double precision default null, p_near boolean default false, p_tag text default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); tg text := hdar.ad_tag_clean(p_tag);
begin
  return coalesce((select jsonb_agg(hdar.ad_json(q.a, s, p_city, p_region) || jsonb_build_object('km', q.km)
      order by q.pin desc, case when p_near then q.km end asc nulls last, q.created_at desc) from (
    select a as a, hdar.ad_pinned(a, nullif(p_region, ''), nullif(p_city, '')) pin, a.created_at,
      case when p_lat is not null and a.lat is not null then round(hdar.km(p_lat, p_lng, a.lat, a.lng)::numeric, 1) end km
    from hdar.ads a
    where a.expires_at > now() and not a.hidden
      and (nullif(p_category, '') is null or a.category = p_category)
      and (tg is null or a.tags @> array[tg])
      and not hdar.is_blocked(s, a.user_id)
      and ((nullif(p_region, '') is null or a.region = p_region) and (nullif(p_city, '') is null or a.city_slug = p_city)
           or hdar.ad_pinned(a, nullif(p_region, ''), nullif(p_city, '')))
    order by 2 desc, case when p_near then 4 end asc nulls last, a.created_at desc
    offset greatest(0, coalesce(p_offset, 0)) limit 40) q(a, pin, created_at, km)), '[]'::jsonb);
end $$;

-- Tags les plus utilisés en ce moment (annonces en ligne), pour les suggestions et le filtre.
create or replace function public.hdar_ads_top_tags(p_region text default null) returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tag', t, 'n', n) order by n desc, t), '[]'::jsonb) from (
    select t, count(*) n from hdar.ads a, unnest(a.tags) t
    where a.expires_at > now() and not a.hidden and (nullif(p_region, '') is null or a.region = p_region)
    group by t order by count(*) desc, t limit 20) x
$$;

drop function if exists public.hdar_admin_ads(text,text,text,text);
create or replace function public.hdar_admin_ads(p_key text, p_status text, p_city text, p_category text, p_tag text default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare tg text := nullif(lower(btrim(coalesce(p_tag, ''))), '');
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(x order by (x->>'created_at') desc) from (
    select hdar.ad_json(a, null, null, null) || jsonb_build_object('hidden', a.hidden,
      'status', case when a.hidden then 'hidden' when a.expires_at <= now() then 'expired' else 'active' end,
      'replies', (select count(*) from hdar.ad_replies r where r.ad_id = a.id),
      'reports', (select count(*) from hdar.ad_reports r where r.ad_id = a.id),
      'open_reports', (select count(*) from hdar.ad_reports r where r.ad_id = a.id and not r.handled),
      'reasons', (select jsonb_agg(r.reason order by r.created_at desc) from hdar.ad_reports r where r.ad_id = a.id)) x
    from hdar.ads a
    where (nullif(p_category, '') is null or a.category = p_category)
      and (tg is null or exists (select 1 from unnest(a.tags) t where t like '%' || tg || '%'))
      and (nullif(p_city, '') is null or a.city_slug like '%' || p_city || '%' or a.city ilike '%' || p_city || '%')
      and case coalesce(p_status, '') when 'active' then a.expires_at > now() and not a.hidden
        when 'expired' then a.expires_at <= now() when 'hidden' then a.hidden
        when 'reported' then exists (select 1 from hdar.ad_reports r where r.ad_id = a.id and not r.handled) else true end
    order by a.created_at desc limit 300) q), '[]'::jsonb);
end $$;

-- Admin : retirer un tag d'une annonce (modération).
create or replace function public.hdar_admin_ad_untag(p_key text, p_id uuid, p_tag text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.ads set tags = array_remove(tags, p_tag) where id = p_id;
end $$;

do $$ declare f text; begin
  foreach f in array array['hdar_ad_create(text,text,text,text,text,text,int,text[],double precision,double precision,text[])',
    'hdar_ads_list(text,text,text,int,double precision,double precision,boolean,text)', 'hdar_ads_top_tags(text)',
    'hdar_admin_ads(text,text,text,text,text)', 'hdar_admin_ad_untag(text,uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
