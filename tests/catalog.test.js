import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, FAMILY_OPTIONS, SHEETS } from "../src/data/catalog.js";
import { DIVISIONS } from "../src/data/divisions.js";

test("locks twenty-one divisions", () => {
  assert.equal(DIVISIONS.length, 21);
  assert.equal(new Set(DIVISIONS.map((division) => division.id)).size, 21);
});

test("registers fifty-four sheets and 1,134 entries", () => {
  assert.equal(SHEETS.length, 54);
  assert.equal(CATALOG.length, 1134);
});

test("creates unique card identifiers and names", () => {
  assert.equal(new Set(CATALOG.map((card) => card.id)).size, 1134);
  assert.equal(new Set(CATALOG.map((card) => card.canonicalName)).size, 1134);
  assert.ok(CATALOG.every((card) => card.provisional));
});

test("contains all twenty-eight families", () => {
  assert.equal(FAMILY_OPTIONS.length, 28);
});
