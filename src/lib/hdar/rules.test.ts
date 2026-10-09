import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptiveCell,
  bucketDistance,
  conversationExpiry,
  hiddenIds,
  isExpired,
  notHidden,
  publishDistance,
  remainingLabel,
  snapMeters,
} from "./rules.ts";

test("snap is a grid, not a random nudge", () => {
  assert.equal(snapMeters(247, 100), 200);
  assert.equal(snapMeters(40, 100), 0);
  assert.equal(snapMeters(250, 300), 300);
  assert.equal(snapMeters(-80, 100), -100);
});

test("adaptive cell widens below 20 people", () => {
  assert.equal(adaptiveCell(20, 20), 100);
  assert.equal(adaptiveCell(19, 20), 300);
  assert.equal(adaptiveCell(19, 19), 1000);
  assert.equal(adaptiveCell(0, 0), 1000);
});

test("published distance never leaks an exact meter reading", () => {
  assert.equal(publishDistance(37, 100), "~100 m");
  assert.equal(publishDistance(247, 100), "~300 m");
  assert.equal(publishDistance(2400, 1000), "~2 km");
  for (const meters of [1, 37, 247, 880, 4321]) {
    const label = bucketDistance(meters);
    assert.match(label, /^~/);
    assert.equal(label.includes(`${meters} m`), false);
  }
});

test("expiry and pins", () => {
  assert.equal(isExpired(1_000, 1_000), true);
  assert.equal(isExpired(1_001, 1_000), false);
  assert.equal(isExpired(null, 9_999), false);
  assert.equal(conversationExpiry(0, true), null);
  assert.equal(conversationExpiry(0, false), 86_400_000);
  assert.equal(remainingLabel(null, 0), "Épinglée");
  assert.equal(remainingLabel(30_000, 0), "1 min");
});

test("a block or a report hides the person both ways in the list", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const hidden = hiddenIds(["b"], ["c"]);
  assert.deepEqual(
    notHidden(rows, hidden).map((r) => r.id),
    ["a"],
  );
  assert.deepEqual(notHidden(rows, hiddenIds(["a"], ["a"])).map((r) => r.id), ["b", "c"]);
});
