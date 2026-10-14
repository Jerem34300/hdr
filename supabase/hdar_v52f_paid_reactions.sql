-- v52f : toutes les réactions du Live (🔥 🥵 😛 ❤️) sont payantes : 1 réaction = 1 cœur du solde (packs Stripe).
-- Admins : illimité (comme hdar_heart_send). La personne qui diffuse les reçoit comme des cœurs.
drop function if exists public.hdar_room_say(uuid, text, text);
create or replace function public.hdar_room_say(p_room uuid, p_body text, p_kind text default 'msg') returns jsonb language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); b text; bal int; adm boolean; h text;
begin
  if not exists (select 1 from hdar.live_room_members where room = p_room and user_id = s and left_at is null) then raise exception 'room_gone: tu n''es plus dans ce Live'; end if;
  if p_kind = 'react' then
    perform hdar.rate_check(s, 'room_react', 40, interval '1 minute');
    if p_body not in ('🔥','🥵','😛','❤️') then raise exception 'bad_reaction'; end if;
    b := p_body;
    adm := hdar.is_admin_user(s);
    if not adm then
      update hdar.hearts_wallet set balance = balance - 1, updated_at = now() where user_id = s and balance > 0 returning balance into bal;
      if bal is null then raise exception 'no_hearts: plus de cœurs'; end if;
    end if;
    select host into h from hdar.live_rooms where id = p_room;
    if h is not null and h <> s then
      insert into hdar.hearts_wallet as w (user_id, received) values (h, 1) on conflict (user_id) do update set received = w.received + 1, updated_at = now();
      insert into hdar.hearts_log (from_id, to_id) values (s, h);
    end if;
    insert into hdar.live_room_messages (room, from_id, kind, body) values (p_room, s, 'react', b);
    return jsonb_build_object('balance', bal, 'unlimited', adm);
  end if;
  perform hdar.rate_check(s, 'room_say', 20, interval '1 minute');
  b := hdar.chat_clean(p_body); if b = '' then return null; end if;
  insert into hdar.live_room_messages (room, from_id, kind, body) values (p_room, s, 'msg', b);
  return null;
end $$;
