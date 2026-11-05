/**
 * Email HTML5 de prospection partenaires (bars / clubs / saunas).
 *
 * ÉTAT : NON ACTIVÉ — ne pas envoyer tant que v107/v130 ne sont pas appliquées
 * en production (90 jours offerts à la publication). Aucun envoi depuis ce module.
 *
 * Design : nuit / corail / vert, tables + CSS inline, compatible clients mail.
 * Pas d'emoji. Vouvoiement. « discret », jamais « anonyme ».
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

export type ProspectionMailInput = {
  /** Nom de l'établissement. */
  name: string;
  /** Jeton de revendication (sans préfixe d'URL). */
  token: string;
  /** Lien de désinscription (obligatoire). */
  unsubscribe: string;
  /** Base du site, défaut https://hdar.chat */
  site?: string;
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Icône au trait en SVG inline (Apple Mail / webmail modernes ; Outlook ignore souvent le SVG). */
const icon = (paths: string, label: string) =>
  `<span role="img" aria-label="${esc(label)}" style="display:inline-block;width:28px;height:28px;vertical-align:middle;line-height:0">` +
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${C.coral}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg></span>`;

const I = {
  map: icon('<path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', "Carte"),
  building: icon('<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>', "Établissement"),
  user: icon('<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>', "Profil"),
  check: icon('<path d="M20 6L9 17l-5-5"/>', "Valider"),
  spark: icon('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>', "Avantages"),
};

function claimUrl(site: string, token: string) {
  const base = site.replace(/\/$/, "");
  return `${base}/pro?claim=${encodeURIComponent(token)}`;
}

export function prospectionSubject(name: string) {
  return `Votre établissement « ${name} » est déjà sur hdar.chat — revendiquez votre fiche`;
}

/** Version texte brut (multipart / accessibilité). */
export function prospectionMailText(o: ProspectionMailInput): string {
  const site = o.site || "https://hdar.chat";
  const url = claimUrl(site, o.token);
  return [
    `Bonjour,`,
    ``,
    `La fiche de « ${o.name} » est déjà préparée sur hdar.chat, la carte live des sorties et rencontres autour de soi (18+, discret).`,
    ``,
    `En un clic, vous créez votre profil pro, vous modifiez la fiche, vous la validez, puis vous la publiez : vous en devenez l'administrateur.`,
    ``,
    `Pendant le lancement : 90 jours offerts, sans carte bancaire, après validation de votre fiche.`,
    `Ensuite : 15 € / semaine · 49 € / mois · 129 € / 3 mois. Sans engagement, résiliable depuis votre espace pro.`,
    ``,
    `Voir et revendiquer ma fiche :`,
    url,
    ``,
    `Avantages partenaires : visibilité sur la carte, Live Pro, Cadeau pro, avis sous votre contrôle, statistiques agrégées (jamais d'identité des membres).`,
    ``,
    `Expéditeur : hdar. partenaires · contact@hdar.chat · https://hdar.chat`,
    `Ne plus recevoir ces messages : ${o.unsubscribe}`,
    ``,
    `(Brouillon — envoi non activé tant que les migrations v107/v130 ne sont pas appliquées en production.)`,
  ].join("\n");
}

/** HTML email (tables + styles inline). */
export function prospectionMailHtml(o: ProspectionMailInput): string {
  const site = o.site || "https://hdar.chat";
  const url = claimUrl(site, o.token);
  const name = esc(o.name);
  const unsub = esc(o.unsubscribe);
  const href = esc(url);

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
<!-- hdar prospection mail · PROSPECTION_MAIL_ACTIVATED=${String(PROSPECTION_MAIL_ACTIVATED)} · ne pas envoyer sans accord -->
</head>
<body style="margin:0;padding:0;background:${C.night};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">
  Votre fiche « ${name} » est prête sur hdar. 90 jours offerts au lancement. Revendiquez-la en quelques minutes.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:28px;overflow:hidden">

  <!-- logo -->
  <tr><td align="center" style="padding:26px 24px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <span style="font-size:30px;font-weight:800;letter-spacing:-0.5px;color:${C.ink}">hdar<span style="color:${C.coral}">.</span></span>
    <div style="margin-top:6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.mint};font-weight:700">Partenaires</div>
  </td></tr>

  <!-- hero -->
  <tr><td style="padding:12px 20px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:22px;background:radial-gradient(circle at 18% 15%,rgba(250,111,108,.45),transparent 55%),radial-gradient(circle at 88% 90%,rgba(62,224,143,.28),transparent 55%),#1a1220">
      <tr><td style="padding:28px 22px;text-align:center">
        <div style="font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:${C.gold};font-weight:700;margin-bottom:10px">Fiche déjà prête</div>
        <div style="font-size:24px;font-weight:800;line-height:1.25;color:${C.ink};margin:0">${I.building}&nbsp; ${name}</div>
        <div style="font-size:14px;line-height:1.55;color:${C.muted};margin-top:12px">
          Votre établissement apparaît déjà sur la carte hdar. Créez votre profil pro, validez la fiche, publiez-la : vous en devenez l'administrateur.
        </div>
      </td></tr>
    </table>
  </td></tr>

  <!-- intro -->
  <tr><td style="padding:20px 26px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.65;color:${C.ink}">
    <p style="margin:0 0 12px">Bonjour,</p>
    <p style="margin:0;color:${C.muted}">
      hdar.chat est la carte live des sorties et rencontres autour de soi, pour tout le monde (18&nbsp;+, discret).
      Les membres voient les lieux partenaires au moment où ils décident de sortir.
    </p>
  </td></tr>

  <!-- parcours -->
  <tr><td style="padding:18px 26px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.green};margin-bottom:6px">Comment ça se passe</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row(I.user, "1 · Profil pro", "Indiquez votre nom de gérant et un contact professionnel, puis confirmez que vous représentez l'établissement.")}
      ${row(I.map, "2 · Modification", "Complétez description, photos, position, horaires et réglages des avis.")}
      ${row(I.check, "3 · Validation et publication", "Vous validez explicitement : la fiche passe en ligne. Vous restez administrateur de votre espace pro.")}
    </table>
  </td></tr>

  <!-- avantages -->
  <tr><td style="padding:18px 26px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.green};margin-bottom:10px">${I.spark}&nbsp; Ce que vous y gagnez</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};border:1px solid ${C.line};border-radius:18px">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:1.6;color:${C.muted}">
        <strong style="color:${C.ink}">Visibilité sur la carte</strong> au moment où les gens cherchent où sortir.<br>
        <strong style="color:${C.ink}">Live Pro</strong> et <strong style="color:${C.ink}">Cadeau pro</strong> pour animer votre lieu.<br>
        <strong style="color:${C.ink}">Avis sous votre contrôle</strong> (notes et commentaires publics ou privés).<br>
        <strong style="color:${C.ink}">Statistiques agrégées</strong> : vues, clics, zones — jamais l'identité des membres.
      </td></tr>
    </table>
  </td></tr>

  <!-- offre + tarifs -->
  <tr><td style="padding:18px 26px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.gold};border-radius:18px;background:#1a1610">
      <tr><td style="padding:16px 18px">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.gold};font-weight:700">Offre de lancement</div>
        <div style="font-size:18px;font-weight:800;color:${C.ink};margin-top:6px">90 jours offerts, sans carte bancaire</div>
        <div style="font-size:13px;line-height:1.55;color:${C.muted};margin-top:6px">
          Après validation de votre fiche. Ensuite, seulement si vous continuez :
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
        <div style="font-size:12px;color:${C.dim};margin-top:10px">Sans engagement. Résiliation depuis votre espace pro.</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td align="center" style="padding:26px 24px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <a href="${href}" style="display:inline-block;background:${C.coral};color:${C.night};font-weight:800;font-size:16px;line-height:1.2;text-decoration:none;border-radius:999px;padding:16px 28px;mso-padding-alt:16px 28px">
      <!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%;mso-text-raise:21pt">&nbsp;</i><![endif]-->
      <span style="mso-text-raise:10pt">Voir et revendiquer ma fiche</span>
      <!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%">&nbsp;</i><![endif]-->
    </a>
    <div style="font-size:12px;color:${C.dim};margin-top:12px;word-break:break-all">
      Ou ouvrez ce lien :<br><a href="${href}" style="color:${C.mint}">${href}</a>
    </div>
  </td></tr>

  <!-- identité -->
  <tr><td style="padding:8px 26px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;line-height:1.55;color:${C.dim};text-align:center">
    Expéditeur : <strong style="color:${C.muted}">hdar. partenaires</strong> · <a href="mailto:contact@hdar.chat" style="color:${C.muted}">contact@hdar.chat</a><br>
    <a href="https://hdar.chat" style="color:${C.muted}">hdar.chat</a> · 18+ · discret · lieux LGBT+ et inclusifs
  </td></tr>
</table>

<p style="max-width:560px;margin:16px auto 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;line-height:1.55;color:${C.dim};text-align:center">
  Vous recevez ce message car votre établissement figure (ou peut figurer) sur la carte hdar en tant que lieu partenaire potentiel.
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
  };
}
