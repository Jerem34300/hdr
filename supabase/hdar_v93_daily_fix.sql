-- hdar v93 — Corrections de l'onglet « Jour par jour » (audit du 26/10) :
-- 1) Inscrits : la date d'inscription est created_at (profile_at est remis à now() à CHAQUE enregistrement du profil,
--    d'où « Hdar admin » affiché inscrit le 26/10 à 23:14). Le compte robot hdar est exclu.
-- 2) Trafic : hdar_hit datait les visites en UTC (current_date) ; désormais jour de Paris.
--    Les jours passés restent datés UTC (visites entre minuit et 1 h/2 h de Paris comptées la veille).

create or replace function public.hdar_hit(p_self text) returns void
language plpgsql security definer set search_path to '' as $function$
declare s text := hdar.self_id(); prev timestamptz; fresh boolean;
begin
  select d.last_seen into prev from hdar.devices d where d.id = s;
  fresh := prev is null or prev < now() - interval '30 minutes';
  insert into hdar.devices (id) values (s)
  on conflict (id) do update set last_seen = now(),
    sessions = hdar.devices.sessions + case when fresh then 1 else 0 end;
  insert into hdar.daily_visits (day, device) values ((now() at time zone 'Europe/Paris')::date, s)
  on conflict (day, device) do update set
    sessions = hdar.daily_visits.sessions + case when fresh then 1 else 0 end;
  if fresh then perform hdar.bump_msg('session'); end if;
end $function$;

create or replace function public.hdar_admin_daily(p_key text, p_day date default null, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  d0 date := coalesce(p_day, today);
  nd int := least(greatest(coalesce(p_days, 30), 1), 90);
  since date := today - (nd - 1);
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'days', coalesce((select jsonb_agg(r order by r.day desc) from (
      select g.day,
        (select count(*) from hdar.profiles p where p.profile_at is not null and p.user_id <> hdar.bot_id() and (p.created_at at time zone 'Europe/Paris')::date = g.day)::int signups,
        (select coalesce(sum(v.sessions), 0) from hdar.daily_visits v where v.day = g.day)::int visits,
        (select count(distinct v.device) from hdar.daily_visits v where v.day = g.day)::int devices,
        (select count(*) from hdar.devices x where (x.first_seen at time zone 'Europe/Paris')::date = g.day)::int new_devices,
        (select coalesce(sum(x.n), 0) from hdar.departures_daily x where x.day = g.day and x.kind = 'profil')::int departures,
        (select coalesce(sum(y.amount_cents - y.refunded_cents), 0) from hdar.payments y where (y.created_at at time zone 'Europe/Paris')::date = g.day)::int revenue_cents,
        (select count(*) from hdar.payments y where (y.created_at at time zone 'Europe/Paris')::date = g.day)::int payments
      from generate_series(since, today, interval '1 day') g0(d), lateral (select g0.d::date as day) g) r), '[]'::jsonb),
    'day', jsonb_build_object(
      'day', d0,
      'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', p.user_id, 'pseudo', p.pseudo, 'age', p.age, 'city', p.city, 'photo', case when p.photo_status = 'approved' then p.photo end,
            'at', p.created_at, 'ref', r.ref, 'still', true) order by p.created_at desc)
          from hdar.profiles p left join hdar.profile_refs r on r.user_id = p.user_id
          where p.profile_at is not null and p.user_id <> hdar.bot_id() and (p.created_at at time zone 'Europe/Paris')::date = d0), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(t order by t.profiles desc, t.visits desc) from (
          select coalesce(k.ref, '(sans lien)') ref,
            coalesce((select x.visits from hdar.ref_daily x where x.day = d0 and x.ref = k.ref), 0) visits,
            coalesce((select x.devices from hdar.ref_daily x where x.day = d0 and x.ref = k.ref), 0) devices,
            (select count(*) from hdar.profiles p left join hdar.profile_refs pr on pr.user_id = p.user_id
               where p.profile_at is not null and p.user_id <> hdar.bot_id() and (p.created_at at time zone 'Europe/Paris')::date = d0 and pr.ref is not distinct from k.ref)::int profiles,
            (select coalesce(sum(y.amount_cents - y.refunded_cents), 0) from hdar.payments y left join hdar.profile_refs pr on pr.user_id = y.user_id
               where (y.created_at at time zone 'Europe/Paris')::date = d0 and pr.ref is not distinct from k.ref)::int revenue_cents
          from (select ref from hdar.ref_daily where day = d0
                union select pr.ref from hdar.profiles p left join hdar.profile_refs pr on pr.user_id = p.user_id where p.profile_at is not null and p.user_id <> hdar.bot_id() and (p.created_at at time zone 'Europe/Paris')::date = d0
                union select pr.ref from hdar.payments y left join hdar.profile_refs pr on pr.user_id = y.user_id where (y.created_at at time zone 'Europe/Paris')::date = d0) k) t), '[]'::jsonb),
      'revenue', coalesce((select jsonb_agg(t order by t.cents desc) from (
          select coalesce(y.kind, y.product, '?') kind, count(*)::int cnt, sum(y.amount_cents - y.refunded_cents)::int cents
          from hdar.payments y where (y.created_at at time zone 'Europe/Paris')::date = d0 group by 1) t), '[]'::jsonb),
      'departures', coalesce((select jsonb_object_agg(dd.kind, dd.n) from hdar.departures_daily dd where dd.day = d0), '{}'::jsonb),
      'platforms', coalesce((select jsonb_object_agg(k, c) from (select coalesce(x.platform, '?') k, count(*)::int c from hdar.daily_visits v
          left join hdar.devices x on x.id = v.device where v.day = d0 group by 1) t), '{}'::jsonb)));
end $$;
revoke all on function public.hdar_admin_daily(text, date, int) from public, anon;
grant execute on function public.hdar_admin_daily(text, date, int) to authenticated;
