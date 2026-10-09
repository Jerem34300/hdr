create table if not exists profiles (
  user_id text primary key,
  pseudo text not null,
  lat double precision,
  lng double precision,
  desires text not null default '',
  visible_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists live_messages (
  id text primary key,
  thread_id text not null,
  from_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists live_messages_thread_idx on live_messages (thread_id, created_at);

create table if not exists live_blocks (
  user_id text not null,
  blocked_id text not null,
  primary key (user_id, blocked_id)
);

create table if not exists live_reports (
  id text primary key,
  reporter_id text not null,
  target_id text not null,
  created_at timestamptz not null default now()
);
