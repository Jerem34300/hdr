-- v143 : la vraie cause du journal des connexions vide depuis le 18 oct. : dans le trigger, la variable
-- « ip » portait le même nom que la colonne hdar.connection_log.ip, et PostgreSQL refusait l'écriture
-- (« column reference "ip" is ambiguous », relevé par le diagnostic v141 le 9 nov.). L'erreur était
-- avalée, d'où un journal vide sans message. La variable devient v_ip ; le reste est identique à v141.
-- Applied as migration hdar_v143_connection_log_ambiguous.

create or replace function hdar.log_connection_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h jsonb; v_ip text;
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
  v_ip := nullif(btrim(split_part(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-forwarded-for', h ->> 'x-real-ip',
          h ->> 'true-client-ip', h ->> 'x-client-ip', h ->> 'x-envoy-external-address', ''), ',', 1)), '');
  if v_ip is null then
    if not exists (select 1 from hdar.connection_log_diag where at > now() - interval '1 hour') then
      insert into hdar.connection_log_diag (header_names, note)
      values ((select array_agg(k order by k) from jsonb_object_keys(h) k), 'aucune adresse IP');
    end if;
    return null;
  end if;
  insert into hdar.connection_log as c (user_id, ip, ua) values (new.id, left(v_ip, 64), left(h ->> 'user-agent', 300))
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
