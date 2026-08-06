import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "../src/data/catalog.js";
import { canAfford, createMatchState, endTurn, playCard } from "../src/lib/game.js";

const freeCard = { ...CATALOG[0], command: 0, insight: 0, essence: 0 };

test("starts with three lanes and twenty core integrity", () => {
  const state = createMatchState();
  assert.equal(state.lanes.length, 3);
  assert.equal(state.coreIntegrity.player, 20);
});

test("deploys an affordable card to a lane", () => {
  const state = playCard(createMatchState(), freeCard, 0);
  assert.equal(state.lanes[0].player.length, 1);
  assert.match(state.log[0], new RegExp(freeCard.canonicalName));
});

test("rejects a card that cannot be afforded", () => {
  const expensive = { ...CATALOG[0], command: 99 };
  assert.equal(canAfford(createMatchState().resources, expensive), false);
  const state = playCard(createMatchState(), expensive, 0);
  assert.equal(state.lanes[0].player.length, 0);
});

test("advances and refreshes the turn", () => {
  const state = endTurn(createMatchState());
  assert.equal(state.turn, 2);
  assert.ok(state.resources.command >= 3);
});
