import assert from "node:assert/strict";
import test from "node:test";
import { isCountryCentroid, spiderfyOffsets } from "./map-pins.ts";

test("le centroïde France près de Sarzay n'est pas une vraie ville", () => {
  assert.equal(isCountryCentroid(46.6034, 1.8883), true);
  assert.equal(isCountryCentroid(46.603354, 1.888334), true);
  // arrondi 0,1° comme /api/geo
  assert.equal(isCountryCentroid(46.6, 1.9), true);
  // vraie adresse (Le Mensch, rue Charlot)
  assert.equal(isCountryCentroid(48.862529, 2.362241), false);
  assert.equal(isCountryCentroid(43.604394, 1.434077), false);
});

test("spiderfy écarte chaque pin, le premier en haut", () => {
  assert.deepEqual(spiderfyOffsets(1), [{ dx: 0, dy: 0 }]);
  const two = spiderfyOffsets(2, 40);
  assert.equal(two.length, 2);
  assert.ok(Math.abs(two[0].dx) < 1e-10 && Math.abs(two[0].dy + 40) < 1e-10);
  const xs = new Set(two.map((o) => `${o.dx.toFixed(3)},${o.dy.toFixed(3)}`));
  assert.equal(xs.size, 2);
  const twelve = spiderfyOffsets(12);
  assert.equal(twelve.length, 12);
  assert.equal(new Set(twelve.map((o) => `${o.dx.toFixed(3)},${o.dy.toFixed(3)}`)).size, 12);
});
