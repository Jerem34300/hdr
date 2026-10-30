-- v106 : l'accueil groupé « Bienvenue à @a, @b… » repart, dans le Général du pays de l'inscrit.
-- Cause : v102 a renommé « Général » en « Général France » ; hdar.bot_main_salon() cherchait le nom exact
-- « Général » → null → hdar.bot_flush_salon() s'arrêtait sans rien poster (depuis le 29/10 ~20:47 CET).
-- La langue : le texte reste celui des réglages (FR), traduit à l'affichage par l'appli (tBot) pour chaque lecteur.

-- Salon principal = Général France (repère par pays, plus par nom).
create or replace function hdar.bot_main_salon() returns uuid
language sql stable set search_path to '' as $$
  select id from hdar.salons where official and not removed
    and (country = 'FR' or (country is null and lower(name) in ('général', 'general', 'général france')))
    and coalesce(region, '') = ''
  order by (country = 'FR') desc nulls last, created_at limit 1 $$;

-- Pays de l'inscrit (envoyé par l'appli à la création du profil ; FR par défaut).
alter table hdar.bot_welcome add column if not exists cc text;
create or replace function public.hdar_bot_welcome_cc(p_cc text) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); c text := upper(left(btrim(coalesce(p_cc, '')), 2));
begin
  if c !~ '^[A-Z]{2}$' or not exists (select 1 from hdar.countries where code = c) then return; end if;
  update hdar.bot_welcome set cc = c where user_id = s and salon_at is null;
end $$;
revoke all on function public.hdar_bot_welcome_cc(text) from public, anon;
grant execute on function public.hdar_bot_welcome_cc(text) to authenticated;

-- Général d'un pays (créé au besoin, comme hdar_country_salon).
create or replace function hdar.bot_country_salon(p_cc text) returns uuid
language plpgsql security definer set search_path to '' as $$
declare nm text; v uuid;
begin
  if p_cc is null or p_cc = 'FR' then return hdar.bot_main_salon(); end if;
  select id into v from hdar.salons where country = p_cc and coalesce(region, '') = '' and not removed limit 1;
  if v is not null then return v; end if;
  select name into nm from hdar.countries where code = p_cc;
  if nm is null then return hdar.bot_main_salon(); end if;
  insert into hdar.salons (name, description, emoji, official, country)
  values ('Général ' || nm, 'Discute avec tout le monde, partout : ' || nm, null, true, p_cc)
  on conflict do nothing returning id into v;
  if v is null then select id into v from hdar.salons where country = p_cc and coalesce(region, '') = '' and not removed limit 1; end if;
  return coalesce(v, hdar.bot_main_salon());
end $$;
revoke all on function hdar.bot_country_salon(text) from public, anon, authenticated;

-- v90 + un lot par pays (au plus un message toutes les 10 min par salon).
create or replace function hdar.bot_flush_salon() returns int
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings; sid uuid; names text[]; ids text[]; txt text; m text; c text; total int := 0;
begin
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.enabled then return 0; end if;
  update hdar.bot_welcome w set salon_at = now()
    where w.salon_at is null and exists (select 1 from hdar.bot_welcome o where o.user_id <> w.user_id
      and lower(btrim(o.pseudo)) = lower(btrim(w.pseudo)) and o.salon_at > now() - interval '24 hours');
  for c in select distinct coalesce(w.cc, 'FR') from hdar.bot_welcome w where w.salon_at is null and w.at > now() - interval '24 hours' loop
    sid := hdar.bot_country_salon(c);
    continue when sid is null;
    continue when exists (select 1 from hdar.salon_messages x where x.salon_id = sid and x.from_id = hdar.bot_id() and x.created_at > now() - interval '10 minutes');
    names := null; ids := null;
    select array_agg(w.pseudo order by w.at), array_agg(w.user_id order by w.at) into names, ids from (select d.* from (
      select distinct on (lower(btrim(w.pseudo))) w.* from hdar.bot_welcome w
      join hdar.profiles p on p.user_id = w.user_id and p.profile_at is not null
      where w.salon_at is null and w.at > now() - interval '24 hours' and coalesce(w.cc, 'FR') = c
        and not exists (select 1 from hdar.bans b where b.user_id = w.user_id and b.active)
      order by lower(btrim(w.pseudo)), w.at) d
      order by d.at limit 5) w;
    continue when names is null;
    update hdar.bot_welcome w set salon_at = now() where w.salon_at is null and coalesce(w.cc, 'FR') = c
      and lower(btrim(w.pseudo)) = any(select lower(btrim(x)) from unnest(names) x);
    m := case array_length(names, 1)
           when 1 then '@' || names[1]
           else array_to_string((select array_agg('@' || x) from unnest(names[1:array_length(names, 1) - 1]) x), ', ') || ' et @' || names[array_length(names, 1)] end;
    txt := replace(cfg.salon_text, '{mentions}', m);
    insert into hdar.salon_messages (salon_id, from_id, pseudo, body) values (sid, hdar.bot_id(), 'hdar', left(txt, 1000));
    update hdar.salons set last_at = now() where id = sid;
    update hdar.bot_welcome set salon_at = now() where user_id = any(ids);
    total := total + array_length(names, 1);
  end loop;
  return total;
end $$;
revoke all on function hdar.bot_flush_salon() from public, anon, authenticated;
