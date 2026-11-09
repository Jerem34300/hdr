-- v141 : le journal des connexions (v64) est resté VIDE du 18 oct. au 9 nov. alors que le trigger est
-- actif et que hdar_hit tourne (~10 appels/h la nuit) : l'adresse IP n'arrive pas dans l'en-tête lu
-- (x-forwarded-for / x-real-ip), et le trigger avale toute erreur. Correction :
-- - plusieurs en-têtes possibles (cf-connecting-ip, x-forwarded-for, x-real-ip, true-client-ip,
--   x-client-ip, x-envoy-external-address) ;
-- - si aucune adresse n'est trouvée, on note les NOMS des en-têtes reçus (jamais leurs valeurs) dans
--   hdar.connection_log_diag, gardé 7 jours, pour savoir lequel utiliser.
-- Applied as migration hdar_v141_connection_log_fix.

create table if not exists hdar.connection_log_diag (
  at timestamptz not null default now(), header_names text[], note text);
alter table hdar.connection_log_diag enable row level security;
revoke all on hdar.connection_log_diag from anon, authenticated;

create or replace function hdar.log_connection_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h jsonb; ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    insert into hdar.connection_log_diag (note) values ('request.headers illisible');
    return null;
  end;
  if h is null then
    if not exists (select 1 from hdar.connection_log_diag where at > now() - interval '1 hour') then
      insert into hdar.connection_log_diag (note) values ('request.headers absent');
    end if;
    return null;
  end if;
  ip := nullif(btrim(split_part(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-forwarded-for', h ->> 'x-real-ip',
          h ->> 'true-client-ip', h ->> 'x-client-ip', h ->> 'x-envoy-external-address', ''), ',', 1)), '');
  if ip is null then
    if not exists (select 1 from hdar.connection_log_diag where at > now() - interval '1 hour') then
      insert into hdar.connection_log_diag (header_names, note)
      values ((select array_agg(k order by k) from jsonb_object_keys(h) k), 'aucune adresse IP');
    end if;
    return null;
  end if;
  insert into hdar.connection_log as c (user_id, ip, ua) values (new.id, left(ip, 64), left(h ->> 'user-agent', 300))
  on conflict (user_id, ip) do update set last_at = now(), hits = c.hits + 1, ua = coalesce(excluded.ua, c.ua);
  return null;
exception when others then
  begin
    if not exists (select 1 from hdar.connection_log_diag where at > now() - interval '1 hour') then
      insert into hdar.connection_log_diag (note) values (left('erreur : ' || sqlerrm, 300));
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke execute on function hdar.log_connection_trg() from public, anon, authenticated;

create or replace function hdar.connection_log_purge() returns void
language sql security definer set search_path = '' as $$
  delete from hdar.connection_log where last_at < now() - interval '1 year';
  delete from hdar.admin_reads where at < now() - interval '1 year';
  delete from hdar.connection_log_diag where at < now() - interval '7 days';
$$;
