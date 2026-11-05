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
  it("reste non activé", () => {
    assert.equal(PROSPECTION_MAIL_ACTIVATED, false);
    assert.equal(buildProspectionMail(sample).activated, false);
  });

  it("ne prétend pas que la fiche est déjà visible", () => {
    const html = prospectionMailHtml(sample);
    const text = prospectionMailText(sample);
    for (const s of [html, text]) {
      assert.match(s, /prépar/i);
      assert.match(s, /pas encore/i);
      assert.doesNotMatch(s, /apparaît déjà sur la carte/i);
      assert.doesNotMatch(s, /est déjà visible/i);
      assert.doesNotMatch(s, /anonyme/i);
    }
  });

  it("explique Live Pro, Cadeau pro et Boost Pro avec faits vérifiés", () => {
    const html = prospectionMailHtml(sample);
    assert.match(html, /Live Pro/);
    assert.match(html, /pas de limite de distance|n'a pas de limite de distance/);
    assert.match(html, /Cadeau pro/);
    assert.match(html, /20 cadeaux/);
    assert.match(html, /Un verre offert/);
    assert.match(html, /Boost Pro/);
    assert.match(html, /pin doré|À la une/);
    assert.match(html, /4 photos/);
  });

  it("images hébergées sans jeton + CTA + tarifs", () => {
    const html = prospectionMailHtml(sample);
    assert.match(html, /https:\/\/hdar\.chat\/email\/prospection\/carte-montpellier\.jpg/);
    assert.doesNotMatch(html, /email\/prospection\/[^"']*claim=/);
    assert.doesNotMatch(html, /demoTokenAbc123\.(jpg|png)/);
    assert.match(html, /Voir et revendiquer ma fiche/);
    assert.match(html, /pro\?claim=demoTokenAbc123/);
    assert.match(html, /15/);
    assert.match(html, /49/);
    assert.match(html, /129/);
    assert.match(html, /Se désinscrire/);
    assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}]/u);
    assert.ok(html.length < 102_400);
  });
});
