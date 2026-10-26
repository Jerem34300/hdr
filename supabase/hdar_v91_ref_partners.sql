-- hdar v91 — Partenaires / promos payantes : lien court hdar.chat/x/<nom> (redirection Netlify vers /?ref=<ref>).
-- Ajoute aux stats ?ref= : appareils uniques (1re arrivée de l'appareil par ce lien) et codes FIRST utilisés
-- par les profils venus du lien. Toujours sans IP ni identifiant d'appareil côté serveur. Additif.

alter table hdar.ref_daily add column if not exists devices int not null default 0;

-- Ancienne signature (text) remplacée : p_new = true seulement la 1re fois que l'appareil arrive par ce lien.
drop function if exists public.hdar_ref_visit(text);
create or replace function public.hdar_ref_visit(p_ref text, p_new boolean default false) returns void
language plpgsql security definer set search_path to '' as $$
declare r text := lower(left(trim(coalesce(p_ref, '')), 32)); u uuid := auth.uid(); today date := (now() at time zone 'Europe/Paris')::date;
  dv int := case when coalesce(p_new, false) then 1 else 0 end;
begin
  if r !~ '^[a-z0-9_-]{1,32}$' then return; end if;
  if u is not null then perform hdar.rate_check('refv:' || u::text, 'ref_visit', 30, interval '1 hour'); end if;
  if not exists (select 1 from hdar.ref_daily where day = today and ref = r)
     and (select count(*) from hdar.ref_daily where day = today) >= 200 then return; end if;
  insert into hdar.ref_daily as d (day, ref, visits, devices) values (today, r, 1, dv)
  on conflict (day, ref) do update set visits = d.visits + 1, devices = d.devices + dv;
end $$;
revoke all on function public.hdar_ref_visit(text, boolean) from public;
grant execute on function public.hdar_ref_visit(text, boolean) to anon, authenticated;

-- Admin « Provenance » : + appareils uniques et codes FIRST (utilisés par un profil rattaché à la ref).
create or replace function public.hdar_admin_refs(p_key text, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 400); since date := (now() at time zone 'Europe/Paris')::date - (d - 1);
begin
  perform hdar.admin_check(p_key);
  return jsonb_build_object(
    'days', d,
    'total', coalesce((select jsonb_agg(t order by t.visits desc, t.ref) from (
        select k.ref, coalesce(v.n, 0) visits, coalesce(v.dv, 0) devices, coalesce(p.n, 0) profiles, coalesce(f.n, 0) first_uses,
               case when coalesce(v.n, 0) > 0 then round(100.0 * coalesce(p.n, 0) / greatest(coalesce(nullif(v.dv, 0), v.n), 1), 1) end conv
        from (select ref from hdar.ref_daily where day >= since union select ref from hdar.profile_refs where (at at time zone 'Europe/Paris')::date >= since) k
        left join (select ref, sum(visits)::int n, sum(devices)::int dv from hdar.ref_daily where day >= since group by ref) v on v.ref = k.ref
        left join (select ref, count(*)::int n from hdar.profile_refs where (at at time zone 'Europe/Paris')::date >= since group by ref) p on p.ref = k.ref
        left join (select r.ref, count(*)::int n from hdar.gift_code_uses u join hdar.profile_refs r on r.user_id = u.user_id
                   where upper(u.code) = 'FIRST' and (u.at at time zone 'Europe/Paris')::date >= since group by r.ref) f on f.ref = k.ref) t), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(t order by t.day desc, t.visits desc) from (
        select k.day, k.ref, coalesce(v.visits, 0) visits, coalesce(v.devices, 0) devices, coalesce(p.n, 0) profiles, coalesce(f.n, 0) first_uses,
               case when coalesce(v.visits, 0) > 0 then round(100.0 * coalesce(p.n, 0) / greatest(coalesce(nullif(v.devices, 0), v.visits), 1), 1) end conv
        from (select day, ref from hdar.ref_daily where day >= since
              union select (at at time zone 'Europe/Paris')::date, ref from hdar.profile_refs where (at at time zone 'Europe/Paris')::date >= since) k
        left join hdar.ref_daily v on v.day = k.day and v.ref = k.ref
        left join (select (at at time zone 'Europe/Paris')::date as day, ref, count(*)::int n from hdar.profile_refs group by 1, 2) p on p.ref = k.ref and p.day = k.day
        left join (select (u.at at time zone 'Europe/Paris')::date as day, r.ref, count(*)::int n from hdar.gift_code_uses u
                   join hdar.profile_refs r on r.user_id = u.user_id where upper(u.code) = 'FIRST' group by 1, 2) f on f.ref = k.ref and f.day = k.day) t), '[]'::jsonb));
end $$;
revoke all on function public.hdar_admin_refs(text, int) from public, anon;
grant execute on function public.hdar_admin_refs(text, int) to authenticated;

insert into hdar.ref_links (ref, label, with_code) values ('expose_twittos', 'Promo X payante @expose_twittos — lien court hdar.chat/x/expose', false)
on conflict (ref) do nothing;
