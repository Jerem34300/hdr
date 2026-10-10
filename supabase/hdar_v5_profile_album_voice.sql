-- Applied as migration `hdar_profile_album_voice`.
-- Album of up to 5 photos (first = main photo) and a 10 s voice intro.
-- hdar_profile_save replaces hdar_profile_set for the app; hdar_profile_extras
-- returns album + voice only when a profile page is opened.
alter table hdar.profiles
  add column if not exists album jsonb not null default '[]'::jsonb,
  add column if not exists voice text,
  add column if not exists voice_sec int;
-- See the migration in Supabase for the full function bodies:
--   public.hdar_profile_save(p_self, p_pseudo, p_age, p_bio, p_tags, p_photos jsonb, p_voice, p_voice_sec)
--     keeps up to 5 data:image/(jpeg|png|webp) entries of <= 400 kB, voice data:audio/* <= 300 kB, 1-10 s
--   public.hdar_profile_extras(p_self, p_id) -> (album jsonb, voice text, voice_sec int), blocked users get nothing
