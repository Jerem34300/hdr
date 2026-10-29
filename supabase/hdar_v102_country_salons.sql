-- v102 : salons « Général » par pays (Général France, Général USA…).
-- Le salon « Général » existant devient « Général France ». Les autres pays sont créés à la demande.
alter table hdar.salons add column if not exists country text check (country ~ '^[A-Z]{2}$');
create unique index if not exists salons_country on hdar.salons (country) where not removed and country is not null;

create table if not exists hdar.countries (code text primary key check (code ~ '^[A-Z]{2}$'), name text not null);
alter table hdar.countries enable row level security;
revoke all on hdar.countries from anon, authenticated;
insert into hdar.countries (code, name) values
 ('FR','France'),('BE','Belgique'),('CH','Suisse'),('LU','Luxembourg'),('MC','Monaco'),('CA','Canada'),('US','USA'),
 ('GB','Royaume-Uni'),('IE','Irlande'),('ES','Espagne'),('PT','Portugal'),('IT','Italie'),('DE','Allemagne'),('AT','Autriche'),
 ('NL','Pays-Bas'),('DK','Danemark'),('SE','Suède'),('NO','Norvège'),('FI','Finlande'),('PL','Pologne'),('CZ','Tchéquie'),
 ('GR','Grèce'),('RO','Roumanie'),('HU','Hongrie'),('HR','Croatie'),('BG','Bulgarie'),('TR','Turquie'),('MA','Maroc'),
 ('DZ','Algérie'),('TN','Tunisie'),('EG','Égypte'),('SN','Sénégal'),('CI','Côte d''Ivoire'),('CM','Cameroun'),('LB','Liban'),
 ('AE','Émirats arabes unis'),('SA','Arabie saoudite'),('QA','Qatar'),('IL','Israël'),('MX','Mexique'),('BR','Brésil'),
 ('AR','Argentine'),('CL','Chili'),('CO','Colombie'),('PE','Pérou'),('AU','Australie'),('NZ','Nouvelle-Zélande'),('JP','Japon'),
 ('TH','Thaïlande'),('IN','Inde'),('ZA','Afrique du Sud'),('AD','Andorre'),('MT','Malte'),('CY','Chypre')
on conflict (code) do update set name = excluded.name;

update hdar.salons set name = 'Général France', country = 'FR', description = 'Discute avec tout le monde, partout en France'
 where official and not removed and region is null and trip_key is null and lower(name) = 'général' and country is null;

create or replace function hdar.salon_row(p_id uuid, s text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', x.id, 'name', x.name, 'description', x.description, 'emoji', x.emoji,
    'official', x.official, 'region', x.region, 'country', x.country, 'mine', x.creator_id = s, 'last_at', x.last_at,
    'recent', (select count(*) from hdar.salon_messages m where m.salon_id = x.id and not m.removed and m.created_at > now() - interval '24 hours'),
    'people', (select count(distinct m.from_id) from hdar.salon_messages m where m.salon_id = x.id and not m.removed and m.created_at > now() - interval '24 hours'))
  from hdar.salons x where x.id = p_id;
$$;
revoke execute on function hdar.salon_row(uuid, text) from public, anon, authenticated;

-- Salon général d'un pays (créé au premier passage). Renvoie la ligne du salon.
create or replace function public.hdar_country_salon(p_cc text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s text := hdar.self_id(); cc text := upper(btrim(coalesce(p_cc, ''))); nm text; v uuid;
begin
  if s is null then raise exception 'Session requise'; end if;
  select name into nm from hdar.countries where code = cc;
  if nm is null then raise exception 'Pays inconnu'; end if;
  select id into v from hdar.salons where country = cc and not removed;
  if v is null then
    insert into hdar.salons (name, description, emoji, official, country)
    values ('Général ' || nm, 'Discute avec tout le monde, partout : ' || nm, null, true, cc)
    on conflict do nothing returning id into v;
    if v is null then select id into v from hdar.salons where country = cc and not removed; end if;
  end if;
  return hdar.salon_row(v, s);
end $$;
revoke all on function public.hdar_country_salon(text) from public, anon;
grant execute on function public.hdar_country_salon(text) to authenticated;

-- Liste des pays proposés.
create or replace function public.hdar_countries() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name) order by name), '[]'::jsonb) from hdar.countries;
$$;
revoke all on function public.hdar_countries() from public;
grant execute on function public.hdar_countries() to anon, authenticated;
