/* engine-state-sharing.test.mjs — the contract that lets `clone` share instead of copy.
 *
 * Every engine transition returns a new state built by a structural deep copy of
 * the old one. That copy has two escape hatches: canon cards, and — new here —
 * anything frozen. The frozen case exists because `state.events` is the match's
 * whole audit trail and never shrinks: `state.log` is capped at 60 lines, but the
 * event stream is what the renderer diffs, what the debrief reads and what the
 * invariant tests reconcile the statistics against, so it has to be complete.
 *
 * Rebuilding it field by field on every playCard and every resolveCombat made the
 * cost of taking a turn a function of how many turns had already been taken. In a
 * measured sovereign match the event array reached 366 records and 58% of the
 * cloned bytes by round 11, and the same AI turn cost 2.6 ms in round 1 against
 * 21.8 ms in round 9 — on a mid-range phone that is the difference between a
 * frame and a visible hitch, and it grew without bound rather than levelling off.
 *
 * Sharing those records is only safe while nobody edits one after it is emitted.
 * That is not a convention to be remembered; `emit` freezes, and these tests are
 * what stop a future change from quietly relying on mutation instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cards } from '../card-canon.js';
import { buildStarterDeck, buildRivalDeck } from '../deck-store.js';
import {
  DIFFICULTY_TIERS, createMatch, mulligan, playCard, resolveCombat,
  aiTakeMainPhase, completePlayerTurn, getPlayability,
} from '../match-engine.js';

const byId = new Map(cards.map(c => [c.id, c]));
const playerDeck = buildStarterDeck(cards).map(id => byId.get(id));
const rivalDeck = buildRivalDeck(cards, playerDeck).map(id => byId.get(id));

const opened = (seed = 5, difficulty = 'veteran') => mulligan(createMatch({ playerDeck, rivalDeck, seed, difficulty }), 'player', []);

/** The first legal (hand, lane) pair, or null if the hand cannot be played. */
function firstLegalPlay(state) {
  for (let h = 0; h < state.players.player.hand.length; h++) {
    for (let lane = 0; lane < 3; lane++) if (getPlayability(state, 'player', h, lane).ok) return { h, lane };
  }
  return null;
}

/** A live main phase with at least one legal play and a non-trivial event
 *  stream behind it. Turn 1 resources do not always afford the opening hand, so
 *  this walks forward rather than assuming they do. */
function playablePosition(seed = 5) {
  let state = opened(seed);
  for (let turn = 0; turn < 12; turn++) {
    const play = firstLegalPlay(state);
    if (play) return { state, play };
    state = completePlayerTurn(state);
    if (state.phase === 'ended') break;
  }
  throw new Error('no playable position found within 12 turns');
}

test('every emitted event is frozen, for the whole life of a match', () => {
  for (const difficulty of DIFFICULTY_TIERS) {
    let state = opened(11, difficulty);
    let turns = 0;
    while (state.phase !== 'ended' && turns++ < 40) {
      state = aiTakeMainPhase(state, 'player', 'veteran');
      if (state.phase === 'ended') break;
      state = completePlayerTurn(state);
    }
    assert.ok(state.events.length > 40, 'the sweep must produce a real stream to check');
    for (const event of state.events) {
      assert.equal(Object.isFrozen(event), true, `event #${event.seq} (${event.type}) was emitted unfrozen`);
    }
  }
});

test('an emitted event cannot be rewritten after the fact', () => {
  'use strict';
  const state = opened();
  const event = state.events[0];
  const before = event.type;
  assert.throws(() => { event.type = 'tampered'; }, TypeError);
  assert.throws(() => { event.injected = true; }, TypeError);
  assert.equal(state.events[0].type, before);
});

test('a transition shares its predecessor’s event records rather than rebuilding them', () => {
  const { state, play } = playablePosition();
  assert.ok(state.events.length > 5, 'there must be a stream behind the transition to share');
  const next = playCard(state, 'player', play.h, play.lane);

  // Shared: the same object identity, not a value-equal copy.
  for (let i = 0; i < state.events.length; i++) {
    assert.equal(next.events[i], state.events[i], `event #${i} was rebuilt instead of shared`);
  }
  // But the arrays are still independent, so appending to one is invisible to the other.
  assert.notEqual(next.events, state.events);
  assert.ok(next.events.length > state.events.length);
});

test('sharing events does not leak mutability anywhere else in the state', () => {
  const { state, play } = playablePosition();
  const next = playCard(state, 'player', play.h, play.lane);

  // Nothing mutable is shared between a state and its successor …
  assert.notEqual(next.players, state.players);
  assert.notEqual(next.players.player, state.players.player);
  assert.notEqual(next.players.player.lanes, state.players.player.lanes);
  assert.notEqual(next.players.player.resources, state.players.player.resources);
  assert.notEqual(next.stats, state.stats);

  // … so the predecessor is genuinely untouched by the transition.
  const coreBefore = state.players.rival.core;
  const handBefore = state.players.player.hand.length;
  next.players.rival.core = 1;
  next.players.player.hand.length = 0;
  next.players.player.lanes[0].units.push({ uid: 'x' });
  assert.equal(state.players.rival.core, coreBefore);
  assert.equal(state.players.player.hand.length, handBefore);
  assert.equal(state.players.player.lanes[0].units.some(u => u.uid === 'x'), false);
});

test('canon cards are still shared, and are still the very objects the caller supplied', () => {
  const state = opened();
  const inHand = state.players.player.hand[0];
  assert.equal(byId.get(inHand.id), inHand, 'a hand card must be the canon record, not a copy of it');
  const next = resolveCombat(state, 'player');
  const same = [...next.players.player.hand, ...next.players.player.deck].find(c => c.id === inHand.id);
  assert.equal(same, inHand);
});

/* A structural guard rather than a wall-clock one: timing assertions are the
 * first thing to go flaky on shared CI. What is asserted is the property that
 * caused the cost — that the number of freshly allocated event objects per
 * transition is bounded by the events that transition actually emits, and does
 * not grow with the length of the stream behind it. */
test('the cost of a transition does not grow with the length of the event stream', () => {
  let state = opened(9, 'sovereign');
  const samples = [];
  let turns = 0;
  while (state.phase !== 'ended' && turns++ < 30) {
    state = aiTakeMainPhase(state, 'player', 'veteran');
    if (state.phase === 'ended') break;
    const before = state.events;
    const next = completePlayerTurn(state);
    // How many of the pre-existing records this transition re-allocated.
    let rebuilt = 0;
    for (let i = 0; i < before.length; i++) if (next.events[i] !== before[i]) rebuilt += 1;
    samples.push({ carried: before.length, rebuilt });
    state = next;
  }
  assert.ok(samples.length > 4, 'the sweep must run long enough for the stream to grow');
  assert.ok(samples.at(-1).carried > 100, 'the stream must actually get long');
  for (const s of samples) assert.equal(s.rebuilt, 0, `a transition rebuilt ${s.rebuilt} of ${s.carried} carried events`);
});
