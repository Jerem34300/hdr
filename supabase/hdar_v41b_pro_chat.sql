-- v41b : messages privés des partenaires (20 nouvelles conversations / jour / lieu)
create table if not exists hdar.pro_threads (
  place_id uuid not null references hdar.places(id) on delete cascade,
  from_id text not null, to_id text not null,
  created_at timestamptz not null default now(),
  reported boolean not null default false,
  primary key (from_id, to_id)
);
alter table hdar.pro_threads enable row level security;

create or replace function public.hdar_pro_chat_open(p_place uuid, p_to text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); t text := lower(btrim(p_to)); n int;
begin
  perform hdar.require_profile(s);
  perform hdar.pro_place_check(s, p_place);
  if t = s or not exists (select 1 from hdar.profiles where user_id = t) then raise exception 'Profil introuvable'; end if;
  if exists (select 1 from hdar.pro_threads where from_id = s and to_id = t) then
    update hdar.pro_threads set place_id = p_place where from_id = s and to_id = t;
    return jsonb_build_object('ok', true);
  end if;
  if exists (select 1 from hdar.profiles where user_id = t and pro_gifts_off)
     or exists (select 1 from hdar.pro_gift_blocks where user_id = t and place_id = p_place) or hdar.is_blocked(s, t) then
    raise exception 'Cette personne ne reçoit pas de messages des pros';
  end if;
  select count(*) into n from hdar.pro_threads where place_id = p_place and created_at > now() - interval '1 day';
  if n >= 20 then raise exception 'Limite atteinte : 20 nouvelles conversations pro par jour'; end if;
  insert into hdar.pro_threads (place_id, from_id, to_id) values (p_place, s, t);
  return jsonb_build_object('ok', true, 'left', 19 - n);
end $$;

-- badge Partenaire d'un interlocuteur (seulement s'il m'a contacté en pro)
create or replace function public.hdar_pro_badge(p_other text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('place', pl.id, 'name', pl.name) from hdar.pro_threads t join hdar.places pl on pl.id = t.place_id
  where t.from_id = lower(p_other) and t.to_id = hdar.self_id() and pl.partner_until > now() limit 1 $$;

create or replace function public.hdar_pro_chat_block(p_other text, p_report boolean default false) returns void
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); r hdar.pro_threads;
begin
  select * into r from hdar.pro_threads where from_id = lower(p_other) and to_id = s;
  if r.place_id is null then raise exception 'Conversation introuvable'; end if;
  insert into hdar.pro_gift_blocks (user_id, place_id) values (s, r.place_id) on conflict do nothing;
  if not hdar.is_blocked(s, r.from_id) then insert into hdar.live_blocks (user_id, blocked_id) values (s, r.from_id); end if;
  if p_report then update hdar.pro_threads set reported = true where from_id = r.from_id and to_id = s; end if;
end $$;

create or replace function public.hdar_admin_pro_threads(p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object('at', t.created_at, 'place', pl.name, 'to', pr.pseudo, 'reported', t.reported) order by t.created_at desc)
    from (select * from hdar.pro_threads order by created_at desc limit 300) t join hdar.places pl on pl.id = t.place_id left join hdar.profiles pr on pr.user_id = t.to_id), '[]'::jsonb);
end $$;
revoke all on function public.hdar_pro_chat_open(uuid, text), public.hdar_pro_badge(text), public.hdar_pro_chat_block(text, boolean), public.hdar_admin_pro_threads(text) from public, anon;
grant execute on function public.hdar_pro_chat_open(uuid, text), public.hdar_pro_badge(text), public.hdar_pro_chat_block(text, boolean), public.hdar_admin_pro_threads(text) to authenticated;
