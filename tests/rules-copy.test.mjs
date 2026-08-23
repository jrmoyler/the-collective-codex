/* rules-copy.test.mjs — the in-app rules copy must state the rules the engine
 * actually plays.
 *
 * Three engine changes shipped without reaching the player: the armour divisor
 * moved 4 → 5, the lane breach ceiling stopped applying to undefended lanes, and
 * the opening refresh went 1 card → 2. Every one of them was documented in
 * docs/match-rules.md and every one of them was contradicted, in the product, by
 * hand-typed prose in the glossary, the pre-match dialog and the mulligan panel.
 *
 * These tests do not compare strings to strings — that would only pin the copy to
 * itself. They re-derive each claim from the engine's own resolvers (armourBreach,
 * the draw schedule, the resource curve) and assert the sentence the player reads
 * agrees with it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as copy from '../src/rules-copy.js';
import { GLOSSARY, PRIMER_PANELS } from '../src/glossary.js';
import {
  armourBreach, resourceCurve, MAX_LANE_BREACH, FLYING_ARMOUR_PIERCE,
  CORE_ARMOUR_DIVISOR, OPENING_HAND, DRAW_PER_REFRESH, ON_THE_DRAW_BONUS,
  RESOURCE_CAPS, RESOURCE_KEYS, DECK_SIZE, STARTING_CORE, REGROUP_RECOVERY,
  CORE_PREVENTION_PER_DEFENSE, RITUAL_CHANNEL, ENTITY_FAMILIES,
  SUPPORT_FAMILIES, IMMEDIATE_FAMILIES,
} from '../match-engine.js';

const bodies = () => [
  ...GLOSSARY.map(([, , body]) => body),
  ...PRIMER_PANELS.flatMap(p => [p.lead, p.body]),
];

/* ---------- armour ---------- */

test('the armour formulas the UI prints resolve the same numbers armourBreach does', () => {
  const parse = text => {
    const capped = text.match(/^min\(⌈raw\/(\d+)⌉, (\d+)\)$/);
    if (capped) return { divisor: Number(capped[1]), cap: Number(capped[2]) };
    const open = text.match(/^⌈raw\/(\d+)⌉$/);
    assert.ok(open, `unparseable armour formula: ${text}`);
    return { divisor: Number(open[1]), cap: Infinity };
  };
  const evaluate = ({ divisor, cap }, raw) => Math.min(Math.ceil(raw / divisor), cap);

  const cases = [
    [copy.ARMOUR_CONTESTED, raw => armourBreach(raw, { cap: MAX_LANE_BREACH })],
    [copy.ARMOUR_FLYING, raw => armourBreach(raw, { pierce: FLYING_ARMOUR_PIERCE, cap: MAX_LANE_BREACH + FLYING_ARMOUR_PIERCE })],
    [copy.ARMOUR_OPEN, raw => armourBreach(raw, { cap: Infinity })],
    [copy.ARMOUR_OPEN_FLYING, raw => armourBreach(raw, { pierce: FLYING_ARMOUR_PIERCE, cap: Infinity })],
  ];
  for (const [text, engineValue] of cases) {
    const formula = parse(text);
    for (let raw = 0; raw <= 60; raw++) {
      assert.equal(evaluate(formula, raw), engineValue(raw),
        `"${text}" disagrees with the engine at raw=${raw}`);
    }
  }
});

test('no rules copy claims an undefended lane is capped', () => {
  // The regression that mattered most: the glossary said an open lane was "worth
  // at most 3 Core a turn" at the exact moment laneBreachCap stopped capping one.
  assert.equal(armourBreach(40, { cap: Infinity }), Math.ceil(40 / CORE_ARMOUR_DIVISOR));
  assert.ok(armourBreach(40, { cap: Infinity }) > MAX_LANE_BREACH,
    'an undefended lane must be able to exceed the contested ceiling');
  const openLane = GLOSSARY.find(([key]) => key === 'open-lane')[2];
  assert.match(openLane, /nothing caps it/i);
  assert.ok(!/at most 3 Core/i.test(openLane), 'the open-lane definition reinstated the old flat ceiling');
});

test('every armour formula in shipped copy is the one rules-copy derived', () => {
  const derived = new Set([copy.ARMOUR_CONTESTED, copy.ARMOUR_FLYING, copy.ARMOUR_OPEN, copy.ARMOUR_OPEN_FLYING]);
  for (const body of [...bodies(), copy.ARMOUR_TOOLTIP]) {
    for (const found of String(body).match(/min\(⌈raw\/\d+⌉, \d+\)|⌈raw\/\d+⌉/g) || []) {
      assert.ok(derived.has(found), `hand-typed armour formula in shipped copy: ${found}`);
    }
  }
});

/* ---------- the draw schedule ---------- */

test('the opening-hand totals match what the engine actually deals', () => {
  assert.equal(copy.OPENING_HAND_TOTAL, OPENING_HAND + DRAW_PER_REFRESH);
  assert.equal(copy.ON_THE_DRAW_TOTAL, OPENING_HAND + DRAW_PER_REFRESH + ON_THE_DRAW_BONUS);
  assert.match(copy.OPENING_DRAW_SENTENCE, new RegExp(`becomes ${copy.OPENING_HAND_TOTAL}\\b`));
  assert.match(copy.OPENING_DRAW_SENTENCE, new RegExp(`opens on\\s+${copy.ON_THE_DRAW_TOTAL}\\b`));
});

test('a real match deals exactly the hands the copy promises', async () => {
  const { cards, cardById } = await import('../card-canon.js');
  const { buildStarterDeck } = await import('../deck-store.js');
  const engine = await import('../match-engine.js');
  const deck = buildStarterDeck(cards).map(id => cardById.get(id));

  let state = engine.createMatch({ playerDeck: deck, rivalDeck: deck, seed: 7 });
  assert.equal(state.players.player.hand.length, OPENING_HAND, 'opening deal');
  state = engine.mulligan(state, 'player', []);
  assert.equal(state.players.player.hand.length, copy.OPENING_HAND_TOTAL,
    'the first seat opens its main phase on the hand the mulligan panel states');

  // Then run one full cycle and count the cards each seat drew *at its first
  // refresh* specifically — total draws also include the mulligan redraw and any
  // Weapon/Magician trigger, neither of which the copy is talking about.
  const before = state.eventSeq;
  state = engine.completePlayerTurn(state);
  const refreshDraws = side => state.events
    .filter(e => e.seq > before && e.type === 'draw' && e.side === side && e.reason === 'refresh').length;

  assert.equal(refreshDraws('rival'), DRAW_PER_REFRESH + ON_THE_DRAW_BONUS,
    'the second seat draws the on-the-draw extra at its first refresh');
  assert.equal(OPENING_HAND + refreshDraws('rival'), copy.ON_THE_DRAW_TOTAL,
    'the second seat opens on the total the copy states');
  assert.equal(refreshDraws('player'), DRAW_PER_REFRESH,
    'the first seat draws the ordinary refresh count and pays no opening tax');
});

/* ---------- the resource curve ---------- */

test('the printed curve and caps come from resourceCurve, in engine key order', () => {
  for (const turn of [1, 3, 5, 9]) {
    assert.equal(copy.curveAt(turn), RESOURCE_KEYS.map(k => resourceCurve(turn)[k]).join('/'));
  }
  assert.equal(copy.CAPS_LABEL, RESOURCE_KEYS.map(k => RESOURCE_CAPS[k]).join('/'));
  assert.equal(copy.curveAt(copy.FULL_RAMP_TURN), copy.CAPS_LABEL, 'FULL_RAMP_TURN must actually be fully ramped');
  assert.notEqual(copy.curveAt(copy.FULL_RAMP_TURN - 1), copy.CAPS_LABEL, 'FULL_RAMP_TURN must be the FIRST fully ramped turn');
  assert.match(copy.RESOURCE_RAMP_SENTENCE, new RegExp(`turn ${copy.FULL_RAMP_TURN} and after gives ${copy.CAPS_LABEL}`));
});

/* ---------- the glossary's remaining numbers ---------- */

test('every number the glossary states is the engine constant, not a copy of one', () => {
  const body = key => GLOSSARY.find(([k]) => k === key)[2];
  assert.match(body('core'), new RegExp(`begins at ${STARTING_CORE} Core`));
  assert.match(body('doctrine'), new RegExp(`Your ${DECK_SIZE}-card deck`));
  assert.match(body('regroup'), new RegExp(`up to ${REGROUP_RECOVERY} power`));
  assert.match(body('defense'), new RegExp(`the first ${CORE_PREVENTION_PER_DEFENSE} Core damage`));
  assert.match(body('channel'), new RegExp(`At Channel ${RITUAL_CHANNEL}`));
  assert.match(body('command'), new RegExp(`caps at ${RESOURCE_CAPS.command}`));
  assert.match(body('insight'), new RegExp(`caps at ${RESOURCE_CAPS.insight}`));
  assert.match(body('essence'), new RegExp(`cap ${RESOURCE_CAPS.essence}`));
  assert.match(body('fatigue'), new RegExp(`draw ${DRAW_PER_REFRESH} cards at every refresh`));
  assert.match(body('refresh'), new RegExp(`draw ${DRAW_PER_REFRESH} cards`));
});

test('the glossary lists exactly the families the engine classifies', () => {
  const support = GLOSSARY.find(([k]) => k === 'support')[2];
  const entity = GLOSSARY.find(([k]) => k === 'entity')[2];
  for (const family of ENTITY_FAMILIES) assert.ok(entity.includes(family), `entity definition omits ${family}`);
  for (const family of SUPPORT_FAMILIES) assert.ok(support.includes(family), `support definition omits ${family}`);
  for (const family of IMMEDIATE_FAMILIES) assert.ok(support.includes(family), `support definition omits immediate family ${family}`);
  // And nothing is claimed twice: the three sets partition the canon.
  const all = [...ENTITY_FAMILIES, ...SUPPORT_FAMILIES, ...IMMEDIATE_FAMILIES];
  assert.equal(new Set(all).size, all.length, 'a family is classified twice');
});
