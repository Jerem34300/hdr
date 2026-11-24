import assert from "node:assert/strict";
import test from "node:test";
import {
  emailMatchesWebsite, isDisplayableOutreach, isPaidPartner, kindNoun, listingLabel, maskEmail,
  defaultCover, isGenericPlaceDescription, photoCreditLabel,
  publicDescription, pickPlaceDescription, websiteDomain,
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

test("photoCreditLabel n'affiche que le domaine, une fois, sans URL", () => {
  assert.equal(photoCreditLabel("Photo : https://data.strobomag.com/assets/businesses/the-muse/main.jpg"), "data.strobomag.com");
  assert.equal(
    photoCreditLabel("Photo : Photo : https://www.redsauna.fr/a.jpg · https://www.redsauna.fr/b.jpg?x=1"),
    "redsauna.fr",
  );
  assert.equal(photoCreditLabel("redsauna.fr"), "redsauna.fr");
  assert.equal(photoCreditLabel("Photo du lieu (source à confirmer)"), null);
  assert.equal(photoCreditLabel(null, "https://www.exemple.fr/x.jpg"), "exemple.fr");
});

test("isGenericPlaceDescription détecte les phrases auto mixées", () => {
  assert.equal(isGenericPlaceDescription("Club en Valencia."), true);
  assert.equal(isGenericPlaceDescription("Sauna au Cour Brasserie, à Uckange."), true);
  assert.equal(isGenericPlaceDescription("Club à Paris."), true);
  assert.equal(isGenericPlaceDescription(""), true);
  assert.equal(
    isGenericPlaceDescription("Le Koncept Sauna se trouve à Montpellier. Hammam, sauna et jacuzzi."),
    false,
  );
});

test("defaultCover suit le type, sans photo stock", () => {
  assert.equal(defaultCover("sauna"), "/places/cover-sauna.svg");
  assert.equal(defaultCover("bar"), "/places/cover-bar.svg");
  assert.equal(defaultCover("club"), "/places/cover-club.svg");
  assert.equal(defaultCover("shop"), "/places/cover-shop.svg");
  assert.equal(defaultCover("exchange"), "/places/cover-exchange.svg");
  assert.equal(defaultCover("cruising"), "/places/cover-cruising.svg");
  assert.equal(defaultCover("park"), "/places/cover-other.svg");
  assert.equal(defaultCover("beach"), "/places/cover-other.svg");
});

test("pickPlaceDescription choisit la langue de l'app, avec repli français", () => {
  const i18n = {
    fr: "Club à Valencia. Ouvert le vendredi et le samedi de 22h à 4h.",
    es: "Club en Valencia. Abierto viernes y sábado de 22:00 a 4:00.",
    en: "Club in Valencia. Open Friday and Saturday from 10 pm to 4 am.",
  };
  assert.equal(pickPlaceDescription(i18n, "fr"), i18n.fr);
  assert.equal(pickPlaceDescription(i18n, "es"), i18n.es);
  assert.equal(pickPlaceDescription(i18n, "ar"), i18n.fr);
  assert.equal(pickPlaceDescription(undefined, "es", i18n.fr), i18n.fr);
  assert.equal(
    pickPlaceDescription({ fr: "Club lesbien et ouvert aux femmes queer, à Paris, depuis 1992." }, "fr"),
    "Club lesbien et ouvert aux femmes queer, à Paris, depuis 1992.",
  );
  assert.equal(isGenericPlaceDescription(i18n.fr), false);
  assert.equal(isGenericPlaceDescription("Club à Paris."), true);
});

test("association est un établissement, avec couverture sportive", () => {
  assert.equal(defaultCover("association"), "/places/cover-association.svg");
  assert.equal(venueOf("association"), "association");
  assert.equal(isEstablishmentPlace({ kind: "association", venue: "association" }), true);
  assert.match(placeFactsFallbackKey({ kind: "association", venue: "association" }), /association/);
});
