-- hdar v82 — Couleur de bulle visible par tous : choisie dans Paramètres → Apparence, stockée sur le profil
-- (8 pastilles seulement), renvoyée avec chaque message (privé, salons, Quartier). Police et taille restent locales. Additif.
alter table hdar.profiles add column if not exists bubble text
  check (bubble is null or bubble in ('corail','bleu','vert','violet','rose','ambre','turquoise','graphite'));

create or replace function public.hdar_set_bubble(p_color text) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); c text := nullif(lower(btrim(coalesce(p_color, ''))), '');
begin
  if s is null then raise exception 'Session requise'; end if;
  if c is not null and c not in ('corail','bleu','vert','violet','rose','ambre','turquoise','graphite') then raise exception 'Couleur invalide'; end if;
  perform hdar.rate_check(s, 'bubble', 20, interval '1 minute');
  update hdar.profiles set bubble = case when c = 'corail' then null else c end where user_id = s;
end $$;
revoke all on function public.hdar_set_bubble(text) from public, anon;
grant execute on function public.hdar_set_bubble(text) to authenticated;

create or replace function public.hdar_thread2(p_with text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id(); w text := lower(left(coalesce(p_with, ''), 80)); since timestamptz; th text;
begin
  if w = '' or w = s then return '[]'::jsonb; end if;
  th := hdar.thread_of(s, w);
  select h.hidden_at into since from hdar.hidden_threads h where h.user_id = s and h.other_id = w;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'from_id', m.from_id, 'bubble', (select bp.bubble from hdar.profiles bp where bp.user_id = m.from_id), 
      'body', case when m.kind = 'location' and m.duration > 0 and m.created_at + make_interval(mins => m.duration) < now() then '' else m.body end,
      'at', m.created_at::text, 'kind', m.kind, 'duration', m.duration, 'reply_to', m.reply_to, 'edited_at', m.edited_at, 'fwd', m.fwd,
      'reply', (select hdar.reply_preview(case when r.from_id = s then 'Toi' else coalesce(nullif(pp.pseudo, ''), 'Anonyme') end,
                                          r.body, r.kind, false)
                from hdar.live_messages r left join hdar.profiles pp on pp.user_id = r.from_id
                where r.id = m.reply_to and r.thread_id = th),
      'reactions', hdar.reactions_of('dm', m.id, s))
      order by m.created_at)
    from (select * from hdar.live_messages lm where lm.thread_id = th and (since is null or lm.created_at > since)
          order by lm.created_at desc limit 200) m), '[]'::jsonb);
end $$;

create or replace function public.hdar_salon_messages(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id, 'bubble', (select bp.bubble from hdar.profiles bp where bp.user_id = m.from_id),  'pseudo', m.pseudo, 'body', m.body,
      'kind', m.kind, 'duration', m.duration, 'at', m.created_at, 'mine', m.from_id = s, 'reply_to', m.reply_to, 'edited_at', m.edited_at, 'fwd', m.fwd,
      'reply', (select hdar.reply_preview(r.pseudo, r.body, r.kind, r.removed) from hdar.salon_messages r where r.id = m.reply_to),
      'reactions', hdar.reactions_of('salon', m.id, s),
      'photo', exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null and p.photo_status = 'approved'))
      order by m.created_at)
    from (select * from hdar.salon_messages m where m.salon_id = p_id and not m.removed and not hdar.is_blocked(s, m.from_id)
            and m.created_at > now() - interval '24 hours'
          order by m.created_at desc limit 200) m), '[]'::jsonb);
end $$;

create or replace function public.hdar_area_feed2(p_lat double precision, p_lng double precision) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s text := hdar.self_id();
begin
  if s is null then raise exception 'Session requise'; end if;
  if p_lat is null or p_lng is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_id', m.from_id, 'bubble', (select bp.bubble from hdar.profiles bp where bp.user_id = m.from_id),  'pseudo', m.pseudo, 'body', m.body,
      'kind', coalesce(m.kind, 'text'), 'duration', m.duration, 'at', m.created_at, 'mine', m.from_id = s,
      'lat', hdar.round_coord(m.lat), 'lng', hdar.round_coord(m.lng), 'reply_to', m.reply_to, 'edited_at', m.edited_at,
      'reply', (select hdar.reply_preview(r.pseudo, r.body, r.kind, r.removed) from hdar.area_messages r where r.id = m.reply_to),
      'reactions', hdar.reactions_of('area', m.id, s),
      'photo', exists (select 1 from hdar.profiles p where p.user_id = m.from_id and p.photo is not null and p.photo_status = 'approved'))
      order by m.created_at)
    from (select * from hdar.area_messages a
          where a.created_at > now() - interval '24 hours' and not a.removed
            and abs(a.lat - p_lat) < 0.03 and abs(a.lng - p_lng) < 0.045
            and not hdar.is_blocked(s, a.from_id)
          order by a.created_at desc limit 150) m), '[]'::jsonb);
end $$;
