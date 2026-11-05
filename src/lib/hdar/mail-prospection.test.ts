import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROSPECTION_MAIL_ACTIVATED,
  buildProspectionMail,
  prospectionMailHtml,
  prospectionMailText,
} from "./mail-prospection.ts";

const sample = {
  name: "Le Sauna du Port",
  token: "demoTokenAbc123",
  unsubscribe: "https://hdar.chat/pro?unsub=demo",
};

describe("mail prospection partenaires", () => {
  it("reste non activé tant que v107/v130 ne sont pas en prod", () => {
    assert.equal(PROSPECTION_MAIL_ACTIVATED, false);
    assert.equal(buildProspectionMail(sample).activated, false);
  });

  it("HTML : CTA, tarifs, désinscription, vouvoiement, pas d'anonyme ni d'emoji", () => {
    const html = prospectionMailHtml(sample);
    assert.match(html, /Voir et revendiquer ma fiche/);
    assert.match(html, /15/);
    assert.match(html, /49/);
    assert.match(html, /129/);
    assert.match(html, /90 jours/);
    assert.match(html, /pro\?claim=demoTokenAbc123/);
    assert.match(html, /Se désinscrire/);
    assert.match(html, /contact@hdar\.chat/);
    assert.match(html, /Vous /);
    assert.doesNotMatch(html, /anonyme/i);
    assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}]/u);
    assert.match(html, /discret/i);
    assert.ok(html.length < 102_400, "sous la limite de clip Gmail (~102 ko)");
  });

  it("texte : lien claim + désinscription + avertissement non activé", () => {
    const text = prospectionMailText(sample);
    assert.match(text, /Voir et revendiquer ma fiche/);
    assert.match(text, /pro\?claim=demoTokenAbc123/);
    assert.match(text, /Se désinscrire|Ne plus recevoir/);
    assert.match(text, /v107\/v130/);
    assert.doesNotMatch(text, /anonyme/i);
  });
});
