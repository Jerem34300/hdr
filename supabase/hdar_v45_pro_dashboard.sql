-- v45 : Tableau de bord pro (agrégé, anonyme) + réponses aux avis + suivi Live Pro / cadeaux utilisés
create table if not exists hdar.pro_live_views (id bigserial primary key, place_id uuid not null references hdar.places(id) on delete cascade,
  viewer text not null, started_at timestamptz not null default now(), ended_at timestamptz);
create index if not exists pro_live_views_place on hdar.pro_live_views (place_id, started_at);
alter table hdar.pro_live_views enable row level security;
alter table hdar.pro_gifts add column if not exists used_at timestamptz;
alter table hdar.place_comments add column if not exists reply text, add column if not exists reply_at timestamptz;

-- suivi Live Pro : début quand le pro est mis en relation, fin quand la relation se termine (spectateur haché, jamais exposé)
create or replace function hdar.pro_live_track() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.pro_place is not null and old.peer_id is not null
     and (tg_op = 'DELETE' or new.peer_id is distinct from old.peer_id) then
    update hdar.pro_live_views set ended_at = now() where place_id = old.pro_place and viewer = md5(old.peer_id) and ended_at is null;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.pro_place is not null and new.peer_id is not null
     and (tg_op = 'INSERT' or new.peer_id is distinct from old.peer_id) then
    insert into hdar.pro_live_views (place_id, viewer) values (new.pro_place, md5(new.peer_id));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists pro_live_track on hdar.live_queue;
create trigger pro_live_track after insert or update or delete on hdar.live_queue for each row execute function hdar.pro_live_track();

create or replace function public.hdar_pro_dashboard(p_id uuid, p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); n int := least(greatest(coalesce(p_days, 30), 1), 400); since date := current_date - n;
  boosts jsonb; b_in numeric; b_out numeric;
begin
  if not exists (select 1 from hdar.places where id = p_id and owner_id = s) then raise exception 'Lieu introuvable'; end if;
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

create or replace function public.hdar_pro_review_reply(p_comment uuid, p_text text) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); c hdar.place_comments;
begin
  select c2.* into c from hdar.place_comments c2 join hdar.places p on p.id = c2.place_id where c2.id = p_comment and p.owner_id = s;
  if c.id is null then raise exception 'Avis introuvable'; end if;
  if c.reply is not null then raise exception 'Vous avez déjà répondu à cet avis'; end if;
  if nullif(btrim(coalesce(p_text, '')), '') is null then raise exception 'Réponse vide'; end if;
  update hdar.place_comments set reply = left(btrim(p_text), 500), reply_at = now() where id = p_comment;
end $$;

create or replace function public.hdar_pro_review_report(p_comment uuid, p_reason text default null) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if not exists (select 1 from hdar.place_comments c join hdar.places p on p.id = c.place_id where c.id = p_comment and p.owner_id = s) then raise exception 'Avis introuvable'; end if;
  if not exists (select 1 from hdar.place_comment_reports where comment_id = p_comment and user_id = s) then
    insert into hdar.place_comment_reports (comment_id, user_id, reason) values (p_comment, s, left(coalesce(p_reason, 'Signalé par le lieu'), 200));
  end if;
end $$;

create or replace function public.hdar_pro_gift_use(p_place uuid, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); g hdar.pro_gifts;
begin
  perform hdar.pro_place_check(s, p_place);
  select * into g from hdar.pro_gifts where place_id = p_place and code = upper(btrim(p_code)) and used_at is null and expires_at > now() and not reported
    order by created_at limit 1 for update;
  if g.id is null then raise exception 'Code introuvable, déjà utilisé ou expiré'; end if;
  update hdar.pro_gifts set used_at = now() where id = g.id;
  return jsonb_build_object('title', g.title, 'description', g.description);
end $$;

revoke all on function public.hdar_pro_dashboard(uuid, integer), public.hdar_pro_review_reply(uuid, text), public.hdar_pro_review_report(uuid, text), public.hdar_pro_gift_use(uuid, text) from public, anon;
grant execute on function public.hdar_pro_dashboard(uuid, integer), public.hdar_pro_review_reply(uuid, text), public.hdar_pro_review_report(uuid, text), public.hdar_pro_gift_use(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.hdar_place_info(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text := hdar.self_id(); p hdar.places; own boolean; pub boolean; r jsonb;
begin
  select * into p from hdar.places where id = p_id;
  if p.id is null then return null; end if;
  own := p.owner_id = s;
  if not hdar.place_visible(p) and not own then return null; end if;
  pub := not p.partner or p.comments_public;
  select jsonb_build_object(
    'website', p.website, 'contact', p.contact, 'photos', to_jsonb(p.photos), 'owner', own,
    'ratings_on', (not p.partner or p.ratings_on), 'comments_on', (not p.partner or p.comments_on), 'comments_public', pub,
    'avg', (select round(avg(stars)::numeric, 1) from hdar.place_ratings where place_id = p_id),
    'count', (select count(*) from hdar.place_ratings where place_id = p_id),
    'mine', (select stars from hdar.place_ratings where place_id = p_id and user_id = s),
    'comments', case when pub or own then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at,
        'pseudo', coalesce(pr.pseudo, 'Anonyme'), 'mine', c.user_id = s,
        'stars', (select stars from hdar.place_ratings x where x.place_id = p_id and x.user_id = c.user_id), 'reply', c.reply) order by c.created_at desc)
      from (select * from hdar.place_comments where place_id = p_id and not hidden order by created_at desc limit 100) c
      left join hdar.profiles pr on pr.user_id = c.user_id), '[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at, 'pseudo', 'Toi', 'mine', true, 'stars', null))
        from hdar.place_comments c where c.place_id = p_id and c.user_id = s and not c.hidden), '[]'::jsonb) end
  ) into r;
  return r;
end $function$;
