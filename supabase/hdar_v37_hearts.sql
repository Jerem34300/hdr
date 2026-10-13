-- v37 — Cœurs du Live : packs payants (Stripe, paiement unique), portefeuille, envoi d'1 cœur au partenaire Live.
-- Les cœurs n'ont aucune valeur monétaire, ne sont ni remboursables ni convertibles.
alter table hdar.pricing drop constraint if exists pricing_kind_check;
alter table hdar.pricing add constraint pricing_kind_check check (kind in ('listing', 'boost', 'place_boost', 'premium', 'hearts'));
alter table hdar.pricing add column if not exists qty int;
insert into hdar.pricing (product, kind, label, duration, price_cents, active, sort, qty) values
  ('hearts_10', 'hearts', '10 cœurs', interval '0', 199, true, 41, 10),
  ('hearts_50', 'hearts', '50 cœurs', interval '0', 699, true, 42, 50),
  ('hearts_150', 'hearts', '150 cœurs', interval '0', 1499, true, 43, 150)
on conflict (product) do nothing;

create table if not exists hdar.hearts_wallet (
  user_id text primary key, balance int not null default 0 check (balance >= 0),
  received int not null default 0, bought int not null default 0, updated_at timestamptz not null default now()
);
alter table hdar.hearts_wallet enable row level security;
revoke all on hdar.hearts_wallet from public, anon, authenticated;
create table if not exists hdar.hearts_log (id bigserial primary key, from_id text not null, to_id text not null, at timestamptz not null default now());
alter table hdar.hearts_log enable row level security;
revoke all on hdar.hearts_log from public, anon, authenticated;

-- Crédit par le webhook : on greffe une branche 'hearts' dans hdar_payment_apply.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.hdar_payment_apply(text,text,text,uuid,integer,text,text,text)'::regprocedure);
  if position('''hearts''' in d) = 0 then
    d := replace(d, $r$  elsif pr.kind = 'premium' then$r$, $r$  elsif pr.kind = 'hearts' then
    insert into hdar.hearts_wallet as w (user_id, balance, bought) values (p_user, coalesce(pr.qty, 0), coalesce(pr.qty, 0))
      on conflict (user_id) do update set balance = w.balance + coalesce(pr.qty, 0), bought = w.bought + coalesce(pr.qty, 0), updated_at = now();
  elsif pr.kind = 'premium' then$r$);
    execute d;
  end if;
  d := pg_get_functiondef('public.hdar_admin_growth(text,int)'::regprocedure);
  if position('''hearts''' in d) = 0 then
    d := replace(d, $r$'boosts', coalesce(sum(amount_cents) filter (where kind = 'boost'), 0),$r$,
      $r$'boosts', coalesce(sum(amount_cents) filter (where kind = 'boost'), 0), 'hearts', coalesce(sum(amount_cents) filter (where kind = 'hearts'), 0), 'premium', coalesce(sum(amount_cents) filter (where kind = 'premium'), 0),$r$);
    execute d;
  end if;
end $$;

create or replace function public.hdar_my_hearts() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('balance', coalesce(w.balance, 0), 'received', coalesce(w.received, 0))
  from (select 1) x left join hdar.hearts_wallet w on w.user_id = hdar.self_id();
$$;
revoke all on function public.hdar_my_hearts() from public, anon;
grant execute on function public.hdar_my_hearts() to authenticated;

create or replace function public.hdar_hearts_received(p_id text) returns int
language sql stable security definer set search_path to '' as $$
  select coalesce((select received from hdar.hearts_wallet where user_id = lower(p_id)), 0);
$$;
revoke all on function public.hdar_hearts_received(text) from public;
grant execute on function public.hdar_hearts_received(text) to anon, authenticated;

-- Envoie 1 cœur au partenaire Live actuel. Débit côté serveur ; 1 cœur / 2 s, 30 / min.
create or replace function public.hdar_heart_send() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare s text := hdar.self_id(); o text; b int;
begin
  select peer_id into o from hdar.live_queue where user_id = s;
  if o is null then raise exception 'Personne en face'; end if;
  perform hdar.rate_check(s, 'heart', 30, interval '1 minute');
  if exists (select 1 from hdar.hearts_log where from_id = s and at > now() - interval '2 seconds') then raise exception 'Doucement 🙂'; end if;
  update hdar.hearts_wallet set balance = balance - 1, updated_at = now() where user_id = s and balance > 0 returning balance into b;
  if b is null then raise exception 'no_hearts: plus de cœurs'; end if;
  insert into hdar.hearts_wallet as w (user_id, received) values (o, 1)
    on conflict (user_id) do update set received = w.received + 1, updated_at = now();
  insert into hdar.hearts_log (from_id, to_id) values (s, o);
  insert into hdar.rtc_signals (to_id, from_id, kind, payload) values (o, s, 'live-heart', '');
  return jsonb_build_object('balance', b);
end $$;
revoke all on function public.hdar_heart_send() from public, anon;
grant execute on function public.hdar_heart_send() to authenticated;
