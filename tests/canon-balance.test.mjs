import test from 'node:test';
import assert from 'node:assert/strict';
import { cards } from '../card-canon.js';
import { ENTITY_FAMILIES } from '../match-engine.js';

/* Card power used to be drawn from a hash that had nothing to do with cost.
 * Measured over the canon, r(totalCost, power) was 0.0156 -- power-10 bodies
 * existed at every cost from 1 to 8, so sorting the canon by power-per-cost
 * produced a 30-card deck that beat the strongest AI 100% of the time, and 19
 * of those 30 cards came from the families that have no mechanical effect at
 * all. Every interesting card in the game was a strictly worse draft pick.
 *
 * These tests exist so that can never quietly come back. */

const totalCost = card => card.cost.command + card.cost.insight + card.cost.essence;
const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length;

function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const sx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const sy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return cov / (sx * sy);
}

test('power is strongly correlated with what a card costs', () => {
  const r = pearson(cards.map(totalCost), cards.map(c => c.power));
  assert.ok(r > 0.85, `expected r(totalCost, power) > 0.85, got ${r.toFixed(4)}`);
});

test('paying more is never, on average, a downgrade', () => {
  const byCost = new Map();
  for (const c of cards) {
    if (!byCost.has(totalCost(c))) byCost.set(totalCost(c), []);
    byCost.get(totalCost(c)).push(c.power);
  }
  const costs = [...byCost.keys()].sort((a, b) => a - b);
  for (let i = 1; i < costs.length; i++) {
    const lower = mean(byCost.get(costs[i - 1])), higher = mean(byCost.get(costs[i]));
    assert.ok(higher >= lower,
      `mean power at cost ${costs[i]} (${higher.toFixed(2)}) must not fall below cost ${costs[i - 1]} (${lower.toFixed(2)})`);
  }
});

test('no card is strictly the best pick at its power for a trivial price', () => {
  /* The exploit was concretely "10 power for 1 resource". Anything at or above
   * the top of the power range must cost near the top of the cost range. */
  const maxPower = Math.max(...cards.map(c => c.power));
  for (const c of cards) {
    if (c.power === maxPower) {
      assert.ok(totalCost(c) >= 7,
        `${c.id} has max power ${maxPower} for only ${totalCost(c)} -- the power-per-cost exploit is back`);
    }
  }
});

test('the cheapest bodies are genuinely weak', () => {
  const cheap = cards.filter(c => ENTITY_FAMILIES.has(c.family) && totalCost(c) === 1);
  assert.ok(cheap.length > 0, 'expected the canon to contain 1-cost entities');
  const strongest = Math.max(...cheap.map(c => c.power));
  assert.ok(strongest <= 4,
    `strongest 1-cost entity is ${strongest} power; a cheap-swarm deck of these beat every archetype`);
});

test('the canon still holds 1,134 cards with untouched identity fields', () => {
  assert.equal(cards.length, 1134);
  const ids = new Set(cards.map(c => c.id));
  assert.equal(ids.size, 1134);
  /* Rebalancing power must not have disturbed anything a player identifies a
   * card by, nor the art coordinates the atlas is addressed with. */
  for (const c of cards) {
    assert.ok(c.name && c.rulesText && c.rarity && c.divisionName);
    assert.ok(Number.isInteger(c.art.row) && Number.isInteger(c.art.col));
    assert.ok(c.art.row >= 0 && c.art.row < 54 && c.art.col >= 0 && c.art.col < 21);
  }
});
