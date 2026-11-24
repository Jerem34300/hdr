import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeChanges,
  filterFicheRows,
  formatStars,
  kindLabel,
  methodLabel,
  photoSourceHref,
  photoSourceLabel,
  statusLabel,
  visiblePhotos,
  type FicheRow,
} from "./admin-fiches.ts";
import { DEMO_FICHE_ROWS } from "./admin-fiches-demo.ts";

const row = (over: Partial<FicheRow> = {}): FicheRow => ({ ...DEMO_FICHE_ROWS[0], ...over });

describe("admin fiches helpers", () => {
  it("traduit statuts, types et preuves en français simple", () => {
    assert.equal(statusLabel("discover"), "À découvrir");
    assert.equal(statusLabel("claimed"), "Réclamé");
    assert.equal(statusLabel("verified"), "Vérifié");
    assert.equal(statusLabel("partner"), "Partenaire");
    assert.equal(kindLabel("club"), "Discothèque");
    assert.equal(kindLabel("shop"), "Sex-shop");
    assert.equal(kindLabel("sauna"), "Sauna");
    assert.match(methodLabel("email_official"), /e-mail officiel/i);
    assert.match(methodLabel("admin_manual"), /document/i);
  });

  it("filtre la liste par ville, type, statut et recherche", () => {
    const rows = DEMO_FICHE_ROWS;
    assert.equal(filterFicheRows(rows, { city: "Paris" }).length, 2);
    assert.equal(filterFicheRows(rows, { country: "be" }).map((r) => r.name).join(), "Quetzal");
    assert.equal(filterFicheRows(rows, { kind: "sauna" }).map((r) => r.name).join(), "Entre Deux Eaux");
    assert.deepEqual(filterFicheRows(rows, { status: "claimed" }).map((r) => r.name), ["Gibus", "Le Shop (exemple)"]);
    assert.equal(filterFicheRows(rows, { q: "gibus" }).length, 1);
  });

  it("affiche notes, photos visibles et lien de source uniquement en http(s)", () => {
    assert.equal(formatStars(4.3, 12), "4,3 / 5 · 12 avis");
    assert.equal(formatStars(null, 0), "Pas encore de note");
    const photos = row().photos.concat({
      id: "x",
      url: "/x.jpg",
      source_url: "javascript:alert(1)",
      hidden: false,
    });
    assert.equal(visiblePhotos([{ ...photos[0], hidden: true }, photos[0]]).length, 1);
    assert.equal(photoSourceHref(photos[0]), "https://www.gibus.fr/");
    assert.equal(photoSourceLabel(photos[0]), "gibus.fr");
    assert.equal(photoSourceHref(photos[photos.length - 1]), null);
  });

  it("résume l'historique sans exposer de données binaires", () => {
    const lines = describeChanges({
      hours: { from: "12h–2h", to: "12h–3h" },
      photos: { from_n: 1, to_n: 2 },
      description: { from: "A", to: "B" },
    });
    assert.deepEqual(lines, ["Horaires : 12h–2h → 12h–3h", "Photos : 1 → 2", "Description : A → B"]);
  });
});
