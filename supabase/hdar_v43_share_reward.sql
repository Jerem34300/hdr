-- v43 : petit cadeau immédiat au partage (1 fois / 7 jours)
create table if not exists hdar.share_rewards (id bigserial primary key, user_id text not null, kind text not null, amount int not null, at timestamptz not null default now());
create index if not exists share_rewards_user on hdar.share_rewards (user_id, at);
alter table hdar.share_rewards enable row level security;
create or replace function public.hdar_share_reward() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); k text; a int; label text;
begin
  perform hdar.require_profile(s);
  perform hdar.rate_check(s, 'share_reward', 5, interval '1 hour');
  perform 1 from hdar.profiles where user_id = s for update;
  if exists (select 1 from hdar.share_rewards where user_id = s and at > now() - interval '7 days') then return null; end if;
  if random() < 0.5 then k := 'boost'; a := 3; else k := 'premium'; a := 1; end if;
  insert into hdar.share_rewards (user_id, kind, amount) values (s, k, a);
  label := hdar.grant_gift(s, k, a, 'Merci partage');
  return jsonb_build_object('kind', k, 'amount', a, 'label', label);
end $$;
revoke all on function public.hdar_share_reward() from public, anon;
grant execute on function public.hdar_share_reward() to authenticated;
