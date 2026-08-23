/* state-integrity.test.mjs — the invariants that make the match state trustworthy.
 *
 * The suite already asserts that the event stream reconciles with the statistics.
 * What it did not assert is that the *board* stays well formed: that cards are
 * conserved, that no card or unit id is ever duplicated, that lane capacity holds,
 * and that no resource or Core goes negative.
 *
 * This is the class of bug that is invisible until it is catastrophic. A card that
 * ends up in both a lane and the discard pile is a duplication exploit in any game
 * that later grows a shared or competitive mode, and it is exactly the kind of
 * defect that a per-feature test never finds — it only shows up when you count the
 * whole board after every turn of a lot of matches. Nothing found a violation when
 * this was written; the point is that a future change cannot introduce one quietly.
 *
 * The corpus is the real canon and the real deck builders, not fixtures, because a
 * card the fixtures do not model is precisely where the leak would be.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cards } from '../card-canon.js';
import { buildStarterDeck, buildRivalDeck } from '../deck-store.js';
import {
  DECK_SIZE, DIFFICULTY_TIERS, MAX_UNITS_PER_LANE, MAX_SUPPORTS_PER_LANE, RESOURCE_KEYS,
  createMatch, mulligan, aiTakeMainPhase, completePlayerTurn,
} from '../match-engine.js';

const byId = new Map(cards.map(c => [c.id, c]));
const playerDeck = buildStarterDeck(cards).map(id => byId.get(id));
const rivalDeck = buildRivalDeck(cards, playerDeck).map(id => byId.get(id));

/** Every card the side owns, wherever it currently sits. */
function census(side) {
  const out = [];
  for (const c of side.deck) out.push(c.id);
  for (const c of side.hand) out.push(c.id);
  for (const c of side.discard) out.push(c.id);
  for (const lane of side.lanes) {
    for (const u of lane.units) out.push(u.card.id);
    for (const s of lane.supports) out.push(s.card.id);
  }
  for (const d of side.delayed || []) if (d.card) out.push(d.card.id);
  return out.sort();
}

/** Plays out matches at every tier and hands each turn's board to `inspect`. */
function sweep(inspect, { seeds = 24, maxTurns = 60 } = {}) {
  for (const difficulty of DIFFICULTY_TIERS) {
    for (let seed = 1; seed <= seeds; seed++) {
      const opened = createMatch({ playerDeck, rivalDeck, seed, difficulty });
      // A third of the runs mulligan, so the "cards go to the bottom of the deck
      // and are redrawn" path is inside the conservation window too.
      let state = mulligan(opened, 'player', seed % 3 === 0 ? [0, 2] : []);
      let turns = 0;
      while (state.phase !== 'ended' && turns++ < maxTurns) {
        state = aiTakeMainPhase(state, 'player', 'veteran');
        if (state.phase === 'ended') break;
        state = completePlayerTurn(state);
        for (const which of ['player', 'rival']) inspect(state.players[which], { which, state, seed, difficulty });
      }
    }
  }
}

test('no card is ever duplicated or lost: every deck still holds its 30 cards, once each', () => {
  sweep((side, ctx) => {
    const bag = census(side);
    assert.equal(bag.length, DECK_SIZE,
      `${ctx.which} holds ${bag.length} cards at ${ctx.difficulty}/seed ${ctx.seed}, round ${ctx.state.round}`);
    assert.equal(new Set(bag).size, bag.length,
      `${ctx.which} holds a duplicated card at ${ctx.difficulty}/seed ${ctx.seed}, round ${ctx.state.round}`);
  });
});

test('unit and support ids stay unique across the whole board', () => {
  sweep((side, ctx) => {
    const uids = [];
    for (const lane of side.lanes) {
      for (const u of lane.units) uids.push(u.uid);
      for (const s of lane.supports) uids.push(s.uid);
    }
    assert.equal(new Set(uids).size, uids.length,
      `${ctx.which} has a duplicated uid at ${ctx.difficulty}/seed ${ctx.seed}`);
  });
});

test('lane capacity, resources and Core never leave their legal range', () => {
  sweep((side, ctx) => {
    const where = `${ctx.which} at ${ctx.difficulty}/seed ${ctx.seed}, round ${ctx.state.round}`;
    side.lanes.forEach((lane, i) => {
      assert.ok(lane.units.length <= MAX_UNITS_PER_LANE, `${where}: lane ${i} holds ${lane.units.length} units`);
      assert.ok(lane.supports.length <= MAX_SUPPORTS_PER_LANE, `${where}: lane ${i} holds ${lane.supports.length} supports`);
      // A unit at or below 0 power is destroyed; one left on the board would
      // keep blocking a lane it can no longer hold.
      for (const u of lane.units) assert.ok(u.power > 0, `${where}: ${u.uid} is on the board at power ${u.power}`);
    });
    for (const k of RESOURCE_KEYS) assert.ok(side.resources[k] >= 0, `${where}: ${k} is ${side.resources[k]}`);
    assert.ok(side.core >= 0, `${where}: Core is ${side.core}`);
  });
});

test('the event sequence is strictly increasing for the life of a match', () => {
  sweep((_side, ctx) => {
    const seqs = ctx.state.events.map(e => e.seq);
    for (let i = 1; i < seqs.length; i++) {
      assert.ok(seqs[i] > seqs[i - 1], `event ${i} went backwards at ${ctx.difficulty}/seed ${ctx.seed}`);
    }
  }, { seeds: 8 });
});
