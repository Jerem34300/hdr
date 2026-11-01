-- hdar v125 — Accueil du robot dans les salons : accord singulier / pluriel, sans emoji.
-- 1 personne  : « Bienvenue à @a ! Faites-lui bon accueil. »  (bot_settings.salon_text_one)
-- 2 ou plus   : « Bienvenue à @a, @b et @c ! Faites-leur bon accueil. »  (bot_settings.salon_text)
-- Les textes restent modifiables dans l'admin ; un texte déjà personnalisé n'est pas écrasé.

alter table hdar.bot_settings add column if not exists salon_text_one text;
update hdar.bot_settings set salon_text = $t$Bienvenue à {mentions} ! Faites-leur bon accueil.$t$
  where id and salon_text = $t$Bienvenue à {mentions} 👋 Faites-leur bon accueil !$t$;
update hdar.bot_settings set salon_text_one = $t$Bienvenue à {mentions} ! Faites-lui bon accueil.$t$
  where id and nullif(btrim(coalesce(salon_text_one, '')), '') is null;

-- Messages déjà publiés par le robot : même correction (accord selon le nombre de mentions, emoji retiré).
update hdar.salon_messages set body = case when body ~ ' et @' then
    replace(body, ' 👋 Faites-leur bon accueil !', ' ! Faites-leur bon accueil.')
  else replace(body, ' 👋 Faites-leur bon accueil !', ' ! Faites-lui bon accueil.') end
  where from_id = hdar.bot_id() and body like 'Bienvenue à @% 👋 Faites-leur bon accueil !';

-- v106 + texte au singulier quand une seule personne est accueillie.
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
    txt := replace(case when array_length(names, 1) = 1 then coalesce(nullif(btrim(cfg.salon_text_one), ''), cfg.salon_text) else cfg.salon_text end, '{mentions}', m);
    insert into hdar.salon_messages (salon_id, from_id, pseudo, body) values (sid, hdar.bot_id(), 'hdar', left(txt, 1000));
    update hdar.salons set last_at = now() where id = sid;
    update hdar.bot_welcome set salon_at = now() where user_id = any(ids);
    total := total + array_length(names, 1);
  end loop;
  return total;
end $$;
revoke all on function hdar.bot_flush_salon() from public, anon, authenticated;

-- v87 + salon_text_one (facultatif côté client : absent = inchangé).
create or replace function public.hdar_admin_bot_set(p_key text, p jsonb) returns void
language plpgsql security definer set search_path to '' as $$
declare t text;
begin
  perform hdar.admin_check(p_key);
  foreach t in array array['dm_text', 'reply_text', 'nudge1_text', 'nudge2_text', 'rules_text', 'tip_text'] loop
    if length(btrim(coalesce(p ->> t, ''))) < 10 or length(p ->> t) > 2000 then raise exception 'Texte « % » : 10 à 2000 caractères', t; end if;
  end loop;
  if position('{mentions}' in coalesce(p ->> 'salon_text', '')) = 0 or length(p ->> 'salon_text') > 300 then raise exception 'Message du salon : doit contenir {mentions}, 300 caractères max'; end if;
  if p ? 'salon_text_one' and (position('{mentions}' in coalesce(p ->> 'salon_text_one', '')) = 0 or length(p ->> 'salon_text_one') > 300) then raise exception 'Message du salon (1 personne) : doit contenir {mentions}, 300 caractères max'; end if;
  if length(coalesce(p ->> 'questions', '')) > 8000 then raise exception 'Questions : 8000 caractères max'; end if;
  update hdar.bot_settings set
    enabled = coalesce((p ->> 'enabled')::boolean, enabled), nudge_on = coalesce((p ->> 'nudge_on')::boolean, nudge_on),
    question_on = coalesce((p ->> 'question_on')::boolean, question_on), rules_on = coalesce((p ->> 'rules_on')::boolean, rules_on),
    tip_on = coalesce((p ->> 'tip_on')::boolean, tip_on),
    dm_text = p ->> 'dm_text', salon_text = p ->> 'salon_text', salon_text_one = coalesce(p ->> 'salon_text_one', salon_text_one), reply_text = p ->> 'reply_text',
    nudge1_text = p ->> 'nudge1_text', nudge2_text = p ->> 'nudge2_text', rules_text = p ->> 'rules_text', tip_text = p ->> 'tip_text',
    questions = coalesce(p ->> 'questions', questions), updated_at = now()
  where id;
  insert into hdar.admin_audit (admin_uid, action, detail) values (auth.uid(), 'bot_settings', p - 'dm_text' - 'questions');
end $$;
revoke all on function public.hdar_admin_bot_set(text, jsonb) from public, anon;
grant execute on function public.hdar_admin_bot_set(text, jsonb) to authenticated;
