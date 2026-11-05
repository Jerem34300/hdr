import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROSPECTION_MAIL_ACTIVATED,
  buildProspectionMail,
  prospectionMailHtml,
  prospectionMailText,
  prospectionMapAsset,
  prospectionSubject,
} from "./mail-prospection.ts";

const sample = {
  name: "Le Sauna du Port",
  token: "demoTokenAbc123",
  unsubscribe: "https://hdar.chat/pro?unsub=demo",
  city: "Montpellier",
};

describe("mail prospection partenaires", () => {
  it("reste non activé", () => {
    assert.equal(PROSPECTION_MAIL_ACTIVATED, false);
  });

  it("titre et aperçu dynamiques selon la ville", () => {
    assert.match(prospectionSubject("X", "Paris"), /à Paris/);
    assert.match(prospectionSubject("X"), /Fiche préparée/);
    assert.equal(prospectionMapAsset("Montpellier").file, "carte-montpellier.jpg");
    assert.equal(prospectionMapAsset("Paris").file, "hdar-hero.jpg");
    assert.equal(prospectionMapAsset(null).file, "hdar-hero.jpg");
    const html = prospectionMailHtml(sample);
    assert.match(html, /Montpellier/);
    assert.match(html, /carte-montpellier\.jpg/);
    const paris = prospectionMailHtml({ ...sample, city: "Paris" });
    assert.match(paris, /Paris/);
    assert.match(paris, /hdar-hero\.jpg/);
    assert.doesNotMatch(paris, /carte-montpellier/);
  });

  it("ne prétend pas que la fiche est déjà visible", () => {
    const html = prospectionMailHtml(sample);
    const text = prospectionMailText(sample);
    for (const s of [html, text]) {
      assert.match(s, /prépar/i);
      assert.match(s, /pas encore/i);
      assert.doesNotMatch(s, /anonyme/i);
    }
  });

  it("explique outils + images sans jeton", () => {
    const html = prospectionMailHtml(sample);
    assert.match(html, /Live Pro/);
    assert.match(html, /Cadeau pro/);
    assert.match(html, /Boost Pro/);
    assert.match(html, /20 cadeaux/);
    assert.match(html, /Voir et revendiquer ma fiche/);
    assert.doesNotMatch(html, /demoTokenAbc123\.(jpg|png)/);
    assert.ok(buildProspectionMail(sample).html.length < 102_400);
  });
});
