-- hdar v87 — Robot hdar : relances des inactifs, annonces (admin), question du jour, rappel des règles, conseil profil.
-- Chaque fonction a son interrupteur et ses textes (hdar.bot_settings). Tâches : pg_cron (hdar.bot_tick, toutes les 15 min).
-- Garde-fous : relances seulement pour les membres vus APRÈS cette mise à jour (pas de vague sur les anciens comptes),
-- 2 relances max par personne, plafonds par passage, jamais aux bannis / à ceux qui ont bloqué ou coupé le robot.
-- Le robot est aussi exclu des stats de messages et des notifications push de salon.

alter table hdar.bot_settings
  add column if not exists nudge_on boolean not null default true,
  add column if not exists nudge1_text text not null default $t$Coucou {pseudo} 👋 Ça fait quelques jours ! Ça bouge sur la carte en ce moment : de nouveaux profils près de chez toi et des salons animés. Passe faire un tour quand tu veux, on t'attend 😊 hdar.chat$t$,
  add column if not exists nudge2_text text not null default $t${pseudo}, petit message de l'équipe hdar 💜 Si tu as besoin d'un coup de main (profil, discrétion, notifications), tout est expliqué ici : hdar.chat/faq. Au plaisir de te revoir sur la carte ! (Ce sera notre dernière relance.)$t$,
  add column if not exists question_on boolean not null default true,
  add column if not exists questions text not null default $q$Ton plan idéal pour un dimanche après-midi ?
Plutôt café en terrasse ou apéro au coucher du soleil ? ☀️
Le dernier film ou la dernière série qui t'a vraiment plu ?
Si tu pouvais partir demain, tu irais où ? ✈️
Ta chanson du moment ? 🎶
Plutôt montagne ou bord de mer ?
Le meilleur resto de ta ville, selon toi ?
Ta façon préférée de te détendre après une longue journée ?
Une activité que tu rêves d'essayer cette année ?
Plutôt lève-tôt ou couche-tard ? 🌙
Le plat que tu cuisines le mieux ?
Ton endroit préféré pour une balade dans ta région ?
Si tu devais résumer ta semaine en un emoji ?
Le meilleur conseil qu'on t'ait donné ?
Ton petit plaisir du week-end ?
Plutôt soirée tranquille à la maison ou sortie entre amis ?
Un talent caché que peu de gens connaissent ?
Thé, café ou chocolat chaud ? ☕
Le concert ou le festival qui t'a le plus marqué ?
Ton souvenir de vacances préféré ?
Plutôt chiens ou chats ? 🐶🐱
Le livre ou le podcast que tu recommanderais ?
Qu'est-ce qui te fait toujours sourire ?
Ta saison préférée, et pourquoi ?
Le sport que tu pratiques (ou que tu aimes regarder) ?
Ton dessert préféré ? 🍰
Une ville que tu aimerais visiter un jour ?
Plutôt cinéma ou soirée jeux ?
Ce que tu préfères dans ta ville ?
La meilleure découverte que tu as faite cette année ?$q$,
  add column if not exists rules_on boolean not null default true,
  add column if not exists rules_text text not null default $t$Petit rappel amical 🤝 Ici, on reste respectueux : pas d'insultes, pas d'insistance, pas de contenu choquant, et le consentement avant tout. Si un message te dérange, un appui long → « Signaler », et l'équipe s'en occupe. Merci à tous de garder ce salon sympa 💜$t$,
  add column if not exists tip_on boolean not null default true,
  add column if not exists tip_text text not null default $t$Psst {pseudo} 😉 Les profils avec une photo et quelques mots reçoivent bien plus de messages. Ajoute-les dans Profil → Modifier : tu choisis ce que tu montres et tu restes discret. 📸✍️$t$;

-- État par membre : dernière visite (suivie à partir de maintenant), relances, conseil, préférence.
create table if not exists hdar.bot_state (
  user_id text primary key,
  last_seen timestamptz not null default now(),
  nudges int not null default 0,
  last_nudge timestamptz,
  tip_at timestamptz,
  opt_out boolean not null default false
);
alter table hdar.bot_state enable row level security;
revoke all on hdar.bot_state from public, anon, authenticated;

-- Journal des messages du robot dans les salons (question du jour, règles).
create table if not exists hdar.bot_salon_log (
  salon_id uuid not null, kind text not null, day date not null, at timestamptz not null default now(),
  primary key (salon_id, kind, day, at));
create index if not exists bot_salon_log_recent on hdar.bot_salon_log (salon_id, kind, at desc);
alter table hdar.bot_salon_log enable row level security;
revoke all on hdar.bot_salon_log from public, anon, authenticated;

-- Signalements faits depuis un salon (1 par membre et par salon toutes les 30 min).
create table if not exists hdar.salon_report_log (
  salon_id uuid not null, reporter_id text not null, at timestamptz not null default now());
create index if not exists salon_report_log_recent on hdar.salon_report_log (salon_id, at desc);
alter table hdar.salon_report_log enable row level security;
revoke all on hdar.salon_report_log from public, anon, authenticated;

-- File d'envoi des annonces privées (vidée par paquets de 300 / passage).
create table if not exists hdar.bot_outbox (
  id bigserial primary key, user_id text not null, body text not null, at timestamptz not null default now(), sent_at timestamptz);
create index if not exists bot_outbox_pending on hdar.bot_outbox (id) where sent_at is null;
alter table hdar.bot_outbox enable row level security;
revoke all on hdar.bot_outbox from public, anon, authenticated;

alter table hdar.bot_welcome add column if not exists tip_at timestamptz;

-- Envoi d'un message privé du robot (refusé si banni, robot bloqué, ou profil disparu).
create or replace function hdar.bot_dm(p_user text, p_body text) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  if p_user is null or p_user = hdar.bot_id() or nullif(btrim(coalesce(p_body, '')), '') is null then return false; end if;
  if not exists (select 1 from hdar.profiles p where p.user_id = p_user and p.profile_at is not null) then return false; end if;
  if exists (select 1 from hdar.bans b where b.user_id = p_user and b.active) then return false; end if;
  if hdar.is_blocked(p_user, hdar.bot_id()) then return false; end if;
  insert into hdar.live_messages (thread_id, from_id, body) values (hdar.thread_of(hdar.bot_id(), p_user), hdar.bot_id(), left(p_body, 2000));
  return true;
end $$;
revoke all on function hdar.bot_dm(text, text) from public, anon, authenticated;

create or replace function hdar.bot_salon_post(p_salon uuid, p_body text, p_kind text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  insert into hdar.salon_messages (salon_id, from_id, pseudo, body) values (p_salon, hdar.bot_id(), 'hdar', left(p_body, 1000));
  update hdar.salons set last_at = now() where id = p_salon;
  insert into hdar.bot_salon_log (salon_id, kind, day) values (p_salon, p_kind, (now() at time zone 'Europe/Paris')::date);
end $$;
revoke all on function hdar.bot_salon_post(uuid, text, text) from public, anon, authenticated;

-- 1) Relances : 3 j puis 10 j sans visite, 2 max, 100 par passage.
create or replace function hdar.bot_nudges() returns int
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings; r record; n int := 0;
begin
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.nudge_on then return 0; end if;
  for r in select st.user_id, st.nudges, p.pseudo from hdar.bot_state st join hdar.profiles p on p.user_id = st.user_id and p.profile_at is not null
    where not st.opt_out and st.nudges < 2
      and ((st.nudges = 0 and st.last_seen < now() - interval '3 days')
        or (st.nudges = 1 and st.last_seen < now() - interval '10 days' and st.last_nudge < now() - interval '5 days'))
    order by st.last_seen limit 100 loop
    if hdar.bot_dm(r.user_id, replace(case when r.nudges = 0 then cfg.nudge1_text else cfg.nudge2_text end, '{pseudo}', r.pseudo)) then n := n + 1; end if;
    update hdar.bot_state set nudges = nudges + 1, last_nudge = now() where user_id = r.user_id; -- compté même si refusé : jamais d'insistance
  end loop;
  return n;
end $$;

-- 5) Conseil profil : ~24 h après l'inscription, sans photo ou sans description, une seule fois, 100 par passage.
create or replace function hdar.bot_tips() returns int
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings; r record; n int := 0;
begin
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.tip_on then return 0; end if;
  for r in select w.user_id, p.pseudo from hdar.bot_welcome w join hdar.profiles p on p.user_id = w.user_id and p.profile_at is not null
    where w.tip_at is null and w.at < now() - interval '24 hours' and w.at > now() - interval '72 hours'
      and (p.photo is null or nullif(btrim(coalesce(p.bio, '')), '') is null)
      and not exists (select 1 from hdar.bot_state st where st.user_id = w.user_id and st.opt_out)
    order by w.at limit 100 loop
    update hdar.bot_welcome set tip_at = now() where user_id = r.user_id;
    if hdar.bot_dm(r.user_id, replace(cfg.tip_text, '{pseudo}', r.pseudo)) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- 3) Question du jour : 10 h–22 h (Paris), salon calme depuis 3 h, 1 par salon et par jour.
create or replace function hdar.bot_questions() returns int
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings; qs text[]; r record; n int := 0; h int := extract(hour from now() at time zone 'Europe/Paris');
  d date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.question_on or h < 10 or h >= 22 then return 0; end if;
  qs := array(select btrim(x) from unnest(string_to_array(cfg.questions, E'\n')) x where btrim(x) <> '');
  if coalesce(array_length(qs, 1), 0) = 0 then return 0; end if;
  for r in select s.id from hdar.salons s
    where not s.removed
      and (s.official or exists (select 1 from hdar.salon_messages m where m.salon_id = s.id and m.from_id <> hdar.bot_id() and m.created_at > now() - interval '7 days'))
      and not exists (select 1 from hdar.salon_messages m where m.salon_id = s.id and not m.removed and m.created_at > now() - interval '3 hours')
      and not exists (select 1 from hdar.bot_salon_log l where l.salon_id = s.id and l.kind = 'question' and l.day = d)
    limit 30 loop
    perform hdar.bot_salon_post(r.id, '💬 Question du jour : ' || qs[1 + ((d - date '2026-01-01') + abs(hashtext(r.id::text))) % array_length(qs, 1)], 'question');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Annonces privées en file : 300 par passage.
create or replace function hdar.bot_drain() returns int
language plpgsql security definer set search_path to '' as $$
declare r record; n int := 0;
begin
  for r in select id, user_id, body from hdar.bot_outbox where sent_at is null order by id limit 300 for update skip locked loop
    perform hdar.bot_dm(r.user_id, r.body);
    update hdar.bot_outbox set sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function hdar.bot_tick() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare a int; b int; c int; d int; e int;
begin
  a := hdar.bot_flush_salon(); b := hdar.bot_questions(); c := hdar.bot_nudges(); d := hdar.bot_tips(); e := hdar.bot_drain();
  return jsonb_build_object('welcome', a, 'questions', b, 'nudges', c, 'tips', d, 'outbox', e);
end $$;
revoke all on function hdar.bot_nudges(), hdar.bot_tips(), hdar.bot_questions(), hdar.bot_drain(), hdar.bot_tick() from public, anon, authenticated;

-- 4) Rappel des règles : 3 signalements (membres différents) en 30 min dans un salon → 1 rappel, au plus 1 / 2 h.
create or replace function public.hdar_salon_report_note(p_salon uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); cfg hdar.bot_settings;
begin
  if s is null or p_salon is null then return; end if;
  if not exists (select 1 from hdar.salons x where x.id = p_salon and not x.removed) then return; end if;
  if exists (select 1 from hdar.salon_report_log l where l.salon_id = p_salon and l.reporter_id = s and l.at > now() - interval '30 minutes') then return; end if;
  insert into hdar.salon_report_log (salon_id, reporter_id) values (p_salon, s);
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.rules_on then return; end if;
  if (select count(distinct reporter_id) from hdar.salon_report_log l where l.salon_id = p_salon and l.at > now() - interval '30 minutes') < 3 then return; end if;
  if exists (select 1 from hdar.bot_salon_log l where l.salon_id = p_salon and l.kind = 'rules' and l.at > now() - interval '2 hours') then return; end if;
  perform hdar.bot_salon_post(p_salon, cfg.rules_text, 'rules');
end $$;
revoke all on function public.hdar_salon_report_note(uuid) from public, anon;
grant execute on function public.hdar_salon_report_note(uuid) to authenticated;

-- Côté membre : visite (au plus 1 écriture / heure) et préférence « Messages du robot hdar ».
create or replace function public.hdar_bot_seen() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); o boolean;
begin
  if s is null or not exists (select 1 from hdar.profiles p where p.user_id = s and p.profile_at is not null) then return null; end if;
  insert into hdar.bot_state (user_id) values (s)
    on conflict (user_id) do update set last_seen = now() where hdar.bot_state.last_seen < now() - interval '1 hour';
  select opt_out into o from hdar.bot_state where user_id = s;
  return jsonb_build_object('bot_msgs', not coalesce(o, false));
end $$;
create or replace function public.hdar_bot_prefs(p_on boolean) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  insert into hdar.bot_state (user_id, opt_out) values (s, not coalesce(p_on, true))
    on conflict (user_id) do update set opt_out = not coalesce(p_on, true);
end $$;
revoke all on function public.hdar_bot_seen(), public.hdar_bot_prefs(boolean) from public, anon;
grant execute on function public.hdar_bot_seen(), public.hdar_bot_prefs(boolean) to authenticated;

-- 2) Annonces : aperçu (p_confirm = false → nombre de destinataires) puis envoi confirmé. Jamais automatique.
create or replace function public.hdar_admin_bot_announce(p_key text, p_text text, p_target text, p_confirm boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare sid uuid := hdar.bot_main_salon(); n int;
begin
  perform hdar.admin_check(p_key);
  if length(btrim(coalesce(p_text, ''))) < 5 or length(p_text) > 1000 then raise exception 'Annonce : 5 à 1000 caractères'; end if;
  if p_target not in ('salon', 'dm', 'both') then raise exception 'Destination inconnue'; end if;
  select count(*) into n from hdar.profiles p
    where p.profile_at is not null and p.user_id <> hdar.bot_id()
      and not exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active)
      and not hdar.is_blocked(p.user_id, hdar.bot_id());
  if not coalesce(p_confirm, false) then
    return jsonb_build_object('dm_count', case when p_target <> 'salon' then n else 0 end, 'salon', case when p_target <> 'dm' then (select name from hdar.salons where id = sid) end);
  end if;
  if p_target in ('salon', 'both') and sid is not null then perform hdar.bot_salon_post(sid, '📣 ' || p_text, 'announce'); end if;
  if p_target in ('dm', 'both') then
    insert into hdar.bot_outbox (user_id, body)
      select p.user_id, '📣 ' || p_text from hdar.profiles p
      where p.profile_at is not null and p.user_id <> hdar.bot_id()
        and not exists (select 1 from hdar.bans b where b.user_id = p.user_id and b.active)
        and not hdar.is_blocked(p.user_id, hdar.bot_id());
  end if;
  insert into hdar.admin_audit (admin_uid, action, detail) values (auth.uid(), 'bot_announce', jsonb_build_object('target', p_target, 'dm_count', n, 'text', left(p_text, 300)));
  return jsonb_build_object('ok', true, 'dm_count', case when p_target <> 'salon' then n else 0 end);
end $$;
revoke all on function public.hdar_admin_bot_announce(text, text, text, boolean) from public, anon;
grant execute on function public.hdar_admin_bot_announce(text, text, text, boolean) to authenticated;

-- Admin : lecture / écriture de tous les réglages (remplace v86).
drop function if exists public.hdar_admin_bot_set(text, boolean, text, text, text);
create or replace function public.hdar_admin_bot_get(p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return (select to_jsonb(s) - 'id' || jsonb_build_object(
    'welcomed', (select count(*) from hdar.bot_welcome), 'pending', (select count(*) from hdar.bot_welcome w where w.salon_at is null and w.at > now() - interval '24 hours'),
    'salon', (select name from hdar.salons where id = hdar.bot_main_salon()),
    'opted_out', (select count(*) from hdar.bot_state where opt_out),
    'outbox', (select count(*) from hdar.bot_outbox where sent_at is null))
    from hdar.bot_settings s where s.id);
end $$;
create or replace function public.hdar_admin_bot_set(p_key text, p jsonb) returns void
language plpgsql security definer set search_path to '' as $$
declare t text;
begin
  perform hdar.admin_check(p_key);
  foreach t in array array['dm_text', 'reply_text', 'nudge1_text', 'nudge2_text', 'rules_text', 'tip_text'] loop
    if length(btrim(coalesce(p ->> t, ''))) < 10 or length(p ->> t) > 2000 then raise exception 'Texte « % » : 10 à 2000 caractères', t; end if;
  end loop;
  if position('{mentions}' in coalesce(p ->> 'salon_text', '')) = 0 or length(p ->> 'salon_text') > 300 then raise exception 'Message du salon : doit contenir {mentions}, 300 caractères max'; end if;
  if length(coalesce(p ->> 'questions', '')) > 8000 then raise exception 'Questions : 8000 caractères max'; end if;
  update hdar.bot_settings set
    enabled = coalesce((p ->> 'enabled')::boolean, enabled), nudge_on = coalesce((p ->> 'nudge_on')::boolean, nudge_on),
    question_on = coalesce((p ->> 'question_on')::boolean, question_on), rules_on = coalesce((p ->> 'rules_on')::boolean, rules_on),
    tip_on = coalesce((p ->> 'tip_on')::boolean, tip_on),
    dm_text = p ->> 'dm_text', salon_text = p ->> 'salon_text', reply_text = p ->> 'reply_text',
    nudge1_text = p ->> 'nudge1_text', nudge2_text = p ->> 'nudge2_text', rules_text = p ->> 'rules_text', tip_text = p ->> 'tip_text',
    questions = coalesce(p ->> 'questions', questions), updated_at = now()
  where id;
  insert into hdar.admin_audit (admin_uid, action, detail) values (auth.uid(), 'bot_settings', p - 'dm_text' - 'questions');
end $$;
revoke all on function public.hdar_admin_bot_get(text), public.hdar_admin_bot_set(text, jsonb) from public, anon;
grant execute on function public.hdar_admin_bot_get(text), public.hdar_admin_bot_set(text, jsonb) to authenticated;

-- Le robot hors stats de messages et hors notifications push de salon (ses messages privés gardent leur notification).
create or replace function hdar.on_msg() returns trigger
language plpgsql security definer set search_path to '' as $$
declare k text := tg_argv[0]; dest text;
begin
  if new.from_id = hdar.bot_id() then return null; end if;
  perform hdar.bump_msg(k);
  perform hdar.bump_user(new.from_id, k);
  if k = 'pm' then
    dest := case when split_part(new.thread_id, ':', 1) = new.from_id then split_part(new.thread_id, ':', 2) else split_part(new.thread_id, ':', 1) end;
    if dest <> '' and dest <> new.from_id and dest <> hdar.bot_id() then perform hdar.bump_user(dest, 'pm_in'); end if;
    if not exists (select 1 from hdar.live_messages m where m.thread_id = new.thread_id and m.id <> new.id) then
      perform hdar.bump_user(new.from_id, 'convs');
    end if;
  end if;
  if k = 'place' then
    insert into hdar.place_daily (day, place_id, messages) values (current_date, new.place_id, 1)
      on conflict (day, place_id) do update set messages = hdar.place_daily.messages + 1;
    insert into hdar.place_visitors values (current_date, new.place_id, new.from_id) on conflict do nothing;
  end if;
  return null;
exception when others then return null;
end $$;

create or replace function hdar.push_salon_reply_trg() returns trigger
language plpgsql security definer set search_path to '' as $$
declare t text; n text;
begin
  if new.reply_to is null or new.from_id = hdar.bot_id() then return new; end if;
  select o.from_id into t from hdar.salon_messages o where o.id = new.reply_to;
  if t is null or t = new.from_id or hdar.is_blocked(t, new.from_id) then return new; end if;
  select x.name into n from hdar.salons x where x.id = new.salon_id;
  perform hdar.push_to(t, 'reply', 'salon:' || new.salon_id, interval '3 minutes', jsonb_build_object(
    'type', 'message', 'title', coalesce(new.pseudo, 'Quelqu''un') || ' t''a répondu dans ' || coalesce(n, 'un salon'),
    'body', 'Touche pour lire et répondre', 'tag', 'salon-' || new.salon_id, 'url', '/?salon=' || new.salon_id));
  return new;
exception when others then return new;
end $$;

-- pg_cron : une seule tâche toutes les 15 min (remplace hdar_bot_flush de v86).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('hdar_bot_flush', 'hdar_bot_tick');
    perform cron.schedule('hdar_bot_tick', '*/15 * * * *', 'select hdar.bot_tick()');
  end if;
end $$;
