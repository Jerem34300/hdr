/**
 * Email HTML5 de prospection partenaires (bars / clubs / saunas).
 *
 * ÉTAT : NON ACTIVÉ — ne pas envoyer tant que v107/v130 ne sont pas appliquées
 * en production (90 jours offerts à la publication). Aucun envoi depuis ce module.
 *
 * Images : https://hdar.chat/email/prospection/* (fichiers dans public/email/prospection/).
 * Aucun jeton de claim dans les URLs d'images.
 *
 * Faits vérifiés dans le code (v41 Live Pro / cadeaux, v44 Boost Pro, v25 photos) :
 * - Live Pro : lieu partenaire actif ; pas de limite de distance (contrairement aux lives entre particuliers ~2 km min).
 * - Boost Pro : pin doré, tête « À la une », priorité dans le matching Live Pro (24 h / 7 j / 30 j).
 * - Cadeau pro : envoi à une personne depuis le Live ou un profil ; titre + détail + code optionnel ;
 *   expiration 1–90 j (défaut 7) ; max 20 / jour / lieu ; la personne peut refuser ou bloquer.
 * - Photos fiche : jusqu'à 4 (galerie) — à ajouter par le gérant, pas pré-collectées.
 * - Publication : la fiche n'est visible sur la carte qu'après validation explicite du propriétaire.
 */
const C = {
  night: "#0b0b10",
  card: "#16161e",
  line: "#2a2a35",
  coral: "#FA6F6C",
  green: "#3EE08F",
  mint: "#A1E3C3",
  gold: "#fbbf24",
  ink: "#f5f5f5",
  muted: "#a1a1aa",
  dim: "#71717a",
} as const;

/** false tant que v107/v130 ne sont pas en prod et que Jérémie n'a pas validé l'envoi. */
export const PROSPECTION_MAIL_ACTIVATED = false;

export const PROSPECTION_FROM = "hdar. partenaires <contact@hdar.chat>";
export const PROSPECTION_REPLY_TO = "contact@hdar.chat";

/** Base CDN / site pour les images (pas de jeton dans le chemin). */
export const EMAIL_ASSET_BASE = "https://hdar.chat/email/prospection";

export type ProspectionMailInput = {
  name: string;
  token: string;
  unsubscribe: string;
  site?: string;
  /** Surcharge la base des images (aperçu local file:// ou http://127.0.0.1). */
  assetBase?: string;
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const icon = (paths: string, label: string) =>
  `<span role="img" aria-label="${esc(label)}" style="display:inline-block;width:28px;height:28px;vertical-align:middle;line-height:0">` +
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${C.coral}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg></span>`;

const I = {
  map: icon('<path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', "Carte"),
  building: icon('<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>', "Établissement"),
  user: icon('<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>', "Profil"),
  check: icon('<path d="M20 6L9 17l-5-5"/>', "Valider"),
  video: icon('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>', "Live Pro"),
  gift: icon('<path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/>', "Cadeau pro"),
  boost: icon('<path d="M13 2L4 14h7l-1 8 10-14h-7l1-6z"/>', "Boost Pro"),
  camera: icon('<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', "Photos"),
};

function claimUrl(site: string, token: string) {
  return `${site.replace(/\/$/, "")}/pro?claim=${encodeURIComponent(token)}`;
}

function asset(base: string, file: string) {
  return `${base.replace(/\/$/, "")}/${file}`;
}

export function prospectionSubject(name: string) {
  return `Fiche préparée pour « ${name} » — créez votre profil pro pour la publier sur hdar`;
}

/** Version texte brut. */
export function prospectionMailText(o: ProspectionMailInput): string {
  const site = o.site || "https://hdar.chat";
  const url = claimUrl(site, o.token);
  return [
    `Bonjour,`,
    ``,
    `Nous avons préparé une fiche pour « ${o.name} » sur hdar.chat (carte live des sorties et rencontres, 18+, discret).`,
    `Cette fiche n'est pas encore visible sur la carte : elle n'apparaît qu'après que vous ayez créé votre profil pro, modifié la fiche, puis validé explicitement sa publication.`,
    ``,
    `Parcours :`,
    `1. Créer votre profil pro (nom du gérant, contact professionnel).`,
    `2. Rattacher la fiche : vous en devenez l'administrateur.`,
    `3. Modifier infos, photos (jusqu'à 4 photos officielles sur la galerie — à ajouter par vos soins), horaires.`,
    `4. Valider et publier : seulement alors la fiche est en ligne.`,
    ``,
    `Une fois partenaire actif, vous disposez notamment de :`,
    ``,
    `• Live Pro — lives vidéo au nom de votre établissement, sans limite de distance (toute la France). Les lives entre particuliers restent limités (~2 km minimum entre eux) ; le Live Pro n'a pas cette contrainte.`,
    `• Cadeau pro — depuis un Live ou un profil, envoyez une offre à une personne (ex. « Un verre offert », « -20 % sur l'entrée », avec code promo optionnel et date d'expiration). Maximum 20 cadeaux par jour et par lieu. La personne peut refuser les cadeaux pro ou vous bloquer.`,
    `• Boost Pro — pin doré sur la carte, place en tête « À la une » des Lieux, et priorité dans le Live Pro pendant 24 h, 7 jours ou 30 jours (option payante en plus de l'abonnement fiche).`,
    ``,
    `Pendant le lancement : 90 jours offerts après validation, sans carte bancaire.`,
    `Ensuite : 15 € / semaine · 49 € / mois · 129 € / 3 mois. Sans engagement.`,
    ``,
    `Voir et revendiquer ma fiche :`,
    url,
    ``,
    `Expéditeur : hdar. partenaires · contact@hdar.chat · https://hdar.chat`,
    `Ne plus recevoir ces messages : ${o.unsubscribe}`,
    ``,
    `(Brouillon — envoi non activé tant que les migrations v107/v130 ne sont pas appliquées en production.)`,
  ].join("\n");
}

/** HTML email (tables + styles inline + images hébergées sur hdar.chat). */
export function prospectionMailHtml(o: ProspectionMailInput): string {
  const site = o.site || "https://hdar.chat";
  const url = claimUrl(site, o.token);
  const name = esc(o.name);
  const unsub = esc(o.unsubscribe);
  const href = esc(url);
  const img = (file: string) => esc(asset(o.assetBase || EMAIL_ASSET_BASE, file));

  const row = (ico: string, title: string, body: string) => `
<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="40" valign="top" style="padding-top:2px">${ico}</td>
    <td valign="top" style="padding-left:8px">
      <div style="font-size:15px;font-weight:700;color:${C.ink};margin:0 0 4px">${title}</div>
      <div style="font-size:14px;line-height:1.55;color:${C.muted};margin:0">${body}</div>
    </td>
  </tr></table>
</td></tr>`;


  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(prospectionSubject(o.name))}</title>
<!-- hdar prospection · PROSPECTION_MAIL_ACTIVATED=${String(PROSPECTION_MAIL_ACTIVATED)} · images sans jeton · ne pas envoyer sans accord -->
</head>
<body style="margin:0;padding:0;background:${C.night};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">
  Fiche préparée pour « ${name} ». Elle n'apparaît sur hdar qu'après votre profil pro, vos modifications et votre validation.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:28px;overflow:hidden">

  <tr><td align="center" style="padding:22px 24px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <img src="${img("logo.png")}" width="96" height="38" alt="hdar." style="display:block;margin:0 auto;border:0;height:auto">
    <div style="margin-top:8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.mint};font-weight:700">Partenaires</div>
  </td></tr>

  <tr><td style="padding:10px 20px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <img src="${img("carte-montpellier.jpg")}" width="520" alt="Aperçu de la carte hdar autour de Montpellier, avec les lieux et les membres autour de vous" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:18px">
  </td></tr>

  <tr><td style="padding:14px 20px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:22px;background:radial-gradient(circle at 18% 15%,rgba(250,111,108,.45),transparent 55%),radial-gradient(circle at 88% 90%,rgba(62,224,143,.28),transparent 55%),#1a1220">
      <tr><td style="padding:26px 20px;text-align:center">
        <div style="font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:${C.gold};font-weight:700;margin-bottom:10px">Fiche préparée · pas encore en ligne</div>
        <div style="font-size:24px;font-weight:800;line-height:1.25;color:${C.ink};margin:0">${I.building}&nbsp; ${name}</div>
        <div style="font-size:14px;line-height:1.55;color:${C.muted};margin-top:12px">
          Nous avons préparé une fiche à votre nom. Elle n'apparaît sur hdar qu'après votre profil pro, vos modifications et votre validation explicite.
        </div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:18px 26px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.65;color:${C.ink}">
    <p style="margin:0 0 12px">Bonjour,</p>
    <p style="margin:0;color:${C.muted}">
      hdar.chat est la carte live des sorties et rencontres autour de soi, pour tout le monde (18&nbsp;+, discret).
      Les membres voient les lieux partenaires au moment où ils décident de sortir — uniquement les fiches validées et publiées.
    </p>
  </td></tr>

  <tr><td style="padding:18px 26px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.green};margin-bottom:6px">Votre parcours</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row(I.user, "1 · Profil pro", "Nom du gérant ou représentant, contact professionnel, confirmation que vous êtes autorisé à gérer l'établissement.")}
      ${row(I.building, "2 · Vous devenez administrateur", "La fiche vous est rattachée : vous seul la modifiez depuis votre espace pro.")}
      ${row(I.camera, "3 · Modification", "Description, horaires, position, site, contact affiché. Ajoutez jusqu'à 4 photos officielles dans la galerie (rien n'est pré-rempli à votre place).")}
      ${row(I.check, "4 · Validation et publication", "Vous validez explicitement. Seulement alors la fiche devient visible sur la carte.")}
    </table>
  </td></tr>

  <tr><td style="padding:8px 26px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="48%" valign="top" style="padding:4px">
          <img src="${img("parcours-apercu.jpg")}" width="250" alt="Écran hdar pro : aperçu de la fiche préparée avant rattachement" style="display:block;width:100%;max-width:250px;height:auto;border:0;border-radius:14px;border:1px solid ${C.line}">
        </td>
        <td width="4%"></td>
        <td width="48%" valign="top" style="padding:4px">
          <img src="${img("parcours-validation.jpg")}" width="250" alt="Écran hdar pro : étape Valider et publier la fiche" style="display:block;width:100%;max-width:250px;height:auto;border:0;border-radius:14px;border:1px solid ${C.line}">
        </td>
      </tr>
    </table>
    <div style="font-size:11px;color:${C.dim};margin-top:6px;text-align:center">Aperçu du parcours dans hdar.chat (exemple)</div>
  </td></tr>

  <tr><td style="padding:18px 26px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.green};margin-bottom:10px">Outils partenaires (après publication)</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};border:1px solid ${C.line};border-radius:18px;margin-bottom:10px">
      <tr><td style="padding:14px 16px">
        <div style="font-size:15px;font-weight:800;color:${C.ink}">${I.video}&nbsp; Live Pro</div>
        <div style="font-size:14px;line-height:1.55;color:${C.muted};margin-top:6px">
          Lancez un live vidéo au nom de votre établissement. Contrairement aux lives entre particuliers (règle d'éloignement d'environ 2&nbsp;km), le Live Pro n'a pas de limite de distance : vous croisez des membres partout en France.
        </div>
        <img src="${img("live.jpg")}" width="480" alt="Illustration du Live sur hdar.chat" style="display:block;width:100%;max-width:480px;height:auto;border:0;border-radius:12px;margin-top:10px">
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};border:1px solid ${C.line};border-radius:18px;margin-bottom:10px">
      <tr><td style="padding:14px 16px">
        <div style="font-size:15px;font-weight:800;color:${C.ink}">${I.gift}&nbsp; Cadeau pro</div>
        <div style="font-size:14px;line-height:1.55;color:${C.muted};margin-top:6px">
          Pendant un Live ou depuis un profil, envoyez une offre concrète à une personne :
          titre (ex. « Un verre offert »), détail (ex. « -20&nbsp;% sur l'entrée jusqu'à dimanche »), code promo optionnel, durée d'expiration (1 à 90 jours, 7 jours par défaut).
          Jusqu'à <strong style="color:${C.ink}">20 cadeaux par jour</strong> et par établissement. La personne peut refuser les cadeaux pro ou bloquer votre lieu.
        </div>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};border:1px solid ${C.line};border-radius:18px">
      <tr><td style="padding:14px 16px">
        <div style="font-size:15px;font-weight:800;color:${C.ink}">${I.boost}&nbsp; Boost Pro</div>
        <div style="font-size:14px;line-height:1.55;color:${C.muted};margin-top:6px">
          Option en plus de la fiche : pin doré sur la carte, place en tête de « À la une » dans Lieux, et priorité dans le matching du Live Pro.
          Durées proposées : 24 heures, 7 jours ou 30 jours.
        </div>
        <img src="${img("boost.jpg")}" width="480" alt="Visuel Boost sur hdar.chat" style="display:block;width:100%;max-width:480px;height:auto;border:0;border-radius:12px;margin-top:10px">
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:18px 26px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.gold};border-radius:18px;background:#1a1610">
      <tr><td style="padding:16px 18px">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.gold};font-weight:700">Offre de lancement</div>
        <div style="font-size:18px;font-weight:800;color:${C.ink};margin-top:6px">90 jours offerts, sans carte bancaire</div>
        <div style="font-size:13px;line-height:1.55;color:${C.muted};margin-top:6px">
          Après votre validation et la publication de la fiche. Ensuite, seulement si vous continuez :
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
          <tr>
            <td width="33%" align="center" style="padding:8px 4px;background:${C.night};border-radius:12px">
              <div style="font-size:18px;font-weight:800;color:${C.coral}">15&nbsp;€</div>
              <div style="font-size:11px;color:${C.muted}">/ semaine</div>
            </td>
            <td width="4%"></td>
            <td width="33%" align="center" style="padding:8px 4px;background:${C.night};border-radius:12px">
              <div style="font-size:18px;font-weight:800;color:${C.coral}">49&nbsp;€</div>
              <div style="font-size:11px;color:${C.muted}">/ mois</div>
            </td>
            <td width="4%"></td>
            <td width="33%" align="center" style="padding:8px 4px;background:${C.night};border-radius:12px">
              <div style="font-size:18px;font-weight:800;color:${C.coral}">129&nbsp;€</div>
              <div style="font-size:11px;color:${C.muted}">/ 3 mois</div>
            </td>
          </tr>
        </table>
        <div style="font-size:12px;color:${C.dim};margin-top:10px">Sans engagement. Résiliation depuis votre espace pro. Boost Pro facturé à part.</div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td align="center" style="padding:26px 24px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <a href="${href}" style="display:inline-block;background:${C.coral};color:${C.night};font-weight:800;font-size:16px;line-height:1.2;text-decoration:none;border-radius:999px;padding:16px 28px">
      <span>Voir et revendiquer ma fiche</span>
    </a>
    <div style="font-size:12px;color:${C.dim};margin-top:12px;word-break:break-all">
      Ou ouvrez ce lien :<br><a href="${href}" style="color:${C.mint}">${href}</a>
    </div>
  </td></tr>

  <tr><td style="padding:8px 26px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;line-height:1.55;color:${C.dim};text-align:center">
    Expéditeur : <strong style="color:${C.muted}">hdar. partenaires</strong> · <a href="mailto:contact@hdar.chat" style="color:${C.muted}">contact@hdar.chat</a><br>
    <a href="https://hdar.chat" style="color:${C.muted}">hdar.chat</a> · 18+ · discret · lieux LGBT+ et inclusifs
  </td></tr>
</table>

<p style="max-width:560px;margin:16px auto 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;line-height:1.55;color:${C.dim};text-align:center">
  Vous recevez ce message car une fiche partenaire peut être proposée pour votre établissement sur hdar.
  <a href="${unsub}" style="color:${C.muted}">Se désinscrire</a>
  · <a href="https://hdar.chat/confidentialite" style="color:${C.muted}">Confidentialité</a>
  · <a href="https://hdar.chat/cgu" style="color:${C.muted}">CGU</a>
</p>
</td></tr></table>
</body>
</html>`;
}

export function buildProspectionMail(o: ProspectionMailInput) {
  return {
    activated: PROSPECTION_MAIL_ACTIVATED,
    from: PROSPECTION_FROM,
    replyTo: PROSPECTION_REPLY_TO,
    subject: prospectionSubject(o.name),
    html: prospectionMailHtml(o),
    text: prospectionMailText(o),
    claimUrl: claimUrl(o.site || "https://hdar.chat", o.token),
    assetBase: o.assetBase || EMAIL_ASSET_BASE,
  };
}
