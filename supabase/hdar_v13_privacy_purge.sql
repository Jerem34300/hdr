-- hdar v13 — suppression de compte + purge automatique (rétention documentée sur /confidentialite)
create extension if not exists pg_cron;

-- Supprime tout ce qui concerne l'appelant, puis son compte anonyme.
create or replace function public.hdar_delete_me()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); u uuid := auth.uid();
begin
  delete from hdar.live_messages where from_id = s
    or split_part(thread_id, ':', 1) = s or split_part(thread_id, ':', 2) = s;
  delete from hdar.favorites where user_id = s or fav_id = s;
  delete from hdar.hidden_threads where user_id = s or other_id = s;
  delete from hdar.live_blocks where user_id = s;
  delete from hdar.live_reports where reporter_id = s;
  delete from hdar.rtc_signals where from_id = s or to_id = s;
  delete from hdar.area_messages where from_id = s;
  delete from hdar.spot_messages where from_id = s;
  delete from hdar.spots where creator_id = s;
  delete from hdar.rate_limits where user_id = s;
  delete from hdar.daily_visits where device = s;
  delete from hdar.devices where id = s;
  delete from hdar.profiles where user_id = s;
  delete from hdar.identities where user_id = s;
  delete from auth.users where id = u;
end $$;
revoke execute on function public.hdar_delete_me() from public, anon;
grant execute on function public.hdar_delete_me() to authenticated;

-- Rétention :
--  * position sur la carte : effacée dès la fin de la durée choisie (1/3/12 h)
--  * position exacte partagée en privé : effacée après expiration (1 h)
--  * signaux d'appel : 1 h ; chat du quartier : 24 h ; lieux : 24 h après fermeture
--  * messages privés : 30 jours ; statistiques de visite : 90 jours
create or replace function hdar.purge() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update hdar.profiles set lat = null, lng = null, visible_until = null
    where visible_until is not null and visible_until < now();
  update hdar.live_messages set body = ''
    where kind = 'location' and body <> '' and duration > 0
      and created_at + make_interval(mins => duration) < now();
  delete from hdar.live_messages where kind = 'location' and created_at < now() - interval '1 day';
  delete from hdar.rtc_signals where created_at < now() - interval '1 hour';
  delete from hdar.area_messages where created_at < now() - interval '24 hours';
  delete from hdar.spot_messages m using hdar.spots s
    where m.spot_id = s.id and s.closes_at < now() - interval '24 hours';
  delete from hdar.spots where closes_at < now() - interval '24 hours';
  delete from hdar.live_messages where created_at < now() - interval '30 days';
  delete from hdar.daily_visits where day < current_date - 90;
  delete from hdar.rate_limits where window_start < now() - interval '1 day';
end $$;
revoke execute on function hdar.purge() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'hdar-purge';
select cron.schedule('hdar-purge', '*/10 * * * *', 'select hdar.purge()');
