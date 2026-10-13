-- v45b : onglet admin Partenaires + accès admin (lecture) au tableau de bord pro
create or replace function hdar.can_see_place(p_id uuid) returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from hdar.places where id = p_id and owner_id = hdar.self_id())
      or exists (select 1 from hdar.admins a where a.auth_user_id = auth.uid()) $$;
revoke all on function hdar.can_see_place(uuid) from public, anon;
grant execute on function hdar.can_see_place(uuid) to authenticated;

create or replace function public.hdar_admin_partners(p_key text, p_days int default 30) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare since date := current_date - least(greatest(coalesce(p_days, 30), 1), 400);
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(r order by (r->>'revenue')::int desc) from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind, 'active', coalesce(p.partner_until > now(), false), 'until', p.partner_until,
      'sub', p.sub_status, 'pro_boost_until', p.pro_boost_until,
      'revenue', (select coalesce(sum(amount_cents), 0) from hdar.payments y where y.place_id = p.id),
      'boosts', (select count(*) from hdar.payments y where y.place_id = p.id and y.kind = 'pro_boost'),
      'views', (select coalesce(sum(views), 0) from hdar.place_daily d where d.place_id = p.id and d.day > since),
      'live', (select count(*) from hdar.pro_live_views v where v.place_id = p.id and v.started_at::date > since),
      'gifts', (select count(*) from hdar.pro_gifts g where g.place_id = p.id and g.created_at::date > since)) r
    from hdar.places p where p.owner_id is not null and (p.partner or p.partner_until is not null or p.stripe_subscription is not null)) x), '[]'::jsonb);
end $$;
revoke all on function public.hdar_admin_partners(text, int) from public, anon;
grant execute on function public.hdar_admin_partners(text, int) to authenticated;
create or replace function public.hdar_pro_dashboard(p_id uuid, p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int := least(greatest(coalesce(p_days, 30), 1), 400); since date := current_date - n;
  boosts jsonb; b_in numeric; b_out numeric;
begin
  if not hdar.can_see_place(p_id) then raise exception 'Lieu introuvable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('from', y.created_at, 'to', y.created_at + pr.duration, 'label', pr.label) order by y.created_at desc), '[]'::jsonb)
    into boosts from hdar.payments y join hdar.pricing pr on pr.product = y.product where y.place_id = p_id and y.kind = 'pro_boost';
  select avg(d.views) filter (where bd), avg(d.views) filter (where not bd) into b_in, b_out from (
    select d.views, exists (select 1 from hdar.payments y join hdar.pricing pr on pr.product = y.product
      where y.place_id = p_id and y.kind = 'pro_boost' and d.day between y.created_at::date and (y.created_at + pr.duration)::date) bd
    from hdar.place_daily d where d.place_id = p_id and d.day > current_date - 180) d;
  return jsonb_build_object(
    'views', (select coalesce(sum(views), 0) from hdar.place_daily where place_id = p_id and day > since),
    'clicks', (select coalesce(sum(clicks), 0) from hdar.place_daily where place_id = p_id and day > since),
    'messages', (select coalesce(sum(messages), 0) from hdar.place_daily where place_id = p_id and day > since),
    'visitors', (select count(distinct user_id) from hdar.place_visitors where place_id = p_id and day > since),
    'favorites', (select count(*) from hdar.favorites where fav_id = p_id::text),
    'live_views', (select count(*) from hdar.pro_live_views where place_id = p_id and started_at::date > since),
    'live_minutes', (select coalesce(round(sum(extract(epoch from coalesce(ended_at, least(now(), started_at + interval '10 minutes')) - started_at)) / 60), 0)
                     from hdar.pro_live_views where place_id = p_id and started_at::date > since),
    'live_avg_sec', (select coalesce(round(avg(extract(epoch from ended_at - started_at))), 0) from hdar.pro_live_views where place_id = p_id and ended_at is not null and started_at::date > since),
    'gifts_sent', (select count(*) from hdar.pro_gifts where place_id = p_id and created_at::date > since),
    'gifts_opened', (select count(*) from hdar.pro_gifts g join hdar.user_notices u on u.pro_gift_id = g.id where g.place_id = p_id and u.seen_at is not null and g.created_at::date > since),
    'gifts_used', (select count(*) from hdar.pro_gifts where place_id = p_id and used_at is not null and created_at::date > since),
    'threads', (select count(*) from hdar.pro_threads where place_id = p_id and created_at::date > since),
    'avg', (select round(avg(stars)::numeric, 1) from hdar.place_ratings where place_id = p_id),
    'ratings', (select count(*) from hdar.place_ratings where place_id = p_id),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', g::date, 'views', coalesce(d.views, 0), 'clicks', coalesce(d.clicks, 0),
        'live', (select count(*) from hdar.pro_live_views v where v.place_id = p_id and v.started_at::date = g::date)) order by g)
      from generate_series(since + 1, current_date, interval '1 day') g left join hdar.place_daily d on d.place_id = p_id and d.day = g::date), '[]'::jsonb),
    'heat', coalesce((select jsonb_agg(jsonb_build_object('dow', dw, 'hour', hour, 'n', n)) from (
        select extract(isodow from day)::int dw, hour, sum(n) n from hdar.place_origin where place_id = p_id and day > since group by 1, 2) q), '[]'::jsonb),
    'boosts', boosts, 'boost_in', round(coalesce(b_in, 0), 1), 'boost_out', round(coalesce(b_out, 0), 1),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at, 'reply', c.reply, 'reply_at', c.reply_at,
        'stars', (select stars from hdar.place_ratings x where x.place_id = p_id and x.user_id = c.user_id)) order by c.created_at desc)
      from (select * from hdar.place_comments where place_id = p_id and not hidden order by created_at desc limit 100) c), '[]'::jsonb));
end $$;
