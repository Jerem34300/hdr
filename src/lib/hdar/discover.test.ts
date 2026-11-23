import assert from "node:assert/strict";
import test from "node:test";
import {
  emailMatchesWebsite, isDisplayableOutreach, isPaidPartner, kindNoun, listingLabel, maskEmail,
  publicDescription, websiteDomain,
} from "./discover-utils.ts";

test("maskEmail cache le début et garde le domaine", () => {
  assert.equal(maskEmail("contact@lecomptoir.fr"), "c***@lecomptoir.fr");
  assert.equal(maskEmail("  A@Site.COM "), "a***@site.com");
  assert.equal(maskEmail("pas-un-email"), null);
});

test("emailMatchesWebsite accepte le même domaine ou un sous-domaine", () => {
  assert.equal(emailMatchesWebsite("toi@lecomptoir.fr", "https://www.lecomptoir.fr/horaires"), true);
  assert.equal(emailMatchesWebsite("hello@mail.lecomptoir.fr", "https://lecomptoir.fr"), true);
  assert.equal(emailMatchesWebsite("toi@gmail.com", "https://lecomptoir.fr"), false);
  assert.equal(emailMatchesWebsite("toi@lecomptoir.fr", ""), false);
});

test("websiteDomain retire www et ignore le chemin", () => {
  assert.equal(websiteDomain("https://www.Exemple.hdar.chat/x"), "exemple.hdar.chat");
  assert.equal(websiteDomain("exemple.hdar.chat"), "exemple.hdar.chat");
});

test("isDisplayableOutreach exclut refus, désinscrits, rebonds et l'absence de coordonnées", () => {
  assert.equal(isDisplayableOutreach({ status: "sent", lat: 48.8, lng: 2.3 }), true);
  assert.equal(isDisplayableOutreach({ status: "ready", lat: 48.8, lng: 2.3 }), true);
  assert.equal(isDisplayableOutreach({ status: "bounced", lat: 48.8, lng: 2.3 }), false);
  assert.equal(isDisplayableOutreach({ status: "sent", refused_at: "2026-01-01", lat: 48.8, lng: 2.3 }), false);
  assert.equal(isDisplayableOutreach({ status: "suppressed", lat: 48.8, lng: 2.3 }), false);
  assert.equal(isDisplayableOutreach({ status: "sent", lat: null, lng: 2.3 }), false);
});

test("listingLabel : partenaires actuels = lieu à découvrir, badge Partenaire seulement si payant", () => {
  assert.equal(listingLabel("discover"), "Lieu à découvrir");
  assert.equal(listingLabel("discover", true), "Lieu à découvrir · Vérifié");
  assert.equal(listingLabel("partner"), "Lieu à découvrir");
  assert.equal(listingLabel("partner", false, true), "Partenaire");
  assert.equal(listingLabel("partner", true, false), "Lieu à découvrir · Vérifié");
  assert.equal(isPaidPartner({}), false);
  assert.equal(isPaidPartner({ paid_partner: true }), true);
  assert.equal(isPaidPartner({ stripe_subscription: "sub_x" }), true);
  assert.equal(isPaidPartner({ stripe_subscription: "  " }), false);
});

test("kindNoun reste neutre dans un pays à risque", () => {
  assert.equal(kindNoun("sauna", true), "Établissement");
  assert.equal(kindNoun("bar", true), "Bar");
  assert.equal(kindNoun("sauna", false), "Sauna");
});

test("publicDescription retire les mots sensibles dans un pays à risque", () => {
  const t = publicDescription("Bar gay du centre, soirées LGBT.", "MA");
  assert.equal(/gay|lgbt/i.test(t), false);
  assert.equal(publicDescription("Bar du centre.", "FR"), "Bar du centre.");
});

import { displayPlaceName, venueColor, venueOf } from "./venue.ts";

test("venueOf mappe les types de prospection, pas les restos inventés", () => {
  assert.equal(venueOf("bar"), "bar");
  assert.equal(venueOf("club"), "club");
  assert.equal(venueOf("sauna"), "sauna");
  assert.equal(venueOf("other"), "shop");
  assert.equal(venueOf("club-echange"), "exchange");
  assert.equal(venueOf("cruising-bar"), "cruising");
  assert.equal(venueOf("club", "club-echange"), "exchange");
  assert.equal(kindNoun("club-echange"), "Club échangiste");
  assert.equal(kindNoun("other"), "Boutique");
  assert.equal(kindNoun("sauna", true), "Établissement");
  assert.notEqual(venueColor("bar"), venueColor("club"));
  assert.notEqual(venueColor("bar"), venueColor("sauna"));
  assert.notEqual(venueColor("shop"), venueColor("exchange"));
});

test("displayPlaceName humanise un identifiant technique", () => {
  assert.equal(displayPlaceName("L'Impact Bar"), "L'Impact Bar");
  assert.equal(displayPlaceName("le-mask"), "Le Mask");
  assert.equal(displayPlaceName("la-bonbonniere-2"), "La Bonbonniere");
});

import { hasPlaceFacts, isEstablishmentPlace, mergePlaceFacts, placeFactsFallbackKey, textOrNull } from "./place-facts.ts";

test("mergePlaceFacts privilégie la colonne et ne comble qu'avec le manifest", () => {
  const merged = mergePlaceFacts(
    { hours: "  19 h – 2 h  ", tags: ["cocktails", ""], entry: null },
    { hours: "autre", entry: "18+", events: [{ name: "Cruising", when: "lundi", price: 15 }, { name: "Bears", when: "mardi" }] },
  );
  assert.equal(merged.hours, "19 h – 2 h");
  assert.equal(merged.entry, "18+");
  assert.deepEqual(merged.events, ["Cruising · lundi · 15 €", "Bears · mardi"]);
  assert.deepEqual(merged.tags, ["cocktails"]);
  assert.equal(hasPlaceFacts(merged), true);
  assert.equal(hasPlaceFacts(mergePlaceFacts({})), false);
  assert.equal(textOrNull("  "), null);
  assert.equal(textOrNull(["", "  "]), null);
});

test("isEstablishmentPlace distingue un établissement d'un lieu public", () => {
  assert.equal(isEstablishmentPlace({ kind: "bar" }), true);
  assert.equal(isEstablishmentPlace({ kind: "sauna", venue: "sauna" }), true);
  assert.equal(isEstablishmentPlace({ kind: "club", venue: "cruising" }), true);
  assert.equal(isEstablishmentPlace({ kind: "park" }), false);
  assert.equal(isEstablishmentPlace({ kind: "cruising", venue: "cruising" }), false);
});

test("placeFactsFallbackKey suit le type du lieu", () => {
  assert.match(placeFactsFallbackKey({ kind: "sauna" }), /sauna/);
  assert.match(placeFactsFallbackKey({ kind: "bar" }), /bar/);
  assert.match(placeFactsFallbackKey({ kind: "club" }), /club/);
  assert.match(placeFactsFallbackKey({ kind: "other", venue: "shop" }), /boutique/);
});
