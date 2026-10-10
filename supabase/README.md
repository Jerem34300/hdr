Schema for the shared Supabase project that stores presence, private chat
(text, photos, voice notes), video-call signaling and shared places. The app
calls the `public.hdar_*` functions from the browser (`src/lib/hdar/live.ts`);
tables live in the private `hdar` schema.

- `hdar_live.sql` — presence, text chat, blocks, reports (migration `hdar_live`)
- `hdar_v2_media_calls_spots.sql` — photos/voice, call signaling, shared places
- `hdar_v3_profiles_area_inbox.sql` — public profiles, neighbourhood chat, conversations list
