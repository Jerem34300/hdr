-- hdar v12 — modération AUTOMATIQUE de la photo principale (pas de validation manuelle)
-- * Nouvelle photo principale publiée tout de suite ('approved').
-- * Passe en attente ('pending', visible seulement par son auteur, file /admin) si :
--   - le contrôle NSFW du navigateur la signale (hdar_photo_flag),
--   - 2 personnes différentes signalent le profil,
--   - c'est une photo déjà refusée par un admin (empreinte md5).
create table if not exists hdar.rejected_photos (
  hash text primary key,
  rejected_at timestamptz not null default now()
);
alter table hdar.rejected_photos enable row level security;

create or replace function hdar.photo_moderation_trg() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.photo is null then
    new.photo_status := null;
  elsif tg_op = 'INSERT' or new.photo is distinct from old.photo then
    new.photo_changed_at := now();
    new.photo_status := case
      when exists (select 1 from hdar.rejected_photos r where r.hash = md5(new.photo)) then 'pending'
      else 'approved' end;
  end if;
  return new;
end $$;

-- Remet en ligne les photos mises en attente par la v10 (aucune n'avait été vérifiée).
update hdar.profiles set photo_status = 'approved' where photo_status = 'pending';

create or replace function public.hdar_photo_flag(p_self text, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s text := hdar.self_id();
begin
  perform hdar.rate_check(s, 'flag', 10, interval '1 hour');
  update hdar.profiles set photo_status = 'pending', photo_changed_at = now()
    where user_id = s and photo is not null;
end $$;
revoke execute on function public.hdar_photo_flag(text, text) from public, anon;
grant execute on function public.hdar_photo_flag(text, text) to authenticated;

create or replace function hdar.report_photo_trg() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(distinct r.reporter_id) from hdar.live_reports r
      where r.target_id = new.target_id and r.handled_at is null) >= 2 then
    update hdar.profiles set photo_status = 'pending'
      where user_id = new.target_id and photo_status = 'approved';
  end if;
  return new;
end $$;
drop trigger if exists live_reports_photo on hdar.live_reports;
create trigger live_reports_photo after insert on hdar.live_reports
  for each row execute function hdar.report_photo_trg();
revoke execute on function hdar.report_photo_trg(), hdar.photo_moderation_trg() from public, anon, authenticated;

create or replace function public.hdar_admin_photo_review(p_key text, p_id text, p_ok boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare o text := lower(left(coalesce(p_id, ''), 80));
begin
  perform hdar.admin_check(p_key);
  if p_ok then
    update hdar.profiles set photo_status = 'approved' where user_id = o and photo is not null;
  else
    insert into hdar.rejected_photos (hash)
      select md5(p.photo) from hdar.profiles p where p.user_id = o and p.photo is not null
      on conflict do nothing;
    update hdar.profiles
      set album = case when jsonb_typeof(album) = 'array' and album ->> 0 = photo then album - 0 else album end,
          photo = null
      where user_id = o;
  end if;
end $$;
