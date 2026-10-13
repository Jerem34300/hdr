-- v35 — hdar+ « Demande à se voir 👀 » : 1 demande par rencontre, réservé hdar+. Ne défloute jamais personne :
-- l'autre reçoit seulement une invitation qu'il accepte ou non.
alter table hdar.live_queue add column if not exists asked_at timestamptz;

create or replace function public.hdar_live_ask() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); q hdar.live_queue;
begin
  perform hdar.require_premium(s);
  select * into q from hdar.live_queue where user_id = s for update;
  if q.peer_id is null then raise exception 'Personne en face'; end if;
  if q.asked_at is not null and q.asked_at >= q.matched_at then raise exception 'Déjà demandé pour cette rencontre'; end if;
  update hdar.live_queue set asked_at = now() where user_id = s;
  insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (q.peer_id, s, 'live-ask', '');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.hdar_live_ask() from public, anon;
grant execute on function public.hdar_live_ask() to authenticated;
