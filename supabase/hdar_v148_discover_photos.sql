-- v148 : photos des lieux à découvrir, crédits domaine, descriptions du manifest
-- hdar_place_get / hdar_place_info renvoyaient photos = {} sauf partenaire ou vérifié,
-- tout en exposant cover_credit (URLs brutes). Les photos Storage publiques (webp floutés)
-- doivent être visibles sur toutes les fiches qui en ont.

create or replace function hdar.place_public_photos(p_photos text[], p_all boolean)
returns text[]
language sql
immutable
set search_path to ''
as $fn$
  select case
    when p_all then coalesce(p_photos, '{}'::text[])
    else coalesce((
      select array_agg(x order by ord)
      from unnest(coalesce(p_photos, '{}'::text[])) with ordinality as t(x, ord)
      where x ~* '^https?://'
    ), '{}'::text[])
  end;
$fn$;

create or replace function public.hdar_place_get(p_id uuid)
returns table(
  id uuid, kind text, name text, description text, lat double precision, lng double precision,
  source text, source_ref text, partner boolean, city text, address text, hours text,
  tags text[], website text, listing text, verified boolean, cover_credit text, photos text[], venue text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare s text := hdar.self_id(); p hdar.places; own boolean;
begin
  select * into p from hdar.places where hdar.places.id = p_id;
  if p.id is null or not hdar.place_visible(p) then return; end if;
  insert into hdar.place_daily (day, place_id, views) values (current_date, p_id, 1)
    on conflict (day, place_id) do update set views = hdar.place_daily.views + 1;
  insert into hdar.place_visitors values (current_date, p_id, s) on conflict do nothing;
  own := (p.owner_id is not null and p.owner_id = s);
  id := p.id; kind := p.kind; name := p.name;
  description := hdar.public_place_description(p);
  lat := p.lat; lng := p.lng; source := p.source; source_ref := p.source_ref;
  partner := (p.map_listing = 'partner');
  city := p.city; address := p.address; hours := p.hours;
  tags := case when hdar.risk_country(p.country) then '{}'::text[] else coalesce(p.tags, '{}') end;
  website := p.website;
  listing := case when p.map_listing = 'partner' then 'partner' else 'discover' end;
  verified := coalesce(p.verified, false);
  cover_credit := p.cover_credit;
  photos := hdar.place_public_photos(p.photos, own or p.map_listing = 'partner' or coalesce(p.verified, false));
  venue := coalesce(p.venue_kind, case p.kind when 'sauna' then 'sauna' when 'club' then 'club' when 'bar' then 'bar' else null end);
  return next;
end
$function$;

create or replace function public.hdar_place_info(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare s text := hdar.self_id(); p hdar.places; own boolean; pub boolean; r jsonb;
  public_photos text[];
begin
  select * into p from hdar.places where id = p_id;
  if p.id is null then return null; end if;
  own := p.owner_id = s;
  if not hdar.place_visible(p) and not own then return null; end if;
  pub := not p.partner or p.comments_public;
  public_photos := hdar.place_public_photos(p.photos, own or p.map_listing = 'partner' or coalesce(p.verified, false));
  select jsonb_build_object(
    'website', p.website,
    'contact', case when own then p.contact else null end,
    'photos', to_jsonb(public_photos),
    'pending_photos', case when own then to_jsonb(coalesce(p.pending_photos, '{}')) else '[]'::jsonb end,
    'owner', own,
    'ratings_on', case when p.map_listing = 'discover' and not p.verified then false else (not p.partner or p.ratings_on) end,
    'comments_on', case when p.map_listing = 'discover' and not p.verified then false else (not p.partner or p.comments_on) end,
    'comments_public', pub,
    'city', p.city, 'address', p.address, 'hours', p.hours,
    'tags', to_jsonb(case when hdar.risk_country(p.country) then '{}'::text[] else coalesce(p.tags, '{}') end),
    'listing', case when p.map_listing = 'partner' then 'partner' else 'discover' end,
    'verified', coalesce(p.verified, false),
    'cover_credit', p.cover_credit,
    'claimable', p.map_listing = 'discover' and p.owner_id is null and not coalesce(p.verified, false),
    'avg', (select round(avg(stars)::numeric, 1) from hdar.place_ratings where place_id = p_id),
    'count', (select count(*) from hdar.place_ratings where place_id = p_id),
    'mine', (select stars from hdar.place_ratings where place_id = p_id and user_id = s),
    'comments', case when pub or own then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at,
        'pseudo', coalesce(pr.pseudo, 'Anonyme'), 'mine', c.user_id = s,
        'stars', (select stars from hdar.place_ratings x where x.place_id = p_id and x.user_id = c.user_id)) order by c.created_at desc)
      from (select * from hdar.place_comments where place_id = p_id and not hidden order by created_at desc limit 100) c
      left join hdar.profiles pr on pr.user_id = c.user_id), '[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at, 'pseudo', 'Toi', 'mine', true, 'stars', null))
        from hdar.place_comments c where c.place_id = p_id and c.user_id = s and not c.hidden), '[]'::jsonb) end
  ) into r;
  return r;
end
$function$;

grant execute on function public.hdar_place_get(uuid) to anon, authenticated, service_role;
grant execute on function public.hdar_place_info(uuid) to anon, authenticated, service_role;

-- Crédits : plus d'URL brutes, uniquement le(s) domaine(s). Placeholders sans source → null.
update hdar.places
set cover_credit = null
where cover_credit ~* 'source à confirmer'
   or btrim(coalesce(cover_credit, '')) ~* '^photo du lieu\.?$';

update hdar.places p
set cover_credit = d.credit
from (
  select id, string_agg(distinct host, ' · ' order by host) as credit
  from (
    select pl.id,
           regexp_replace(lower(m[1]), '^www\.', '') as host
    from hdar.places pl
    cross join lateral regexp_matches(coalesce(pl.cover_credit, ''), 'https?://([^/[:space:]·?]+)', 'gi') as m
  ) s
  where host <> ''
  group by id
) d
where p.id = d.id;

-- Descriptions, horaires et ville depuis le manifest photos (uniquement si la colonne est vide / générique).

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$2raumclub ist ein Club in Bremen, 7-9 Rembertiring Brême (28195). Angegebene Öffnungszeiten: Freitag, Samstag 23:00–07:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Freitag, Samstag 23:00–07:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bremen$city$)
where id = '96b16663-d357-4f86-8192-d8b2785fd7fa';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$3 Monkeys es un bar situado en Torremolinos, en Calle Danza Invisible, Torremolinos, 29620. Horario indicado: lunes, martes, miércoles, jueves 18:00–02:00 ; domingo, viernes, sábado 15:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes, martes, miércoles, jueves 18:00–02:00 ; domingo, viernes, sábado 15:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Torremolinos$city$)
where id = '9a2a6e4b-d112-4e0d-a042-6053b1b579cb';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$45 Tours est un bar situé 45 Rue de Montreuil Paris (75011). Horaires indiqués : tous les jours 16h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 16h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'bea8b5ee-dee2-4210-b81b-040fe39ee8c3';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Abysse sauna est un sauna situé 4, passage Théodore Lemaître,Alençon,61000. Horaires indiqués : mardi, jeudi, samedi 14h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, jeudi, samedi 14h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Alençon$city$)
where id = '8a565dda-3923-47ad-bd80-8b60cc7c2c7e';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '354e8a2c-94eb-431c-a720-2864c4ea3cc4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Aire Chicas es un club situado en Barcelona, en 233, Carrer de la Diputació, Barcelone, 08007. Se presenta como un espacio lésbico o abierto a mujeres queer. Horario indicado: viernes, sábado 23:59–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$viernes, sábado 23:59–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'f8f8398b-dd99-4365-b035-e52669c28044';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = '47138d0c-8022-4f70-9d74-db39105ee478';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Annexe est un bar situé 7 Rue Saint-Bazile Marseille (13001). Horaires indiqués : dimanche, jeudi, vendredi, samedi 19h–4h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, jeudi, vendredi, samedi 19h–4h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Marseille$city$)
where id = '7d8ba30d-11ac-48e4-8bf1-5c8d11160ef1';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = 'f0b0ebf8-a848-4e5c-a900-db41818eb28c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Apolo sauna es un sauna situado en Torremolinos, en 105, Avenida Carlota Alessandri, Torremolinos, 29620. Horario indicado: todos los días 15:00–22:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 15:00–22:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Torremolinos$city$)
where id = '77e400a0-59b4-4ca1-a32f-4ab561fee72a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Aqualis sauna ist eine Sauna in Berne, 21, Brunnmattstrasse, Berne, 3007. Angegebene Öffnungszeiten: Montag 12:00–23:00, Dienstag 12:00–23:00, Mittwoch 12:00–23:00, Donnerstag 12:00–23:00, Freitag 12:00–03:30, Samstag 14:00–23:00, Sonntag 12:00–23:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 12:00–23:00, Dienstag 12:00–23:00, Mittwoch 12:00–23:00, Donnerstag 12:00–23:00, Freitag 12:00–03:30, Samstag 14:00–23:00, Sonntag 12:00–23:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berne$city$)
where id = 'fb8160cb-c53f-45ef-95eb-47618626d8a1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Arena est un club situé 26 Allée des Foulques Toulouse (31200). Le programme est tourné vers la musique électronique. Horaires indiqués : samedi 23h–5h45.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$samedi 23h–5h45$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = '0f1f768e-7e51-4933-8bfb-70faecd4fc14';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Atlantide sauna est un sauna situé 13 Rue Parrot Paris (75012). La source le décrit comme un sauna mixte, et on y trouve un hammam. Horaires indiqués : tous les jours 12h–22h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 12h–22h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '5d75af98-8a0d-4699-9c7e-ea8e0b18c325';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Atlantique sauna est un sauna situé Boulevard de l'Atlantique Cherbourg-en-Cotentin (50100). La source le décrit comme un sauna mixte, et il fonctionne en libre service. Horaires indiqués : lundi, mardi, mercredi, jeudi, vendredi, samedi 14h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi, jeudi, vendredi, samedi 14h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Cherbourg-en-Cotentin$city$)
where id = '6d36ae65-caf9-4220-9b99-7126bbba8747';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Atlantis sauna est un sauna naturiste situé Rue Thalès Aytré (17440). La source le décrit comme un sauna mixte. Horaires indiqués : lundi 12h–20h, mardi 12h–20h, mercredi 12h–20h, jeudi 12h–22h, vendredi 12h–23h59, samedi 14h–23h59, dimanche 14h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–20h, mardi 12h–20h, mercredi 12h–20h, jeudi 12h–22h, vendredi 12h–23h59, samedi 14h–23h59, dimanche 14h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Aytré$city$)
where id = '908d1b20-1430-455b-911e-005ccf9a7000';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Atlantis sauna est un sauna naturiste situé 14, rue Lafayette,Périgueux,24000. Le lieu est indiqué comme réservé aux hommes, selon les jours précisés par la source. Horaires indiqués : lundi 13h–20h, mercredi 13h–20h, jeudi 13h–20h, vendredi 14h–23h59, samedi 14h–23h59, dimanche 14h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 13h–20h, mercredi 13h–20h, jeudi 13h–20h, vendredi 14h–23h59, samedi 14h–23h59, dimanche 14h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Périgueux$city$)
where id = '927009ee-6690-4500-8add-d565fbec35c6';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Atomic cat est un bar queer situé 6, Passage Thiéré, Paris, 75011. Le programme est tourné vers la musique électronique.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '38c63063-2815-495a-b354-6e11a3c3e087';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$B-Lage ist eine Bar in Berlin, 1, Mareschstraße, Berlin, 12055.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '7d0c741e-d45f-420d-9b19-3daa4e5b4634';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$B4 sauna club est un sauna situé Nantes. La source le décrit comme un sauna mixte. Horaires indiqués : lundi, mardi, mercredi 14h–1h ; dimanche, jeudi, vendredi, samedi 14h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi 14h–1h ; dimanche, jeudi, vendredi, samedi 14h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nantes$city$)
where id = '893d36f9-0505-479e-ad33-5653874b448c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$BB Brussels est un bar à Bruxelles (Brussels), au 25, Rue du Marché au Charbon, Bruxelles, 1000. Horaires indiqués : jeudi 19h–3h, vendredi 19h–5h, samedi 19h–5h, dimanche 19h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi 19h–3h, vendredi 19h–5h, samedi 19h–5h, dimanche 19h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = '6903bdba-db8f-45ed-aee6-3b661d96be44';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$BMC store est un boutique situé 21 Rue des Lombards Paris (75004). Horaires indiqués : tous les jours 10h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 10h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '282a670f-3d14-4eaf-bcc3-a32a8514076f';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Babylon Lille est un boutique situé 40, Place de la Gare, Lille, 59777.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Lille$city$)
where id = 'f9cbadc0-6eab-4cdf-9c73-a265c04e0be6';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Babylone est un club situé 153, Rue Nationale, Le Mans, 72000. Horaires indiqués : mercredi 22h–4h, jeudi 22h–4h, vendredi 23h–5h, samedi 23h–6h, dimanche 22h–4h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi 22h–4h, jeudi 22h–4h, vendredi 23h–5h, samedi 23h–6h, dimanche 22h–4h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Le Mans$city$)
where id = '9350ee36-0cbc-4271-86cb-36c706e724c1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bad Mother Fucker Pub est un bar situé 16, Cours de l'Argonne, Bordeaux, 33000. On y trouve une terrasse.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Bordeaux$city$)
where id = 'fe0218d7-db49-4462-9571-07ec30db390a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bains de l'Est est un sauna situé 3, Rue de l'Est, Genève, 1207. La source le décrit comme un sauna mixte. Horaires indiqués : lundi 12h–1h, mercredi 12h–1h, samedi 14h–4h, dimanche 14h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–1h, mercredi 12h–1h, samedi 14h–4h, dimanche 14h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Genève$city$)
where id = 'a2d3089c-c296-4d18-93fd-e1c62018aeea';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Baloo bar es un bar situado en Torremolinos, en Plaza De La Nogalera, Torremolinos, 29620.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Torremolinos$city$)
where id = 'd6aee498-8ac6-46fd-a637-fd2417aedb22';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bar Blend is een bar in Amsterdam, op 41, Reguliersdwarsstraat, Amsterdam, 1017BK. Vermelde openingstijden: maandag 15:00–03:00, dinsdag 15:00–03:00, woensdag 15:00–03:00, donderdag 15:00–03:00, vrijdag 14:00–04:00, zaterdag 14:00–04:00, zondag 14:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$maandag 15:00–03:00, dinsdag 15:00–03:00, woensdag 15:00–03:00, donderdag 15:00–03:00, vrijdag 14:00–04:00, zaterdag 14:00–04:00, zondag 14:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = '8c92b519-42f4-4583-bb7b-aaadef42fd4d';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bar Buka is een bar in Amsterdam, op 124-1A, Albert Cuypstraat, Amsterdam, 1072EA. Vermelde openingstijden: donderdag 17:00–00:30, vrijdag 17:00–01:00, zaterdag 17:00–01:00, zondag 16:00–20:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$donderdag 17:00–00:30, vrijdag 17:00–01:00, zaterdag 17:00–01:00, zondag 16:00–20:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = '0ff06d65-3090-49aa-8a69-d81083106525';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bar Central ist eine Bar in Frankfurt am Main, 13, Elefantengasse, Francfort-sur-le-Main, 60313. Angegebene Öffnungszeiten: Dienstag 20:00–01:00, Mittwoch 20:00–01:00, Donnerstag 18:00–02:00, Freitag 20:00–03:00, Samstag 20:00–03:00, Sonntag 18:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Dienstag 20:00–01:00, Mittwoch 20:00–01:00, Donnerstag 18:00–02:00, Freitag 20:00–03:00, Samstag 20:00–03:00, Sonntag 18:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Frankfurt am Main$city$)
where id = 'e49cd2c8-036b-4cec-a696-d33baffd81a3';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '0ed81091-58cc-4f02-931c-9452f6c3d932';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bar Junior es un bar situado en Maspalomas, Las Palmas, en 54 Avenida Estados Unidos Maspalomas, Las Palmas (35100). Horario indicado: todos los días 19:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 19:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = 'c45c07ce-d14b-4f91-931c-f861d15ec868';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bar Oh est un bar situé Rue d'Estaires, La Bassée, 59480. Horaires indiqués : mardi 18h–23h59, mercredi 18h–23h59, jeudi 18h–23h59, vendredi 18h–2h, samedi 16h–2h, dimanche 16h–23h59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi 18h–23h59, mercredi 18h–23h59, jeudi 18h–23h59, vendredi 18h–2h, samedi 16h–2h, dimanche 16h–23h59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$La Bassée$city$)
where id = '5c8aff57-fc9f-41fa-9a80-9bac78c790dc';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bar Rendezvous ist eine Bar in München, 54, Müllerstraße, Munich, 80469. Angegebene Öffnungszeiten: Montag 18:00–03:00, Dienstag 18:00–03:00, Mittwoch 18:00–03:00, Donnerstag 18:00–03:00, Freitag 18:00–05:00, Samstag 18:00–05:00, Sonntag 20:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 18:00–03:00, Dienstag 18:00–03:00, Mittwoch 18:00–03:00, Donnerstag 18:00–03:00, Freitag 18:00–05:00, Samstag 18:00–05:00, Sonntag 20:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$München$city$)
where id = '8124e4b0-7f07-4bb6-9dd7-6abde00aed82';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bar Saint Jean ist eine Bar in Berlin, 29, Ziegelstraße, Berlin, 10117. Angegebene Öffnungszeiten: Dienstag, Mittwoch, Donnerstag 19:00–02:00 ; Freitag, Samstag 20:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Dienstag, Mittwoch, Donnerstag 19:00–02:00 ; Freitag, Samstag 20:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '7dad685d-d519-4bdd-adb1-e75d2513e3e8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bar'ouf est un bar situé 11 bis Rue de Fontenelle Rouen (76000). Horaires indiqués : mardi, mercredi, jeudi, vendredi, samedi 19h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi, jeudi, vendredi, samedi 19h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Rouen$city$)
where id = '6ad1d812-7b19-4fdb-b297-f03284f3e124';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = 'f3a7370d-97e2-415d-8093-78e7d7214093';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Batchi est un club situé 34 Rue Vasselot Rennes (35000|35700|35200). Horaires indiqués : vendredi, samedi 23h50–7h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$vendredi, samedi 23h50–7h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Rennes$city$)
where id = 'b13565e6-c692-44b7-9095-bfa25d512cac';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Baustelle 4U ist eine Bar in Köln, 12, Vor St.Martin, Cologne, 50667. Angegebene Öffnungszeiten: Montag 17:00–01:00, Dienstag 17:00–01:00, Mittwoch 17:00–01:00, Donnerstag 17:00–01:00, Freitag 17:00–03:00, Samstag 14:00–03:00, Sonntag 14:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 17:00–01:00, Dienstag 17:00–01:00, Mittwoch 17:00–01:00, Donnerstag 17:00–01:00, Freitag 17:00–03:00, Samstag 14:00–03:00, Sonntag 14:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = '270d4c66-c904-4662-9d4b-6234409f0fb3';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = '7f43f787-4392-4be4-976c-6d22b64f8b33';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bears bar Madrid es un bar situado en Madrid, en 4, Calle de Pelayo, Madrid, 28004. Horario indicado: lunes 19:00–01:00, martes 19:00–02:00, miércoles 19:00–02:00, jueves 19:00–02:00, viernes 19:00–03:30, sábado 19:00–03:30, domingo 19:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes 19:00–01:00, martes 19:00–02:00, miércoles 19:00–02:00, jueves 19:00–02:00, viernes 19:00–03:30, sábado 19:00–03:30, domingo 19:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '2fdb00ab-6d07-47a4-8be6-1f2064bc98df';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Believe Club es un club situado en Barcelona, en 56 Carrer de Balmes Barcelone (08001). Horario indicado: domingo, lunes, martes, miércoles, jueves 23:00–05:00 ; viernes, sábado 23:00–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, lunes, martes, miércoles, jueves 23:00–05:00 ; viernes, sábado 23:00–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '65301e3e-eb93-469f-8444-9a0df876b651';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bellini Bar ist eine Bar in Hamburg, 63, Danziger Straße, Hambourg, 20099. Der Treffpunkt richtet sich an lesbische und queere Frauen. Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 18:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 18:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Hamburg$city$)
where id = 'fc2fabcf-a208-4465-9a5d-fc4b772d135e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Belover Barcelone es un tienda situado en Barcelona, en 568, Gran Via de les Corts Catalanes, Barcelone, 08011.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '0d188d4b-80be-44ec-80c0-6790d5730eb6';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Betty F ist eine Bar in Berlin, 13, Mulackstraße, Berlin, 10119. Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 20:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 20:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '22b06aaa-6374-45c5-92b5-6fb17acd1221';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bikini est un club situé Rue Théodore Monod Ramonville-Saint-Agne (31520 Ramonville Saint Agne).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Ramonville-Saint-Agne$city$)
where id = 'a7206f7c-6c48-48a3-86c0-23c9ffa4eea8';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Lille$city$)
where id = 'cfd2aa7b-ee87-4256-aa62-8f0ac369b02d';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Marseille$city$)
where id = '71ae0d0d-4343-4a39-84f4-d74b5fdb56a9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Blend XL is een bar in Amsterdam, op 44, Reguliersdwarsstraat, Amsterdam, 1017BM. Vermelde openingstijden: donderdag 20:00–01:00 ; vrijdag, zaterdag 20:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$donderdag 20:00–01:00 ; vrijdag, zaterdag 20:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = 'b172dc62-04de-4acc-88ad-6eda9fb83a59';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Blond ist eine Bar in Berlin, 28, Motzstraße, Berlin, 10777. Angegebene Öffnungszeiten: werktags 15:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$werktags 15:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '2aff01be-4e0c-4bbb-8ac0-bc4436b14d45';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Blue Club sauna est un sauna situé 8, rue Sébastien Leclerc,Metz,57000. Horaires indiqués : dimanche, lundi, jeudi, samedi 14h–20h ; mercredi, vendredi 12h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, jeudi, samedi 14h–20h ; mercredi, vendredi 12h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Metz$city$)
where id = '1b361ef8-79a3-4347-ad64-c3c9ef4f9f98';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Body Talk is een bar in Utrecht, op 64, Oudegracht, Utrecht, 3511AS. Vermelde openingstijden: dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–02:00, vrijdag 16:00–03:00, zaterdag 15:00–03:00, zondag 15:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–02:00, vrijdag 16:00–03:00, zaterdag 15:00–03:00, zondag 15:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Utrecht$city$)
where id = '7ae618c6-7ada-44d5-b0c7-74ea162afc4d';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bonaparte is een club in Anvers, op 21 Grote Markt Anvers (2000). Vermelde openingstijden: maandag 21:00–03:00, dinsdag 21:00–03:00, woensdag 21:00–04:00, donderdag 21:00–05:00, vrijdag 20:00–05:00, zaterdag 20:00–03:00, zondag 20:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$maandag 21:00–03:00, dinsdag 21:00–03:00, woensdag 21:00–04:00, donderdag 21:00–05:00, vrijdag 20:00–05:00, zaterdag 20:00–03:00, zondag 20:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = 'd5a3486f-95e9-4469-a4f8-379c36c8faa3';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bonjour Madame est un bar situé 40, Rue de Montreuil, Paris, 75011. Horaires indiqués : lundi 18h–23h59 ; mardi, mercredi, jeudi, vendredi, samedi 14h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 18h–23h59 ; mardi, mercredi, jeudi, vendredi, samedi 14h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'b6c89177-41d5-453e-81de-170f1e5903fe';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Torremolinos$city$)
where id = '86b29dbc-7205-4071-bbb1-72dbe5ab1ca2';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Boxer Berlin ist eine Bar in Berlin, 11 Eisenacher Straße Berlin (10777). Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 11:00–20:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 11:00–20:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '8596679a-daee-4bd4-b5cd-daaa2103c59a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Boxer Gran Canaria es un tienda situado en Maspalomas, Las Palmas, en 54 Avenida Estados Unidos Maspalomas, Las Palmas (35100).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = '644d61d9-cfd8-4d24-ad75-b7358a607ca3';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Boxer café es un bar situado en Barcelona, en Carrer de la Diputació Barcelone (08013). Horario indicado: domingo, miércoles, jueves 18:00–01:30 ; viernes, sábado 18:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, miércoles, jueves 18:00–01:30 ; viernes, sábado 18:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'aee861c2-7417-417b-81f6-b29af8009847';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Boxer shop es un tienda situado en Barcelona, en Carrer de la Diputació Barcelone (08013). Horario indicado: lunes, martes, miércoles, jueves, viernes, sábado 11:00–20:45.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes, martes, miércoles, jueves, viernes, sábado 11:00–20:45$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '52fc3d5b-95a1-4d8f-867b-7d362172a143';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Boys Charleroi est un bar situé 38, Place de la Digue, Charleroi, 6000. Horaires indiqués : jeudi 21h–3h ; vendredi, samedi 21h–5h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi 21h–3h ; vendredi, samedi 21h–5h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Charleroi$city$)
where id = '5d92fc9e-0060-4ac4-8203-971a954819b0';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Boys bar BCN es un bar situado en Barcelona, en 174, Carrer de la Diputació, Barcelone, 08001. Horario indicado: martes, miércoles, jueves 21:00–02:30 ; viernes, sábado 21:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$martes, miércoles, jueves 21:00–02:30 ; viernes, sábado 21:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '63e868c0-2f76-4c5d-a4dd-1ec5df043861';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Boys club is een club in Bekkevoort, op 16 Staatsbaan Bekkevoort (3460). Vermelde openingstijden: zondag, maandag, dinsdag, woensdag, donderdag 12:00–23:00 ; vrijdag, zaterdag 12:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, maandag, dinsdag, woensdag, donderdag 12:00–23:00 ; vrijdag, zaterdag 12:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bekkevoort$city$)
where id = '342bff8e-b842-4d36-9132-ba63284d33a7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Boîte à frissons-Tango est un club situé 13 Rue au Maire Paris (75003). Le lieu existe depuis 1997. Horaires indiqués : mercredi 14h–19h, vendredi 22h30–5h, samedi 22h30–5h, dimanche 18h–23h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi 14h–19h, vendredi 22h30–5h, samedi 22h30–5h, dimanche 18h–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '0f0fe4f9-b1e5-4c13-9f8c-5091cca6e8d6';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Lyon$city$)
where id = 'c5a6d7f2-3759-4891-979b-68c4f885e188';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bruc es un sauna situado en Barcelona, en 87, Carrer de Pau Claris, Barcelone, 08007. Horario indicado: todos los días 10:00–22:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 10:00–22:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'd2417a23-f955-4c9c-a1da-11739218ed95';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Brunos ist ein Shop in Berlin, 14 Maaßenstraße Berlin (10777). Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 10:00–22:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 10:00–22:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'cd54ae88-7ee4-46db-9bcd-6c10a5dcd1d1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Bull ist eine Bar in Berlin, 35, Kleiststraße, Berlin, 10787.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '17c0e961-8a88-46fa-994e-e8051d2dfc51';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = 'da0fb088-6357-4f6e-87c3-0b6c49fb399e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$C'est ma Tournée est un bar à Bruxelles (Brussels), au 2, Rue du Lombard, Bruxelles, 1000. Horaires indiqués : dimanche, lundi, mardi, mercredi, jeudi 16h–1h ; vendredi, samedi 16h–2h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mardi, mercredi, jeudi 16h–1h ; vendredi, samedi 16h–2h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = 'a4f35fb2-5fba-4d15-9638-55018ebd5a18';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$C12 est un club à Bruxelles (Brussels), au 116 Rue du Marché aux Herbes Ville de Bruxelles (1000).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = '5c3ab9eb-f715-4620-b436-f19531ff6217';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$CUD est un club situé 12 Rue des Haudriettes Paris (75003). Horaires indiqués : dimanche, lundi, mardi, mercredi, jeudi 23h30–6h ; vendredi, samedi 23h30–7h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mardi, mercredi, jeudi 23h30–6h ; vendredi, samedi 23h30–7h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '13441efd-2a58-45eb-9364-458598ec0299';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Cabaret des Merveilles est un bar queer situé 25, Rue de l'Hirondelle, Paris, 75006. Il se présente comme un lieu lesbien ou ouvert aux femmes queer.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '12311e54-37bf-449c-b6f7-d46f026ca362';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Cafee Cabron is een bar in Anvers, op 1 Kaasrui Anvers (2000). Vermelde openingstijden: elke dag 11:30–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$elke dag 11:30–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = '46825e5d-60fd-41cb-8937-46664acbad02';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Barge est un bar situé 5 Port de la Rapée Paris (75012). Horaires indiqués : mardi 12h–15h, mardi 20h–2h, mercredi 12h–15h, mercredi 20h–2h, jeudi 12h–15h, jeudi 20h–2h, vendredi 12h–15h, vendredi 20h–2h, samedi 19h30–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi 12h–15h, mardi 20h–2h, mercredi 12h–15h, mercredi 20h–2h, jeudi 12h–15h, jeudi 20h–2h, vendredi 12h–15h, vendredi 20h–2h, samedi 19h30–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '692e18d9-3c7a-4411-b752-0212241938d8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Delux is een bar in Anvers, op 16-18 Melkmarkt Anvers (2000). Vermelde openingstijden: zondag, maandag, dinsdag, woensdag, donderdag 11:00–02:00 ; vrijdag, zaterdag 11:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, maandag, dinsdag, woensdag, donderdag 11:00–02:00 ; vrijdag, zaterdag 11:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = '11c5c1f5-5734-4d37-9aa3-4a703d3e98f4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Den Draak is een bar in Anvers, op 1 Draakplaats Anvers (2018). Vermelde openingstijden: dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–01:00, vrijdag 16:00–03:00, zaterdag 16:00–03:00, zondag 12:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–01:00, vrijdag 16:00–03:00, zaterdag 16:00–03:00, zondag 12:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = '8e57322d-e6a0-432f-8127-200a014ea0e9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Kalff is een bar in Utrecht, op 47, Oudegracht, Utrecht, 3511AC. Vermelde openingstijden: dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–01:00, vrijdag 16:00–02:00, zaterdag 15:00–02:00, zondag 15:00–23:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–01:00, vrijdag 16:00–02:00, zaterdag 15:00–02:00, zondag 15:00–23:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Utrecht$city$)
where id = '1da14a72-1a83-474c-b327-700d8c63e1ad';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Montmartre is een bar in Amsterdam, op 129, Reguliersdwarsstraat, Amsterdam, 1017 BN. Vermelde openingstijden: woensdag, donderdag 18:00–01:00 ; zondag, vrijdag, zaterdag 18:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$woensdag, donderdag 18:00–01:00 ; zondag, vrijdag, zaterdag 18:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = 'a25dc9d8-1746-4440-a3be-4e3d57e3ffb2';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Nîmes$city$)
where id = '84edfbb5-ad41-4d54-a91f-2711a51e2c08';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Rosa est un bar queer situé 78 bis, Rue Béchevelin, Lyon, 69007. Horaires indiqués : mardi, mercredi, jeudi, vendredi, samedi 13h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi, jeudi, vendredi, samedi 13h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lyon$city$)
where id = 'f2adfb39-98f1-40f3-9eb5-05fad8444dba';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Rosé is een bar in Maastricht, op 43, Bogaardenstraat, Maastricht, 6211SN. Vermelde openingstijden: donderdag, zaterdag 19:00–01:00 ; vrijdag 17:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$donderdag, zaterdag 19:00–01:00 ; vrijdag 17:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Maastricht$city$)
where id = 'cb7863fe-59dd-43e0-9d76-13b35bdbea88';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Twilight is een bar in Anvers, op 4 Nieuwstad Anvers (2000). Vermelde openingstijden: woensdag 15:00–23:59, donderdag 15:00–23:59, vrijdag 15:00–02:00, zaterdag 15:00–02:00, zondag 10:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$woensdag 15:00–23:59, donderdag 15:00–23:59, vrijdag 15:00–02:00, zaterdag 15:00–02:00, zondag 10:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = 'f528a537-ce61-4068-be82-c7573df66bc7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Uhrlaub ist eine Bar in Hamburg, 63 Lange Reihe Hambourg (20099). Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 08:00–00:00 ; Sonntag 08:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 08:00–00:00 ; Sonntag 08:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Hamburg$city$)
where id = '515e304d-6018-4591-9903-66a367c19774';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café Voulez-vous est un bar situé 18 Rue du Temple Paris (75004). Horaires indiqués : dimanche, lundi, mardi, mercredi, jeudi 11h30–2h ; vendredi, samedi 11h30–3h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mardi, mercredi, jeudi 11h30–2h ; vendredi, samedi 11h30–3h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '3ef2ba54-edb4-40e5-bc69-fddd51a8f8c0';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'bfc21fc9-6bfc-4b80-91ae-f5e09e0139e4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café de la Gare est un bar situé 41 Rue du Temple, 75004 Paris Paris (75004).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '3c92ebc1-e115-4387-93a6-2e8bae2e3acc';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café de la Mer est un bar à Montpellier.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = '2f459a97-b01b-4cea-8204-2affd7c311c7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café local est un bar situé Quimper (29000). Horaires indiqués : dimanche, mercredi, jeudi 18h–2h ; vendredi, samedi 18h–3h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mercredi, jeudi 18h–2h ; vendredi, samedi 18h–3h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Quimper$city$)
where id = 'bd97fa15-85b4-4f6a-acbe-aef728f65e7e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Café pompier est un bar situé Place Pierre Renaudel Bordeaux (33800). Horaires indiqués : en semaine 9h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$en semaine 9h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bordeaux$city$)
where id = 'ea65c46c-9af8-44a9-b1e6-de43735242d7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$California sauna est un sauna situé 7-9 rue de Léon,Rennes,35000. La source le décrit comme un sauna mixte. Horaires indiqués : lundi 12h–23h, mardi 12h–23h59, mercredi 12h–23h59, jeudi 12h–23h59, vendredi 12h–19h, samedi 12h–23h59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–23h, mardi 12h–23h59, mercredi 12h–23h59, jeudi 12h–23h59, vendredi 12h–19h, samedi 12h–23h59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Rennes$city$)
where id = '7c60533a-bc7f-4578-b1e9-1dcbdc8496c7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Canapé queer est un bar situé 20 Rue des Couples Strasbourg (67065). Horaires indiqués : lundi, mardi, mercredi 17h–1h30 ; jeudi, vendredi, samedi 17h–4h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi 17h–1h30 ; jeudi, vendredi, samedi 17h–4h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Strasbourg$city$)
where id = '1346f5fb-08b9-4242-94e9-4233451ca5ec';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Candy Darling Bar es un bar situado en Barcelona, en 586, Gran Via de les Corts Catalanes (lateral mar), Barcelone, 08001. Horario indicado: domingo, lunes, martes, miércoles, jueves 19:00–02:30 ; viernes, sábado 19:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, lunes, martes, miércoles, jueves 19:00–02:30 ; viernes, sábado 19:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'b8523546-5de2-423b-b8ff-f95436d01b70';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Cargo club is een club in Anvers, op 11 Lange Schipperskapelstraat Anvers (2000). Vermelde openingstijden: donderdag 23:00–05:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$donderdag 23:00–05:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = '17aa6689-8a81-489d-a91d-234792687824';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Carré rouge sauna est un sauna naturiste situé 15 Rue de la Donelière,Rennes,35000. On y trouve un hammam, un jacuzzi, une terrasse. Horaires indiqués : lundi 12h–22h, mardi 12h–22h, mercredi 12h–23h59, jeudi 12h–23h59, vendredi 12h–23h59, samedi 13h–23h59, dimanche 13h30–22h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–22h, mardi 12h–22h, mercredi 12h–23h59, jeudi 12h–23h59, vendredi 12h–23h59, samedi 13h–23h59, dimanche 13h30–22h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Rennes$city$)
where id = 'b192b02d-195d-4ca7-8310-78d68a63d54f';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Cave est un club à Bruxelles (Brussels), au 52 Rue des Chartreux Ville de Bruxelles (1000). Le programme est tourné vers la musique électronique.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = '14a7d504-d9e2-491d-a577-bd65e2711ae1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Cavern Club est un club situé 21, Rue Dauphine, Paris, 75006. Horaires indiqués : dimanche, mardi, mercredi, jeudi, vendredi, samedi 17h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mardi, mercredi, jeudi, vendredi, samedi 17h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '84a2ed17-b0db-42ca-b5b6-eb533cbc08df';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$City men shop ist ein Shop in Berlin, 26 Fuggerstraße Berlin (10777). Angegebene Öffnungszeiten: täglich 12:00–19:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$täglich 12:00–19:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '263ee654-8a7c-4f06-a15e-131732387c66';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Club F212 est un sauna situé 1606 Avenue du Maréchal Juin Nîmes (30907). La source le décrit comme un sauna mixte, et on y trouve un hammam, un jacuzzi. Horaires indiqués : lundi, mardi, mercredi, jeudi, vendredi, samedi 11h–19h ; dimanche 11h–18h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi, jeudi, vendredi, samedi 11h–19h ; dimanche 11h–18h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nîmes$city$)
where id = '5dcb16cb-2253-486f-bdca-8b5faac285ff';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Club Random is een club in Anvers, op 28 Geulincxstraat Anvers (2060). Vermelde openingstijden: vrijdag, zaterdag 23:00–08:00 ; zondag 21:00–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$vrijdag, zaterdag 23:00–08:00 ; zondag 21:00–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = '9aa6be64-24e4-413e-96b5-9447906bd7eb';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Comeback Bar ist eine Bar in Frankfurt am Main, 33.35, Alte Gasse, Francfort-sur-le-Main, 60313. Angegebene Öffnungszeiten: täglich 18:00–05:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$täglich 18:00–05:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Frankfurt am Main$city$)
where id = '602d682d-4e90-4667-b729-2e81112f6689';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Cosmo'bar est un bar situé Valence (26000). Horaires indiqués : mardi 18h–2h, mercredi 18h–1h, jeudi 18h–3h, vendredi 18h–3h, samedi 18h–3h, dimanche 18h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi 18h–2h, mercredi 18h–1h, jeudi 18h–3h, vendredi 18h–3h, samedi 18h–3h, dimanche 18h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Valence$city$)
where id = '95a7ecd9-d0cf-4e61-a2b3-a2fb29f6d8c9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Cranberry Bar ist eine Bar in Zurich, 3, Metzgergasse, Zurich, 8001. Angegebene Öffnungszeiten: Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 17:00–23:59 ; Freitag, Samstag 17:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 17:00–23:59 ; Freitag, Samstag 17:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Zurich$city$)
where id = '048a2ef8-4cf4-4173-8062-12a5d89f77a3';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Crazy Circle est un bar queer à Bruxelles (Brussels), au Bruxelles (Brussel). Il se présente comme un lieu lesbien ou ouvert aux femmes queer.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = '51caa25e-fffd-4ffa-a24e-60bac0eccdea';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Cut is een bar in Anvers, op 21, Grote Pieter Potstraat, Anvers, 2000. Vermelde openingstijden: donderdag 17:00–23:59, vrijdag 20:00–02:00, zaterdag 17:00–02:00, zondag 17:00–22:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$donderdag 17:00–23:59, vrijdag 20:00–02:00, zaterdag 17:00–02:00, zondag 17:00–22:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = '95f68891-e008-43a6-ab10-3a278e6b1835';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '7755562b-f159-4dc4-ac3c-e8e5400daca3';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Dado Bar es un bar situado en Ibiza, en Carrer de la Mare de Déu, Ibiza (ville), 07800. Horario indicado: todos los días 21:00–03:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 21:00–03:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Ibiza$city$)
where id = 'f5a0713f-de13-442d-98c8-d1ec3314ecb2';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Daniel's Company Bar ist eine Bar in Hamburg, 6, Kreuzweg, Hambourg, 20099. Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch, Donnerstag 18:00–08:00 ; Sonntag, Freitag, Samstag 18:00–10:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch, Donnerstag 18:00–08:00 ; Sonntag, Freitag, Samstag 18:00–10:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Hamburg$city$)
where id = '52985d19-6ec4-4d79-b8f0-d1331b818375';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Darjeeling est un club situé 24 Chemin de l'Ile de Piot Avignon (84000). Horaires indiqués : mardi, vendredi 14h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, vendredi 14h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Avignon$city$)
where id = '15126242-648e-44a2-b43a-dbc9848a6b00';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Dark Cruising Bar es un bar situado en Palma de Mallorca, en 22 rue Carrer de Ticià,Palma de Majorque,07003. Horario indicado: domingo, lunes, martes, miércoles, jueves 21:00–03:00 ; viernes, sábado 21:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, lunes, martes, miércoles, jueves 21:00–03:00 ; viernes, sábado 21:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Palma de Mallorca$city$)
where id = 'f966033d-812e-4b37-95f3-0401e159a1ed';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Delta sauna club est un sauna situé 263 Boulevard Carnot,Le Mans,72000. Horaires indiqués : lundi 13h–19h, mercredi 13h–22h, jeudi 13h–1h, vendredi 13h30–2h, samedi 13h30–1h, dimanche 13h30–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 13h–19h, mercredi 13h–22h, jeudi 13h–1h, vendredi 13h30–2h, samedi 13h30–1h, dimanche 13h30–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Le Mans$city$)
where id = 'af56f6e2-68ae-4db2-ab98-fb776f8082e8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Der Boiler Sauna ist eine Sauna in Berlin, 34 Mehringdamm Berlin (10961). Im Programm steht elektronische Musik. Angegebene Öffnungszeiten: Montag 00:00–06:00, Montag 12:00–06:00, Dienstag 12:00–06:00, Mittwoch 12:00–06:00, Donnerstag 12:00–06:00, Freitag 12:00–23:59, Samstag 00:00–23:59, Sonntag 00:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 00:00–06:00, Montag 12:00–06:00, Dienstag 12:00–06:00, Mittwoch 12:00–06:00, Donnerstag 12:00–06:00, Freitag 12:00–23:59, Samstag 00:00–23:59, Sonntag 00:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '6a6eb090-7048-4acb-99c5-65a6b739e38d';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Deseo 54 es un club situado en Valencia, en Carrer de Pepita, Valence, 46009. Horario indicado: el fin de semana 01:00–07:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$el fin de semana 01:00–07:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Valencia$city$)
where id = 'caccf4b6-c350-45dc-b350-dd83f76817ff';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Diamonds club ist ein Club in Köln, 90 Hohenzollernring Cologne (50672). Angegebene Öffnungszeiten: Donnerstag, Freitag, Samstag 23:00–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Donnerstag, Freitag, Samstag 23:00–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = 'f7f21825-a4f7-4d53-bae3-9551de83df94';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Die Mumu ist eine Bar in Köln, 51, Schaafenstraße, Cologne, 50676. Angegebene Öffnungszeiten: Montag 18:00–01:30, Dienstag 18:00–04:00, Mittwoch 18:00–05:00, Donnerstag 18:00–01:30, Freitag 18:00–06:00, Samstag 15:00–06:00, Sonntag 15:00–01:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 18:00–01:30, Dienstag 18:00–04:00, Mittwoch 18:00–05:00, Donnerstag 18:00–01:30, Freitag 18:00–06:00, Samstag 15:00–06:00, Sonntag 15:00–01:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = 'c1e403df-70f9-4ea0-8eda-2ac13d5c59d9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Discus sauna ist eine Sauna in Zurich, Zurich. Angegebene Öffnungszeiten: Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 13:00–22:00 ; Freitag, Samstag 13:00–23:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 13:00–22:00 ; Freitag, Samstag 13:00–23:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Zurich$city$)
where id = '32979bf4-192a-4439-b9a8-df9d5be2f937';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Dolores est un bar à Bruxelles (Brussels), au 40 Rue du Marché au Charbon Ville de Bruxelles (1000). Horaires indiqués : lundi 17h–1h, mardi 17h–1h, mercredi 17h–1h, jeudi 17h–2h, vendredi 17h–3h, samedi 17h–3h, dimanche 17h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 17h–1h, mardi 17h–1h, mercredi 17h–1h, jeudi 17h–2h, vendredi 17h–3h, samedi 17h–3h, dimanche 17h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = 'daca629e-035f-45c8-9346-f4b5477b1efa';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = '2e729aaf-1fb3-445b-a424-01e87a0a0ebb';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Dos Santos - exclusive leather design ist eine Bar in Berlin, 119 Mehringdamm Berlin (10965).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'c957593c-0b38-4939-ae29-a2760d7203df';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Double jeu est un club situé Centre LGBTQI+ Paris Ile-de-France. Il se présente comme un lieu lesbien ou ouvert aux femmes queer, et le lieu existe depuis 2002.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'ac138219-a860-4488-80eb-b6042413cdc8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Dragon sauna ist eine Sauna in Hamburg, 37, Pulverteich, Hambourg, 20099. Angegebene Öffnungszeiten: Montag 13:00–23:00, Dienstag 13:00–23:00, Mittwoch 13:00–23:00, Donnerstag 13:00–23:59, Freitag 13:00–23:59, Samstag 00:00–23:59, Sonntag 00:00–23:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 13:00–23:00, Dienstag 13:00–23:00, Mittwoch 13:00–23:00, Donnerstag 13:00–23:59, Freitag 13:00–23:59, Samstag 00:00–23:59, Sonntag 00:00–23:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Hamburg$city$)
where id = '4190a0eb-31a8-4d5c-9263-7b0b81fd6fff';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Drak's sauna est un sauna situé 2a, rue Moll,Strasbourg,67000. Horaires indiqués : lundi 12h–21h, mardi 12h–21h, mercredi 12h–21h, jeudi 12h–21h, vendredi 14h–21h, samedi 14h–21h, dimanche 14h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–21h, mardi 12h–21h, mercredi 12h–21h, jeudi 12h–21h, vendredi 14h–21h, samedi 14h–21h, dimanche 14h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Strasbourg$city$)
where id = 'dd7c7972-019c-41a7-b080-6b760beeb0c9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Dreizehn ist eine Bar in Berlin, 27, Welserstraße, Berlin, 10777. Angegebene Öffnungszeiten: Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 14:00–04:00 ; Freitag, Samstag 14:00–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 14:00–04:00 ; Freitag, Samstag 14:00–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '31b4bb9c-f049-4b0c-9d0e-00dc7dc8e1d9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Eagle bar Stuttgart ist eine Bar in Stuttgart, 51, Mozartstraße, Stuttgart, 70180. Angegebene Öffnungszeiten: Dienstag, Donnerstag 20:00–01:00 ; Freitag, Samstag 21:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Dienstag, Donnerstag 20:00–01:00 ; Freitag, Samstag 21:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Stuttgart$city$)
where id = 'b3b5cbc3-19dd-446a-81ed-d11a9192ac65';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Eagle bar Torremolinos es un bar situado en Torremolinos, en Plaza de la Nogalera, Torremolinos, 29620. Horario indicado: lunes 20:00–02:00, martes 20:00–02:00, miércoles 20:00–02:00, jueves 20:00–03:00, viernes 20:00–03:00, sábado 20:00–03:00, domingo 16:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes 20:00–02:00, martes 20:00–02:00, miércoles 20:00–02:00, jueves 20:00–03:00, viernes 20:00–03:00, sábado 20:00–03:00, domingo 16:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Torremolinos$city$)
where id = 'd3508bd3-f86c-4ea7-8ff8-eae67ae73371';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = 'ddc0d5c4-1a5e-4c1b-bd98-12df5189d7b4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Elite club est un club situé 1 Rue du Mouton Blois (41000).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Blois$city$)
where id = '0e8b6fe9-1971-4393-be02-58eb2f68483b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Elvira café es un bar situado en Barcelona, en 275, Carrer del Consell de Cent, Barcelone, 08001. Horario indicado: domingo, lunes, martes, miércoles, jueves 18:00–03:00 ; viernes, sábado 18:00–03:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, lunes, martes, miércoles, jueves 18:00–03:00 ; viernes, sábado 18:00–03:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'e1f34fcf-3626-4aba-a82f-019d0d72c947';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Entre Deux Eaux est un bar naturiste au 45 rue de la Folie-Méricourt, dans le 11e arrondissement de Paris. Il ouvre tous les jours à partir de 17h, jusqu’à minuit en semaine et 2h le week-end. Un tarif réduit est indiqué pour les moins de 26 ans.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mardi, mercredi, jeudi 17h–23h59 ; vendredi, samedi 17h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '77bda544-6583-4e6d-9436-cff870e4f6f5';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Lyon$city$)
where id = '2199563e-eb73-43d3-980e-157e893af128';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$ExCorner ist eine Bar in Köln, 57, Schaafenstraße, Cologne, 50676. Angegebene Öffnungszeiten: Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 19:00–03:00 ; Freitag, Samstag 19:00–05:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 19:00–03:00 ; Freitag, Samstag 19:00–05:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = 'cfcbbb98-6a34-43f4-bd96-687083f7f3a6';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Extratour ist eine Bar in Hamburg, 1, Zimmerpforte, Hambourg, 20099. Angegebene Öffnungszeiten: Montag 14:00–03:00, Dienstag 14:00–03:00, Mittwoch 14:00–03:00, Donnerstag 14:00–03:00, Freitag 14:00–04:00, Samstag 12:00–04:00, Sonntag 12:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 14:00–03:00, Dienstag 14:00–03:00, Mittwoch 14:00–03:00, Donnerstag 14:00–03:00, Freitag 14:00–04:00, Samstag 12:00–04:00, Sonntag 12:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Hamburg$city$)
where id = '8ab35755-16ce-46eb-ad37-8b447aaca45c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Ficken 3000 ist ein Club in Berlin, 70, Urbanstraße, Berlin, 10967. Angegebene Öffnungszeiten: täglich 22:00–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$täglich 22:00–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '14596d13-db2c-431d-bf52-a1065e909cbc';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Flashback Café est un bar situé 5, Allée de Brienne, Toulouse, 31000.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = 'bb6f4407-6aa3-46e3-bd65-cfb6ba45f33b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Flax ist eine Bar in Berlin, 41, Chodowieckistraße, Berlin, 10405. Angegebene Öffnungszeiten: Mittwoch 18:30–03:00, Donnerstag 18:30–03:00, Freitag 18:30–04:00, Samstag 18:30–04:00, Sonntag 18:30–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Mittwoch 18:30–03:00, Donnerstag 18:30–03:00, Freitag 18:30–04:00, Samstag 18:30–04:00, Sonntag 18:30–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '9d5d69c4-66f0-427c-8de2-e8bbb50506d8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Fluidescape es un bar situado en Madrid, en 13, Calle de Gravina, Madrid, 28004. Horario indicado: lunes 22:00–04:00, martes 22:00–04:00, miércoles 22:00–04:00, jueves 22:00–05:30, viernes 22:00–06:00, sábado 22:00–06:00, domingo 22:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes 22:00–04:00, martes 22:00–04:00, miércoles 22:00–04:00, jueves 22:00–05:30, viernes 22:00–06:00, sábado 22:00–06:00, domingo 22:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = 'a71457bc-6a4a-40ab-a7b3-b629ba488d0f';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Saint-Brieuc$city$)
where id = '68e11c7a-1e19-4d05-a885-517efae3d046';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Folles saisons est un bar situé 197 Route de Saint-Simon Toulouse (31100).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = '729653a1-31a5-40a6-bb0a-da46f451e7d0';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Football club Paris arc-en-ciel est un club situé Centre LGBTQ+ Paris.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '289a8fe5-8599-469e-ad8d-36ce709aafb9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Friends Bar ist eine Bar in Bremen, 32, Rembertistraße, Bremen, 28203. Angegebene Öffnungszeiten: Mittwoch, Donnerstag 18:00–01:00 ; Freitag, Samstag 18:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Mittwoch, Donnerstag 18:00–01:00 ; Freitag, Samstag 18:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bremen$city$)
where id = 'd43d335c-4a51-4c0b-868e-2d58dfac356c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Front runner Nice est un club situé Nice.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = 'b2a29100-f8c8-4d2c-a9c1-d075378696a0';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Front runner Paris est un club situé Centre LGBTQI+ Paris Ile-de-France. Il se présente comme un lieu lesbien ou ouvert aux femmes queer, et le lieu existe depuis 1992.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '0af03c85-36c3-4089-8511-212ccc8db102';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Front runners Strasbourg est un club situé Strasbourg (67000;67100;67200).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Strasbourg$city$)
where id = '512a133b-43b5-4713-a637-0c34fd03a0e1';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '47d91f88-c63e-4559-a3a7-f52d724d64b0';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = '77fdd838-6d8d-48c9-aa9a-513f52f488de';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '112709d0-e0d8-4508-a1a7-2bd9a214b672';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$George V est un club situé 124 Cours Berriat Grenoble (38000). Horaires indiqués : vendredi, samedi 23h–6h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$vendredi, samedi 23h–6h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Grenoble$city$)
where id = '8340158e-0626-4c00-a27c-352bf77deed5';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Gibus est un club à Paris, connu pour ses soirées LGBTQIA+. Le site du lieu annonce des événements festifs surtout du vendredi au dimanche, avec des afters.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'e86ad2f3-67a0-46dd-a7e4-c2a3c99f51a1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Gigi est un bar situé 9, Rue de France, Charleroi, 6000. Horaires indiqués : lundi 17h–23h59, mardi 17h–23h59, mercredi 17h–23h59, jeudi 17h–23h59, vendredi 17h–2h, samedi 17h–2h, dimanche 11h–22h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 17h–23h59, mardi 17h–23h59, mercredi 17h–23h59, jeudi 17h–23h59, vendredi 17h–2h, samedi 17h–2h, dimanche 11h–22h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Charleroi$city$)
where id = '0bcdaf3b-4a3c-483d-815b-0d67832b83dc';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Glam est un club situé Rue Eugène Emmanuel Nice. Horaires indiqués : dimanche, vendredi, samedi 23h–4h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, vendredi, samedi 23h–4h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = '7f971f0c-f04c-443c-96a5-beaf6268151c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Glitter Club (ex-VHS club) est un club situé Place du Maréchal Foch La Rochelle (17000). Horaires indiqués : dimanche, lundi, mardi, mercredi, jeudi 23h–5h ; vendredi, samedi 23h–6h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mardi, mercredi, jeudi 23h–5h ; vendredi, samedi 23h–6h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$La Rochelle$city$)
where id = '39ca47ce-a3fa-490c-b75e-8c810867424e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Grosse Freiheit 114 ist eine Bar in Berlin, 114, Boxhagener Straße, Berlin, 10245. Angegebene Öffnungszeiten: Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 20:00–03:00 ; Freitag, Samstag 20:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 20:00–03:00 ; Freitag, Samstag 20:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '46f38a8a-736f-4103-9fc9-dfce6f37fbe8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Ground club est un club situé Rue de Hollerich Luxembourg (1740). Le programme est tourné vers la musique électronique. Horaires indiqués : vendredi, samedi 23h59–6h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$vendredi, samedi 23h59–6h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Luxembourg$city$)
where id = '7ad85bad-a109-4eb6-929a-3f1dabc44c82';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le H2O est un sauna à Béziers. Le site du lieu présente des espaces de détente, un hammam et un jacuzzi. Un tarif réduit est indiqué pour les moins de 26 ans, selon les horaires d’arrivée.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–19h30, mardi 12h–19h30, mercredi 12h–19h30, jeudi 12h–1h, vendredi 12h–1h, samedi 12h–1h, dimanche 12h–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Béziers$city$)
where id = '91aec9c1-adc0-476f-8241-3dd6918551ee';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Happy café est un bar situé 193 Rue Jean Jaurès Brest (29200). Horaires indiqués : dimanche, mercredi, jeudi 18h–1h ; vendredi, samedi 18h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mercredi, jeudi 18h–1h ; vendredi, samedi 18h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Brest$city$)
where id = '01f7437b-288d-4bf9-87ce-ee2957d39adf';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Heaven ist ein Club in Zurich, 5, Spitalgasse, Zurich, 8001. Angegebene Öffnungszeiten: Freitag, Samstag 22:45–05:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Freitag, Samstag 22:45–05:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Zurich$city$)
where id = 'ec08551e-cfa5-4c4a-831e-7a70d390fa6b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Herenhuis sauna is een sauna in Berchem, op 63 De Lescluzestraat Berchem (2600). Vermelde openingstijden: zondag, maandag, dinsdag, woensdag, donderdag 12:00–23:59 ; vrijdag, zaterdag 12:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, maandag, dinsdag, woensdag, donderdag 12:00–23:59 ; vrijdag, zaterdag 12:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berchem$city$)
where id = '84bf4ef5-9909-4ed1-b899-08cf5cd94cc2';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Hessenhuis is een bar in Anvers, op 79 Falconrui Anvers (2000). Vermelde openingstijden: dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–02:00, vrijdag 16:00–04:00, zaterdag 16:00–04:00, zondag 16:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–02:00, vrijdag 16:00–04:00, zaterdag 16:00–04:00, zondag 16:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = '80efa5a7-54f0-4a68-94d7-65213bbda4af';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Himmelreich ist eine Bar in Berlin, 36, Simon-Dach-Straße, Berlin, 10245. Angegebene Öffnungszeiten: Montag 17:00–23:59, Dienstag 17:00–23:59, Mittwoch 17:00–23:59, Donnerstag 17:00–23:59, Freitag 17:00–03:00, Samstag 17:00–03:00, Sonntag 16:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 17:00–23:59, Dienstag 17:00–23:59, Mittwoch 17:00–23:59, Donnerstag 17:00–23:59, Freitag 17:00–03:00, Samstag 17:00–03:00, Sonntag 16:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'fa3c388f-78f9-47a8-b478-7d981659178c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Homo erectus est un bar à Bruxelles (Brussels), au 5 Rue du Marché au Charbon Ville de Bruxelles (1000). Horaires indiqués : dimanche, mardi, mercredi, jeudi, vendredi, samedi 15h–23h59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mardi, mercredi, jeudi, vendredi, samedi 15h–23h59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = '44f4e774-8679-45fa-807c-1a00e012f27e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Hot Bear es un bar situado en Madrid, en 9, Calle de las Infantas, Madrid, 28004. Horario indicado: todos los días 16:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 16:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '681e4239-333a-4f4b-9df6-69d6fee2d0b5';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Hot club est un club situé Toulouse. Le lieu existe depuis 1995. Horaires indiqués : jeudi 20h–2h ; dimanche 14h–19h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi 20h–2h ; dimanche 14h–19h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = '5b234169-a786-47c5-9e56-6987b9fa1d03';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Hot video store est un boutique situé 16 bis, avenue Gaston Lacoste, Pau, 64000. Horaires indiqués : tous les jours 14h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 14h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Pau$city$)
where id = '02015c0f-9c5e-403e-838c-0539470988b2';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$HypnoBar est un bar situé 4, Rue des Trésoriers de la Bourse, Montpellier, 34000. Horaires indiqués : mercredi, jeudi, vendredi, samedi 18h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi, jeudi, vendredi, samedi 18h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = 'd626967d-8f20-48a4-aade-b70363ace370';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$L’IDM est un sauna au 4 rue du Faubourg Montmartre, dans le 9e arrondissement de Paris. Le site du lieu mentionne un hammam, un jacuzzi, un espace fitness et une ouverture tous les jours de midi à 1h. Le week-end, le sauna est indiqué comme naturiste.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–1h, mardi 12h–1h, mercredi 12h–1h, jeudi 12h–1h, vendredi 12h–2h, samedi 11h–2h, dimanche 11h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'd8daec97-cdc3-4179-947d-b154407bcaa2';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$IEM est un boutique situé 18 Rue Sainte-Croix de la Bretonnerie Paris (75004). Le lieu existe depuis 1980. Horaires indiqués : lundi 12h–20h, mardi 12h–20h, mercredi 12h–20h, jeudi 12h–20h, vendredi 12h–21h, samedi 12h–21h, dimanche 14h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–20h, mardi 12h–20h, mercredi 12h–20h, jeudi 12h–20h, vendredi 12h–21h, samedi 12h–21h, dimanche 14h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '3fb7b1a2-58a7-4d90-b62c-d778976ce852';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Ikon is een club in Anvers, op 3 Straatsburgdok-Noordkaai Anvers (2030). Het programma is gericht op elektronische muziek.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = '3aea159e-6f30-4d22-8a8a-516d9592de64';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Incognito ist eine Bar in Berlin, 53, Hohenstaufenstraße, Berlin, 10779. Angegebene Öffnungszeiten: Mittwoch 18:00–23:30, Donnerstag 18:00–23:30, Freitag 18:00–02:00, Samstag 18:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Mittwoch 18:00–23:30, Donnerstag 18:00–23:30, Freitag 18:00–02:00, Samstag 18:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '17702148-f4aa-4357-b51c-358836d12939';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Insomnia night club ist ein Club in Berlin, 17 Alt-Tempelhof Berlin (12099). Im Programm steht elektronische Musik. Angegebene Öffnungszeiten: Dienstag, Mittwoch, Donnerstag 20:00–03:00 ; Freitag, Samstag 22:00–05:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Dienstag, Mittwoch, Donnerstag 20:00–03:00 ; Freitag, Samstag 22:00–05:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'fdd8c4de-7882-4eff-9ac2-12d867799024';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Interférence est un club situé 56, Route de Lavaur, Balma, 31130. Le programme est tourné vers la musique électronique.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Balma$city$)
where id = '8bcde763-596e-4e31-bb46-5728361b5537';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$JJ Bar es un bar situado en Ibiza, en Ibiza (ville), 07800. Horario indicado: todos los días 22:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 22:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Ibiza$city$)
where id = '9dbd6487-2d35-4af3-8fba-105e0cd87dd4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Jail Bar ist eine Bar in Berne, 53, Gerechtigkeitsgasse, Berne, 3011. Angegebene Öffnungszeiten: Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 17:00–00:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 17:00–00:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berne$city$)
where id = '94efc78c-2bdc-4ad8-82bb-ad026b7c1ad4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Jet Set est un bar situé 4 Rue Général de La Bédoyère Perpignan (66000). Horaires indiqués : dimanche, jeudi, vendredi, samedi 20h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, jeudi, vendredi, samedi 20h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Perpignan$city$)
where id = 'abf819a4-f7fe-49c3-874a-cb092ab28285';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Jo's Bar Pau est un bar situé 6, Rue René Fournets, Pau, 64000. Horaires indiqués : dimanche, mercredi, jeudi, vendredi, samedi 19h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mercredi, jeudi, vendredi, samedi 19h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Pau$city$)
where id = '59b9fa59-cf28-4ccc-be3c-35dcfdcb5df6';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Jungle bar est un bar à Bruxelles (Brussels), au 52 Rue des Pierres Ville de Bruxelles (1000). Le programme est tourné vers la musique électronique. Horaires indiqués : jeudi 21h–5h ; vendredi, samedi 21h–6h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi 21h–5h ; vendredi, samedi 21h–6h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = '8fa1acb4-fa16-40cb-b7d2-20976b2ce758';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$K'sensuel est un boutique situé 123, rue du Jolivet, Tours, 37000. Horaires indiqués : lundi, mardi, mercredi, jeudi, vendredi, samedi 12h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi, jeudi, vendredi, samedi 12h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Tours$city$)
where id = '837aede8-a392-49df-8f39-6de02b28291b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Karmen Camina est un bar situé 4, Cour des Cigarières, Strasbourg, 67000. Le programme est tourné vers la musique électronique.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Strasbourg$city$)
where id = '1f648f0e-7401-4931-ad52-a50006ff256a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Keerweer is een bar in Rotterdam, op 14, Keerweer, Rotterdam, 3012KB. Vermelde openingstijden: zondag, maandag, dinsdag, woensdag, donderdag 17:00–06:00 ; vrijdag, zaterdag 17:00–07:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, maandag, dinsdag, woensdag, donderdag 17:00–06:00 ; vrijdag, zaterdag 17:00–07:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Rotterdam$city$)
where id = 'ffb208b4-9b2b-4cf7-badb-ff1ce4686030';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Keewee - Séné est un boutique queer situé Quimper (29000).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Quimper$city$)
where id = '7891cf02-2c70-42b4-84ae-25db08ab8b11';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Keller est un bar à Paris. Selon l’annuaire StroboMag, il ouvre le jeudi de 21h à 4h, le vendredi et le samedi de 22h à 5h, et le dimanche de 17h à minuit.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi 21h–4h, vendredi 22h–5h, samedi 22h–5h, dimanche 17h–0h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'c63ad56c-8e17-4e2f-86ca-b43b88d02e68';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Kelmonderhof is een sauna in Beek, op 51, Kelmonderhofweg, Beek, 6191RB. Vermelde openingstijden: zondag, maandag, woensdag 12:00–23:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, maandag, woensdag 12:00–23:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Beek$city$)
where id = '28c13c8d-1b59-4fe9-9d97-9ee9f4ca477b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Kiki es un club situado en Maspalomas, Las Palmas, en Maspalomas, Las Palmas. Horario indicado: lunes, martes, miércoles, jueves, viernes, sábado 23:59–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes, martes, miércoles, jueves, viernes, sábado 23:59–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = '0e81b2e5-7e91-4cb4-9dc1-8cf1616cfc84';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Kilomètre25 est un club situé Rue Ella Fitzgerald Paris (75019). Le programme est tourné vers la musique électronique.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '5b305956-e9d3-4b15-a797-2cc4de950d83';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Koncept Sauna se trouve à Montpellier. La source le décrit comme mixte le mardi et le vendredi à partir de 20h, avec hammam, sauna et jacuzzi. Il est annoncé ouvert tous les jours à partir de 13h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 13h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = 'b728bcc2-2f5c-44c7-b7a6-cb8761bd1299';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Kweer bar ist eine Bar in Zurich, 14, Spitalgasse, Zurich, 8001. Angegebene Öffnungszeiten: Dienstag 17:00–23:30, Mittwoch 17:00–23:30, Donnerstag 17:00–23:59, Freitag 17:00–02:00, Samstag 17:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Dienstag 17:00–23:30, Mittwoch 17:00–23:30, Donnerstag 17:00–23:59, Freitag 17:00–02:00, Samstag 17:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Zurich$city$)
where id = '1de582ce-0092-4786-8f83-64ba4fee5ca3';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = '428cc2a3-4a3c-4e79-abf3-4d297a1cfe14';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$L'Autre (after) est un club situé 30 Rue de Stalingrad Toulouse (31000). Horaires indiqués : le week-end 5h–12h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$le week-end 5h–12h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = 'dee0a9ec-0b08-4026-8d06-df2684f7c974';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Lille$city$)
where id = '505f203e-dcbd-43cf-86f6-391f258547ec';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = '67fc21aa-5464-4f9a-83de-f96299e7e6df';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$L'Exception cabaret-bar est un bar situé Bordeaux. Horaires indiqués : mercredi, jeudi 20h–2h ; vendredi, samedi 20h–4h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi, jeudi 20h–2h ; vendredi, samedi 20h–4h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bordeaux$city$)
where id = '38c653d2-128e-442e-9257-3195883521f7';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Biarritz$city$)
where id = 'd512f910-47c7-4246-bcf5-fc3bea19e1ef';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$L'Impact Bar est un bar naturiste à Paris.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '32f007b7-ef69-49fb-8a8e-ee660c753878';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$L'Insolite club est un club situé 61 Rue Beaurepaire Angers (49035). Horaires indiqués : mercredi, jeudi 23h59–4h ; vendredi, samedi 23h59–7h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi, jeudi 23h59–4h ; vendredi, samedi 23h59–7h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Angers$city$)
where id = '2c7fb268-0f08-4880-9050-0c7335081ce2';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = 'd6f21a33-d588-408f-8e9d-98d70ea64108';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$LP3 by Dali est un bar situé 61 Cours Jean Jaurès Grenoble (38000). Horaires indiqués : mardi, mercredi, jeudi, vendredi, samedi 18h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi, jeudi, vendredi, samedi 18h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Grenoble$city$)
where id = 'a50e72a6-5f30-4720-8ae5-5a44c4398aed';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Chapelle café est un bar situé 8 Quai des Célestins Lyon (69002). Horaires indiqués : lundi 16h–1h, mardi 16h–1h, mercredi 16h–1h, jeudi 16h–3h, vendredi 16h–4h, samedi 14h–4h, dimanche 11h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 16h–1h, mardi 16h–1h, mercredi 16h–1h, jeudi 16h–3h, vendredi 16h–4h, samedi 14h–4h, dimanche 11h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lyon$city$)
where id = 'da5b9d7c-b008-4555-80e3-84736bcab7b1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Federica es un bar situado en Barcelona, en Carrer de Salvà, Barcelone, 08001. Horario indicado: miércoles 19:00–02:00, jueves 19:00–02:00, viernes 19:00–03:00, sábado 19:00–03:00, domingo 19:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$miércoles 19:00–02:00, jueves 19:00–02:00, viernes 19:00–03:00, sábado 19:00–03:00, domingo 19:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'c37f308b-d231-48f8-b15e-ffb654f9ddfd';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Gougnotte est un bar situé 18 Avenue Étienne Billières Toulouse (31300). Horaires indiqués : dimanche, mardi, mercredi, jeudi 17h–0h30 ; vendredi, samedi 17h–1h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mardi, mercredi, jeudi 17h–0h30 ; vendredi, samedi 17h–1h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = '060b45fa-5488-470c-bdd8-bd58f0bc6127';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Grenze est un bar situé Rue Georges Wodli Strasbourg (67083). On y trouve une terrasse. Horaires indiqués : mercredi, jeudi, vendredi, samedi 17h–0h30 ; dimanche 15h–21h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi, jeudi, vendredi, samedi 17h–0h30 ; dimanche 15h–21h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Strasbourg$city$)
where id = '720557a6-fe45-4c2a-babf-33c2220d8d6a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Java est un club situé 105 Rue du Faubourg du Temple Paris (75011). Le lieu existe depuis 1923.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'b83eccd1-4184-4ea1-9d87-3b8f46397565';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Loge est un bar situé 7 Rue Charles Dullin Lyon (69002). Horaires indiqués : mardi, mercredi, jeudi, vendredi, samedi 11h–14h30 ; mardi, mercredi, jeudi, vendredi, samedi 18h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi, jeudi, vendredi, samedi 11h–14h30 ; mardi, mercredi, jeudi, vendredi, samedi 18h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lyon$city$)
where id = 'b8640956-4502-4c8d-89ca-2de9d05b52ff';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Machine du Moulin Rouge est un club situé 90 Boulevard de Clichy Paris (75018). On y trouve une terrasse.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'b83e65fc-fed5-4620-bea0-1b1d7d882ad3';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '372620a8-193f-4497-91a3-00574d65e68a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Mutinerie est un bar queer situé 176-178 Rue Saint-Martin Paris (75003). Il se présente comme un lieu lesbien ou ouvert aux femmes queer, et le lieu existe depuis 2012. Horaires indiqués : dimanche, lundi, mardi 17h–23h59 ; mercredi, jeudi, vendredi, samedi 17h–1h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mardi 17h–23h59 ; mercredi, jeudi, vendredi, samedi 17h–1h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '1f29b1e5-6a71-49a9-9781-cc59b8cae23b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Réserve est un bar à Bruxelles (Brussels), au 2a Petite rue au Beurre Ville de Bruxelles (1000). Horaires indiqués : lundi 15h–23h59, mardi 15h–1h, jeudi 15h–1h, vendredi 15h–1h, samedi 14h–23h59, dimanche 13h–23h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 15h–23h59, mardi 15h–1h, jeudi 15h–1h, vendredi 15h–1h, samedi 14h–23h59, dimanche 13h–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = '24aae40a-45f2-4ddd-a6dd-2cf871010fe2';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Suite Etoile est un club situé 2 Rue Malherbe Rouen (76100).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Rouen$city$)
where id = '757a3633-cd66-41c6-ab9d-0e79803f0644';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$La Tram bar est un bar situé 4 Rue Jean de Vienne Calais (62100). Horaires indiqués : dimanche, lundi, mercredi, jeudi 18h–1h ; vendredi, samedi 18h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mercredi, jeudi 18h–1h ; vendredi, samedi 18h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Calais$city$)
where id = '8bb73a13-f0be-4365-b069-c002670e24f6';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Laddicted bar est un bar situé 2, Rue Louis Bertrand, Ivry-sur-Seine, 94200. Horaires indiqués : dimanche, vendredi, samedi 21h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, vendredi, samedi 21h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Ivry-sur-Seine$city$)
where id = 'ebdaa6af-3985-4576-9386-e5fb92681dd4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Lapart is een bar in Amersfoort, op 6, Hof, Amersfoort, 3811CJ.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Amersfoort$city$)
where id = 'f7f88d61-aac2-4f7f-8c4e-9c3123a36469';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Belgica est un bar à Bruxelles (Brussels), au 32 Rue du Marché au Charbon Ville de Bruxelles (1000). Horaires indiqués : dimanche, mercredi 18h–1h ; jeudi, vendredi, samedi 18h–3h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mercredi 18h–1h ; jeudi, vendredi, samedi 18h–3h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = '28c62461-f210-4d84-a6e0-caf35334b8d8';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Lille$city$)
where id = '1c01da41-5199-46f1-b7ec-603dee350b10';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Clair Obscur est un club à Cap d'Agde.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = '14845aaa-d65e-451e-b20f-14846f988598';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Couloir est un bar situé Rue Alberti Nice (06000). Horaires indiqués : mardi, mercredi, jeudi, vendredi, samedi 18h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi, jeudi, vendredi, samedi 18h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = 'adc9464e-e214-40ef-8a4d-d85441f744ba';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Crystal est un club naturiste à Cap d'Agde.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = '255ca438-2bd6-43c3-8f6e-e318f02a05b5';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles$city$)
where id = 'c9a57df8-7e8b-41ad-be8d-c6d16671d177';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'a6dcca0f-8b25-4031-98e1-3d8dabf79175';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Glamour est un club naturiste à Cap d'Agde.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = '02a5fd98-5cc0-4baf-83ca-d984e8d1ba0f';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Le Boulou$city$)
where id = 'b298ffd1-cb04-41f9-af18-ca95a80481f7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Jul's sauna est un sauna situé 17, rue de Montpellier,Carcassonne,11000. Horaires indiqués : dimanche, lundi, mardi, mercredi, jeudi, vendredi 12h–20h ; samedi 12h–22h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mardi, mercredi, jeudi, vendredi 12h–20h ; samedi 12h–22h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Carcassonne$city$)
where id = 'c6f9e54e-2c5b-4180-a45d-b1157638c5ef';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Look est un bar naturiste à Cap d'Agde. Le lieu existe depuis 2016.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = 'f56a0fb0-58b8-42d2-ab82-735e67087751';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Lounge est un bar situé 16, Place Charles Laganne, Toulouse, 31300.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = 'f342960d-a94a-49a8-a454-240b93097f67';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Marais music bar est un bar situé 49 Rue Fontgiève Clermont-Ferrand (63000). Horaires indiqués : dimanche, jeudi, vendredi, samedi 18h30–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, jeudi, vendredi, samedi 18h30–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Clermont-Ferrand$city$)
where id = '4adc5542-2489-4c0d-8707-b999246fa4a0';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = 'ac21c316-c7d5-4d2f-8ec7-f65dbd5b8f2c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le New Bora est un club. On y trouve un hammam, un jacuzzi.$desc$ else description end
where id = '11ec9807-b62e-49af-8d61-82f4f32bad6a';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = '1091267f-696d-4e6a-8e94-3c6e81ed071e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Petit Marais est un bar situé 15 Rue Kervégan Nantes (44000). Horaires indiqués : mardi, mercredi, jeudi, vendredi, samedi 22h–4h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi, jeudi, vendredi, samedi 22h–4h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nantes$city$)
where id = 'dc24cd60-9cf9-42e7-b241-264aff24fab0';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Piaf est un bar situé 11, Rue de la Casquette, Liège, 4000. Horaires indiqués : lundi, mardi, mercredi, jeudi, vendredi, samedi 17h–23h59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi, jeudi, vendredi, samedi 17h–23h59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Liège$city$)
where id = '4ccd7bd6-4940-4d6c-b4b1-3315d45b2850';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Plaisir Club est un club à Bréal-sous-Montfort. On y trouve un hammam.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Bréal-sous-Montfort$city$)
where id = '3430b55f-7144-4005-9f3b-56d8ebebab35';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Bordeaux$city$)
where id = '8e707b29-d91d-40c9-be97-e4c3bcf123fc';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Privilège sauna est un sauna situé Nice. Horaires indiqués : jeudi 13h30–23h59, vendredi 13h30–2h, samedi 18h30–2h30, dimanche 13h30–23h59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi 13h30–23h59, vendredi 13h30–2h, samedi 18h30–2h30, dimanche 13h30–23h59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = '7fb3da15-03f8-44be-a0a8-ad8b2d9a1e6e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le QG de Monbadon est un bar situé 43, Rue Lafaurie de Monbadon, Bordeaux, 33000. Horaires indiqués : mardi, mercredi, jeudi, vendredi, samedi 21h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi, jeudi, vendredi, samedi 21h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bordeaux$city$)
where id = '8727aa92-d841-4db7-9794-30179d2e359e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Rive droite sauna est un sauna situé 177 route de Paris,Amfreville la Mivoie,76920. Horaires indiqués : lundi 12h–0h, mardi 12h–0h, mercredi 12h–0h, jeudi 12h–0h, vendredi 12h–2h, samedi 14h–2h, dimanche 14h–0h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–0h, mardi 12h–0h, mercredi 12h–0h, jeudi 12h–0h, vendredi 12h–2h, samedi 14h–2h, dimanche 14h–0h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amfreville la Mivoie$city$)
where id = '24fd1945-061e-464d-bc4d-2b1e4b3ebe49';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Spa't thermes masculins est un sauna situé 724, Avenue du Club Hippique, Aix-en-Provence, 13090. On y trouve un hammam, un jacuzzi. Horaires indiqués : mardi 12h–21h, mercredi 12h–21h, jeudi 12h–21h, vendredi 12h–23h, samedi 12h–23h, dimanche 13h–21h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi 12h–21h, mercredi 12h–21h, jeudi 12h–21h, vendredi 12h–23h, samedi 12h–23h, dimanche 13h–21h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Aix-en-Provence$city$)
where id = '2d33c074-7c58-4851-9794-b238f8a4e451';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Square sauna est un sauna situé 39 rue Saint Nicolas,Rouen,76000. Le lieu est indiqué comme réservé aux hommes, selon les jours précisés par la source, et on y trouve un hammam. Horaires indiqués : en semaine 12h–20h ; samedi 13h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$en semaine 12h–20h ; samedi 13h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Rouen$city$)
where id = '2090bc22-28b9-4019-be3a-3d07ac10ae8a';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = 'acb16775-3b62-4326-8300-b868a0bdb4a2';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Bernay$city$)
where id = 'a4756ae4-8d5e-4c34-af8d-4d6fca88baf1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Lellebel is een bar in Amsterdam, op Utrechtsestraat, Amsterdam, 1017 VL. Vermelde openingstijden: donderdag 21:00–23:59, vrijdag 21:00–02:00, zaterdag 21:00–02:00, zondag 21:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$donderdag 21:00–23:59, vrijdag 21:00–02:00, zaterdag 21:00–02:00, zondag 21:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = '1952eae5-f4a0-443e-b01a-1faa047c7e72';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Les Bains Paris est un club situé 7 Rue du Bourg l'Abbé Paris (75003).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '70bf4320-3ba1-4f46-b348-fda076031b6e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Les Bains sauna est un sauna situé 52 rue de Cambrai,Lille,59000. On y trouve une terrasse. Horaires indiqués : lundi 12h–0h, mardi 12h–0h, mercredi 12h–0h, jeudi 12h–0h, vendredi 12h–1h, samedi 14h–1h, dimanche 12h–0h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–0h, mardi 12h–0h, mercredi 12h–0h, jeudi 12h–0h, vendredi 12h–1h, samedi 14h–1h, dimanche 12h–0h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lille$city$)
where id = '414e57e7-cb85-44df-b603-6f67dfab3523';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Les Coqs festifs est un club situé Paris. Le lieu existe depuis 2006.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'de6f3923-1e6a-4f8b-85bd-c4c3a5bdf46b';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'c8f2cf7e-e7ea-4804-847e-17d0765b0644';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Les Jardins de Bao est un sauna situé 79, chemin du Cores,Drumettaz-Clarafond,73420. La source le décrit comme un sauna mixte, et on y trouve un hammam, un jacuzzi, une terrasse. Horaires indiqués : lundi 12h–20h, mardi 12h–22h, mercredi 12h–22h, jeudi 12h–20h, vendredi 12h–0h, samedi 12h–0h, dimanche 12h–22h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–20h, mardi 12h–22h, mercredi 12h–22h, jeudi 12h–20h, vendredi 12h–0h, samedi 12h–0h, dimanche 12h–22h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Drumettaz-Clarafond$city$)
where id = '5df15bae-55e6-49e6-a38d-582b439d7b51';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Les Sir Carmes est un bar situé 19 Rue des Carmes Nantes (44000). Horaires indiqués : lundi 18h–23h, mardi 18h–2h, mercredi 18h–2h, jeudi 18h–2h, vendredi 18h–2h, samedi 16h–2h, dimanche 18h–23h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 18h–23h, mardi 18h–2h, mercredi 18h–2h, jeudi 18h–2h, vendredi 18h–2h, samedi 16h–2h, dimanche 18h–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nantes$city$)
where id = '1b53d61b-0062-4983-892f-52517ad8e489';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Les bien-aimé.e.s est un bar situé 2 Rue de la Paix Nantes (44000). Horaires indiqués : mardi, mercredi, jeudi, vendredi, samedi 11h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi, jeudi, vendredi, samedi 11h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nantes$city$)
where id = '3b0d47f6-3455-4917-a3a4-e968aeffeb1a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Lights bar es un bar situado en Torremolinos, en 4, C. Danza Invisible, Torremolinos, 29620. Horario indicado: lunes 22:00–23:59 ; domingo, martes, miércoles, jueves, viernes, sábado 22:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes 22:00–23:59 ; domingo, martes, miércoles, jueves, viernes, sábado 22:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Torremolinos$city$)
where id = '341e0152-ae4d-490f-b012-1857eac006f7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Limelight est un club situé 23 Rue Pierre Paul Riquet Toulouse (31000). Horaires indiqués : tous les jours 23h59–7h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 23h59–7h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = '3c54e419-17de-43bc-b189-38791be6a2a9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Locko est un bar situé 53, Rue Devosge, Dijon, 21000. Horaires indiqués : jeudi, vendredi, samedi 21h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi, vendredi, samedi 21h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Dijon$city$)
where id = '83e78b55-8284-4926-9d0f-b962ef386caa';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Los Valents est un club situé Montpellier.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = '3c8b05ac-8eb7-4248-8e86-fd4c10387c43';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Lotus sauna est un sauna situé 33 rue de Witry,Reims,51100. Horaires indiqués : mercredi, samedi 13h30–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi, samedi 13h30–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Reims$city$)
where id = '1bbf9ea9-e31b-4830-bea0-a87dc1d99197';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Lucky's ist eine Bar in Frankfurt am Main, 26, Große Friedberger Straße, Francfort-sur-le-Main, 60313. Angegebene Öffnungszeiten: Montag 15:00–01:00, Dienstag 15:00–01:00, Mittwoch 15:00–01:00, Donnerstag 15:00–01:00, Freitag 15:00–02:00, Samstag 15:00–02:00, Sonntag 15:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 15:00–01:00, Dienstag 15:00–01:00, Mittwoch 15:00–01:00, Donnerstag 15:00–01:00, Freitag 15:00–02:00, Samstag 15:00–02:00, Sonntag 15:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Frankfurt am Main$city$)
where id = '9d29d7a8-7087-4835-807f-302490dc475d';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Lulu club est un club situé Rue Curaterie Nîmes (30020). Horaires indiqués : le week-end 1h–7h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$le week-end 1h–7h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nîmes$city$)
where id = '888dab51-8943-4647-b594-044a66ec6faf';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Ma-Tine bar est un bar situé 34, Rue des Bouchers, Lille, 59000. Horaires indiqués : mardi, mercredi 18h–1h ; jeudi, vendredi, samedi 18h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi 18h–1h ; jeudi, vendredi, samedi 18h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lille$city$)
where id = 'f26c439b-145a-4429-93f7-84545df95e14';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Madame Jasmine es un bar situado en Barcelona, en 22, Rambla del Raval, Barcelone, 08001. Horario indicado: lunes 17:00–02:30, martes 17:00–02:30, miércoles 17:00–02:30, jueves 17:00–02:30, viernes 17:00–03:00, sábado 17:00–03:00, domingo 12:00–02:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes 17:00–02:30, martes 17:00–02:30, miércoles 17:00–02:30, jueves 17:00–02:30, viernes 17:00–03:00, sábado 17:00–03:00, domingo 12:00–02:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'fefc5d1a-3aa3-4d8d-bfde-c2668abd07b0';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Madrediosa est un bar queer situé 5, Rue Belmont, Montpellier, 34000. Horaires indiqués : mercredi 18h–23h59 ; jeudi, vendredi, samedi 18h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi 18h–23h59 ; jeudi, vendredi, samedi 18h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = 'e2531ee6-a291-4fba-aded-40b539c8fdc5';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '169048d7-6561-41ca-b2a5-33e4a1335d40';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Marienhof ist eine Bar in Berlin, 7, Marienburger Straße, Berlin, 10405. Angegebene Öffnungszeiten: Dienstag, Mittwoch, Donnerstag 19:00–02:00 ; Freitag, Samstag 19:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Dienstag, Mittwoch, Donnerstag 19:00–02:00 ; Freitag, Samstag 19:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '4519354e-33af-4071-a910-40f411850338';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '65fd7309-8a3f-47e4-806e-63504cd8287b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Maxim's est un club situé 3 Rue Royale Paris (75008).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'd9ec0bcd-c974-4f0b-9a23-4aab1f7956b0';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Meo ist ein Shop in Herten, 7, 9 Lise-Meitner-Straße Herten (45699).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Herten$city$)
where id = 'f42338b1-9c93-4709-a78e-97b18656cee1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Merci Marsha est un bar situé 8, Rue Richard Lenoir, Paris, 75011. Horaires indiqués : dimanche, mercredi, jeudi, vendredi 18h–1h30 ; samedi 16h–1h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mercredi, jeudi, vendredi 18h–1h30 ; samedi 16h–1h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'd37415f1-688d-4efa-bfc4-38c35b829194';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Milk est un bar situé 1 bis Rue du Père Adam Rouen (76000). On y trouve une terrasse. Horaires indiqués : mardi 18h–23h59, mercredi 18h–23h59, jeudi 18h–23h59, vendredi 18h–2h, samedi 18h–2h, dimanche 18h–23h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi 18h–23h59, mercredi 18h–23h59, jeudi 18h–23h59, vendredi 18h–2h, samedi 18h–2h, dimanche 18h–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Rouen$city$)
where id = 'e8b516e4-a709-47fe-bad4-fd48c40708b5';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Mister B Amsterdam is een winkel in Amsterdam, op 192, Prinsengracht, Amsterdam, 1016HC. Vermelde openingstijden: elke dag 11:00–19:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$elke dag 11:00–19:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = '49226015-f74c-4d8d-9e33-44e3bc757b53';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Mister B Berlin ist ein Shop in Berlin, 22 Motzstraße Berlin (10777). Angegebene Öffnungszeiten: werktags 12:00–20:00 ; Samstag 11:00–20:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$werktags 12:00–20:00 ; Samstag 11:00–20:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '3347592b-8b30-463e-a990-cea0fe8bd397';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Moda est un club situé 32 Rue Crucy Nantes (44000). Horaires indiqués : dimanche, jeudi, vendredi, samedi 23h59–6h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, jeudi, vendredi, samedi 23h59–6h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nantes$city$)
where id = '1b8901e5-5556-44b4-819d-5c359882c335';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Moeem es un bar situado en Barcelona, en 11 Carrer de Muntaner Barcelone (08001). Horario indicado: lunes 18:00–02:30, jueves 21:00–02:30, viernes 18:00–03:00, sábado 18:00–03:00, domingo 18:00–02:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes 18:00–02:30, jueves 21:00–02:30, viernes 18:00–03:00, sábado 18:00–03:00, domingo 18:00–02:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '92fa7566-fd8a-4c2c-891e-7f191661409c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Mona Lisa es un bar situado en Ibiza, en Carrer d'Alfons XII, Ibiza (ville), 07800. Horario indicado: todos los días 21:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 21:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Ibiza$city$)
where id = 'bd994f56-deb7-4d6a-8893-2eba188f85cc';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Monster Ronsons ist eine Bar in Berlin, 34-38, Warschauer Straße, Berlin, 10243. Angegebene Öffnungszeiten: Montag 18:00–02:00, Dienstag 18:00–02:00, Mittwoch 18:00–02:00, Donnerstag 18:00–02:00, Freitag 18:00–05:00, Samstag 14:00–05:00, Sonntag 14:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 18:00–02:00, Dienstag 18:00–02:00, Mittwoch 18:00–02:00, Donnerstag 18:00–02:00, Freitag 18:00–05:00, Samstag 14:00–05:00, Sonntag 14:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '9e49e066-49f1-4eb2-9858-8422af46bfb5';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Montecito est un bar situé 6 Allée Duquesne Nantes (44000). Horaires indiqués : tous les jours 16h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 16h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nantes$city$)
where id = 'b0bd4f54-0fdc-422e-a34d-8dfe1a5c02bd';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$My Lord ist eine Bar in Köln, 57, Mühlenbach, Cologne, 50676. Angegebene Öffnungszeiten: Montag 17:00–01:00 ; Sonntag, Freitag, Samstag 17:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 17:00–01:00 ; Sonntag, Freitag, Samstag 17:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = '591c4fa9-9327-4d99-aa3f-6ca6b37619a7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Möbel Olfe ist eine Bar in Berlin, 177, Reichenberger Straße, Berlin, 10999. Angegebene Öffnungszeiten: Dienstag 18:00–04:00, Mittwoch 18:00–04:00, Donnerstag 18:00–04:00, Freitag 18:00–05:00, Samstag 18:00–05:00, Sonntag 18:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Dienstag 18:00–04:00, Mittwoch 18:00–04:00, Donnerstag 18:00–04:00, Freitag 18:00–05:00, Samstag 18:00–05:00, Sonntag 18:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '415a9d6b-7ce1-4db6-a9bc-a3649b8c5cb8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$NY Club ist ein Club in München, 3, Elisenstraße, Munich, 80335. Angegebene Öffnungszeiten: Freitag, Samstag 23:00–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Freitag, Samstag 23:00–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$München$city$)
where id = '742039ac-1bae-4eb1-8f14-1c92d4f0ef15';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Nachteule ist eine Bar in Köln, 51, Am Rinkenpfuhl, Cologne, 50676. Angegebene Öffnungszeiten: Donnerstag 20:00–01:00 ; Freitag, Samstag 20:00–05:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Donnerstag 20:00–01:00 ; Freitag, Samstag 20:00–05:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = '1c30567e-3974-4c96-bb01-595a2fcbac85';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Nachtflug ist ein Club in Köln, 89-93 Hohenzollernring Cologne (50672). Angegebene Öffnungszeiten: Samstag 23:00–05:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Samstag 23:00–05:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = '32ae8f22-773b-4b4e-af78-b82fb51b682f';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Nathan Café est un bar situé 34, Avenue de Frontenex, Genève, 1207. Horaires indiqués : dimanche, lundi, mardi, mercredi, jeudi 17h–2h ; vendredi, samedi 17h–3h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mardi, mercredi, jeudi 17h–2h ; vendredi, samedi 17h–3h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Genève$city$)
where id = '3cb93fdc-53d8-48b2-abb1-242d224194ef';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$New Action ist eine Bar in Berlin, Kleiststraße 35 Ecke Eisenacher Straße,Berlin,10787. Laut Quelle ist der Ort an bestimmten Tagen Männern vorbehalten. Angegebene Öffnungszeiten: Mittwoch 22:00–02:00, Donnerstag 22:00–03:00, Freitag 22:00–05:00, Samstag 22:00–05:00, Sonntag 22:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Mittwoch 22:00–02:00, Donnerstag 22:00–03:00, Freitag 22:00–05:00, Samstag 22:00–05:00, Sonntag 22:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'd1525f25-8aaa-484c-90c4-4472dbd25ec8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Nieuwezijds Sauna is een sauna in Amsterdam, op 95, Nieuwezijds Armsteeg, Amsterdam, 1012NB. Vermelde openingstijden: zondag, maandag, dinsdag, woensdag, donderdag 12:00–02:00 ; vrijdag, zaterdag 12:00–10:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, maandag, dinsdag, woensdag, donderdag 12:00–02:00 ; vrijdag, zaterdag 12:00–10:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = 'e8fb62c3-af60-4814-8d5a-438218fce75f';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Night Barcelona es un bar situado en Barcelona, en 161, Carrer de la Diputació, Barcelone, 08015. La fuente lo indica como un espacio reservado a hombres en los días señalados. Horario indicado: domingo, lunes, martes, miércoles, jueves 18:00–02:30 ; viernes, sábado 18:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, lunes, martes, miércoles, jueves 18:00–02:30 ; viernes, sábado 18:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '44175f05-ab99-4b49-a1e5-3e2bcd360490';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Nil café & bar ist eine Bar in München, 2, Hans-Sachs-Straße, Munich, 80469. Angegebene Öffnungszeiten: täglich 15:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$täglich 15:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$München$city$)
where id = 'b749348c-bdad-43e7-8d41-365bbc0e2b93';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = 'be04c8d2-0dbd-4f42-8b7f-a84cbf91a57b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Nuevo Rokoko es un bar situado en San Bartolomé de Tirajana, en 31 Avenida Alfereces Provisionales San Bartolomé de Tirajana (35100). Horario indicado: domingo, jueves, viernes, sábado 09:00–17:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, jueves, viernes, sábado 09:00–17:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$San Bartolomé de Tirajana$city$)
where id = '3ea9f225-04c1-4830-ba12-646dbbabd5b1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Nuremberg leather club ist eine Bar in Nürnberg, 14 Christoph-Weiß-Straße Nuremberg (90419).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Nürnberg$city$)
where id = 'ccee5290-d4b5-4e83-adae-15d18cae76ea';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Nyx is een club in Amsterdam, op 42, Reguliersdwarsstraat, Amsterdam, 1017BM. Vermelde openingstijden: donderdag 23:00–04:00 ; vrijdag, zaterdag 23:00–05:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$donderdag 23:00–04:00 ; vrijdag, zaterdag 23:00–05:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = '0e8889cd-19b4-44dd-9b8e-806b8e9be8bb';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Nîmes club sauna est un sauna situé 7-9 rue Fernand Pelloutier,Nîmes,30900. Horaires indiqués : lundi, mardi, mercredi, jeudi 12h–21h ; dimanche, vendredi, samedi 12h–23h59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi, jeudi 12h–21h ; dimanche, vendredi, samedi 12h–23h59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nîmes$city$)
where id = '5965ac76-24b5-444c-8545-c3153b342896';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$O Cap sauna est un sauna situé Rue de l'Égalité, Nœux-les-Mines, 62290. Horaires indiqués : mardi, mercredi 13h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi 13h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nœux-les-Mines$city$)
where id = '0e0297e7-d040-4247-a5e2-a689b8eb6740';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Oasis sauna est un sauna à Bruxelles (Brussels), au 10 Rue Van Orley Ville de Bruxelles (1000). On y trouve un hammam, un jacuzzi. Horaires indiqués : tous les jours 11h30–22h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 11h30–22h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = 'cda7232b-1c18-4f2c-bb27-e8df32ba6627';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Oasis sauna Lyon est un sauna situé 2 rue Coustou,Lyon,69001. La source le décrit comme un sauna mixte. Horaires indiqués : lundi, mardi, mercredi, jeudi, vendredi, samedi 12h–19h ; dimanche 13h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi, jeudi, vendredi, samedi 12h–19h ; dimanche 13h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lyon$city$)
where id = '22d6b0bd-2e4a-4651-baad-a2d2808a98de';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$One o One (101) est un club situé Rue du Coche Clermont-Ferrand (63000). Horaires indiqués : jeudi, vendredi, samedi 23h59–5h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi, vendredi, samedi 23h59–5h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Clermont-Ferrand$city$)
where id = 'be31099e-ac30-44e3-9397-c18c11073ae0';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Other Nature ist ein Shop in Berlin, 79 Mehringdamm Berlin (10965). Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 12:00–19:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag 12:00–19:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '6ae464df-7be0-4d9a-b28d-438dbd0c9652';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Oxydo sauna club est un sauna à Strasbourg, au 3 Place Clément. La source le décrit comme un sauna mixte, et on y trouve un hammam. Horaires indiqués : mercredi, vendredi 20h–1h30 ; dimanche 14h–23h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi, vendredi 20h–1h30 ; dimanche 14h–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Strasbourg$city$)
where id = '6d47754a-056e-43bc-9ed4-548a3e1dbaa5';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Oya ist eine Bar in Berlin, 6, Mariannenstraße, Berlin, 12209. Angegebene Öffnungszeiten: Donnerstag, Freitag, Samstag 18:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Donnerstag, Freitag, Samstag 18:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'ef58cc0a-c5ec-4851-b3e1-ceab2d7f4220';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$PZ city club est un club situé 4 Quai du Verdanson Montpellier (34000). Le programme est tourné vers la musique électronique. Horaires indiqués : dimanche, vendredi, samedi 23h59–7h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, vendredi, samedi 23h59–7h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = '42e5879a-9f86-4601-a8b4-1661be447510';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Pamela est un club situé 62 Rue Mazarine Paris (75006). Horaires indiqués : jeudi, vendredi, samedi 20h–6h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi, vendredi, samedi 20h–6h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'c1c2cf50-a094-4ad4-b527-7bb4d6be484b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Panama is een club in Amsterdam, op 4 Oostelijke Handelskade Amsterdam (1019BM). Het programma is gericht op elektronische muziek.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = '7c59cc87-6d1b-40f8-bd4f-5f43f8403b3d';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Paname boxing club est un club situé Paris. Il se présente comme un lieu lesbien ou ouvert aux femmes queer.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '0391af6c-c1ef-4bd1-8930-c598e8705428';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Panic room est un club situé 101 Rue Amelot Paris (75011). Le lieu existe depuis 2012. Horaires indiqués : mercredi 19h–2h, jeudi 19h–4h, vendredi 19h–5h, samedi 19h–5h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi 19h–2h, jeudi 19h–4h, vendredi 19h–5h, samedi 19h–5h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '06bcd244-7ebc-41da-98de-c845ba727ff1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Paragonya sauna ist eine Sauna in Zurich, 11, Mühlegasse, Zurich, 8001. Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch 11:30–19:00 ; Sonntag, Donnerstag, Freitag, Samstag 11:30–21:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch 11:30–19:00 ; Sonntag, Donnerstag, Freitag, Samstag 11:30–21:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Zurich$city$)
where id = 'a0758cbc-4457-4863-895a-b5d89e23b911';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Parrots Gran Canaria es un bar situado en Maspalomas, Las Palmas, en Yumbo Center. Horario indicado: todos los días 19:00–02:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 19:00–02:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = '3a8469b6-e830-4604-bc18-8bfca47f911a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Parthenon es un club situado en Torremolinos, en Plaza de la Nogalera, Torremolinos. Horario indicado: domingo, lunes, martes, miércoles, jueves 23:59–06:00 ; viernes, sábado 23:59–07:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, lunes, martes, miércoles, jueves 23:59–06:00 ; viernes, sábado 23:59–07:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Torremolinos$city$)
where id = '5a9b0676-cfb8-4c58-9f1f-b713ae0cacfe';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Petit Paris est un bar situé 31, Place du Marché, Liège, 4000. Horaires indiqués : tous les jours 11h–23h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 11h–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Liège$city$)
where id = 'cdd117b7-dde8-45ce-a033-3c371d299dcc';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Phantom est un club situé 8 Boulevard de Bercy Paris (75012).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'd77c9bf5-164f-432b-9290-7b9f2dc47f05';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Phoenix Sauna Köln ist eine Sauna in Köln, 12, Richard-Wagner-Straße, Cologne, 50674. Angegebene Öffnungszeiten: Montag 00:00–06:00, Montag 12:00–06:00, Dienstag 12:00–06:00, Mittwoch 12:00–06:00, Donnerstag 12:00–06:00, Freitag 12:00–23:59, Samstag 00:00–23:59, Sonntag 00:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 00:00–06:00, Montag 12:00–06:00, Dienstag 12:00–06:00, Mittwoch 12:00–06:00, Donnerstag 12:00–06:00, Freitag 12:00–23:59, Samstag 00:00–23:59, Sonntag 00:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = 'd34c6b55-39bf-4ec3-b801-90d69ddd86b2';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Pink Beach est un sauna situé 7&9 avenue Tivoli,Lausanne,1007. Horaires indiqués : lundi 12h–23h, jeudi 12h–23h, vendredi 12h–3h, samedi 12h–23h59, dimanche 0h01–23h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–23h, jeudi 12h–23h, vendredi 12h–3h, samedi 12h–23h59, dimanche 0h01–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lausanne$city$)
where id = '8e3c1ffb-51dd-457f-8732-81eac7585b42';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = '2b2af864-0c2d-4bfa-aba0-ce01407decf9';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = '10f4a5f7-0f96-486c-a695-ed3ed782f347';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Polikarpov est un bar situé 24 Cours Honoré d'Estienne d'Orves Marseille (13001). Horaires indiqués : tous les jours 9h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 9h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Marseille$city$)
where id = '21a02d66-3242-40bb-a61e-63c981421c12';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Nantes$city$)
where id = 'b13f7c7b-1d2a-4c38-92e1-f0aa7761dd09';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Prik is een bar in Amsterdam, op 109D, Spuistraat, Amsterdam, 1012SV. Vermelde openingstijden: maandag 16:00–01:00, dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–01:00, vrijdag 16:00–03:00, zaterdag 15:00–03:00, zondag 15:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$maandag 16:00–01:00, dinsdag 16:00–01:00, woensdag 16:00–01:00, donderdag 16:00–01:00, vrijdag 16:00–03:00, zaterdag 15:00–03:00, zondag 15:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = 'e5e63df2-00ef-4fd2-832b-4dfab19f279b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Privilège club est un club situé 2 Rue Royale Lille (59000). Horaires indiqués : dimanche, mardi, mercredi 17h–1h ; jeudi, vendredi, samedi 17h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mardi, mercredi 17h–1h ; jeudi, vendredi, samedi 17h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lille$city$)
where id = '8e77288b-eb7f-4f56-b270-444d7c79a52c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Pullermanns sauna ist eine Sauna in Köln, 22, Mathiasstraße, Cologne, 50676. Angegebene Öffnungszeiten: Montag 18:00–03:00, Dienstag 21:00–03:00, Mittwoch 21:00–03:00, Donnerstag 21:00–03:00, Freitag 21:00–05:00, Samstag 21:00–05:00, Sonntag 14:00–20:00, Sonntag 21:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 18:00–03:00, Dienstag 21:00–03:00, Mittwoch 21:00–03:00, Donnerstag 21:00–03:00, Freitag 21:00–05:00, Samstag 21:00–05:00, Sonntag 14:00–20:00, Sonntag 21:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = '6de5de98-f098-46ff-870e-a2dd8a9f2a2d';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Pulp Club est un club situé 30, Rue des Vignes, Bordeaux, 33800.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Bordeaux$city$)
where id = '7e83643c-4cc5-4321-ad94-f5347eab91ed';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Punto BCN es un bar situado en Barcelona, en 65 Carrer de Muntaner Barcelone (08001). Horario indicado: domingo, martes, miércoles, jueves 18:00–02:30 ; viernes, sábado 18:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, martes, miércoles, jueves 18:00–02:30 ; viernes, sábado 18:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'd0b3c667-58e2-4913-9ad8-d67c8a87f029';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Cap d'Agde$city$)
where id = 'cc5551ed-70d5-4faa-8c32-4e1e1bffe408';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Quartier Généreux est un bar situé 2, Quai des Tanneurs, Montpellier, 34090. On y trouve une terrasse.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Montpellier$city$)
where id = 'c05e1aab-2c60-47b7-90cb-0c892edd489e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Queen Club est un club à Lyon, au 3, Rue Terme, 69001. Horaires indiqués : dimanche, jeudi, vendredi, samedi 23h–5h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, jeudi, vendredi, samedi 23h–5h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lyon$city$)
where id = '32d049eb-7471-489c-94b2-c5e8308fc95b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Queer Lieu est un bar queer. Horaires indiqués : jeudi 17h–21h ; samedi 14h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi 17h–21h ; samedi 14h–20h$hrs$)
where id = '185dee24-4927-436e-9ef2-21e402dbe897';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Quetzal est un bar à Paris. Selon l’annuaire StroboMag, il ouvre tous les jours de 17h à 2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 17h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '0e4aa451-2957-4ced-a1c2-358c7bf3fb72';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Quien la invito es un club situado en Madrid, en Calle de la Libertad, Madrid, 28004. Horario indicado: de lunes a viernes 23:00–05:30 ; el fin de semana 22:00–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$de lunes a viernes 23:00–05:30 ; el fin de semana 22:00–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '96010a1c-77a6-41ee-aeeb-3e75a6ba5091';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$R&co ist ein Shop in Berlin, 19 Fuggerstraße Berlin (10777). Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch 12:00–18:00 ; Donnerstag, Freitag, Samstag 12:00–20:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch 12:00–18:00 ; Donnerstag, Freitag, Samstag 12:00–20:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '9db6cafd-442d-4f42-af1a-42ae42fc4f26';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Rainbow bar est un bar situé 9 Rue Bonaparte Nice (06300). Horaires indiqués : tous les jours 17h–0h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 17h–0h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = '37100364-dd58-43ce-80b1-c23001675cae';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Ramdam bar est un bar situé 3, Rue Lascaris, Nice, 06300. Horaires indiqués : lundi, mercredi, jeudi 18h–23h59 ; dimanche, vendredi, samedi 18h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mercredi, jeudi 18h–23h59 ; dimanche, vendredi, samedi 18h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = 'd84657f8-ec9c-45d4-972d-c33cb6b79b2f';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Razzmatazz es un club situado en Barcelona, en 122 124 Carrer dels Almogàvers Barcelone (08018).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'fc1a783f-995e-4cce-ab17-13115b8d6407';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Red kafé est un bar situé Rue Halévy Nice (06046). Horaires indiqués : tous les jours 16h–2h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 16h–2h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = 'a5bb6a55-fab0-467a-8c56-e55821eb21f2';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Red sauna est un sauna situé Cour Brasserie,Uckange,57270. On y trouve un hammam. Horaires indiqués : dimanche, lundi, samedi 14h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, samedi 14h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Uckange$city$)
where id = 'c23ca87f-4543-4514-bfc3-632bc57621bf';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Renos Relax sauna ist eine Sauna in Zurich, 16, Brauerstrasse, Zurich, 8004. Angegebene Öffnungszeiten: Montag 12:00–22:00, Dienstag 12:00–22:00, Mittwoch 12:00–22:00, Donnerstag 12:00–23:59, Freitag 12:00–04:00, Samstag 12:00–04:00, Sonntag 12:00–22:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 12:00–22:00, Dienstag 12:00–22:00, Mittwoch 12:00–22:00, Donnerstag 12:00–23:59, Freitag 12:00–04:00, Samstag 12:00–04:00, Sonntag 12:00–22:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Zurich$city$)
where id = 'd3ee1703-ca21-4686-8328-be68b17592bf';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Rex club est un club situé 5 Boulevard Poissonnière Paris (75002). Le programme est tourné vers la musique électronique.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '7039482a-113c-4409-a79c-aabf434ac683';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Rex club sauna est un sauna situé Rue Cordier Nîmes (30). La source le décrit comme un sauna mixte. Horaires indiqués : lundi 14h–19h, lundi 21h–1h, mardi 14h–19h, mardi 21h–1h, mercredi 14h–19h, mercredi 21h–1h, jeudi 14h–19h, jeudi 21h–1h, vendredi 14h–19h, vendredi 21h–2h, samedi 14h–19h, samedi 21h–2h, dimanche 14h–23h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 14h–19h, lundi 21h–1h, mardi 14h–19h, mardi 21h–1h, mercredi 14h–19h, mercredi 21h–1h, jeudi 14h–19h, jeudi 21h–1h, vendredi 14h–19h, vendredi 21h–2h, samedi 14h–19h, samedi 21h–2h, dimanche 14h–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nîmes$city$)
where id = 'a715d807-328b-43cf-a6f3-baf057be4ec4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Romeo und Romeo ist eine Bar in Berlin, 20 Motzstraße Berlin (10777). Angegebene Öffnungszeiten: Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 08:00–20:00 ; Freitag, Samstag 08:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 08:00–20:00 ; Freitag, Samstag 08:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'f6f0cb81-57f2-41ce-8073-59a90e3d1599';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Rosa Bonheur à l'Est est un bar queer à Paris, au Porte Jaune. Le lieu existe depuis 1998. Horaires indiqués : vendredi, samedi 18h–1h ; dimanche 11h30–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$vendredi, samedi 18h–1h ; dimanche 11h30–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '6fe9a56d-284b-4a35-beaf-e289eb2c766b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Rosa Bonheur à l'ouest est un bar queer situé Quai du Docteur Dervaux Asnières-sur-Seine (92600). Le lieu existe depuis 1998. Horaires indiqués : jeudi 17h–1h, vendredi 17h–1h, samedi 12h–1h, dimanche 11h30–23h59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi 17h–1h, vendredi 17h–1h, samedi 12h–1h, dimanche 11h30–23h59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Asnières-sur-Seine$city$)
where id = '901a4003-3b24-4db9-a11f-702a2a90226a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Rosa bonheur Buttes est un bar queer situé 2 Avenue de la Cascade Paris (75019). Le lieu existe depuis 2008. Horaires indiqués : dimanche, jeudi, vendredi, samedi 12h–0h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, jeudi, vendredi, samedi 12h–0h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '5986bc9b-584f-4522-b7ee-61fcf28675f6';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Rouge Baisers Pride est un boutique situé 14 bis, Rue Defly, Nice, 06000. Horaires indiqués : lundi, mardi, mercredi, jeudi, vendredi, samedi 10h30–12h30 ; lundi, mardi, mercredi, jeudi, vendredi, samedi 13h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi, jeudi, vendredi, samedi 10h30–12h30 ; lundi, mardi, mercredi, jeudi, vendredi, samedi 13h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = '3d684e2e-467c-4c81-9b78-874811d62a86';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$S64 sauna est un sauna situé 70 boulevard Alsace Lorainne,Bayonne,64100. La source le décrit comme un sauna mixte, et on y trouve un hammam, un jacuzzi. Horaires indiqués : dimanche, lundi, mercredi 14h–0h ; samedi 14h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi, mercredi 14h–0h ; samedi 14h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bayonne$city$)
where id = 'e034dedf-1319-4347-8569-c3b122359560';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Saarein is een bar in Amsterdam, op Elandsstraat, Amsterdam, 1016 RX. Vermelde openingstijden: zondag, woensdag, donderdag 16:00–01:00 ; vrijdag, zaterdag 16:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, woensdag, donderdag 16:00–01:00 ; vrijdag, zaterdag 16:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = '9c1664e4-7abd-44e5-b5d6-a9c2628222d9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sacré est un club à Paris, au 142 Rue Montmartre (75002). Horaires indiqués : jeudi, vendredi, samedi 19h–6h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi, vendredi, samedi 19h–6h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '92b0ffe4-ef4c-44c7-a7bb-f45a730338a3';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna 139 est un sauna situé Liège, 4000.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Liège$city$)
where id = '040b8310-5585-4a98-a1cf-e896a8d55867';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna 422 est un sauna situé 422, Avenue Émile Herman, Manage, 7170. On y trouve un hammam. Horaires indiqués : dimanche, mardi, mercredi, jeudi, vendredi, samedi 12h–22h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mardi, mercredi, jeudi, vendredi, samedi 12h–22h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Manage$city$)
where id = '3140a6a5-e70b-4c8d-9010-38fbd5a7ed8c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna 6ème Sens est un sauna situé 164 avenue des graviers,Abrest,03200. Horaires indiqués : lundi, mercredi, jeudi, vendredi 12h–18h ; le week-end 13h–18h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mercredi, jeudi, vendredi 12h–18h ; le week-end 13h–18h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Abrest$city$)
where id = 'd793be08-5338-4bef-a391-da2985bd1ea8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Bains d'Odessa est un sauna situé 5 rue Odessa,Paris,75014. Horaires indiqués : tous les jours 12h–22h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 12h–22h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '45484c5a-43f7-4d2a-a843-1bb73952def3';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Beach es un sauna situado en Madrid, en 12, Cuesta de Santo Domingo, Madrid, 28013. Horario indicado: lunes, martes, miércoles, jueves 10:00–23:59 ; domingo, viernes, sábado 00:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes, martes, miércoles, jueves 10:00–23:59 ; domingo, viernes, sábado 00:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '399ee177-01cc-455e-9cb6-4d26f83b43ac';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Casanova es un sauna situado en Barcelona, en 57, Carrer de Casanova, Barcelone, 08011. Horario indicado: todos los días 00:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 00:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '9562e4f4-27e7-4030-a638-4175296cf03b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Center es un sauna situado en Madrid, en 32, Calle de Valverde, Madrid, 28004.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = 'ad1a4f0a-f045-4195-be08-44492452ff40';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna City club est un sauna situé 18, rue d'Orbey,Colmar,68000. On y trouve un hammam. Horaires indiqués : mercredi 12h–23h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mercredi 12h–23h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Colmar$city$)
where id = '998a1c58-d6fd-4199-9e78-ad5cb2deea88';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Corpus es un sauna situado en Maspalomas, Las Palmas, en Maspalomas, Las Palmas. La fuente lo indica como un espacio reservado a hombres en los días señalados. Horario indicado: domingo, martes, miércoles, jueves, viernes, sábado 17:00–22:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, martes, miércoles, jueves, viernes, sábado 17:00–22:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = '9933bdee-b6d0-4674-8f1a-3cc82de3b9b1';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '1b9aa90c-4297-4f5b-b4fd-3e1cd945b937';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Deutsche Eiche ist eine Sauna in München, 13, Reichenbachstraße, Munich, 80469. Angegebene Öffnungszeiten: Montag 12:00–07:00, Dienstag 12:00–07:00, Mittwoch 12:00–07:00, Donnerstag 12:00–07:00, Freitag 12:00–23:59, Samstag 00:00–23:59, Sonntag 00:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 12:00–07:00, Dienstag 12:00–07:00, Mittwoch 12:00–07:00, Donnerstag 12:00–07:00, Freitag 12:00–23:59, Samstag 00:00–23:59, Sonntag 00:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$München$city$)
where id = '1c368a95-a746-4927-9873-d5f12292d1fd';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Double side est un sauna situé 8 rue Constantine,Lyon,69001. Horaires indiqués : lundi 12h–19h, mardi 12h–1h, mercredi 12h–1h, jeudi 12h–1h, vendredi 12h–5h, samedi 12h–5h, dimanche 12h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–19h, mardi 12h–1h, mercredi 12h–1h, jeudi 12h–1h, vendredi 12h–5h, samedi 12h–5h, dimanche 12h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lyon$city$)
where id = 'edec1d4b-6e4d-4bc9-9fcc-9d361ee75ab8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Euro Men's Club est un sauna situé 10, rue Saint-Marc,Paris,75002. Horaires indiqués : tous les jours 11h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 11h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '8c7c3bd2-6785-4c16-8a96-d96032cf6429';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Hispalis es un sauna situado en Sevilla, en 3, Calle Cefiro, Séville, 41018. Horario indicado: lunes 11:00–22:00, martes 11:00–22:00, miércoles 11:00–22:00, jueves 11:00–22:00, viernes 11:00–01:00, sábado 07:00–01:00, domingo 07:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes 11:00–22:00, martes 11:00–22:00, miércoles 11:00–22:00, jueves 11:00–22:00, viernes 11:00–01:00, sábado 07:00–01:00, domingo 07:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Sevilla$city$)
where id = 'c7e8f415-14e6-4a44-853a-881edfda3b4f';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Joe is een sauna in Kerkrade, op 110, Nieuwstraat, Kerkrade, 6462GP. Vermelde openingstijden: maandag 12:00–23:59, dinsdag 12:00–23:59, woensdag 12:00–23:59, donderdag 12:00–23:59, vrijdag 12:00–23:59, zaterdag 12:00–02:00, zondag 12:00–22:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$maandag 12:00–23:59, dinsdag 12:00–23:59, woensdag 12:00–23:59, donderdag 12:00–23:59, vrijdag 12:00–23:59, zaterdag 12:00–02:00, zondag 12:00–22:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Kerkrade$city$)
where id = '43c1b381-ab5e-4b2a-b3e5-297c64c96677';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Mikonos est un sauna à Saint-Etienne, au Rue Jean-Claude Verpilleux Saint-Étienne (42000). On y trouve un hammam. Horaires indiqués : lundi, mardi, mercredi, jeudi, vendredi, samedi 13h–17h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi, jeudi, vendredi, samedi 13h–17h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Saint-Etienne$city$)
where id = '8948799b-539e-4925-b9fe-444fec0addb1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Mykonos est un sauna naturiste situé 71 rue des Martyrs, Paris, 75018. Le lieu est indiqué comme réservé aux hommes, selon les jours précisés par la source, et on y trouve un hammam. Horaires indiqués : tous les jours 12h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 12h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '42f8f486-7bcf-45b8-bcf1-b0f0a3ea7a6c';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Nautilus is een sauna in Avelgem, op 392, Oudenaardsesteenweg, Avelgem, 8581. Vermelde openingstijden: zondag, maandag, dinsdag, donderdag, vrijdag, zaterdag 13:00–23:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, maandag, dinsdag, donderdag, vrijdag, zaterdag 13:00–23:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Avelgem$city$)
where id = '72a535fd-0959-435c-b54c-8fd9c018728a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Octopus es un sauna situado en Madrid, en 10, Calle de Churruca, Madrid, 28004. Horario indicado: todos los días 10:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 10:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '8650a89f-a035-4ade-8c60-51ff4ef4e2fe';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna Paraíso es un sauna situado en Madrid, en 15, Calle del Norte, Madrid, 28015. Horario indicado: domingo, lunes, sábado 00:00–23:59 ; martes, miércoles, jueves, viernes 10:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, lunes, sábado 00:00–23:59 ; martes, miércoles, jueves, viernes 10:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '241af233-798b-4888-9bb2-825bacd79af4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna de la gare est un sauna situé 20, boulevard Santraille,Bergerac,24100. Horaires indiqués : tous les jours 13h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 13h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bergerac$city$)
where id = '4e32f2eb-e42c-43fa-82e8-01d557fe47b5';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna icaunais (ex KLS sauna) est un sauna situé 8 rue Denis Papin,Auxerre,89000. La source le décrit comme un sauna mixte, et on y trouve un hammam, une terrasse. Horaires indiqués : lundi 12h–19h, mardi 12h–19h, mercredi 12h–19h, jeudi 20h–23h59, vendredi 12h–18h, vendredi 20h–2h, samedi 12h–19h, dimanche 14h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h–19h, mardi 12h–19h, mercredi 12h–19h, jeudi 20h–23h59, vendredi 12h–18h, vendredi 20h–2h, samedi 12h–19h, dimanche 14h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Auxerre$city$)
where id = 'c29e575e-c4c0-492e-b99b-a6b064374c31';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna le 9 est un sauna situé Chemin de l'Industrie Le Cannet (06110). Horaires indiqués : lundi 12h30–20h, mardi 12h30–20h, mercredi 12h30–20h, jeudi 12h30–20h, vendredi 12h30–23h59, samedi 14h–23h59, dimanche 14h–20h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 12h30–20h, mardi 12h30–20h, mercredi 12h30–20h, jeudi 12h30–20h, vendredi 12h30–23h59, samedi 14h–23h59, dimanche 14h–20h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Le Cannet$city$)
where id = '4510c164-2cd4-4c5a-aad6-561f5eed98c1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sauna le Dauphin est un sauna situé 186, rue Octavie Duchellier,Dreuil-lès-Amiens,80470. On y trouve un hammam. Horaires indiqués : dimanche, lundi 14h–20h ; samedi 14h–19h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, lundi 14h–20h ; samedi 14h–19h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Dreuil-lès-Amiens$city$)
where id = '3100e238-3aeb-4038-a1b9-55f0978779a1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Schatziii Bar ist eine Bar in Hamburg, 17, Bremer Reihe, Hambourg, 20099.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Hamburg$city$)
where id = 'e77c77c4-4526-4b70-87cb-eefbe7cfb602';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '6201e9ed-b88a-455a-968a-be73e156571b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Silom bar est un bar situé 138, Rue Nationale, Lille, 59046. Horaires indiqués : lundi, mardi, mercredi 17h–1h ; jeudi, vendredi, samedi 17h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi, mardi, mercredi 17h–1h ; jeudi, vendredi, samedi 17h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lille$city$)
where id = 'aeb6d018-ba58-42a1-835a-d816a1aedc94';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Silver Future ist eine Bar in Berlin, 206, Weserstraße, Berlin, 12047. Angegebene Öffnungszeiten: Montag, Dienstag, Mittwoch, Donnerstag 17:00–01:00 ; Freitag, Samstag 17:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag, Dienstag, Mittwoch, Donnerstag 17:00–01:00 ; Freitag, Samstag 17:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '3e65abdb-72fb-4705-96d3-c479d2b617ed';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sing or Die karaoké est un bar situé 56, Rue Léon Bourgeois, Marseille, 13001.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Marseille$city$)
where id = '7ef25ca6-f773-48f3-aae0-04f15f8fc2e8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sister Midnight est un bar situé 4, Rue Viollet-le-Duc, Paris, 75009. Horaires indiqués : lundi 18h–23h59, mardi 18h–1h, mercredi 18h–1h, jeudi 18h–1h, vendredi 18h–2h, samedi 18h–2h, dimanche 18h–23h59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 18h–23h59, mardi 18h–1h, mercredi 18h–1h, jeudi 18h–1h, vendredi 18h–2h, samedi 18h–2h, dimanche 18h–23h59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'e7aaaec3-f655-4a77-bc2d-afd49961abd7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sky Bar by Axel Barcelone es un bar situado en Barcelona, en 33, Carrer d'Aribau, Barcelone, 08011. Horario indicado: todos los días 19:30–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 19:30–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '8a91b14f-8323-4808-828a-938c596f7dea';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Slalom est un club situé Rue de Trévise, Lille, 59000. Horaires indiqués : jeudi, vendredi, samedi 23h59–6h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi, vendredi, samedi 23h59–6h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Lille$city$)
where id = '62fe3603-e805-4b36-9b9c-bdd88e51df1e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Slut club ist eine Bar in Hamburg, Rostocker Straße Hambourg (20099). Angegebene Öffnungszeiten: Mittwoch 20:00–02:00, Donnerstag 20:00–02:00, Freitag 22:00–05:00, Samstag 22:00–05:00, Sonntag 18:00–23:59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Mittwoch 20:00–02:00, Donnerstag 20:00–02:00, Freitag 22:00–05:00, Samstag 22:00–05:00, Sonntag 18:00–23:59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Hamburg$city$)
where id = '567a9e3e-8adb-4f68-bc11-ca016a382257';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sonntags Club ist eine Bar in Berlin, 28, Greifenhagener Straße, Berlin, 10437. Der Treffpunkt richtet sich an lesbische und queere Frauen. Angegebene Öffnungszeiten: täglich 18:00–23:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$täglich 18:00–23:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'dcbbb171-aa28-4b8e-a7e5-12f60785b68d';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Spark est un bar queer situé 51, Rue Saint-Michel, Caen, 14000. Horaires indiqués : dimanche, mercredi, jeudi, vendredi, samedi 17h–1h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mercredi, jeudi, vendredi, samedi 17h–1h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Caen$city$)
where id = '23e6878e-d34e-4214-b50d-b670c3b08110';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sparkles Show Bar es un bar situado en Maspalomas, Las Palmas, en 54 Avenida Estados Unidos Maspalomas, Las Palmas (35100). Horario indicado: todos los días 20:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 20:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = 'f253e9ad-5631-42e8-a4d0-224901455d5b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Speechless Bar est un bar situé 45, Rue de Montreuil, Paris, 75011. Horaires indiqués : mardi, mercredi 18h–1h ; jeudi, vendredi, samedi 18h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi, mercredi 18h–1h ; jeudi, vendredi, samedi 18h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '2390cf5d-ddfd-419f-9f66-74e4fce309d3';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Spijker Bar is een bar in Amsterdam, op 4A, Kerkstraat, Amsterdam, 1017GL. Vermelde openingstijden: dinsdag 19:00–01:00, woensdag 16:00–01:00, donderdag 16:00–01:00, vrijdag 16:00–03:00, zaterdag 16:00–03:00, zondag 16:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dinsdag 19:00–01:00, woensdag 16:00–01:00, donderdag 16:00–01:00, vrijdag 16:00–03:00, zaterdag 16:00–03:00, zondag 16:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = '1915d6f9-25cb-433e-a132-1d690614f70e';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Le Stammbar est un bar à Bruxelles. Les horaires indiqués vont de 21h à 3h du lundi au jeudi, jusqu’à 5h le vendredi et le samedi, et de 15h à 22h le dimanche.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lundi 21h–3h, mardi 21h–3h, mercredi 21h–3h, jeudi 21h–3h, vendredi 21h–5h, samedi 21h–5h, dimanche 15h–22h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles$city$)
where id = 'c2f2e1a8-87d6-4102-b755-70014c6fefc1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Stargayte ist eine Sauna in Leipzig, 10, Otto-Schill-Straße, Leipzig, 04109. Angegebene Öffnungszeiten: Montag 13:00–22:00, Dienstag 13:00–23:59, Freitag 15:00–03:00, Samstag 13:00–03:00, Sonntag 13:00–22:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Montag 13:00–22:00, Dienstag 13:00–23:59, Freitag 15:00–03:00, Samstag 13:00–03:00, Sonntag 13:00–22:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Leipzig$city$)
where id = '5cd4b6de-fa32-4690-bbe9-43a023cb42d7';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Station BXL est un bar à Bruxelles (Brussels), au 27 Rue du Marché au Charbon Ville de Bruxelles (1000). Horaires indiqués : dimanche, mardi, mercredi, jeudi 17h–1h ; vendredi, samedi 17h–3h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$dimanche, mardi, mercredi, jeudi 17h–1h ; vendredi, samedi 17h–3h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bruxelles (Brussels)$city$)
where id = 'a9707639-0f5a-4acb-a41b-c7d887a845a3';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Strano is een bar in Rotterdam, op 154A, Van Oldenbarneveltstraat, Rotterdam, 3012GX. Vermelde openingstijden: maandag 17:00–03:00, dinsdag 17:00–03:00, woensdag 17:00–03:00, donderdag 17:00–04:00, vrijdag 17:00–06:00, zaterdag 17:00–06:00, zondag 17:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$maandag 17:00–03:00, dinsdag 17:00–03:00, woensdag 17:00–03:00, donderdag 17:00–04:00, vrijdag 17:00–06:00, zaterdag 17:00–06:00, zondag 17:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Rotterdam$city$)
where id = 'e1d9ff02-e1d6-49c9-83fc-d479b8cbf114';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sundeck sauna ist eine Sauna in Berne, 65, Länggassstrasse, Berne, 3012. Die Quelle beschreibt die Sauna als gemischt. Angegebene Öffnungszeiten: täglich 12:00–23:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$täglich 12:00–23:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berne$city$)
where id = 'd31e37ec-aa0a-4815-a4ec-e8cc73757021';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Sunnyday sauna ist eine Sauna in Bâle, 62, Grenzacherstrasse, Bâle, 4058. Angegebene Öffnungszeiten: Sonntag, Montag, Dienstag, Mittwoch, Donnerstag, Samstag 15:00–22:30 ; Freitag 15:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Sonntag, Montag, Dienstag, Mittwoch, Donnerstag, Samstag 15:00–22:30 ; Freitag 15:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Bâle$city$)
where id = '2062c479-0c29-4a87-913e-470bd7ea2253';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'b84f1a2d-0371-4ef6-9cf5-20b065ea93f9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Swing est un bar situé 10 Rue Defly Nice (06000). Horaires indiqués : tous les jours 18h–2h30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$tous les jours 18h–2h30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = '9fc9fe4d-78fa-40e4-9af9-afd26b9a2182';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Symbol est un club situé 22, Rue du Départ, Paris, 75015.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'fe412221-df83-41b9-b5c6-28680af64673';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Taboo Bar is een bar in Amsterdam, op 45, Reguliersdwarsstraat, Amsterdam, 1017BK. Vermelde openingstijden: maandag 16:00–03:00, dinsdag 16:00–03:00, woensdag 16:00–03:00, donderdag 16:00–03:00, vrijdag 15:00–04:00, zaterdag 15:00–04:00, zondag 15:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$maandag 16:00–03:00, dinsdag 16:00–03:00, woensdag 16:00–03:00, donderdag 16:00–03:00, vrijdag 15:00–04:00, zaterdag 15:00–04:00, zondag 15:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = 'c267061c-feab-4860-905e-0b5a56c6cf22';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$The Cage ist eine Bar in Köln, 6, Rathenauplatz, Cologne, 50674.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Köln$city$)
where id = '038b7e2c-6736-4790-8bb3-e61a5345011d';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$The Cube Urban es un sauna situado en Sevilla, en Calle Perafán de Rivera, Séville, 41071. Horario indicado: lunes 14:00–22:00, martes 11:00–22:00, miércoles 11:00–22:00, jueves 11:00–22:00, viernes 11:00–23:59, sábado 00:00–23:59, domingo 00:00–22:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes 14:00–22:00, martes 11:00–22:00, miércoles 11:00–22:00, jueves 11:00–22:00, viernes 11:00–23:59, sábado 00:00–23:59, domingo 00:00–22:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Sevilla$city$)
where id = '243999dc-02d9-4c9e-973f-b28f5f0bba69';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$The Moon es un bar situado en Barcelona, en 60, Carrer de Villarroel, Barcelone, 08001. Horario indicado: domingo, lunes, martes, miércoles, jueves 17:00–02:30 ; viernes, sábado 17:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, lunes, martes, miércoles, jueves 17:00–02:30 ; viernes, sábado 17:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = 'bcd37e10-1120-477b-ac76-0f2bca6155c9';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$The Muse es un club situado en Valencia, en 48, Carrer de Ruaya, Valence, 46009. Horario indicado: viernes, sábado 22:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$viernes, sábado 22:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Valencia$city$)
where id = 'a7222436-514a-4b75-b854-b267b1b17785';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Caen$city$)
where id = '7d59f089-6675-4db1-a155-7155f375af55';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$The Queen's Head is een bar in Amsterdam, op 20, Zeedijk, Amsterdam, 1012AZ. Vermelde openingstijden: zondag, maandag, dinsdag, woensdag, donderdag 16:00–01:00 ; vrijdag, zaterdag 16:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, maandag, dinsdag, woensdag, donderdag 16:00–01:00 ; vrijdag, zaterdag 16:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Amsterdam$city$)
where id = 'ed39bea8-0001-4157-b464-23180991283a';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Thick bar es un bar situado en Madrid, en 16, Calle de San Marcos, Madrid, 28004. Horario indicado: martes, miércoles, jueves 20:00–03:00 ; viernes, sábado 20:00–03:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$martes, miércoles, jueves 20:00–03:00 ; viernes, sábado 20:00–03:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = '6db283bd-5987-476b-9194-09f0413c68e4';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Tibet is een sauna in Eindhoven, op 10, Antoon Coolenlaan, Eindhoven, 5654CD. Volgens de bron is de zaak op de vermelde dagen alleen voor mannen. Vermelde openingstijden: zondag, maandag, dinsdag, woensdag, donderdag 12:00–23:59 ; vrijdag, zaterdag 12:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$zondag, maandag, dinsdag, woensdag, donderdag 12:00–23:59 ; vrijdag, zaterdag 12:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Eindhoven$city$)
where id = 'c8cf1c4c-001a-4595-b0c9-748bec02abe1';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Tiki Boy es un bar situado en Maspalomas, Las Palmas, en Yumbo center. Horario indicado: lunes, martes, miércoles, jueves, viernes, sábado 20:30–02:30.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$lunes, martes, miércoles, jueves, viernes, sábado 20:30–02:30$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = '62e0a38c-e011-4806-a87c-44c168a9b8da';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Tipsy Bear ist eine Bar in Berlin, 21, Eberswalder Straße, Berlin, 10437. Angegebene Öffnungszeiten: Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 18:00–02:00 ; Freitag, Samstag 18:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 18:00–02:00 ; Freitag, Samstag 18:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = '5c383f18-0704-4fac-9b13-c3e191cd4088';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Tom's cruising bar es un bar situado en Maspalomas, Las Palmas, en 54 Avenida Estados Unidos Maspalomas, Las Palmas (35100). Horario indicado: todos los días 20:00–04:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 20:00–04:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = 'e675eb3d-72a8-41fb-a629-6e7d7d5cd58b';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Toom-Peerstall ist eine Bar in Hamburg, 43, Clemens-Schultz-Straße, Hambourg, 20359.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Hamburg$city$)
where id = 'd13b3ff6-94c7-4041-b409-7097f8403e61';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Toys4Boys is een winkel in Anvers, op 6 Nosestraat Anvers (2000). Vermelde openingstijden: donderdag, vrijdag, zaterdag 11:00–20:00 ; zondag 14:00–17:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$donderdag, vrijdag, zaterdag 11:00–20:00 ; zondag 14:00–17:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Anvers$city$)
where id = '4ab7fe16-7d7d-400e-ad55-c0286f25bc41';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Tr3ème lieu est un bar situé Rue Raspail Limoges (87000). Horaires indiqués : jeudi, vendredi, samedi 18h–2h.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$jeudi, vendredi, samedi 18h–2h$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Limoges$city$)
where id = '55814352-70ad-4316-bb14-235ee4a218e5';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Berlin$city$)
where id = 'aae51e7a-f6fc-4cbe-be22-7e320ce04542';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Veridis es un bar situado en Barcelona, en 319, Carrer del Consell de Cent, Barcelone, 08007. Horario indicado: domingo, martes, miércoles, jueves, viernes, sábado 17:00–01:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$domingo, martes, miércoles, jueves, viernes, sábado 17:00–01:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Barcelona$city$)
where id = '00d369d6-c328-41b9-be93-c9e06d8ccf88';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Visible Cycling Club est un club queer situé Nice. Il se présente comme un lieu lesbien ou ouvert aux femmes queer.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Nice$city$)
where id = '708d16fb-117f-4f18-bae5-42119a3ff7b8';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$We are Brewers est un bar queer situé 16, Boulevard Jules Ferry, Paris, 75011. Horaires indiqués : mardi 18h–2h, mercredi 18h–2h, jeudi 18h–2h, vendredi 18h–2h, samedi 16h–2h, dimanche 16h–23h59.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$mardi 18h–2h, mercredi 18h–2h, jeudi 18h–2h, vendredi 18h–2h, samedi 16h–2h, dimanche 16h–23h59$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '30b639cb-4354-443a-a7ac-83d152305766';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$WunderBar es un bar situado en Maspalomas, Las Palmas, en 54 Avenida Estados Unidos Maspalomas, Las Palmas (35100). Horario indicado: todos los días 20:00–02:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$todos los días 20:00–02:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Maspalomas, Las Palmas$city$)
where id = '0c02502a-4c0d-4ab9-ba74-44c50b246597';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$WunderBar Hambourg ist eine Bar in Hamburg, 14, Talstraße, Hambourg, 20359. Angegebene Öffnungszeiten: Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 20:00–03:00 ; Freitag, Samstag 20:00–06:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$Sonntag, Montag, Dienstag, Mittwoch, Donnerstag 20:00–03:00 ; Freitag, Samstag 20:00–06:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Hamburg$city$)
where id = '4a71f36f-3fe8-4f80-8777-71ad0002d855';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$You & Me es un bar situado en Madrid, en 6, Calle de San Bartolomé, Madrid, 28004. Horario indicado: de lunes a viernes 20:00–03:00 ; el fin de semana 17:00–03:00.$desc$ else description end,
  hours = coalesce(nullif(btrim(hours), ''), $hrs$de lunes a viernes 20:00–03:00 ; el fin de semana 17:00–03:00$hrs$),
  city = coalesce(nullif(btrim(city), ''), $city$Madrid$city$)
where id = 'ddb74545-6f5c-4bfd-861b-773326c0fb96';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$Yoyo est un club situé 13 Avenue du Président Wilson Paris (75116).$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '5837b13e-feba-4ee6-89fa-a3cd810284aa';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Bordeaux$city$)
where id = '36193de7-a9aa-4795-95b5-b02623477aea';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Caen$city$)
where id = 'bf01e9a4-75f6-493d-9bd0-e34b87b495dd';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Grenade sur l$city$)
where id = 'aac3a315-54e7-4986-acc2-b72fb51073f8';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'af1f82d6-9139-4066-bd2b-e666159967ae';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'b1fbdc38-c1b7-4b8e-865e-fd73d338ef5d';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'e02a2371-b71a-4653-af7d-8a45093d7737';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$size-full$city$)
where id = '2e01624c-654f-4663-88cb-7fa01310fd71';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '2e8e19fa-6d4a-4489-8701-e51673491398';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '0503c8b2-f9c7-4dc1-b073-3fc879ae6ac1';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '7cca2864-8622-474d-bb26-0d8d4ed7b54e';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '293e6680-3733-4363-9d82-283a48a9dcb7';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Besançon$city$)
where id = 'c08297c3-0880-4f4b-9f60-e7e8773b3bdc';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Nantes$city$)
where id = 'eefdc0b8-2572-4488-8acd-cd6f9198d5c1';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '3b01d4b7-d0b2-4a4b-a883-6952d1b55356';

update hdar.places set
  description = case when description is null or btrim(description) = '' or (length(btrim(description)) < 120 and description ~* '^(Bar|Club|Sauna|Boutique|Sex-shop|Club échangiste|Bar cruising|Parc|Plage|Cruising)[[:space:]]+(à|au|aux|en|in|im|aan|bei)[[:space:]]') then $desc$les-bains-de-saint-aubin est un sauna à Toulouse. On y trouve un jacuzzi.$desc$ else description end,
  city = coalesce(nullif(btrim(city), ''), $city$Toulouse$city$)
where id = 'd48dd4ab-7306-4aec-8525-13a15cb46999';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'b6a4060f-fba1-402d-8435-0356d384227a';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = 'f487c34c-66e7-4b7d-b31f-cbf406a7a185';

update hdar.places set
  city = coalesce(nullif(btrim(city), ''), $city$Paris$city$)
where id = '060ced69-16d7-41c2-ae80-03a381bef44a';
