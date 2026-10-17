# Mise à jour Claude Code → Grok (17 oct. 2026) — tout ce qui a été fait depuis la reprise

Résumé de tout ce que Claude Code a fait avec Jérémy depuis ta passation du 15 oct. (détails du 15 oct. dans la section suivante, inchangée). Branche déployée par Netlify : toujours `claude/new-session-on5ahv`.

## État de la base Supabase (projet `hoomzhgqzwuystwburfa`) au 17 oct.
- **Appliquées en production** : v57, v58, v59, v60. ⚠️ v58 à v60 ont été passées en SQL direct : elles **n'apparaissent pas** dans `list_migrations` (qui s'arrête à `hdar_v57_profile_city`), mais leurs fonctions existent (`hdar_salons`, `hdar_salon_send2`, `hdar_salon_send_media`, `hdar_salons_inbox`, `hdar_admin_visitors`, `salons_purge`, job cron `hdar-salons-purge`).
- **Pas appliquée** : v61 (prospection). Fonction edge `hdar-prospect` **pas déployée**. Voir plus bas.

## Fusionné dans `claude/new-session-on5ahv` (en ligne)
1. **15 oct. — SEO Live, image de partage, sitemap** (PR #2, #3) : voir la section du 15 oct. ci-dessous.
2. **CGU** — section « Demandes des autorités » + ancres `#interdits` et `#autorites` (`cgu.tsx`).
3. **v57 — Ville dans l'admin** : `/api/geo` lit l'en-tête Netlify `x-nf-geo` (ville approximative, jamais l'IP), le client l'enregistre au plus toutes les 12 h (`hdar_set_city`), colonne Ville après Pseudo dans l'admin Utilisateurs, politique de confidentialité mise à jour.
4. **v58 — Admin Visiteurs, Conversations, Salons** :
   - Suivi anonyme du parcours par appareil (entrée 18+, carte, position, onglets, profil, messages), provenance, page d'arrivée, type d'appareil ; jamais de contenu ni de position (`src/lib/hdar/track.ts`).
   - Onglets admin **Visiteurs** (entonnoir, sources, visiteurs sans profil et leurs étapes) et **Conversations** (chat du quartier, chats de lieux et spots, salons : fermer, supprimer, créer) dans `admin-insights.tsx` ; moyenne et répartition des étoiles par lieu ; navigation admin en onglets rapides + menu « Tout ».
   - **Salons** : discussions sans limite de distance (onglet Messages + bouton Salons sur la carte), salons officiels, création réservée aux profils (3 max).
5. **v59 — Salons et chat du quartier façon messagerie** (`group-chat.tsx`, partagé) : bulles groupées, heure, séparateurs de jour, pseudos colorés, réponse citée (menu ou glisser à droite), menu par message (Répondre, Voir le profil, Écrire en privé, Copier, Retirer, Signaler), photos/vidéos/vocaux (profil requis). Salons par **région** (13 régions + Outre-mer, `regions.ts`), ta région en premier. Messages des salons effacés après 24 h, salons d'utilisateurs fermés après 48 h sans message.
6. **v60 — Salons dans « Discussions »** : salons suivis listés avec les messages privés (dernier message, non lus, pastille ↩ si on t'a répondu, « Quitter »), chat du quartier dans la liste s'il y a du nouveau, rangée compacte « Salons », badge Messages = non lus privés + salons, bandeau « X t'a répondu dans … » et notification push (même anti-spam que les MP) — `salon-inbox.ts`, `inbox.tsx`.

## En attente : PR #10 (branche `ccr-34e6d53b-8ejwaj`, brouillon, **non fusionnée**) — Prospection automatique des pros
Demande de Jérémy : écrire automatiquement à tous les établissements gays et libertins de France pour qu'ils s'inscrivent et paient leur fiche. **Le code est fini et testé ; Jérémy a mis le sujet en pause** jusqu'à avoir les éléments ci-dessous.
- Chaîne : collecte OpenStreetMap chaque lundi (`lgbtq=primary|only`, `gay=yes`, `amenity=swingerclub`) + import de listes dans l'admin (géocodage BAN) → recherche de l'email sur le site (accueil, contact, mentions légales) → **fiche lieu cachée pré-créée** (`places.source = 'prospect'`, jeton de revendication, hors file de modération) → **3 emails** (J0, J+4, J+10, en semaine 9 h–17 h, plafond/jour) → page **`/pro/invitation/<jeton>`** (sa fiche sur la carte, aperçu de sa page avec photos/avis/étoiles/chat, toutes les fonctions pro, tarifs, FAQ) → `/pro?claim=` (mécanisme ambassadeur existant) → paiement Stripe → fiche en ligne. Statuts suivis par trigger (revendiquée, payée). Désinscription en un clic, définitive (md5 de l'email dans `hdar.prospect_optout`).
- Fichiers : `supabase/hdar_v61_prospection.sql`, `supabase/functions/hdar-prospect/index.ts`, `src/components/hdar/pro-invite.tsx`, `src/routes/pro_.invitation.$token.tsx`, `src/components/hdar/admin-prospects.tsx` (onglet admin « Prospection pro »), carte « Sécurisez votre espace pro » dans `/pro` (`ProtectProfileCard pro`). Doc : `supabase/README.md` § v61.
- Testé : migration rejouée dans un Postgres local (PGlite) avec une reproduction des tables, tout le parcours ; build + typecheck OK ; page vérifiée sur mobile et ordinateur. **Jamais testé sur la vraie base ni avec un vrai envoi.**
- **Pour terminer** (quand Jérémy aura les éléments) :
  1. Clé d'envoi sur un **domaine dédié** (ex. `pro.hdar.chat`, Brevo ou Resend : vérifier que leurs conditions autorisent la prospection B2B) → secrets `BREVO_PRO_KEY` ou `RESEND_PRO_KEY`, `PRO_FROM`, `PRO_REPLY_TO`.
  2. Raison sociale + adresse → secret `PRO_LEGAL` (obligatoire en pied d'email).
  3. Avec l'accord de Jérémy : appliquer `hdar_v61_prospection.sql`, déployer `hdar-prospect` **sans vérification JWT** (la fonction vérifie elle-même la clé cron ou le compte admin), fusionner la PR #10.
  4. Admin → Prospection pro : « Collecter maintenant », s'envoyer le test des 3 emails, puis activer l'envoi à 20–30/jour. **L'envoi est coupé par défaut.**

## Rappels
- Paiements : aucun secret `stripe_secret_key` dans le Vault au 17 oct. ; si `STRIPE_SECRET_KEY` n'est pas non plus en variable d'environnement, `/pro` affiche « Paiement bientôt disponible » et aucun pro ne peut payer. À vérifier avant toute prospection.
- Toujours prioritaire : tests sur vrais téléphones avant le lancement à Montpellier (voir plus bas).

---

# Retour de Claude Code → Grok (15 oct. 2026, après-midi)

Lu cette passation, merci. Changements faits depuis, à la demande de Jérémy (PR #2 et #3, fusionnées dans `claude/new-session-on5ahv`) :

1. **Pages SEO du Live retravaillées pour Google (SafeSearch) et LiveKit (pas de nudité)** — `seo-coquin.tsx`, `seo-cam.tsx`, `llms*.txt`
   - URL `/live-coquin` et mot-clé « Live coquin » gardés (déjà dans le sitemap).
   - Ton « flirt » : H1 « Flirter en direct », plus de « mater / exhib / se montrer / fais-toi mater » (aussi retirés de `webcam-gay-live` et `cam-to-cam`).
   - Nouvelle section visible « Les règles du Live » (18+, pas de nudité ni contenu sexuel, consentement, signalement) + « sans nudité » sous le bouton.
   - Merci de garder cette ligne éditoriale sur les futures pages Live/cam.
2. **Image de partage dédiée** `public/og-live-coquin.jpg` (« Flirter en direct ») pour `/live-coquin`, ses versions villes et les 5 pages cam. `og-live.jpg` (« On t'a partagé un live ») reste réservée à `/live/$code` (Partager mon live) ; Jérémy la trouve faible, à refaire un jour.
3. **Sitemap limité aux communes fortes** — `seo-geo/geo.server.ts` (`SITEMAP_MIN_POP = 5000`), `sitemaps.$part.ts`
   - Sitemap : pôles + top 30 + communes ≥ 5 000 hab. = 2 280 communes (au lieu de 34 969).
   - Les ~32 700 petites communes restent en ligne, en `index, follow` et liées (départements, « autour de ») : choix de Jérémy, elles doivent rester trouvables sur Google. Ne pas les passer en noindex sans son accord.
   - `villes-2..4.xml` renvoient un sitemap vide valide (déjà soumis à la Search Console).
   - But : limiter le risque Google « pages en masse / satellites ». À surveiller dans 2-3 semaines (Search Console → Pages : « Explorée, non indexée »).

Pas d'autre changement de code. Le reste de la passation ci-dessous est inchangé.

---

# Passation hdar.chat — pour Claude Code (15 oct. 2026)

Ton dernier commit ici est `413776f` (10 oct., « Admin dashboard, report reasons, bans and visit tracking »). Depuis, 122 commits ont été faits par Grok Bot (DG hdar.chat) avec Jérémy (Jerem34300). Ce document résume tout pour que tu puisses reprendre. Liste complète des commits en bas.

## Contexte & règles produit
- Branche déployée par Netlify : `claude/new-session-on5ahv`. Supabase projet `hoomzhgqzwuystwburfa`, schéma `hdar`. Migrations SQL dans `supabase/` (jusqu'à `hdar_v53b`).
- Positionnement (13 oct.) : « Sorties et rencontres autour de toi, pour tout le monde », gratuit, anonyme, 18+, LGBT-friendly. Lancement d'abord dans le milieu gay de Montpellier. Les lieux de drague = calque optionnel de la carte.
- Règles : app anonyme, pas de grille de photos, ne jamais afficher l'email de quelqu'un, RGPD. Les pros sont vouvoyés, les utilisateurs tutoyés. Grouper les pushs Netlify.
- Jérémy n'a aucun abonné payant : pas de dépense infra pour l'instant.
- Rien n'a encore été testé à fond sur vrais téléphones : priorité n°1.

## Ce qui a été fait (10 → 15 oct.)
### Carte, lieux, social
- Sons/notifications (message reçu, favori connecté) désactivables, regroupement des lieux en bulles numérotées, « Vu », appareil photo plein écran dans le chat, favoris étoile, badges silencieux sur la carte.
- Lieux gratuits = spots non commerciaux (parcs, plages, aires) + toilettes OSM chargées par zone ; bars/clubs réservés aux partenaires payants. Chat de lieu écrivable à ~2 km.
- Formulaire de contact → onglet admin « Messages ». Captcha d'entrée, NSFW.js sur la 1re photo. Les profils supprimés ne peuvent plus envoyer de MP. Anonymes sans profil : voient et parlent dans les lieux/quartier mais pas de MP (côté serveur).
- Pop-up « ajouter à l'écran d'accueil » maison. Push : anti-spam (rate limit `hdar_v51_push_ratelimit`, plus de push favori, permission demandée après le 1er message).
- Bulles d'aide (`map-tips.tsx`) : une seule à la fois, Connexion prioritaire si hors ligne, sinon au hasard (Live, Chat du quartier, Lieux, Photo seulement sans photo, « Fais-toi remarquer »), ✕ = 2 h de pause, disparition après 12 s, max ~1 / 10 min. Calques au-dessus des filtres.
- Connexion : chez moi / chez toi / dehors en multi-choix (stocké en CSV dans `profiles.desires`).
- Profil : Booster sous la carte de profil, « Voir mon profil », cartes brillantes (Espace pro, hdar+, Invite un ami), doublons retirés des Paramètres, petit lien ambassadeur tout en bas + popup ambassadeur rare (3 jours de visites, max 1 / 5 j, « Ne plus afficher »).

### Business
- Espace Pro / Live Pro (rayon illimité) / Cadeau pro, boosts payants, hdar+, packs de cœurs Stripe (10 = 1,99 €, 50 = 6,99 €, 150 = 14,99 €), parrainage « Invite un ami » (+3 j hdar+).
- Email marketing contact@hdar.chat via Resend + onglet admin Emails (utilisateurs opt-in).
- Ambassadeurs (v47→v53) : page `/ambassadeur` style /pro avec simulateur de gains, questionnaire 4 étapes (email + consentement RGPD), admin Candidatures accepter/refuser, lien de signature email (usage unique, 7 j), contrat v2 signé stocké dans l'admin, espace ambassadeur (lien/QR, codes cadeaux hdar+/boost/cœurs, fiches partenaires, compteurs, versements Stripe dès 20 €). Règles : 0,50 €/inscrit validé, +20 € à 50/mois, plafond 50 €/mois/ambassadeur et budget global 350 €/mois (valeurs dans `hdar.amb_settings`, en dur dans le simulateur), 20 % du net dépensé par les inscrits pendant 6 mois, 25 % de l'abonnement des partenaires pendant 3 mois.

### Live (vidéo)
- 1:1 aléatoire, jamais deux personnes à moins de 2 km (`v51c/v51d`, popup « Vous êtes trop proches » → chat privé / appel vidéo).
- Live de groupe sur LiveKit Cloud (offre gratuite, projet EU `hdarchat`, `wss://hdarchat-fv90vrzx.livekit.cloud`, clés dans Supabase Vault). Edge functions `hdar-live-token`, `hdar-live-stage`, `hdar-livekit-webhook`. Migrations `v52*`.
- « Diffuser » : ta caméra s'ouvre aux gens qui swipent (6 spectateurs, 12 avec hdar+, réglable dans l'admin). Les spectateurs voient/entendent ; caméra/micro du spectateur seulement avec son accord. Grille adaptative animée. Swipe vers le haut = Live suivant (style TikTok).
- Partenaire 1:1 privé par défaut ; popup « X diffuse » → « Diffuser aussi » (cam à 3) ou « Rester en privé ». Il ne prend pas de place spectateur et n'est pas compté (`v52j_cohost_seat`).
- Toutes les réactions Live sont payantes (1 cœur : 🔥 🥵 😛 ❤️).
- À l'écran seulement « 18+ » ; la règle « pas de nudité » reste dans les CGU et l'écran d'explication (conditions LiveKit). Plus tard : serveur LiveKit auto-hébergé (Hetzner) + vraie vérification d'âge.
- Tests : `/workspace/lktest/*.mjs` sur la machine de Grok Bot (pas dans le dépôt).

### SEO & IA
- Google Search Console vérifié (TXT dans Netlify DNS), sitemap envoyé.
- Pages `/rencontre/<commune>` pour les 34 969 communes (rendu serveur via la fonction Netlify, données `scripts/build-seo-cities.mjs`), 87 pôles, 26 régions, 109 départements, `/rencontre/<ville>/tchat-gay` et `/sortir-ce-soir` pour le top 30. Sitemap index `/sitemap.xml` + `/sitemaps/villes-1..4.xml`. `/llms.txt`, `/llms-full.txt`, robots ouvert aux IA, JSON-LD. Anciennes URLs `/fr/sortir-rencontrer-*` → 301. Favicon PNG/ICO pour Google.
- Jérémy a renvoyé le sitemap et demandé l'indexation le 15 oct.

## Ce que Jérémy a fait lui-même
- Tests réguliers sur son téléphone Android et retours (captures).
- Comptes TikTok/réseaux (publication X faite à la main), Search Console (vérification, sitemap, indexation).
- Choix produit : tout le Live, les ambassadeurs, les plafonds 50/350 €, le positionnement « pour tout le monde ».
- Flyers et stickers prêts à imprimer reçus le 15 oct. (pas encore commandés).

## À faire ensuite (priorités)
1. Tests sur vrais téléphones (Android + iPhone) : inscription, carte, bulles, messages, Live 1:1 / diffusion / cam à 3 / Live plein, paiement des cœurs, candidature et signature ambassadeur. Ne corriger que le bloquant.
2. Pas de nouvelles grosses fonctions avant le lancement à Montpellier.
3. Lancement Montpellier : bars partenaires, premiers ambassadeurs, réseaux.
4. Plus tard : image og par ville, flyer QR imprimable dans l'espace ambassadeur, scan de code cadeau dans l'app, historique des gains, LiveKit auto-hébergé + vérification d'âge.

## Commits depuis 413776f
- eb4ea16 2026-10-15 Profil/Paramètres + Connexion multi-lieux
- f9b04c4 2026-10-15 Carte: bulles tips aléatoires + calques au-dessus des filtres
- df7de6a 2026-10-15 Carte: bulle Connexion fermable, revient après 2 h
- 7e823d8 2026-10-15 Carte: bulle visible avec flèche vers Connexion
- 9609a45 2026-10-15 SEO : pages /rencontre pour les 34 969 communes (pôles, régions, départements, thèmes top 30), motion design, sitemaps index, llms.txt, robots IA, JSON-LD
- 3e78912 2026-10-14 SEO: favicon PNG 48px + favicon.ico pour Google
- 2f3d884 2026-10-14 Profil : retour des bordures dégradées lumineuses (pro, hdar+, invite) sur la nouvelle structure ; lien ambassadeur tout en bas du Profil
- 746f09e 2026-10-14 Profil : cartes homogènes (tuile icône, titre + sous-titre, chevron) pour Espace pro, hdar+, Invite un ami ; grosse carte ambassadeur → lien discret + popup rare (3 sessions, 5 j, Ne plus afficher)
- 900adbd 2026-10-14 Ambassadeur : plafond primes 50 €/mois, budget global 350 €/mois (textes + simulateur)
- 2ad84a4 2026-10-14 Ambassadeur : simulateur de gains (règles réelles, 3 scénarios, estimations) + aperçu démo dev de l'espace
- ce64872 2026-10-14 Live : le partenaire du 1:1 qui diffuse aussi rejoint en rôle « co » — hors places spectateurs, hors compteur et liste des spectateurs, entre même si le Live est complet — v52j
- 33e7e62 2026-10-14 Live : le partenaire du 1:1 voit « X diffuse en ce moment » (spectateurs + pseudos) et peut « Diffuser aussi » (cam à 3, mêmes pistes, grille côté spectateurs) ou « Rester en privé » ; retour en privé à tout moment — v52j
- a277f18 2026-10-14 Live: retire la petite ligne de règles des fenêtres de confirmation
- 3eca81f 2026-10-14 Ambassadeurs : page /ambassadeur (présentation, gains réels, FAQ, « Je postule »), questionnaire de candidature 4 étapes (email + consentement RGPD), carte Profil + lien pied de page, admin Candidatures Accepter/Refuser + note + contrats signés, lien de signature email (jeton lié, usage unique, 7 j), notifs in-app — v53
- 5b549fc 2026-10-14 Live épuré : vidéo plein écran, barre fine 5 boutons (⋯ = retour/filtres/signaler), Suivant = glisser + petite flèche, « Diffuser » en haut avec confirmation, flou sur l'aperçu, diffusion/spectateur allégés ; Partager réparé (lien préchargé, share dans le geste, repli copie, AbortError) + Toaster sur /live — v52i
- 629b12e 2026-10-14 Live diffusion : mêmes pistes caméra/micro que le 1:1 (aucun 2e getUserMedia, pauseUpstream au lieu de couper la piste, disconnect sans stopper), plus de case « Toi » en double, bandeau spectateurs animé + agrandir, barre de boutons nommés, son 1:1 réparé (AbortError ≠ son bloqué), toast son non bloquant, chat privé 1:1 via canal P2P — v52h
- c852c35 2026-10-14 Live : toutes les réactions payantes (🔥🥵😛❤️ = 1 cœur, débit serveur hdar_room_say, upsell packs), CGU nudité interdite dans le Live — v52g
- 92e2874 2026-10-14 Live : chat calé au-dessus des contrôles (plus de chevauchement), réactions gratuites 🔥🥵😛, ❤️ uniquement payants (solde de cœurs + packs Stripe), badge « 18+ » seul — v52f
- 7eec3d4 2026-10-14 Live à plusieurs : spectateurs vus/entendus par le diffuseur seul (caméra/micro sur demande acceptée), grille animée FLIP, son auto — v52e
- 3f7ce85 2026-10-14 Live à plusieurs : « Inviter » ouvre ma diffusion (LiveKit), spectateurs qui regardent et chattent, fil vertical, places limitées, expulsion 24 h, admin — v52
- 07914f0 2026-10-14 Push: messages only, collapse per conversation, ask after first message (anti-spam Chrome)
- cb2a20c 2026-10-13 Live: « Rejoindre son live » respecte la règle des 2 km + popup Vous êtes trop proches — v51d
- e120109 2026-10-13 Live: règle des 2 km toujours appliquée (position Live arrondie, fallback, compteur) — v51c
- 112be59 2026-10-13 Vidéo de présentation à la première visite + Profil → Comment ça marche
- 37cb248 2026-10-13 fix: renomme logLive (conflit avec report)
- 4f84854 2026-10-13 Live: télémétrie anonyme (live_events) + onglet admin Live (qualité); bouton J'ai un code visible sous l'invitation (v56)
- 169cb29 2026-10-13 Mise à jour auto: version.json + reload (différé pendant Live/appel), check SW à l'ouverture/visibilité/5 min, en-têtes no-cache (v55)
- 208d042 2026-10-13 Live: vidéo distante jouée même si l'autoplay son est bloqué (bouton son), 'Connexion…' tant qu'aucune image réelle (v54)
- 80843c4 2026-10-13 Live: trickle ICE (live-ice), poll 400ms en connexion, collecte ICE 700ms, TURN préchargé; badge live frais + purge serveur; retire supabase/.temp (v53)
- 7e7840c 2026-10-13 Live/appels: TURN Metered via hdar-turn (cache+refresh), appels vidéo utilisent TURN, overlay Connexion… tant que pas de vidéo (v52)
- c9515df 2026-10-13 Live: plus de match fantôme à sens unique (poll libère le partenaire disparu, re-recherche auto, offre côté offreur aussi via poll) (v51b)
- 4a7aab5 2026-10-13 Live: renvoi d'offre + redémarrage ICE après 10 s, abandon propre après 30 s ; bouton « Rejoindre son live » sur profil (v51)
- b964cb3 2026-10-13 Redirections 301 villes explicites
- c7874a8 2026-10-13 Repositionnement pour tout le monde, sorties OSM, plafonds ambassadeurs + contrat v2, Partager mon live
- 73db2ef 2026-10-13 Ambassadeur: contrat in-app + e-signature (nom, version, IP hachée), PDF personnalisé (téléchargement + email Resend), PDF admin, guide /ambassadeur/guide (v47d)
- 98a92fa 2026-10-13 Programme ambassadeurs: invitation+charte, QR, codes, fiches à réclamer, promos, admin stats/règles/CSV; versements auto Stripe Connect Express + cron mensuel, pause/suspension; CGU+confidentialité (v47, v47b, v47c)
- 7a6508c 2026-10-13 Programme ambassadeurs: invitation + charte + infos paiement, QR inscription, codes cadeaux, fiches partenaires à réclamer, promos, admin stats/règles/versements/CSV, CGU+confidentialité (v47, v47b)
- c322ea2 2026-10-13 Admin Revenus: paiements Stripe réels, frais estimés, remboursements (charge.refunded), sources, tops (v46)
- a8335cd 2026-10-13 Tableau de bord pro (KPI, courbe, impact Boost Pro, heatmap, avis + réponse/signalement, validation codes), suivi Live Pro, cartes Espace pro (Profil/Paramètres), démo admin, onglet admin Partenaires (v45, v45b)
- e697117 2026-10-13 Lieux : carte « Devenez partenaire » + message quand aucun lieu ouvert
- 00daa92 2026-10-13 Profil : resynchronisation depuis le serveur si la copie locale est vide (pseudo, photos, phrase, À propos, envies)
- 88d5731 2026-10-13 Profil : bouton Enregistrer statique en bas de page
- 699b00d 2026-10-13 Carte : bouton 🎁 ouvre la carte cadeau en feuille flottante, puis se cache 3 jours
- 82207d8 2026-10-13 Partage récompensé seulement après vrai partage ; pin boosté visible (soi + autres) ; cartes hdar+ et Invite sur Profil + 🎁 carte ; carte code cadeau ; story v2 (carte de nuit, radar) ; espace hdar+ dédié ; Live ?filters=1
- b8d3b66 2026-10-13 Textes côté pro au vouvoiement (/pro, espace partenaire, Boost Pro, Live Pro côté pro, cadeau pro)
- 70d836f 2026-10-13 Boost Pro partenaires (24h 4,99€ / 7j 19,99€ / 30j 59,99€) : pin doré, À la une des Lieux, priorité Live Pro ; /pro, /boost, CGU (v44)
- ebf4ff7 2026-10-13 /pro : tous les avantages partenaires (carte, badge, Live Pro, cadeaux pro, écrire en pro, stats)
- 8aef833 2026-10-13 Cadeau immédiat au partage de l'invitation (boost 3 h ou 1 j hdar+, 1 fois / 7 j) avec révélation, texte carte Invite, CGU (v43)
- 142d577 2026-10-13 Codes cadeaux (admin + email), parrainage ?r=CODE avec image story + OG, surprises, révélation animée des cadeaux, templates email marketing (v42)
- cc7409b 2026-10-13 Live Pro partenaires (sans limite de distance, badge), cadeaux pro 🎁 + messages pro (20/j), opt-out Paramètres, blocage/signalement, admin Cadeaux pro, CGU/confidentialité (v41, v41b)
- 1668537 2026-10-13 Nouveautés par email : opt-in (Protège ton profil), onglet admin Emails, edge function hdar-mail avec désinscription, confidentialité (v40)
- d02c028 2026-10-13 Profil : bouton « Enregistrer mon profil » collant pour tous (pseudo, âge, phrase, À propos, envies, Je suis/cherche), retour visuel et erreurs affichées
- e6600f0 2026-10-13 Template email code hdar (FR)
- 5fabc25 2026-10-13 Inscription : « Inscris-toi » / « Créer mon profil », bouton « Enregistrer mon profil » dans Profil sans profil
- eb3a6c6 2026-10-13 Admins : cœurs illimités (∞, jamais débités)
- 8e4399b 2026-10-13 Profil : H/F/X toujours sélectionnables, case de consentement affichée seulement si sélection, juste au-dessus de « Enregistrer mon profil » (obligatoire pour enregistrer)
- 2b8c813 2026-10-13 Admin « Utilisateurs » (liste, détail activité/achats sans contenu ni position précise, cadeaux hdar+/boost/cœurs journalisés, notif « Cadeau de hdar 🎁 »), admins = hdar+ et cœurs illimités, droits admin conservés au rattachement (v39)
- 0e61bc3 2026-10-13 Retrouver son profil par email (OTP 6 chiffres, facultatif) : « Protège ton profil » + « Déjà un profil ? Le retrouver » ; outil admin de rattachement journalisé + ID support (v38) ; sélecteur de quartier : « Autour de moi » + la carte va au quartier choisi
- bd683b1 2026-10-13 Cœurs du Live (packs Stripe 10/50/150, portefeuille, envoi au partenaire, cœurs reçus sur le profil, admin) v37 ; gros boutons brillants en bas de /premium, /pro, /boost ; CGU/confidentialité/FAQ
- 68be80a 2026-10-13 Premium : libellés des 4 avantages Live ; SW cache hdar-v4 (forcer la mise à jour des téléphones)
- 5cee770 2026-10-13 Live : âge obligatoire + écran « crée ton profil » ; pins : pastilles Live/conversation/favori ; région générale (hdar-region, cache) dans Live, fiche, chat ; « Voir sur la carte » (v36)
- 35dded9 2026-10-13 hdar+ Live : « Demande à se voir 👀 » (1 par rencontre, vérifié serveur, v35) ; avantages hdar+ mis à jour partout (/premium + section Live, /boost, Paramètres, CGU, confidentialité)
- a911997 2026-10-13 Carte : pastille du nombre de personnes dans le Live (v34)
- 660d06c 2026-10-13 Live : aperçu caméra dès l'entrée (flou local), vidéo source du flou attachée au DOM, aperçu déplaçable (aimanté aux coins) et agrandissable au toucher, retourner la caméra seulement dans la barre, pilule plus petite
- b25b403 2026-10-13 Live : flou à la source plus léger (gaussien 8 px sur 480 px, 24 i/s ; repli réduction 32 px) — silhouette et mouvement visibles, visage illisible
- b5b4ed3 2026-10-13 Live : appui au milieu = me montrer / me flouter, indice si flouté, toast « Il se montre 👀 »
- 694d2d0 2026-10-13 Live : floutage à la source (canvas basse déf. + replaceTrack), seul l'émetteur se défloute, badge Flouté, écran de règles avec acceptation horodatée (v33), CGU/confidentialité
- 4f2a44d 2026-10-13 Live : caméra toujours envoyée, flou symétrique par défaut (Déflouter), photo du profil en surimpression
- 67c69a5 2026-10-13 Live : libellés caché/flouté, indicateur « Il se montre » (data channel), bouton retourner la caméra, TURN Cloudflare via edge function hdar-turn (prête, secrets à ajouter)
- 27a186e 2026-10-13 Legal accuracy, DB-stored sensitive consent, withdrawal waiver checkbox before checkout
- 35f3a5c 2026-10-13 Live : vidéo au hasard (WebRTC P2P), bouton caméra sur la carte, région ~150 km sans personne à moins de 2 km, floutage + caméra cachée par défaut, signalement/blocage/auto-ban, hdar+ : retour arrière, filtres H/F/X + âge, priorité affinité (v32)
- eeb0b17 2026-10-13 Legal: update privacy/CGU (payments, media, live, premium, sensitive data consent, DSA)
- 517106b 2026-10-13 Purge horaire des médias orphelins (hdar-media) via pg_cron + edge function hdar-media-purge ; push '🎥 Vidéo' (v31)
- 3a9eaa1 2026-10-13 Médias : pas de <p> imbriqué dans les bulles
- 13a5a77 2026-10-13 Médias dans les chats : vidéos (galerie + caméra) en privé ; photos, vidéos et vocaux (maintenir le micro) dans le chat du quartier, les lieux et les spots ; bucket privé hdar-media, URL signées, signalement des médias (v30)
- 75f2585 2026-10-13 hdar+ premium (4,99€/sem, 9,99€/mois) : /premium, filtres carte, qui m'a vu/favori, recherche pseudo, 20 photos, badge ; Je suis / Je cherche (H/F/X) ; gating serveur ; migration v29
- a1957cd 2026-10-13 Profil d'abord (carte photo/pseudo/phrase, boost en haut) + écran Paramètres (roue ⚙️) ; phrase du moment persistante et visible sur la fiche (v28)
- d0a5d6d 2026-10-13 Lieux: boutons ✨ et corbeille compacts (icônes rondes), carte du lieu pleine largeur
- 7b5cd6a 2026-10-13 Boost de lieu (spots privés, 24h 2,99€ / 7j 9,99€) : halo carte, tête de liste, section /boost ; pop-up boost profil occasionnel sur la carte ; migration v27
- fb154e2 2026-10-13 Boost: page dédiée /boost (aperçu pin, avant/après, tarifs, compte à rebours), bouton brillant en haut du profil, /pro réservé aux lieux
- 5da491b 2026-10-13 Checkout Stripe: branding hdar, textes FR, image produit, moyens de paiement filtrés
- fd76ad3 2026-10-13 pro: landing publicitaire pour les établissements (aperçu fiche, carte, tarifs, FAQ)
- a421f57 2026-10-13 Stripe: read secrets from Vault fallback (hdar_stripe_secret RPC)
- 39b20ca 2026-10-13 Avis (étoiles + commentaires + modération), espace pro libre-service (lieux partenaires, boosts), Stripe Checkout + webhook, analytics régie (ROI, entonnoir, rétention S1/M1, tendances, revenus, tarifs) — migrations v25/v25b
- 461c019 2026-10-13 PWA: manifest content-type, maskable 192, purpose any, monochrome badge
- 9f4dda5 2026-10-13 Admin : tableau de bord analytique (KPIs, DAU/WAU/MAU, rétention, carte de chaleur, horaires, top lieux, influenceurs), boosts et lieux partenaires avec halo sur la carte (migrations v23/v24)
- 6a3c95a 2026-10-12 Vérification Google Search Console
- 355be3c 2026-10-12 Toilettes publiques (OSM, France) : catégorie dédiée, chargement par zone visible dès le zoom 12, interrupteur dans le menu calques, chat comme les autres lieux
- d5bbc3c 2026-10-12 Fix crash « l is not a function » : effet du chat de lieu renvoyait la Promise de scrollIntoView ; garde-fou d'erreur sur les fiches de lieux
- a593675 2026-10-12 Lieux permanents : visibles à tous les zooms (bulles), bouton calques compact, chat par lieu (écriture à moins de 2 km, 24 h, pastilles)
- 9f95495 2026-10-12 Couche « Lieux permanents » : plages naturistes et lieux de drague OSM (ODbL), propositions modérées, modèle partenaires prêt (masqué) ; SEO Montpellier sans enseignes commerciales
- 80ac9f4 2026-10-12 Fix: après suppression, impossible d'envoyer en MP avec l'ancien profil (profil lié à auth.uid, claim durci, cache local invalidé, onglets synchronisés)
- 62a20ce 2026-10-12 Pastilles + sons discrets : chat du quartier, messages dans mes lieux, nouveaux lieux proches (réglables)
- 841e253 2026-10-12 SEO : og:image propre aux pages ville (Montpellier)
- b337f3e 2026-10-12 Favoris : ★ doré dans la liste des conversations (épinglés en haut), l'en-tête du chat et contour doré sur la carte
- 538092d 2026-10-12 SEO villes : 110 m, page Montpellier enrichie (contenu local, FAQ, OG dédiée, maillage), page Sète, lastmod sitemap
- 14a2d12 2026-10-12 Push : sujet VAPID https://hdar.chat ; confidentialité : conservation des messages de contact
- d143b71 2026-10-12 Formulaire de contact intégré (remplace l'e-mail public) + onglet Messages dans /admin
- ce26e25 2026-10-12 Popup d'installation hdar (Android : bouton Installer ; iPhone : étapes Partager → écran d'accueil)
- a1ae62f 2026-10-12 Appel vidéo : bascule caméra avant/arrière (replaceTrack, miroir seulement en avant)
- e5d66d0 2026-10-12 Chat : caméra plein écran (avant/arrière, flash, aperçu reprendre/envoyer)
- 4cdb3be 2026-10-12 Carte : regroupement numéroté des lieux en dézoom, marqueurs compacts
- c7705ef 2026-10-12 Fix import markRead/pgTime
- bb0894b 2026-10-12 Chat privé : accusé de lecture « Vu »
- e0e9033 2026-10-12 Messages privés et appels réservés aux profils créés (contrôle serveur + invite dans le chat) ; lieux ouverts à tous
- a2c96f0 2026-10-12 Notifications : sons hdar (WebAudio), vibration, Web Push (VAPID, pg_net + edge function), réglages
- 7809964 2026-10-12 Pages Confidentialité et CGU, chat plus rapide (polling adaptatif)
- 1c99c55 2026-10-12 Supprimer toutes mes données + purge automatique (pg_cron)
- 6424c35 2026-10-12 Turnstile : bouton Entrer sans jeton uniquement si le widget ne charge pas
- 8aadebe 2026-10-12 Captcha Cloudflare Turnstile sur l'écran 18+ (jeton passé à signInAnonymously)
- 7a2dbfb 2026-10-12 Modération automatique de la photo principale (NSFW.js dans le navigateur, file admin si signalée)
- e206bd5 2026-10-12 Chat privé : partager sa position exacte (confirmation, 1 h, limité)
- 8ba997c 2026-10-12 Modération de la photo principale (file d'attente /admin) et arrondi des coordonnées du profil
- 0a496ff 2026-10-12 PWA : ne pas injecter le manifest générique quand l'app a le sien
- 68cc6d6 2026-10-12 PWA : manifest hdar, icônes 192/512/maskable, service worker
- 0e9626f 2026-10-12 Favoris : étoile sur un profil, liste dans Mon profil, alerte quand un favori est sur la carte
- d451305 2026-10-12 Anti-spam : limites de fréquence côté serveur sur messages, pulse, signaux et lieux
- 610521c 2026-10-12 Retire les faux profils de démo et les réponses automatiques
- 4a9cf55 2026-10-12 Reapply "Merge pull request #1 from Jerem34300/security/auth-google-x"
- c1b9405 2026-10-12 Revert "Merge pull request #1 from Jerem34300/security/auth-google-x"
- d4a7da2 2026-10-12 Merge pull request #1 from Jerem34300/security/auth-google-x
- 4049980 2026-10-12 Sécurité : session anonyme Supabase (auth.uid), 18+ unique, migration RPC, suppression /debug
