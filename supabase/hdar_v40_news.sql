-- v40 : opt-in nouveautés (email lié), envoi admin via edge function hdar-mail, désinscription par jeton.
create table if not exists hdar.news_optin (
  user_id text primary key,
  auth_user_id uuid not null,
  consent_at timestamptz not null default now(),
  token uuid not null default gen_random_uuid() unique
);
alter table hdar.news_optin enable row level security;
create table if not exists hdar.news_log (id bigserial primary key, at timestamptz default now(), subject text, recipients int, by_key text);
alter table hdar.news_log enable row level security;

create or replace function public.hdar_news_status() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('on', exists (select 1 from hdar.news_optin where user_id = hdar.self_id()),
    'at', (select consent_at from hdar.news_optin where user_id = hdar.self_id()));
$$;

create or replace function public.hdar_news_set(p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); a uuid := auth.uid();
begin
  if s is null or a is null then raise exception 'Crée d''abord ton profil'; end if;
  if p_on then
    if not exists (select 1 from auth.users u where u.id = a and u.email is not null and u.email_confirmed_at is not null) then
      raise exception 'Lie d''abord un email'; end if;
    insert into hdar.news_optin (user_id, auth_user_id) values (s, a)
      on conflict (user_id) do update set auth_user_id = excluded.auth_user_id, consent_at = now();
  else
    delete from hdar.news_optin where user_id = s;
  end if;
  return public.hdar_news_status();
end $$;

-- Destinataires (admin uniquement, appelé par hdar-mail avec la clé admin).
create or replace function public.hdar_admin_news_recipients(p_key text) returns table(email text, token uuid, pseudo text)
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return query select u.email::text, n.token, p.pseudo from hdar.news_optin n
    join auth.users u on u.id = n.auth_user_id and u.email_confirmed_at is not null
    left join hdar.profiles p on p.user_id = n.user_id;
end $$;

create or replace function public.hdar_admin_news_count(p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object('optin', (select count(*) from hdar.news_optin),
    'history', coalesce((select jsonb_agg(l order by l.at desc) from (select at, subject, recipients from hdar.news_log order by at desc limit 20) l), '[]'));
end $$;

create or replace function public.hdar_admin_news_logged(p_key text, p_subject text, p_n int) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform hdar.admin_check(p_key);
  insert into hdar.news_log (subject, recipients) values (left(p_subject, 200), p_n);
end $$;

create or replace function public.hdar_news_unsubscribe(p_token uuid) returns boolean
language sql security definer set search_path to '' as $$
  with d as (delete from hdar.news_optin where token = p_token returning 1) select exists (select 1 from d);
$$;
revoke all on function public.hdar_news_unsubscribe(uuid) from public, anon, authenticated;
revoke all on function public.hdar_admin_news_recipients(text) from public, anon;
