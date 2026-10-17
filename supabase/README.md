Schema for the shared Supabase project that stores presence, private chat
(text, photos, voice notes), video-call signaling and shared places. The app
calls the `public.hdar_*` functions from the browser (`src/lib/hdar/live.ts`);
tables live in the private `hdar` schema.

- `hdar_live.sql` — presence, text chat, blocks, reports (migration `hdar_live`)
- `hdar_v2_media_calls_spots.sql` — photos/voice, call signaling, shared places
- `hdar_v3_profiles_area_inbox.sql` — public profiles, neighbourhood chat, conversations list
- `hdar_round_presence` (migration) — `hdar_pulse` stores presence on a ~200 m grid
- `hdar_v4_hide_conversations.sql` — per-user conversation deletion
- `hdar_v5_profile_album_voice.sql` — photo album (5) and voice intro on profiles
- `hdar_v6_admin_moderation.sql` — admin dashboard, visits, report reasons, bans
- `hdar_v23_monetization.sql` — boosts utilisateurs (`hdar.boosts`), annonces de lieux partenaires
  (`hdar.partner_listings`, prolonge `places.partner_until`), `hdar_boosted()` pour le halo sur la carte,
  RPC admin de gestion manuelle (pas de paiement en ligne).
- `hdar_v24_analytics.sql` — statistiques persistantes après les purges : `activity_hourly` (présence par
  carreau ~1 km et par heure, sans identifiant, cron `hdar-stats-snapshot` toutes les 10 min), `msg_hourly`,
  `user_daily`, `place_daily`, `place_visitors` (triggers sur les messages, `hdar_hit`, `hdar_profile_get`,
  `hdar_place_get`) ; RPC admin `hdar_admin_overview/heat/week/top_places/influencers`. Appliqué en
  `hdar_v24_analytics` + correctifs `hdar_v24b_analytics_fix` (variable_conflict) et `hdar_v24c_revoke_triggers`
  (déjà intégrés au fichier).

## v25 — Avis, espace pro, paiements Stripe

Migrations `hdar_v25_selfserve`, `hdar_v25b_portal`. Fonctions edge `hdar-checkout` (JWT requis) et `hdar-stripe-webhook` (sans JWT, signature Stripe vérifiée).

Pour activer les paiements (Supabase → Edge Functions → Secrets) :
1. `STRIPE_SECRET_KEY` = clé secrète Stripe (`sk_live_…`, ou `sk_test_…` pour tester).
2. Stripe → Développeurs → Webhooks → Ajouter un endpoint :
   `https://hoomzhgqzwuystwburfa.supabase.co/functions/v1/hdar-stripe-webhook`
   Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
3. `STRIPE_WEBHOOK_SECRET` = secret de signature de cet endpoint (`whsec_…`).
4. Stripe → Paramètres → Billing → Portail client : activer (pour « Gérer / résilier mon abonnement »).
Tant que `STRIPE_SECRET_KEY` manque, /pro affiche « Paiement bientôt disponible ». Prix : table `hdar.pricing` (onglet admin « Tarifs »).

## v61 — Prospection automatique des établissements pros

Migration `hdar_v61_prospection.sql` + fonction edge `hdar-prospect` (déployer **sans vérification JWT** : elle vérifie
elle-même la clé cron ou le compte admin). Page publique `/pro/invitation/<jeton>`, onglet admin « Prospection pro ».

Chaîne : collecte OpenStreetMap chaque lundi (bars/clubs/saunas `lgbtq=primary|only`, `gay=yes`, `amenity=swingerclub`)
→ recherche de l'email sur le site (accueil, contact, mentions légales) → fiche lieu cachée pré-créée (`source = 'prospect'`,
jeton de revendication) → 3 emails (J0, J+4, J+10, en semaine 9 h–17 h, plafond/jour réglable) → page d'invitation
→ `/pro?claim=` → paiement Stripe → fiche en ligne. Statuts mis à jour par trigger (revendiquée, payée) ; désinscription
définitive en un clic (empreinte md5 dans `hdar.prospect_optout`). **L'envoi est coupé par défaut** (onglet admin).

Secrets (Edge Functions → Secrets) :
- `RESEND_PRO_KEY` (ou `BREVO_PRO_KEY`) : clé d'envoi **d'un domaine dédié** (ex. `pro.hdar.chat`) pour ne pas abîmer la
  réputation de `contact@hdar.chat`. Vérifier que les conditions du fournisseur autorisent la prospection B2B.
- `PRO_FROM` (ex. `Jérémy de hdar <jeremy@pro.hdar.chat>`), `PRO_REPLY_TO` (défaut `contact@hdar.chat`),
  `PRO_LEGAL` (raison sociale + adresse, affichées en pied d'email : obligatoire pour la prospection).
