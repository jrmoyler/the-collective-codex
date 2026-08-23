/* ruleset.test.mjs — the balance layer, and what it does with input it did not write.
 *
 * A ruleset may arrive from a remote config, a query string, or a cached payload
 * three releases old. None of those are trusted, and the requirement is stronger
 * than "reject bad data": a client that refuses to start a match is a worse
 * outcome than one that starts a slightly repaired one. Every test here is about
 * that trade — corrected and reported, not thrown.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES, CANONICAL_RULES, RULESET_VERSION, createRuleset, rulesetDigest, rulesetDiff,
  loadRuleset, RULESET_STORAGE_KEY,
} from '../ruleset.js';
import { createMatch, simulateMatch, resourceCurve, armourBreach, planAiPlays, mulligan, aiTakeMainPhase } from '../match-engine.js';

const zero = { command: 0, insight: 0, essence: 0 };
const makeCard = (id, o = {}) => ({
  id, name: id, divisionId: 1, divisionName: 'Test', family: o.family ?? 'Warrior',
  cost: o.cost ?? { command: 1, insight: 0, essence: 0 }, power: o.power ?? 4,
  rulesText: '', keywords: ['Dash'], targeting: 'Friendly Lane', timing: 'Main', duration: 'Immediate', ...o,
});
const deck = (prefix, size = DEFAULT_RULES.deckSize) => Array.from({ length: size }, (_, i) => makeCard(`${prefix}-${i}`, { power: 3 + (i % 4) }));

test('DEFAULT_RULES is frozen too — it backs the exported constants', () => {
  // It is the default argument of resourceCurve/armourBreach and the object
  // behind RESOURCE_CAPS and AI_TIER_PROFILES, so one write to it would retune
  // every match in the process.
  assert.ok(Object.isFrozen(DEFAULT_RULES));
  assert.ok(Object.isFrozen(DEFAULT_RULES.tiers.veteran));
  assert.ok(Object.isFrozen(DEFAULT_RULES.onTheDraw));
});

test('the shipped ruleset is deeply frozen, which is what makes clone() cheap', () => {
  assert.ok(Object.isFrozen(CANONICAL_RULES));
  assert.ok(Object.isFrozen(CANONICAL_RULES.resourceCaps));
  assert.ok(Object.isFrozen(CANONICAL_RULES.tiers));
  assert.ok(Object.isFrozen(CANONICAL_RULES.tiers.sovereign));
  assert.ok(Object.isFrozen(CANONICAL_RULES.tiers.sovereign.style));
  assert.throws(() => { 'use strict'; CANONICAL_RULES.startingCore = 1; }, TypeError);
});

test('an out-of-range value is clamped and reported, never thrown', () => {
  const rules = createRuleset({ startingCore: 1e9, coreArmourDivisor: -4 });
  assert.equal(rules.startingCore, 200);
  assert.equal(rules.coreArmourDivisor, 1);
  assert.equal(rules.warnings.length, 2);
  assert.match(rules.warnings.join(' '), /startingCore/);
});

test('a field nobody reviewed cannot be smuggled in', () => {
  const rules = createRuleset({ secretBackdoor: 99 });
  assert.equal(rules.secretBackdoor, undefined);
  assert.match(rules.warnings.join(' '), /secretBackdoor/);
});

test('a payload cannot reach Object.prototype through any nested key', () => {
  /* Overrides arrive as parsed JSON, and JSON.parse('{"__proto__": …}') yields a
   * REAL own property — unlike the same text in a source literal. The tiers path
   * was the live one: `'__proto__' in out` is true through the prototype chain,
   * so a tier patch named __proto__ resolved to Object.prototype and the style
   * branch wrote a property onto it, corrupting every object in the process. */
  const payloads = [
    '{"__proto__": {"pwned": 1}}',
    '{"tiers": {"__proto__": {"style": {"trap": 1}}}}',
    '{"tiers": {"veteran": {"__proto__": {"maxPlays": 9}}}}',
    '{"tiers": {"veteran": {"style": {"__proto__": {"trap": 1}}}}}',
    '{"resourceCaps": {"__proto__": {"command": 99}}}',
    '{"constructor": {"prototype": {"pwned": 1}}}',
  ];
  for (const text of payloads) {
    const rules = createRuleset(JSON.parse(text));
    assert.ok(Object.isFrozen(rules), `${text} still produced a playable ruleset`);
  }
  const probe = {};
  for (const key of ['pwned', 'style', 'trap', 'maxPlays', 'command']) {
    assert.equal(probe[key], undefined, `Object.prototype.${key} was written by an override`);
  }
  // …and the shipped values are untouched by any of it.
  assert.equal(createRuleset().tiers.veteran.maxPlays, DEFAULT_RULES.tiers.veteran.maxPlays);
  assert.equal(createRuleset().tiers.sovereign.style.trap, DEFAULT_RULES.tiers.sovereign.style.trap);
});

test('garbage of the wrong shape falls back to the defaults', () => {
  for (const bad of [null, undefined, 42, 'nope', [], { resourceCaps: 7 }, { tiers: 'yes' }]) {
    const rules = createRuleset(bad);
    assert.equal(rules.version, RULESET_VERSION);
    assert.equal(rules.deckSize, DEFAULT_RULES.deckSize);
    assert.ok(Object.isFrozen(rules));
  }
});

test('a payload aimed at a different ruleset version is ignored wholesale', () => {
  const rules = createRuleset({ version: RULESET_VERSION + 1, startingCore: 5 });
  assert.equal(rules.startingCore, DEFAULT_RULES.startingCore, 'no field of a mismatched payload is adopted');
  assert.match(rules.warnings.join(' '), /v\d+/);
});

test('cross-field impossibilities are repaired rather than shipped', () => {
  const raised = createRuleset({ resourceCaps: { command: 9 }, resourceCeiling: 2 });
  assert.equal(raised.resourceCeiling, 9, 'a ceiling below the per-turn cap is unreachable resource');
  const hand = createRuleset({ deckSize: 10, openingHand: 10 });
  assert.ok(hand.openingHand <= hand.deckSize - hand.onTheDraw.cards, 'an opening hand nobody can draw');
});

test('the digest is stable, order-independent, and moves when a value moves', () => {
  assert.equal(rulesetDigest(createRuleset()), rulesetDigest(createRuleset()));
  const a = createRuleset({ maxLaneBreach: 4, startingCore: 25 });
  const b = createRuleset({ startingCore: 25, maxLaneBreach: 4 });
  assert.equal(a.digest, b.digest);
  assert.notEqual(a.digest, CANONICAL_RULES.digest);
  // The label is presentation, not balance: it must not change the identity.
  assert.equal(createRuleset({ label: 'experiment' }).digest, CANONICAL_RULES.digest);
});

test('rulesetDiff names exactly what a player is not playing under', () => {
  assert.deepEqual(rulesetDiff(CANONICAL_RULES), []);
  const diff = rulesetDiff(createRuleset({ startingCore: 25, tiers: { veteran: { maxPlays: 5 } } }));
  assert.deepEqual(diff.sort((x, y) => (x.key < y.key ? -1 : 1)), [
    { key: 'startingCore', from: 20, to: 25 },
    { key: 'tiers.veteran.maxPlays', from: 4, to: 5 },
  ]);
});

/* ---------- the engine actually reads them ---------- */

test('a match is played under the ruleset it was started with', () => {
  const rules = createRuleset({ startingCore: 33, openingHand: 3, maxUnitsPerLane: 1 });
  const state = createMatch({ playerDeck: deck('P'), rivalDeck: deck('R'), seed: 4, rules });
  assert.equal(state.players.player.core, 33);
  assert.equal(state.players.rival.core, 33);
  assert.equal(state.players.player.hand.length, 3);
  assert.equal(state.rules.digest, rules.digest);
  assert.equal(state.rules, rules, 'an already-built ruleset is adopted, not rebuilt');
});

test('the ruleset survives every clone the engine takes', () => {
  const rules = createRuleset({ startingCore: 24 });
  let state = mulligan(createMatch({ playerDeck: deck('P'), rivalDeck: deck('R'), seed: 9, rules }), 'player', []);
  state = aiTakeMainPhase(state, 'player', 'veteran');
  assert.equal(state.rules, rules, 'shared by reference — a per-play deep copy of 90 numbers is not free');
});

test('deck legality is checked against the ruleset, not the build', () => {
  const rules = createRuleset({ deckSize: 12 });
  assert.doesNotThrow(() => createMatch({ playerDeck: deck('P', 12), rivalDeck: deck('R', 12), rules }));
  assert.throws(() => createMatch({ playerDeck: deck('P'), rivalDeck: deck('R'), rules }), /exactly 12 cards/);
});

test('the pure helpers take a ruleset and default to the shipped one', () => {
  const rules = createRuleset({ resourceCaps: { command: 2, insight: 2, essence: 2 }, coreArmourDivisor: 2 });
  assert.deepEqual(resourceCurve(9, rules), { command: 2, insight: 2, essence: 2 });
  assert.deepEqual(resourceCurve(9), resourceCurve(9, DEFAULT_RULES));
  assert.equal(armourBreach(10, { cap: 99, rules }), 5);
  assert.equal(armourBreach(10, { cap: 99 }), 2);
});

test('a retuned ruleset changes the match it produces', () => {
  const base = simulateMatch({ playerDeck: deck('P'), rivalDeck: deck('R'), seed: 11, shuffle: false });
  const brisk = simulateMatch({ playerDeck: deck('P'), rivalDeck: deck('R'), seed: 11, shuffle: false, rules: createRuleset({ startingCore: 8 }) });
  assert.ok(brisk.rounds < base.rounds, `a smaller Core must end sooner (${brisk.rounds} vs ${base.rounds})`);
  assert.equal(brisk.state.phase, 'ended');
});

/* ---------- the AI work budget ---------- */

test('the AI search is bounded in positions evaluated, not in milliseconds', () => {
  // Wall-clock would make the rival machine-dependent, and this game hands out
  // seed codes that promise to reproduce a match.
  let state = mulligan(createMatch({ playerDeck: deck('P'), rivalDeck: deck('R'), seed: 6 }), 'player', []);
  const full = planAiPlays(state, 'player', 'sovereign');
  assert.ok(full.nodes > 0 && full.nodes < CANONICAL_RULES.aiNodeBudget, `shipped tiers stay well inside the budget (${full.nodes})`);
  const starved = planAiPlays(state, 'player', 'sovereign', { budget: 1 });
  assert.ok(starved.length <= full.length, 'a starved search returns a shorter plan, never an illegal one');
  assert.deepEqual(planAiPlays(state, 'player', 'sovereign', { budget: 12 }), planAiPlays(state, 'player', 'sovereign', { budget: 12 }), 'and it is deterministic');
});

test('a truncated plan is still a legal main phase', () => {
  let state = mulligan(createMatch({ playerDeck: deck('P'), rivalDeck: deck('R'), seed: 8 }), 'player', []);
  const before = state.players.player.hand.length;
  const played = aiTakeMainPhase(state, 'player', 'sovereign', { budget: 5 });
  assert.ok(played.players.player.hand.length <= before);
  for (const lane of played.players.player.lanes) assert.ok(lane.units.length <= CANONICAL_RULES.maxUnitsPerLane);
});

/* ---------- delivery ---------- */

const reader = value => ({ getItem: key => (key === RULESET_STORAGE_KEY ? value : null) });

test('with nothing stored, the shipped balance is what loads', () => {
  const result = loadRuleset(reader(null));
  assert.equal(result.source, 'shipped');
  assert.equal(result.rules, CANONICAL_RULES);
  assert.equal(loadRuleset(null).source, 'shipped', 'no storage at all is normal, not broken');
});

test('an unreadable or unparseable override does not stop the app starting', () => {
  const thrower = { getItem() { throw new Error('blocked'); } };
  assert.equal(loadRuleset(thrower).source, 'shipped');
  const broken = loadRuleset(reader('{not json'));
  assert.equal(broken.source, 'shipped');
  assert.match(broken.error, /valid JSON/);
});

test('an override that changes nothing is reported as shipped, not as an override', () => {
  // Otherwise the "you are not playing the documented rules" banner appears over
  // a match that is playing exactly the documented rules.
  assert.equal(loadRuleset(reader(JSON.stringify({ startingCore: DEFAULT_RULES.startingCore }))).source, 'shipped');
  assert.equal(loadRuleset(reader(JSON.stringify({ label: 'renamed' }))).source, 'shipped', 'a label is not balance');
});

test('a client can pin the fields its own UI cannot follow', () => {
  // deckSize is the live case: the engine plays a 12-card match happily, and a
  // deck builder built around 30 cards would leave a client that cannot start a
  // match at all — the one failure a remote knob must not be able to cause.
  const result = loadRuleset(reader(JSON.stringify({ deckSize: 12, startingCore: 25 })), { pin: ['deckSize'] });
  assert.equal(result.rules.deckSize, DEFAULT_RULES.deckSize, 'the pinned field held');
  assert.equal(result.rules.startingCore, 25, 'the rest of the override still applied');
  assert.deepEqual(result.pinned, ['deckSize']);
  assert.equal(loadRuleset(reader(JSON.stringify({ deckSize: 12 })), { pin: ['deckSize'] }).source, 'shipped',
    'an override that is entirely pinned away is not an override');
});
