/* match-codec.test.mjs — a match in progress, written down and read back.
 *
 * The bar is not "it round-trips". It is that a restored board plays out
 * IDENTICALLY to the one it replaced, and that anything less than identical is
 * refused outright — a player cannot see that the board in front of them is
 * subtly not the board they left, so a wrong restore is worse than none.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cards, cardById } from '../card-canon.js';
import { buildStarterDeck } from '../deck-store.js';
import { createMatch, mulligan, playCard, completePlayerTurn, aiTakeMainPhase, getPlayability, createRuleset } from '../match-engine.js';
import { encodeMatch, decodeMatch, validateMatch, saveMatch, loadMatch, clearMatch, MATCH_SCHEMA, MATCH_STORAGE_KEY } from '../match-codec.js';

const deckCards = buildStarterDeck(cards).map(id => cardById.get(id));
const wire = state => JSON.parse(JSON.stringify(encodeMatch(state)));

/** A match several rounds deep, so the fixture has units, supports, a discard
 *  pile, resource carry and a long event stream — not an opening hand. */
function playedOut(rounds = 5, options = {}) {
  let state = mulligan(createMatch({ playerDeck: deckCards, rivalDeck: deckCards, seed: 42, ...options }), 'player', [0, 3]);
  for (let i = 0; i < rounds && state.phase !== 'ended'; i++) {
    state = aiTakeMainPhase(state, 'player', 'veteran');
    if (state.phase !== 'ended') state = completePlayerTurn(state);
  }
  return state;
}

/** localStorage, as much of it as the codec touches. */
function fakeStorage({ failFirstWrite = false, limit = Infinity } = {}) {
  const map = new Map();
  let failed = false;
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      if (failFirstWrite && !failed) { failed = true; throw new DOMException('quota', 'QuotaExceededError'); }
      if (v.length > limit) throw new DOMException('quota', 'QuotaExceededError');
      map.set(k, v);
    },
    removeItem: k => map.delete(k),
  };
}

test('a restored match is byte-identical to the one it replaced', () => {
  const state = playedOut();
  const restored = decodeMatch(wire(state), { cardById });
  assert.equal(restored.error, undefined);
  assert.deepEqual(wire(restored.state), wire(state));
});

test('and it plays on identically — the real test of a save file', () => {
  const state = playedOut();
  const restored = decodeMatch(wire(state), { cardById }).state;
  const continueFrom = s => completePlayerTurn(aiTakeMainPhase(s, 'player', 'veteran'));
  assert.deepEqual(wire(continueFrom(restored)), wire(continueFrom(state)));
});

test('canon cards come back as the shared frozen singletons, not copies', () => {
  const state = playedOut();
  const restored = decodeMatch(wire(state), { cardById }).state;
  const card = restored.players.player.hand[0];
  assert.equal(card, cardById.get(card.id), 'the engine shares cards by reference; a copy would defeat that and unfreeze the canon');
  assert.ok(Object.isFrozen(card));
  for (const event of restored.events) assert.ok(Object.isFrozen(event), 'events are shared across clones and must stay immutable');
});

test('a mid-mulligan match survives too', () => {
  const state = createMatch({ playerDeck: deckCards, rivalDeck: deckCards, seed: 8 });
  const restored = decodeMatch(wire(state), { cardById }).state;
  assert.equal(restored.phase, 'mulligan');
  assert.deepEqual(wire(mulligan(restored, 'player', [1])), wire(mulligan(state, 'player', [1])));
});

test('an ended match keeps its debrief', () => {
  let state = playedOut(60);
  assert.equal(state.phase, 'ended');
  const restored = decodeMatch(wire(state), { cardById }).state;
  assert.equal(restored.winner, state.winner);
  assert.deepEqual(restored.stats, state.stats);
});

/* ---------- what it refuses ---------- */

test('a payload from another schema is dropped, not guessed at', () => {
  const payload = wire(playedOut(1));
  payload.schema = MATCH_SCHEMA + 1;
  assert.match(decodeMatch(payload, { cardById }).error, /schema/);
});

test('a match played under different balance is not resumable under this one', () => {
  const state = playedOut(2, { rules: createRuleset({ startingCore: 25 }) });
  const result = decodeMatch(wire(state), { cardById });
  assert.match(result.error, /different ruleset/);
  // …but it does resume under the ruleset it was actually played with.
  assert.equal(decodeMatch(wire(state), { cardById, rules: state.rules }).error, undefined);
});

test('a card the build no longer has refuses the whole board', () => {
  const payload = wire(playedOut(2));
  payload.state.players.player.hand[0] = { $card: 'D99-GHOST-S01-99' };
  assert.match(decodeMatch(payload, { cardById }).error, /does not have/);
});

test('hand-edited values are refused rather than handed to the engine', () => {
  const cases = {
    'a Core above the maximum': p => { p.state.players.player.core = 9999; },
    'a negative Core': p => { p.state.players.rival.core = -1; },
    'an impossible phase': p => { p.state.phase = 'godmode'; },
    'a fourth lane': p => { p.state.players.player.lanes.push({ units: [], supports: [] }); },
    'an over-capacity lane': p => { p.state.players.player.lanes[0].units = Array.from({ length: 9 }, () => ({ uid: 'x', card: { $card: deckCards[0].id }, power: 9 })); },
    'resources above the ceiling': p => { p.state.players.player.resources.command = 500; },
    'a rewritten event sequence': p => { p.state.events = [{ seq: 5 }, { seq: 2 }]; },
    'a missing seat': p => { delete p.state.players.rival; },
    'a corrupt deck': p => { p.state.players.player.deck = ['not a card']; },
  };
  for (const [name, corrupt] of Object.entries(cases)) {
    const payload = wire(playedOut(3));
    corrupt(payload);
    const result = decodeMatch(payload, { cardById });
    assert.ok(result.error, `${name} should be refused`);
    assert.equal(result.state, undefined, `${name} must not yield a board`);
  }
});

test('a stored payload cannot reach Object.prototype either', () => {
  // Same class of hole as the ruleset validator, same source: a saved match is
  // parsed JSON, where "__proto__" is a real own key rather than a setter.
  const payload = wire(playedOut(2));
  payload.state.players.player.__proto__ = { pwned: 1 };
  const parsed = JSON.parse(JSON.stringify(payload).replace('"core"', '"__proto__":{"pwned":1},"core"'));
  const result = decodeMatch(parsed, { cardById });
  assert.equal(({}).pwned, undefined, 'Object.prototype was written by a saved match');
  if (result.state) assert.equal(Object.getPrototypeOf(result.state.players.player), Object.prototype);
});

test('validateMatch passes a real match and is not merely always-false', () => {
  assert.equal(validateMatch(playedOut(3)), null);
  assert.equal(validateMatch(createMatch({ playerDeck: deckCards, rivalDeck: deckCards })), null);
});

test('nothing about a broken payload throws at the caller', () => {
  for (const bad of [null, undefined, 0, 'text', [], {}, { schema: MATCH_SCHEMA }, { schema: MATCH_SCHEMA, rulesDigest: 'x' }]) {
    const result = decodeMatch(bad, { cardById });
    assert.ok(result.error, 'every refusal is a value, never an exception');
  }
});

/* ---------- storage ---------- */

test('save and load round-trip through a storage that behaves', () => {
  const storage = fakeStorage();
  const state = playedOut(3);
  assert.equal(saveMatch(storage, state), true);
  const loaded = loadMatch(storage, cardById);
  assert.equal(loaded.error, undefined);
  assert.deepEqual(wire(loaded.state), wire(state));
  assert.equal(typeof loaded.savedAt, 'number');
  clearMatch(storage);
  assert.match(loadMatch(storage, cardById).error, /no saved match/);
});

test('a full origin costs the log, not the board', () => {
  const state = playedOut(6);
  assert.ok(state.events.length > 150, 'fixture needs a long enough stream for the trim to bite');
  const storage = fakeStorage({ failFirstWrite: true });
  assert.equal(saveMatch(storage, state), true, 'quota is an expected outcome, not a failure to report');
  const loaded = loadMatch(storage, cardById);
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.state.players.player.core, state.players.player.core, 'the board is intact');
  assert.ok(loaded.state.events.length < state.events.length, 'the oldest history is what was dropped');
  assert.equal(loaded.state.eventSeq, state.eventSeq, 'and the sequence stays monotonic for the rest of the match');
});

test('storage that refuses everything degrades to no persistence at all', () => {
  const dead = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(saveMatch(dead, playedOut(1)), false);
  assert.ok(loadMatch(dead, cardById).error);
  assert.equal(clearMatch(dead), false);
  assert.ok(loadMatch(null, cardById).error);
  assert.equal(saveMatch(null, playedOut(1)), false);
});

test('a corrupt stored string does not take the boot with it', () => {
  const storage = fakeStorage();
  storage.map.set(MATCH_STORAGE_KEY, '{not json');
  assert.match(loadMatch(storage, cardById).error, /valid JSON/);
});

test('a restored match still rejects the plays the original would have', () => {
  const state = playedOut(4);
  const restored = decodeMatch(wire(state), { cardById }).state;
  for (let hand = 0; hand < state.players.player.hand.length; hand++) {
    for (let lane = 0; lane < 3; lane++) {
      const before = getPlayability(state, 'player', hand, lane);
      const after = getPlayability(restored, 'player', hand, lane);
      assert.equal(after.ok, before.ok);
      assert.equal(after.reason, before.reason);
    }
  }
  const legal = [...Array(state.players.player.hand.length).keys()]
    .flatMap(h => [0, 1, 2].map(l => ({ h, l })))
    .find(({ h, l }) => getPlayability(state, 'player', h, l).ok);
  if (legal) assert.deepEqual(wire(playCard(restored, 'player', legal.h, legal.l)), wire(playCard(state, 'player', legal.h, legal.l)));
});
