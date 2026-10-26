-- hdar v86 — Robot d'accueil officiel « hdar ».
-- À la création d'un profil (profile_at passe de null à une date, avec un pseudo) : un message privé de bienvenue,
-- puis un « Bienvenue à @a, @b et @c 👋 » groupé dans le salon Général (au plus un toutes les 10 min).
-- Un seul accueil par profil (hdar.bot_welcome, clé primaire). Rien de sensible : seulement le pseudo public.
-- Le robot n'a pas de position (jamais sur la carte), n'est jamais « en ligne », ne peut pas être signalé,
-- et répond à tout message privé par un texte automatique (FAQ + formulaire de contact), au plus 1 fois / 10 min.

create table if not exists hdar.bot_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  dm_text text not null,
  salon_text text not null,
  reply_text text not null,
  updated_at timestamptz not null default now()
);
alter table hdar.bot_settings enable row level security;
revoke all on hdar.bot_settings from public, anon, authenticated;

insert into hdar.bot_settings (id, dm_text, salon_text, reply_text) values (true,
$t$Bienvenue sur hdar, {pseudo} ! 🎉
Ravi de te compter parmi nous. L'essentiel pour bien démarrer :

🗺️ La carte : vois qui est dispo autour de toi, en restant discret (ta position est toujours approximative).
💬 Les salons et le Chat du quartier : discute avec ta région ou ton coin.
🎥 Le Live : des rencontres en vidéo, caméra floutée tant que tu veux.
👤 Ton profil : une photo et tes envies, et tu es bien plus visible.
🎨 Apparence : la couleur de tes bulles, la police, le fond.
🔒 Discrétion : active un code PIN et protège ton profil avec ton email (Paramètres).

Les règles sont simples : 18 ans et plus, respect et consentement toujours. Un souci ? Appui long sur un message ou « Signaler » sur un profil, l'équipe s'en occupe.

Toutes les réponses sont ici : hdar.chat/faq
Belle découverte ! 💜 L'équipe hdar

(Je suis le robot d'accueil : je ne lis pas les réponses.)$t$,
$t$Bienvenue à {mentions} 👋 Faites-leur bon accueil !$t$,
$t$Je suis le robot d'accueil de hdar 🤖 : je ne peux pas lire ta réponse. La plupart des questions trouvent leur réponse ici : hdar.chat/faq — et pour écrire à l'équipe, c'est par ici : hdar.chat/contact$t$)
on conflict (id) do nothing;

create or replace function hdar.bot_id() returns text language sql immutable set search_path to '' as $$ select '00000000-0000-4000-8000-00000000b075'::text $$;

-- Profil système : pas de position, pas de visibilité, jamais « en ligne ».
insert into hdar.profiles (user_id, pseudo, bio, hide_offline, profile_at)
values (hdar.bot_id(), 'hdar', 'Robot d''accueil officiel de hdar. Je ne lis pas les messages : réponses sur hdar.chat/faq, équipe via hdar.chat/contact.', true, now())
on conflict (user_id) do update set pseudo = 'hdar', lat = null, lng = null, visible_until = null, hide_offline = true;

create table if not exists hdar.bot_welcome (
  user_id text primary key,
  pseudo text not null,
  at timestamptz not null default now(),
  dm_at timestamptz,
  salon_at timestamptz
);
alter table hdar.bot_welcome enable row level security;
revoke all on hdar.bot_welcome from public, anon, authenticated;

-- Salon principal : « Général » officiel actif.
create or replace function hdar.bot_main_salon() returns uuid language sql stable set search_path to '' as $$
  select id from hdar.salons where official and not removed and lower(name) in ('général', 'general') order by created_at limit 1 $$;

-- Publie un accueil groupé dans le salon si le dernier date de plus de 10 min (5 pseudos max par message).
create or replace function hdar.bot_flush_salon() returns int
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings; sid uuid := hdar.bot_main_salon(); names text[]; ids text[]; txt text; m text;
begin
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.enabled or sid is null then return 0; end if;
  if exists (select 1 from hdar.salon_messages x where x.salon_id = sid and x.from_id = hdar.bot_id() and x.created_at > now() - interval '10 minutes') then return 0; end if;
  select array_agg(w.pseudo order by w.at), array_agg(w.user_id order by w.at) into names, ids from (
    select w.* from hdar.bot_welcome w
    join hdar.profiles p on p.user_id = w.user_id and p.profile_at is not null
    where w.salon_at is null and w.at > now() - interval '24 hours'
      and not exists (select 1 from hdar.bans b where b.user_id = w.user_id and b.active)
    order by w.at limit 5) w;
  if names is null then return 0; end if;
  m := case array_length(names, 1)
         when 1 then '@' || names[1]
         else array_to_string((select array_agg('@' || x) from unnest(names[1:array_length(names, 1) - 1]) x), ', ') || ' et @' || names[array_length(names, 1)] end;
  txt := replace(cfg.salon_text, '{mentions}', m);
  insert into hdar.salon_messages (salon_id, from_id, pseudo, body) values (sid, hdar.bot_id(), 'hdar', left(txt, 1000));
  update hdar.salons set last_at = now() where id = sid;
  update hdar.bot_welcome set salon_at = now() where user_id = any(ids);
  return array_length(names, 1);
end $$;
revoke all on function hdar.bot_flush_salon() from public, anon, authenticated;

create or replace function hdar.bot_welcome_trg() returns trigger
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings;
begin
  if new.user_id = hdar.bot_id() or new.profile_at is null or nullif(btrim(coalesce(new.pseudo, '')), '') is null then return new; end if;
  if tg_op = 'UPDATE' and old.profile_at is not null then return new; end if;
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.enabled then return new; end if;
  insert into hdar.bot_welcome (user_id, pseudo) values (new.user_id, new.pseudo) on conflict do nothing;
  if not found then return new; end if; -- déjà accueilli
  begin
    insert into hdar.live_messages (thread_id, from_id, body) values (hdar.thread_of(hdar.bot_id(), new.user_id), hdar.bot_id(), replace(cfg.dm_text, '{pseudo}', new.pseudo));
    update hdar.bot_welcome set dm_at = now() where user_id = new.user_id;
    perform hdar.bot_flush_salon();
  exception when others then null; -- l'accueil ne doit jamais empêcher la création du profil
  end;
  return new;
end $$;
drop trigger if exists bot_welcome on hdar.profiles;
create trigger bot_welcome after insert or update of profile_at on hdar.profiles
  for each row execute function hdar.bot_welcome_trg();

-- Réponse automatique quand on écrit au robot (au plus 1 toutes les 10 min par conversation).
create or replace function hdar.bot_reply_trg() returns trigger
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings;
begin
  if new.from_id = hdar.bot_id() or position(hdar.bot_id() in new.thread_id) = 0 then return new; end if;
  select * into cfg from hdar.bot_settings where id;
  if cfg is null then return new; end if;
  if exists (select 1 from hdar.live_messages m where m.thread_id = new.thread_id and m.from_id = hdar.bot_id() and m.created_at > now() - interval '10 minutes' and m.body = cfg.reply_text) then return new; end if;
  insert into hdar.live_messages (thread_id, from_id, body) values (new.thread_id, hdar.bot_id(), cfg.reply_text);
  return new;
end $$;
drop trigger if exists bot_reply on hdar.live_messages;
create trigger bot_reply after insert on hdar.live_messages for each row execute function hdar.bot_reply_trg();

-- Le robot ne peut pas être signalé comme un faux membre.
create or replace function hdar.bot_report_guard() returns trigger language plpgsql set search_path to '' as $$
begin
  if new.target_id = hdar.bot_id() then return null; end if;
  return new;
end $$;
drop trigger if exists bot_report_guard on hdar.live_reports;
create trigger bot_report_guard before insert on hdar.live_reports for each row execute function hdar.bot_report_guard();

-- Admin : lire / modifier les réglages.
create or replace function public.hdar_admin_bot_get(p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return (select jsonb_build_object('enabled', s.enabled, 'dm_text', s.dm_text, 'salon_text', s.salon_text, 'reply_text', s.reply_text, 'updated_at', s.updated_at,
    'welcomed', (select count(*) from hdar.bot_welcome), 'pending', (select count(*) from hdar.bot_welcome w where w.salon_at is null and w.at > now() - interval '24 hours'),
    'salon', (select name from hdar.salons where id = hdar.bot_main_salon()))
    from hdar.bot_settings s where s.id);
end $$;
create or replace function public.hdar_admin_bot_set(p_key text, p_enabled boolean, p_dm text, p_salon text, p_reply text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  if length(btrim(coalesce(p_dm, ''))) < 10 or length(p_dm) > 2000 then raise exception 'Message privé : 10 à 2000 caractères'; end if;
  if position('{mentions}' in coalesce(p_salon, '')) = 0 or length(p_salon) > 300 then raise exception 'Message du salon : doit contenir {mentions}, 300 caractères max'; end if;
  if length(btrim(coalesce(p_reply, ''))) < 10 or length(p_reply) > 600 then raise exception 'Réponse automatique : 10 à 600 caractères'; end if;
  update hdar.bot_settings set enabled = coalesce(p_enabled, enabled), dm_text = p_dm, salon_text = p_salon, reply_text = p_reply, updated_at = now() where id;
  insert into hdar.admin_audit (admin_uid, action, detail) values (auth.uid(), 'bot_settings', jsonb_build_object('enabled', p_enabled));
end $$;
revoke all on function public.hdar_admin_bot_get(text), public.hdar_admin_bot_set(text, boolean, text, text, text) from public, anon;
grant execute on function public.hdar_admin_bot_get(text), public.hdar_admin_bot_set(text, boolean, text, text, text) to authenticated;

-- Inscriptions en attente de l'accueil groupé : vidées toutes les 5 min (pg_cron, si présent).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'hdar_bot_flush';
    perform cron.schedule('hdar_bot_flush', '*/5 * * * *', 'select hdar.bot_flush_salon()');
  end if;
end $$;
