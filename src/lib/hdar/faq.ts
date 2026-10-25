/** FAQ hdar.chat : réponses basées sur le comportement réel de l'app. Texte brut (réutilisé dans le JSON-LD FAQPage). */
export type Faq = { q: string; a: string; link?: { href: string; label: string } };
export type FaqSection = { id: string; title: string; emoji: string; items: Faq[] };

export const FAQ: FaqSection[] = [
  {
    id: "demarrer", title: "Démarrer", emoji: "🚀",
    items: [
      { q: "hdar est-il gratuit ?", a: "Oui. Carte, chat du quartier, lieux, messages privés, appels vidéo et Live sont gratuits. Pendant le lancement, même les options avancées (hdar+, boosts, cœurs) sont offertes : aucun paiement n'est demandé dans l'app." },
      { q: "Faut-il avoir 18 ans ?", a: "Oui, hdar est réservé aux adultes (18 ans et plus). Tu le confirmes une seule fois à l'entrée, l'appareil s'en souvient. Tout profil d'une personne mineure est supprimé.", link: { href: "/cgu", label: "Conditions d'utilisation" } },
      { q: "Dois-je créer un compte ou donner mon email ?", a: "Non. Tu entres en un geste, sans inscription : hdar crée un accès discret propre à ton téléphone. Sans profil, tu vois déjà la carte et tu peux parler dans les lieux et le chat du quartier. Crée un profil (pseudo, âge, photo si tu veux) pour envoyer des messages privés et passer des appels. L'email est facultatif : il sert seulement à retrouver ton profil." },
      { q: "C'est quoi la petite vérification à l'entrée ?", a: "C'est un contrôle anti-robot (Cloudflare Turnstile), le plus souvent invisible ou en un clic. Il protège hdar des faux comptes et du spam. S'il ne s'affiche pas, recharge la page ou vérifie ta connexion." },
      { q: "Comment installer hdar sur mon écran d'accueil ?", a: "hdar s'installe comme une appli, sans passer par un store. Sur Android, accepte la proposition « Installer hdar » (ou menu ⋮ du navigateur → Installer l'application / Ajouter à l'écran d'accueil). Sur iPhone, dans Safari : bouton Partager → « Sur l'écran d'accueil ». Une appli Android sur le Play Store arrive bientôt." },
    ],
  },
  {
    id: "compte", title: "Compte & récupération", emoji: "🔑",
    items: [
      { q: "Pourquoi lier un email (« Protège ton profil ») ?", a: "Ton profil est lié à ton téléphone. En liant un email (en bas de ton profil, « Protège ton profil »), tu peux le retrouver si tu changes de téléphone, vides ton navigateur ou te déconnectes. L'email n'est jamais visible par les autres membres. C'est facultatif mais vivement conseillé." },
      { q: "Comment fonctionne le code reçu par email ?", a: "Tu reçois un code de 8 chiffres à recopier dans hdar. Pas de lien à cliquer : seulement le code. Pense à regarder dans tes spams ou courriers indésirables, l'email peut mettre jusqu'à une minute à arriver." },
      { q: "Puis-je quitter la page pour aller lire mon email ?", a: "Oui. Quand tu retrouves ton compte, l'étape « code » reste ouverte pendant 1 h, même si tu changes d'appli ou recharges la page. Pour lier un email depuis ton profil, l'étape « code » réapparaît aussi tant que la vérification est en attente. Le plus simple reste d'ouvrir ta boîte mail sans fermer hdar." },
      { q: "J'ai déjà reçu un code mais l'écran a changé", a: "Dans « Retrouver mon compte », entre ton email puis touche « J'ai déjà reçu un code » : tu arrives directement sur la saisie du code, sans en redemander un." },
      { q: "Comment marche « Retrouver mon compte » ?", a: "Touche « Retrouver mon compte » sur l'écran d'entrée ou dans Paramètres, entre l'email lié à ton profil, puis le code à 8 chiffres reçu par email. Ton profil, tes photos et tes conversations reviennent sur ce téléphone. Si tu es déjà connecté avec un autre profil, hdar te prévient avant de basculer. Il faut avoir lié un email avant (« Protège ton profil »)." },
      { q: "Je change de téléphone, comment garder mon profil ?", a: "Avant de changer, vérifie qu'un email est lié (« Profil protégé » dans ton profil). Sur le nouveau téléphone, ouvre hdar.chat et touche « Retrouver mon compte » (à l'entrée ou dans Paramètres), entre ton email puis le code reçu : ton profil, tes photos et tes conversations reviennent." },
      { q: "J'ai perdu mon profil et je n'avais pas lié d'email", a: "Sans email, hdar ne peut pas te rattacher automatiquement à ton ancien profil : c'est le prix de la discrétion, on ne connaît pas ton identité. Si tu avais noté ton « ID support » (affiché dans Paramètres), écris-nous via le formulaire de contact avec cet ID : on regarde ce qu'il est possible de faire. Sinon, crée un nouveau profil et pense à le protéger avec un email.", link: { href: "/contact", label: "Formulaire de contact" } },
      { q: "Comment supprimer toutes mes données ?", a: "Paramètres → « Supprimer toutes mes données ». Profil, photos, vocal, messages, médias, favoris, position et accès sont effacés définitivement de nos serveurs, en un geste. C'est irréversible. Tu peux aussi faire une demande RGPD via le formulaire de contact." },
    ],
  },
  {
    id: "discretion", title: "Discrétion & sécurité", emoji: "🛡️",
    items: [
      { q: "Quelqu'un peut utiliser mon téléphone : comment protéger hdar ?", a: "Deux outils dans Paramètres. 1) Le code de verrouillage (4 chiffres) : il est demandé à l'ouverture de hdar et au retour après une pause (immédiat, 1 min ou 5 min, au choix). L'écran de verrouillage est neutre, sans nom ni contenu. Le code n'est jamais envoyé : seule une empreinte chiffrée reste sur ton téléphone. Après 5 erreurs, il faut se déconnecter et revenir avec son email. 2) « Se déconnecter » : efface hdar de ce téléphone ; tu reviens quand tu veux avec « Retrouver mon compte ». Sans email lié, hdar t'avertit avant, car tu perdrais ton profil." },
      { q: "Comment activer, changer ou désactiver le code PIN ?", a: "Paramètres → Discrétion → Code de verrouillage → « Activer », puis choisis 4 chiffres et confirme-les. Tu règles quand il est redemandé après une pause : immédiat, 1 min ou 5 min. Pour le changer ou le désactiver, il faut entrer le code actuel : quelqu'un qui prend ton téléphone ne peut pas l'enlever. Code oublié ? Après 5 erreurs, déconnecte-toi depuis l'écran de verrouillage et reviens avec « Retrouver mon compte »." },
      { q: "Que fait « Se déconnecter » ?", a: "Paramètres → « Se déconnecter » efface hdar de ce téléphone : session, profil en cache, réglages et données locales. Tu reviens sur l'écran d'entrée. Avec un email lié, tu retrouves tout quand tu veux avec « Retrouver mon compte ». Sans email, hdar t'affiche un avertissement et te propose d'abord « Protège ton profil », car sinon le profil ne pourrait plus être retrouvé." },
      { q: "Les autres voient-ils ma position exacte ?", a: "Non. Sur la carte, ta position est arrondie : quand tu n'es plus connecté, ton pin estompé « vu il y a … » est placé à environ 400 m près, et les visiteurs sans profil n'apparaissent qu'en bulle anonyme à ~1 km près. Ta position exacte n'est partagée que si tu choisis de l'envoyer dans une conversation privée (avec confirmation, pendant 1 h)." },
      { q: "Comment ne pas apparaître sur la carte ?", a: "Tu n'es affiché « en ligne » que lorsque tu touches Connexion, pendant quelques heures. Ensuite, ton pin estompé reste visible 48 h : active « Me cacher de la carte quand je suis hors ligne » dans Paramètres → Carte pour le retirer. Sans profil, l'option « Ne pas m'afficher en bulle anonyme » supprime aussi ta bulle." },
      { q: "Comment bloquer quelqu'un ?", a: "Depuis son profil ou la conversation, touche Bloquer. Cette personne ne peut plus t'écrire et vous ne vous voyez plus sur la carte. Elle n'est pas prévenue." },
      { q: "Comment signaler un profil, un message ou un média ?", a: "Touche Signaler sur le profil, le message ou le média, puis choisis la raison (faux profil, harcèlement, photos choquantes, semble mineur, arnaque ou spam, autre). Le signalement bloque aussi la personne pour toi, et l'équipe hdar le traite en priorité." },
      { q: "Comment se passe la modération ?", a: "Les signalements arrivent dans un espace de modération : l'équipe peut retirer un contenu, une photo ou bannir un profil. Des limites anti-spam automatiques freinent les envois en masse. Les règles sont simples : respect, consentement, 18+, aucune discrimination.", link: { href: "/cgu#interdits", label: "Ce qui est interdit" } },
      { q: "Les photos sont-elles filtrées ?", a: "Oui. Ta photo de profil est analysée automatiquement sur ton téléphone avant publication ; si elle semble explicite, elle passe en vérification par l'équipe avant d'être visible. Les photos et médias peuvent aussi être signalés à tout moment." },
      { q: "Conseils contre les arnaques et le chantage", a: "Ne partage jamais d'argent, de codes reçus par SMS ou email, ni de photos que tu ne voudrais pas voir circuler. Méfie-toi de qui veut vite quitter hdar pour une autre appli ou demande une aide financière. Pour un premier rendez-vous, choisis un lieu public et préviens un proche. En cas de chantage : ne paie pas, garde les preuves (captures), bloque et signale le profil, et contacte la police (17) ou la plateforme PHAROS. Tu n'es pas seul : écris-nous aussi via le formulaire." },
      { q: "Et mes données personnelles (RGPD) ?", a: "hdar collecte le strict minimum, sans nom ni numéro de téléphone. Tu peux à tout moment supprimer toutes tes données depuis Paramètres, ou faire une demande d'accès, de rectification ou de suppression via le formulaire de contact.", link: { href: "/confidentialite", label: "Politique de confidentialité" } },
    ],
  },
  {
    id: "carte", title: "Carte & lieux", emoji: "🗺️",
    items: [
      { q: "Quels lieux sont sur la carte ?", a: "Des lieux publics et non commerciaux (parcs, plages, aires, toilettes publiques issues d'OpenStreetMap…), des lieux proposés par la communauté et validés, et les établissements partenaires. Les calques se choisissent depuis le bouton calques de la carte." },
      { q: "C'est quoi un lieu partenaire ?", a: "Un bar, club ou établissement qui a sa fiche sur hdar, mise en avant sur la carte. Pendant le lancement, c'est gratuit pour les établissements." },
      { q: "Comment ajouter un lieu ?", a: "Sur la carte, touche « + Proposer un lieu ici ». La proposition est vérifiée avant d'apparaître pour tout le monde." },
      { q: "Comment marche le chat d'un lieu ?", a: "Chaque lieu a son chat. Tout le monde peut le lire, et tu peux y écrire quand tu es à environ 2 km du lieu. Les messages restent 24 h : parfait pour savoir où ça bouge, maintenant." },
      { q: "C'est quoi le chat du Quartier ?", a: "Un chat commun avec les personnes connectées autour de toi, sans profil obligatoire. Les messages sont récents (24 h), pour discuter avec ceux qui sont vraiment dans le coin." },
    ],
  },
  {
    id: "messages", title: "Messages", emoji: "💬",
    items: [
      { q: "Qui peut envoyer des messages privés ?", a: "Les membres qui ont créé un profil (pseudo et âge). C'est une protection contre le spam : sans profil, tu peux déjà parler dans les lieux et le quartier." },
      { q: "Comment répondre à un message précis ?", a: "Fais glisser la bulle vers la droite, ou appuie longuement dessus (clic droit sur ordinateur) puis « Répondre ». Le message cité s'affiche au-dessus du tien : touche la citation pour retrouver l'original dans la discussion. Ça marche en privé, dans les salons et dans le chat du quartier." },
      { q: "Comment réagir avec un emoji ?", a: "Appui long sur un message : une barre d'emojis apparaît, choisis le tien. Les réactions s'affichent sous la bulle avec leur nombre ; touche ta réaction pour la retirer." },
      { q: "Puis-je modifier un message envoyé ?", a: "Oui : appui long sur ton message → « Modifier », pendant 15 minutes après l'envoi (messages texte). La bulle affiche alors « modifié », pour que la discussion reste claire pour tout le monde." },
      { q: "Comment transférer un message ?", a: "Appui long sur un message → « Transférer », puis choisis une conversation privée ou un salon (avec la recherche). Ça marche dans les deux sens : d'un salon vers un message privé, et d'un message privé vers un salon. Texte, photo, vidéo et vocal se transfèrent. La bulle transférée affiche un en-tête : « Transféré de <pseudo> » quand elle vient d'un salon (déjà public), et seulement « Transféré » quand elle vient d'un message privé, pour que l'auteur d'un message privé ne soit jamais nommé ailleurs. Un message transféré ne se modifie pas. Envoyer en privé ou transférer une photo, une vidéo ou un vocal demande un profil." },
      { q: "Que veulent dire les coches ✓ et ✓✓ ?", a: "En conversation privée, à côté de l'heure, dans la bulle de chacun de tes messages : ✓ veut dire envoyé, ✓✓ veut dire que l'autre l'a vu." },
      { q: "Qui voit les photos, vidéos et vocaux d'un salon ?", a: "Tout le monde dans le salon, même les visiteurs sans profil, pendant 24 heures. Ensuite ils disparaissent automatiquement : les salons restent légers et discrets. Pour envoyer un média dans un salon, il faut un profil. Un média choquant se signale en un geste avec le drapeau." },
      { q: "Comment personnaliser mes discussions ?", a: "Paramètres → Apparence : choisis la couleur de tes bulles (8 couleurs), la police des messages (Par défaut, Moderne, Serif, Mono), la taille du texte (petit à très grand) et un fond de discussion sobre. Un aperçu en direct montre le résultat. Ces réglages ne changent que ton affichage, sur ce téléphone ; « Revenir aux réglages d'origine » remet tout comme avant." },
      { q: "Comment mettre quelqu'un en favori ?", a: "Touche l'étoile sur son profil. Tes favoris sont épinglés en haut de tes conversations, avec une étoile dorée, et repérables sur la carte." },
      { q: "Comment régler les sons et les notifications ?", a: "Paramètres → Notifications : « Son et vibration » pour les messages, des sons discrets réglables un par un quand l'appli est ouverte (chat du quartier, messages dans tes lieux, nouveau lieu près de toi), et « Notifications appli fermée » pour être prévenu même hdar fermé. Les notifications sont limitées pour ne jamais te harceler." },
      { q: "Peut-on passer des appels vidéo ?", a: "Oui, depuis une conversation privée, touche la caméra en haut. Tu peux couper ta caméra ou ton micro et changer de caméra à tout moment. Il faut autoriser caméra et micro la première fois." },
    ],
  },
  {
    id: "live", title: "Live", emoji: "🎥",
    items: [
      { q: "C'est quoi le Live ?", a: "Des rencontres vidéo en direct : face-à-face au hasard avec quelqu'un qui n'est pas à côté de chez toi (jamais à moins de 2 km), ou « Diffuser » pour que d'autres te voient. Swipe vers le haut pour passer au Live suivant." },
      { q: "Suis-je visible tout de suite ?", a: "Non : ta vidéo est floutée par défaut. Tu choisis quand te montrer (appui sur ton aperçu) et tu peux te reflouter à tout moment. Les spectateurs n'utilisent leur caméra et leur micro que s'ils l'acceptent." },
      { q: "Quelles sont les règles du Live ?", a: "18+, pas de nudité ni de contenu sexuel, consentement et respect. Chaque personne peut être signalée et bloquée en un geste." },
    ],
  },
  {
    id: "offres", title: "Offre FIRST, hdar+ & boosts", emoji: "🎁",
    items: [
      { q: "C'est quoi le code FIRST ?", a: "Le cadeau de lancement : les 5000 premiers membres qui entrent le code FIRST reçoivent hdar+ à vie, des boosts et des cœurs offerts. Il faut un profil et une région (position ou ville). Un seul code FIRST par profil." },
      { q: "Que contient hdar+ ?", a: "Des options en plus : filtres de la carte, qui m'a vu, plus de photos et d'annonces, avantages Live… Pendant le lancement, tout est offert : aucun paiement n'est demandé." },
      { q: "C'est quoi un boost ?", a: "Ton profil (ou ton annonce) mis en avant sur la carte pendant un temps limité. Avec FIRST, tu as des boosts de profil d'1 h offerts chaque jour et un boost d'annonce France 24 h par jour." },
    ],
  },
  {
    id: "parrainage", title: "Parrainage", emoji: "🤝",
    items: [
      { q: "Comment inviter un ami ?", a: "Dans ton profil, « Invite un ami » te donne ton lien personnel. Quand ton invité crée son profil avec une photo validée, vous recevez tous les deux 3 jours de hdar+ (jusqu'à 10 invitations récompensées par mois)." },
    ],
  },
  {
    id: "pro", title: "Partenaires & établissements", emoji: "🏳️‍🌈",
    items: [
      { q: "Je gère un bar, un club, un lieu : comment être sur hdar ?", a: "Rendez-vous sur l'espace pro. Pendant le lancement, la fiche partenaire et sa mise en avant sont gratuites : écrivez-nous via le formulaire de contact et nous activons votre fiche.", link: { href: "/pro", label: "Espace pro" } },
    ],
  },
  {
    id: "technique", title: "Problèmes techniques", emoji: "🛠️",
    items: [
      { q: "La page se recharge ou je reviens à l'écran d'entrée", a: "Les navigateurs ferment parfois les onglets en arrière-plan pour économiser la batterie. Ton profil reste lié à ton téléphone : rouvre hdar, il revient. Installer hdar sur l'écran d'accueil rend tout plus stable. Si ton profil ne revient pas, utilise « Retrouver mon compte » avec ton email." },
      { q: "Je ne reçois pas le code par email", a: "Attends une minute, puis regarde dans les spams, courriers indésirables ou l'onglet Promotions. Vérifie l'orthographe de ton email. Évite de redemander plusieurs codes d'affilée : seul le dernier code reçu est valable." },
      { q: "Je ne reçois pas les notifications", a: "Vérifie dans Paramètres → Notifications que « Notifications appli fermée » est activé, puis dans les réglages de ton téléphone que ton navigateur (ou l'appli hdar) a le droit d'envoyer des notifications. Sur iPhone, les notifications marchent quand hdar est installé sur l'écran d'accueil. Le mode économie d'énergie peut aussi les retarder." },
      { q: "La caméra ou le micro ne marchent pas", a: "Autorise l'accès quand le navigateur le demande. Si tu as refusé : touche le cadenas à côté de l'adresse hdar.chat → Autorisations → Caméra et Micro → Autoriser, puis recharge. Ferme les autres applis qui utilisent la caméra." },
      { q: "Comment vider le cache si quelque chose bloque ?", a: "Recharge d'abord la page. Si ça persiste, vide le cache du navigateur pour hdar.chat. Attention : supprimer les « données du site » efface aussi ton accès sur ce téléphone, donc lie un email avant (« Protège ton profil ») pour le retrouver ensuite." },
    ],
  },
  {
    id: "contact", title: "Contact", emoji: "✉️",
    items: [
      { q: "Comment contacter l'équipe hdar ?", a: "Via le formulaire de contact, directement dans l'app, même sans profil. Choisis le sujet (RGPD, signalement, autre) et, si tu veux une réponse, indique comment te joindre. L'équipe répond dès que possible.", link: { href: "/contact", label: "Écrire à l'équipe" } },
    ],
  },
];
