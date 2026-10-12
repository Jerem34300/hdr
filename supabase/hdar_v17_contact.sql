create table if not exists hdar.contact_messages (
  id bigint generated always as identity primary key,
  user_id text,
  subject text not null check (subject in ('rgpd','signalement','autre')),
  body text not null,
  reply_to text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
alter table hdar.contact_messages enable row level security;
revoke all on hdar.contact_messages from public, anon, authenticated;

create or replace function public.hdar_contact_send(p_subject text, p_body text, p_reply text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id(); b text := btrim(coalesce(p_body, '')); r text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if s is null then raise exception 'Session requise'; end if;
  perform hdar.rate_check(s, 'contact', 3, interval '1 hour');
  if p_subject not in ('rgpd','signalement','autre') then raise exception 'Sujet invalide'; end if;
  if length(b) < 5 then raise exception 'Message trop court'; end if;
  insert into hdar.contact_messages (user_id, subject, body, reply_to)
  values (s, p_subject, left(b, 4000), left(r, 200));
end $$;
revoke execute on function public.hdar_contact_send(text, text, text) from public, anon;
grant execute on function public.hdar_contact_send(text, text, text) to authenticated;

create or replace function public.hdar_admin_contacts(p_key text, p_all boolean default false)
returns table (id bigint, user_id text, subject text, body text, reply_to text, at text, handled boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  return query select c.id, c.user_id, c.subject, c.body, c.reply_to, c.created_at::text, c.handled_at is not null
    from hdar.contact_messages c where p_all or c.handled_at is null
    order by c.created_at desc limit 200;
end $$;
create or replace function public.hdar_admin_contact_handle(p_key text, p_id bigint)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hdar.admin_check(p_key);
  update hdar.contact_messages set handled_at = now() where id = p_id;
end $$;
revoke execute on function public.hdar_admin_contacts(text, boolean), public.hdar_admin_contact_handle(text, bigint) from public, anon;
grant execute on function public.hdar_admin_contacts(text, boolean), public.hdar_admin_contact_handle(text, bigint) to authenticated;
select cron.schedule('hdar-contact-purge', '17 3 * * *', $c$delete from hdar.contact_messages where created_at < now() - interval '1 year'$c$);
