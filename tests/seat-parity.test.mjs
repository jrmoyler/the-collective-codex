/* seat-parity.test.mjs — the seat you sit in should not decide the match.
 *
 * The engine's own notes carried this defect, measured and unfixed, for several
 * releases: "on mirror decks the first seat currently wins 72-81%… Fixing it
 * properly means revisiting combat, not the opening hand." The cause is
 * structural. The first seat attacks into the second seat's board before that
 * board has attacked, so it removes blockers a turn earlier every round; the
 * advantage compounds rather than deciding one final swing, which is why an
 * extra opening CARD moved it by less than run-to-run noise.
 *
 * The compensation that closed it is resource tempo, granted once at the second
 * seat's first refresh. These tests hold two separate things: that the numbers
 * still measure parity, and that the mechanism is wired where it claims to be —
 * a measurement alone would not say which knob had drifted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cards, cardById } from '../card-canon.js';
import { buildStarterDeck } from '../deck-store.js';
import { simulateMatch, createRuleset, createMatch, mulligan, completePlayerTurn, aiTakeMainPhase, RESOURCE_KEYS, DEFAULT_RULES } from '../match-engine.js';

const starter = buildStarterDeck(cards).map(id => cardById.get(id));
const legal = cards.filter(c => c.pvpLegal !== false);
const totalCost = c => c.cost.command + c.cost.insight + c.cost.essence;
const topPower = legal.slice().sort((a, b) => b.power - a.power || (a.id < b.id ? -1 : 1)).slice(0, 30);

/** First-seat win rate over `seeds` mirror matches, as a percentage. */
function firstSeatWinRate(deck, { tier = 'veteran', rules, seeds = 60 } = {}) {
  let first = 0, decided = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const result = simulateMatch({ playerDeck: deck, rivalDeck: deck, seed, difficulty: tier, playerDifficulty: tier, rules });
    assert.ok(!result.timedOut, `mirror match ${seed} never resolved`);
    if (result.winner === 'draw') continue;
    decided += 1;
    if (result.winner === 'player') first += 1;
  }
  return (first / decided) * 100;
}

/* The ruleset as it was before the fix: the extra opening card, and nothing
 * else. Kept as a live control so the tests below measure a real improvement
 * rather than asserting a number that happens to be true today. */
const LEGACY = createRuleset({ onTheDraw: { cards: 1, command: 0, insight: 0, essence: 0 } });

test('the seat bias this fix targets is real and reproducible', () => {
  const rate = firstSeatWinRate(starter, { rules: LEGACY });
  assert.ok(rate > 70, `the documented defect should still reproduce under the old numbers, measured ${rate.toFixed(1)}%`);
});

test('with the shipped ruleset neither seat owns the match', () => {
  for (const [name, deck] of [['starter doctrine', starter], ['top-power doctrine', topPower]]) {
    const rate = firstSeatWinRate(deck);
    assert.ok(rate > 35 && rate < 65, `${name}: first seat won ${rate.toFixed(1)}%, which is not a contest`);
  }
});

test('parity holds at every rival tier, not just the default one', () => {
  for (const tier of ['veteran', 'sovereign']) {
    const rate = firstSeatWinRate(starter, { tier });
    assert.ok(rate > 35 && rate < 65, `${tier}: first seat won ${rate.toFixed(1)}%`);
  }
});

test('the compensation lands once, at the second seat first refresh, and never after', () => {
  let state = mulligan(createMatch({ playerDeck: starter, rivalDeck: starter, seed: 3 }), 'player', []);
  const grants = () => state.events.filter(e => e.type === 'resource-gain' && e.source === 'On the draw');
  assert.equal(grants().length, 0, 'nothing is granted before the second seat has taken a turn');
  state = completePlayerTurn(state);
  const first = grants();
  assert.equal(first.length, RESOURCE_KEYS.filter(k => DEFAULT_RULES.onTheDraw[k] > 0).length);
  assert.ok(first.every(e => e.side === 'rival'), 'the grant belongs to the seat that acts second');
  for (let round = 0; round < 3 && state.phase !== 'ended'; round++) {
    state = aiTakeMainPhase(state, 'player', 'veteran');
    if (state.phase !== 'ended') state = completePlayerTurn(state);
  }
  assert.equal(grants().length, first.length, 'a once-per-match grant that fires twice is a resource engine');
});

test('the grant is ruleset data, so a balance pass is a config change', () => {
  const state = completePlayerTurn(
    mulligan(createMatch({ playerDeck: starter, rivalDeck: starter, seed: 3, rules: createRuleset({ onTheDraw: { cards: 0, command: 3, insight: 0, essence: 0 } }) }), 'player', []),
  );
  const grants = state.events.filter(e => e.type === 'resource-gain' && e.source === 'On the draw');
  assert.deepEqual(grants.map(e => [e.resource, e.amount]), [['command', 3]]);
});

test('turning the compensation off restores the bias — the knob is the cause', () => {
  const off = createRuleset({ onTheDraw: { cards: 0, command: 0, insight: 0, essence: 0 } });
  const biased = firstSeatWinRate(starter, { rules: off, seeds: 40 });
  const fair = firstSeatWinRate(starter, { seeds: 40 });
  assert.ok(biased - fair > 15, `removing it must move the result materially (${biased.toFixed(1)}% vs ${fair.toFixed(1)}%)`);
});
