-- hdar v16 — accusés de lecture « Vu » dans les chats privés
create table if not exists hdar.thread_reads (
  user_id text not null,
  other_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, other_id)
);
alter table hdar.thread_reads enable row level security;

-- Marque la conversation comme lue par l'appelant et renvoie quand l'autre l'a lue pour la dernière fois.
create or replace function public.hdar_mark_read(p_self text, p_with text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); w text := lower(left(coalesce(p_with, ''), 80)); r timestamptz;
begin
  if w = '' or w = s then return null; end if;
  insert into hdar.thread_reads (user_id, other_id, read_at) values (s, w, now())
    on conflict (user_id, other_id) do update set read_at = now();
  if hdar.is_blocked(s, w) then return null; end if;
  select t.read_at into r from hdar.thread_reads t where t.user_id = w and t.other_id = s;
  return r::text;
end $$;
revoke execute on function public.hdar_mark_read(text, text) from public, anon;
grant execute on function public.hdar_mark_read(text, text) to authenticated;

create or replace function hdar.thread_reads_cleanup_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from hdar.thread_reads where user_id = old.user_id or other_id = old.user_id;
  return old;
end $$;
drop trigger if exists identities_reads_cleanup on hdar.identities;
create trigger identities_reads_cleanup after delete on hdar.identities
  for each row execute function hdar.thread_reads_cleanup_trg();
revoke execute on function hdar.thread_reads_cleanup_trg() from public, anon, authenticated;
