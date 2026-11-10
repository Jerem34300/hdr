-- hdar v141 — Liste « en ligne » d'un salon : une personne sans profil s'affiche « Discret N », plus « Anonyme ».
-- Avant : la liste reprenait le nom envoyé par l'appli, qui envoie « Anonyme » quand il n'y a pas de pseudo.
-- Maintenant : sans profil, le nom vient du serveur (hdar.discreet_name, même numéro stable que partout ailleurs).
-- Seule la ligne « pseudo » change ; le reste de la fonction est identique.
create or replace function hdar.room_people(p_room text, s text, p_lat double precision, p_lng double precision)
returns jsonb language sql stable security definer set search_path to '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'pseudo', coalesce(nullif(p.pseudo, ''), hdar.discreet_name(r.user_id)),
      'profile', p.profile_at is not null, 'mine', r.user_id = s,
      'photo', p.photo is not null and p.photo_status = 'approved',
      'ago', extract(epoch from now() - r.seen_at)::int)
      order by r.user_id = s desc, r.seen_at > now() - interval '1 minute' desc, (p.profile_at is not null) desc,
        (p.photo is not null and p.photo_status = 'approved') desc, r.seen_at desc), '[]'::jsonb)
  from (select * from hdar.room_presence r
        where r.room = p_room and r.seen_at > now() - interval '5 minutes'
          and (p_room <> 'area' or (abs(r.lat - p_lat) < 0.03 and abs(r.lng - p_lng) < 0.045))
          and not hdar.is_blocked(s, r.user_id)
        order by r.seen_at desc limit 200) r
  left join hdar.profiles p on p.user_id = r.user_id and p.profile_at is not null
    and not exists (select 1 from hdar.bans b where b.user_id = r.user_id and b.active);
$function$;
