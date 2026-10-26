-- v90 : l'accueil groupé du salon ne salue jamais deux fois le même pseudo en 24 h
-- (cas « Medi » : deux profils créés à 1 min d'écart sur deux appareils → 2 « Bienvenue à @Medi »).
-- Copie de hdar.bot_flush_salon (v86) + dédoublonnage par pseudo. Le message privé reste envoyé à chaque profil.
create or replace function hdar.bot_flush_salon() returns int
language plpgsql security definer set search_path to '' as $$
declare cfg hdar.bot_settings; sid uuid := hdar.bot_main_salon(); names text[]; ids text[]; txt text; m text;
begin
  select * into cfg from hdar.bot_settings where id;
  if cfg is null or not cfg.enabled or sid is null then return 0; end if;
  if exists (select 1 from hdar.salon_messages x where x.salon_id = sid and x.from_id = hdar.bot_id() and x.created_at > now() - interval '10 minutes') then return 0; end if;
  -- Même pseudo déjà salué dans les 24 h (2e profil de la même personne, autre appareil) : on le marque sans le re-saluer.
  update hdar.bot_welcome w set salon_at = now()
    where w.salon_at is null and exists (select 1 from hdar.bot_welcome o where o.user_id <> w.user_id
      and lower(btrim(o.pseudo)) = lower(btrim(w.pseudo)) and o.salon_at > now() - interval '24 hours');
  select array_agg(w.pseudo order by w.at), array_agg(w.user_id order by w.at) into names, ids from (select d.* from (
    select distinct on (lower(btrim(w.pseudo))) w.* from hdar.bot_welcome w
    join hdar.profiles p on p.user_id = w.user_id and p.profile_at is not null
    where w.salon_at is null and w.at > now() - interval '24 hours'
      and not exists (select 1 from hdar.bans b where b.user_id = w.user_id and b.active)
    order by lower(btrim(w.pseudo)), w.at) d
    order by d.at limit 5) w;
  if names is null then return 0; end if;
  -- Les doublons de pseudo du même lot sont aussi marqués comme salués.
  update hdar.bot_welcome w set salon_at = now() where w.salon_at is null and lower(btrim(w.pseudo)) = any(select lower(btrim(x)) from unnest(names) x);
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
