-- Applied as migration `hdar_hide_conversations`.
-- "Delete a conversation" hides it for one person only: messages older than
-- hidden_at disappear for them; a new message makes the thread reappear.
-- hdar_thread and hdar_conversations were redefined (same signatures) to
-- skip messages older than hidden_at for the caller.
create table if not exists hdar.hidden_threads (
  user_id text not null,
  other_id text not null,
  hidden_at timestamptz not null default now(),
  primary key (user_id, other_id)
);
alter table hdar.hidden_threads enable row level security;

create or replace function public.hdar_conversation_hide(p_self text, p_other text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s text := hdar.check_id(p_self);
  o text := lower(left(coalesce(p_other, ''), 80));
begin
  if o = '' or o = s then return; end if;
  insert into hdar.hidden_threads (user_id, other_id, hidden_at) values (s, o, now())
  on conflict (user_id, other_id) do update set hidden_at = now();
end $$;

revoke execute on function public.hdar_conversation_hide(text, text) from public, authenticated;
grant execute on function public.hdar_conversation_hide(text, text) to anon;
