-- hdar v129 — Accueil du robot moins répétitif.
-- 1) 12 tournures au singulier, 12 au pluriel (présentation factuelle : vient de s'inscrire / de créer son profil), tirées au hasard (seulement si l'admin garde les textes par défaut).
-- 2) Accueil d'une seule personne : « Envies affichées sur son profil : Un verre · Balade. » à partir de SES envies
--    publiques (hdar.profiles.tags, qu'il/elle a cochées). Jamais genre, recherche (orientation), âge, ville ou position.
--    « Plan » est exclu (vie intime). Rien de coché → message normal.
-- Format de mention inchangé (@pseudo / @[pseudo avec espace]). Le client traduit (i18n : mêmes textes sources).

create or replace function hdar.bot_welcome_pick(p_one boolean) returns text
language sql volatile set search_path to '' as $$
  select (case when p_one then array[
    '{mentions} vient de créer son profil. Bienvenue !',
    'Nouveau sur hdar : {mentions}. Passez lui dire bonjour.',
    'Bienvenue à {mentions}, qui vient de s''inscrire sur hdar.',
    '{mentions} vient de rejoindre hdar. Un petit bonjour lui fera plaisir.',
    'Profil tout neuf sur hdar : {mentions}. Bienvenue !',
    '{mentions} fait ses premiers pas sur hdar. Bienvenue à toi !',
    'Inscription toute fraîche : {mentions}. Bienvenue sur hdar !',
    '{mentions} vient de s''inscrire. N''hésitez pas à lui dire bonjour.',
    'Bienvenue sur hdar, {mentions} ! Ton profil est en ligne.',
    '{mentions} fait désormais partie de hdar. Bienvenue !',
    'Nouveau profil : {mentions}. Bienvenue parmi nous !',
    '{mentions} vient de s''inscrire sur hdar. Faites-lui bon accueil.']
  else array[
    '{mentions} viennent de créer leur profil. Bienvenue !',
    'Nouveaux sur hdar : {mentions}. Passez leur dire bonjour.',
    'Bienvenue à {mentions}, qui viennent de s''inscrire sur hdar.',
    '{mentions} viennent de rejoindre hdar. Un petit bonjour leur fera plaisir.',
    'Profils tout neufs sur hdar : {mentions}. Bienvenue !',
    '{mentions} font leurs premiers pas sur hdar. Bienvenue à vous !',
    'Inscriptions toutes fraîches : {mentions}. Bienvenue sur hdar !',
    '{mentions} viennent de s''inscrire. N''hésitez pas à leur dire bonjour.',
    'Bienvenue sur hdar, {mentions} ! Vos profils sont en ligne.',
    '{mentions} font désormais partie de hdar. Bienvenue !',
    'Nouveaux profils : {mentions}. Bienvenue parmi nous !',
    '{mentions} viennent de s''inscrire sur hdar. Faites-leur bon accueil.'] end)[1 + floor(random() * 12)::int]
$$;
revoke all on function hdar.bot_welcome_pick(boolean) from public, anon, authenticated;

create or replace function hdar.bot_welcome_summary(p_user text) returns text
language sql stable security definer set search_path to '' as $$
  select 'Envies affichées sur son profil : ' || string_agg(l.label, ' · ' order by l.o) || '.'
  from hdar.profiles p
  cross join lateral unnest(string_to_array(coalesce(p.tags, ''), ',')) t(id)
  join (values ('verre', 'Un verre', 1), ('discuter', 'Discuter', 2), ('balade', 'Balade', 3), ('sortir', 'Sortir', 4)) l(id, label, o)
    on l.id = btrim(t.id)
  where p.user_id = p_user and p.profile_at is not null
  having count(*) > 0
$$;
revoke all on function hdar.bot_welcome_summary(text) from public, anon, authenticated;

create or replace function hdar.bot_flush_salon() returns int
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings; sid uuid; names text[]; ids text[]; txt text; tpl text; syn text; m text; c text; total int := 0;
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
           when 1 then hdar.mention_tag(names[1])
           else array_to_string((select array_agg(hdar.mention_tag(x)) from unnest(names[1:array_length(names, 1) - 1]) x), ', ') || ' et ' || hdar.mention_tag(names[array_length(names, 1)]) end;
    tpl := case when array_length(names, 1) = 1 then coalesce(nullif(btrim(cfg.salon_text_one), ''), cfg.salon_text) else cfg.salon_text end;
    -- Textes par défaut (non personnalisés dans l'admin) : une tournure tirée au hasard parmi 12.
    if tpl in ('Bienvenue à {mentions} ! Faites-lui bon accueil.', 'Bienvenue à {mentions} ! Faites-leur bon accueil.') then
      tpl := hdar.bot_welcome_pick(array_length(names, 1) = 1);
    end if;
    txt := replace(tpl, '{mentions}', m);
    -- Une seule personne : rappel de ses envies déjà publiques sur son profil (jamais genre, orientation, âge, position).
    if array_length(names, 1) = 1 then
      syn := hdar.bot_welcome_summary(ids[1]);
      if syn is not null then txt := txt || E'\n' || syn; end if;
    end if;
    insert into hdar.salon_messages (salon_id, from_id, pseudo, body) values (sid, hdar.bot_id(), 'hdar', left(txt, 1000));
    update hdar.salons set last_at = now() where id = sid;
    update hdar.bot_welcome set salon_at = now() where user_id = any(ids);
    total := total + array_length(names, 1);
  end loop;
  return total;
end $$;
revoke all on function hdar.bot_flush_salon() from public, anon, authenticated;
