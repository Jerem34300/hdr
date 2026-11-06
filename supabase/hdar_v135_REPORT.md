# v135 — Rapport concurrence Micro (pas encore en prod)

## Inventaire appels à l'ouverture (avant → après)

| Source | RPC | Avant | Après |
|--------|-----|-------|-------|
| usePlaces | hdar_places | jusqu'à **12** tuiles 1° en parallèle | **1** monde / 10 min, filtre client |
| useToilets | hdar_toilets | chaque pan @400 ms | tuile 0,05° TTL 5 min, délai 700 ms |
| useOutings | hdar_outings | chaque pan @450 ms | tuile + délai 1100 ms |
| useTransit | hdar_transit / Overpass | 700 ms | 1400 ms (stagger) |
| live_map | hdar_live_map | **15 s** | **30 s** (idle 60 s) |
| conversations | hdar_conversations | 15 s / idle 2 min + nudge | inchangé (déjà OK) |
| salon-inbox | hdar_salons_inbox | **5 s** inbox / 15 s | **30 s** / idle 2 min + nudge dm\|salon |
| activity | hdar_activity | 40–50 s | inchangé |
| presence | hdar_rooms_online / room_here | 20 s / 30–40 s | 40–50 s / 45–60 s |
| DM open | read_thread | 3 s / idle 30 s | 5 s / idle 45 s |
| meetup | meet_state | 4 s / 8 s | 12 s / 30 s |
| gate RPC | tous live.ts + ads.ts | illimité | **max 3** en vol / client |

## Mesures SQL (prod, 2026-11-06)

| Requête | Avant | Après (v135, mesuré hors apply) |
|---------|-------|----------------------------------|
| hdar_places bbox FR (v134) | ~4 ms | ~4 ms (inchangé, timeout 2 s) |
| toilets Paris bbox sur `places` | **~171 ms** (400 rows) | — |
| toilets Paris sur table mince `toilets_pin` | — | **~0,26 ms** |
| toilets Montpellier | ~0,5 ms | ~0,3 ms attendu |
| places total / toilets / cache | 127 772 / 33 284 / 1 987 pins | idem |

## Fichiers

- SQL : `supabase/hdar_v135_concurrency.sql` (**pas appliqué**)
- Client : `gate.ts`, `live.ts`, `ads.ts`, `salon-inbox.ts`, `places-layer.tsx`, `map-view.tsx`, `live-chat.tsx`, `meetup.ts`, `presence.ts`, `transit.ts`

## Plafond réaliste Micro (pool PostgREST = 10, Auth = 10)

- **Avant v134+v135** : plantage PGRST003 dès ~3–5 (places 2–7 s).
- **Après v134 seul** : carte lieux OK, mais fan-out + toilets Paris + salon 5 s restent risqués.
- **Après v134 + client v135 + SQL v135** (estimation) :
  - **carte + discussion légère** : **~40–80** simultanés si Realtime connecté et peu de fan-out.
  - **1 000** : **impossible** sur Micro (Auth 10 + PostgREST 10 + CPU partagé). Architecture Realtime est la bonne direction ; le plafond matériel reste Small (~80–200) puis Large (~500–1000) selon mix chat/carte.

## Ce qui nécessite encore Small/Large

- Auth capped at 10 absolute connections (advisor).
- PostgREST pool 10.
- Realtime fan-out + Postgres CPU sous 1000 WebSockets.
- `hdar_salons_inbox` reste une RPC lourde (100 salons × counts) — allégée côté fréquence, pas encore réécrite.

## Go-live

Attendre feu vert Jérémie (widget) avant `apply_migration` v135 et deploy Netlify.
