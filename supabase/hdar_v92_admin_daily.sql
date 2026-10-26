-- hdar v92 — Admin « Jour par jour » : inscrits, trafic, départs, provenance et revenus par jour (heure de Paris).
-- RGPD : agrégats seulement ; la liste du jour montre pseudo / âge / ville (jamais email, IP ni position).
-- Départs : compteur anonyme (jour × type), sans identifiant. Additif.

create table if not exists hdar.departures_daily (
  day date not null,
  kind text not null check (kind in ('profil', 'visiteur')),
  n int not null default 0,
  primary key (day, kind)
);
alter table hdar.departures_daily enable row level security;
revoke all on hdar.departures_daily from anon, authenticated;

-- À chaque suppression de profil : +1 (profil complet ou simple visiteur sans profil). Aucune donnée gardée.
create or replace function hdar.count_departure() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into hdar.departures_daily as d (day, kind, n)
  values ((now() at time zone 'Europe/Paris')::date, case when old.profile_at is not null then 'profil' else 'visiteur' end, 1)
  on conflict (day, kind) do update set n = d.n + 1;
  return null;
end $$;
drop trigger if exists count_departure on hdar.profiles;
create trigger count_departure after delete on hdar.profiles for each row execute function hdar.count_departure();

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
        (select count(*) from hdar.profiles p where (p.profile_at at time zone 'Europe/Paris')::date = g.day)::int signups,
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
            'at', p.profile_at, 'ref', r.ref, 'still', true) order by p.profile_at desc)
          from hdar.profiles p left join hdar.profile_refs r on r.user_id = p.user_id
          where (p.profile_at at time zone 'Europe/Paris')::date = d0), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(t order by t.profiles desc, t.visits desc) from (
          select coalesce(k.ref, '(sans lien)') ref,
            coalesce((select x.visits from hdar.ref_daily x where x.day = d0 and x.ref = k.ref), 0) visits,
            coalesce((select x.devices from hdar.ref_daily x where x.day = d0 and x.ref = k.ref), 0) devices,
            (select count(*) from hdar.profiles p left join hdar.profile_refs pr on pr.user_id = p.user_id
               where (p.profile_at at time zone 'Europe/Paris')::date = d0 and pr.ref is not distinct from k.ref)::int profiles,
            (select coalesce(sum(y.amount_cents - y.refunded_cents), 0) from hdar.payments y left join hdar.profile_refs pr on pr.user_id = y.user_id
               where (y.created_at at time zone 'Europe/Paris')::date = d0 and pr.ref is not distinct from k.ref)::int revenue_cents
          from (select ref from hdar.ref_daily where day = d0
                union select pr.ref from hdar.profiles p left join hdar.profile_refs pr on pr.user_id = p.user_id where (p.profile_at at time zone 'Europe/Paris')::date = d0
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
