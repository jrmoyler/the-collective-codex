/* rules-copy.js — every rules number the UI states in prose, derived from the
 * engine's own constants.
 *
 * This module exists because of a defect class, not a style preference. The
 * armour divisor moved from 4 to 5, the lane breach ceiling stopped being a
 * constant, and the opening refresh went from 1 card to 2 — all three were
 * carefully documented in docs/match-rules.md and none of them reached the
 * player. The glossary (whose own header calls it "the single source of truth
 * for rules copy"), the pre-match dialog, the mulligan panel, the lane seam
 * tooltip and the deck analysis each kept a hand-typed copy of the old numbers,
 * so the game shipped teaching rules it does not play. The worst of them
 * inverted the strategic lesson the engine change existed to create: the
 * glossary told players an open lane was "worth at most 3 Core a turn" at the
 * exact moment the engine removed that ceiling to make abandoning a lane
 * dangerous.
 *
 * Prose that contains an engine number is engine output. It is computed here,
 * once, and tests/rules-copy.test.mjs re-derives every claim from armourBreach
 * and the draw schedule so the next rebalance cannot silently orphan it.
 */

import {
  CORE_ARMOUR_DIVISOR, FLYING_ARMOUR_PIERCE, MAX_LANE_BREACH,
  OPENING_HAND, DRAW_PER_REFRESH, ON_THE_DRAW_BONUS,
  REGROUP_RECOVERY, RESOURCE_CAPS, RESOURCE_KEYS, resourceCurve,
} from '../match-engine.js';

/* ---------- Core armour ---------- */

/** The divisor a ground strike is scaled by. */
export const GROUND_DIVISOR = CORE_ARMOUR_DIVISOR;
/** An unblocked Flying strike pierces one step of the divisor. */
export const FLYING_DIVISOR = Math.max(1, CORE_ARMOUR_DIVISOR - FLYING_ARMOUR_PIERCE);
/** The ceiling on a lane that still has a living defender. */
export const CONTESTED_CEILING = MAX_LANE_BREACH;
export const FLYING_CEILING = MAX_LANE_BREACH + FLYING_ARMOUR_PIERCE;

const ceil = divisor => `⌈raw/${divisor}⌉`;

/** `min(⌈raw/5⌉, 3)` — a ground strike into a lane that is still defended. */
export const ARMOUR_CONTESTED = `min(${ceil(GROUND_DIVISOR)}, ${CONTESTED_CEILING})`;
/** `min(⌈raw/4⌉, 4)` — an unblocked air strike over living defenders. */
export const ARMOUR_FLYING = `min(${ceil(FLYING_DIVISOR)}, ${FLYING_CEILING})`;
/** `⌈raw/5⌉` — a lane with no living defender has no ceiling at all. */
export const ARMOUR_OPEN = ceil(GROUND_DIVISOR);
/** `⌈raw/4⌉` — an air strike into a lane with no living defender. */
export const ARMOUR_OPEN_FLYING = ceil(FLYING_DIVISOR);

/** The one-sentence statement of the whole rule, ceiling included. */
export const ARMOUR_SENTENCE =
  `A raw hit aimed at a Core is divided down before anything else: ${ARMOUR_CONTESTED} into a lane that still has a living defender, ` +
  `${ARMOUR_FLYING} for an unblocked Flying strike over one. A lane with no living defender has no ceiling — only the divisor applies, ` +
  `so ${ARMOUR_OPEN} of a stacked lane lands in full. Raw board power is never face damage, but an abandoned lane is not capped either. ` +
  `Monster deploy damage and fatigue damage are not armoured.`;

/** The seam tooltip: short, because it sits on a hover. */
export const ARMOUR_TOOLTIP =
  `Damage shown is what actually lands: Core armour reduces a raw hit to ${ARMOUR_CONTESTED} in a defended lane, ` +
  `and to ${ARMOUR_OPEN} with no ceiling in an undefended one, before Defense prevention.`;

export const OPEN_LANE_SENTENCE =
  `A lane with no opposing units. Every unexhausted attacker there strikes the opposing Core, and that raw total is divided by ` +
  `${GROUND_DIVISOR} — but nothing caps it. An open lane is worth ${ARMOUR_OPEN}, which is why leaving one empty against a stacked ` +
  `board loses matches that a ${CONTESTED_CEILING}-per-lane ceiling would have survived.`;

export const BREAKTHROUGH_SENTENCE =
  `If a contested lane's defenders are all destroyed, the attackers that fought there and survived push their combined remaining ` +
  `power into the Core as one raw strike, armoured and capped like any other contested lane: ${ARMOUR_CONTESTED}.`;

/* ---------- The draw schedule ---------- */

/** 5 + 2 = 7: the hand the first seat opens its first main phase on. */
export const OPENING_HAND_TOTAL = OPENING_HAND + DRAW_PER_REFRESH;
/** 5 + 3 = 8: the second seat's, which is one card ahead. */
export const ON_THE_DRAW_TOTAL = OPENING_HAND + DRAW_PER_REFRESH + ON_THE_DRAW_BONUS;

export const OPENING_DRAW_SENTENCE =
  `You draw ${DRAW_PER_REFRESH} at every refresh, the opening one included, so a kept hand of ${OPENING_HAND} becomes ` +
  `${OPENING_HAND_TOTAL}. The seat that acts second draws ${ON_THE_DRAW_BONUS} extra at its first refresh and opens on ` +
  `${ON_THE_DRAW_TOTAL}; that is the only asymmetry between the seats.`;

export const FATIGUE_SENTENCE =
  `You draw ${DRAW_PER_REFRESH} cards at every refresh. Drawing from an empty deck instead deals escalating, unpreventable ` +
  `Core damage: the Nth failed draw costs N Core. A match can end this way.`;

export const REFRESH_SENTENCE =
  `The start of your turn: resources refill along the curve, your units un-exhaust and regroup up to ${REGROUP_RECOVERY} power, ` +
  `Bases generate, and you draw ${DRAW_PER_REFRESH} cards.`;

/* ---------- The resource curve ---------- */

/** `2/2/2` for turn 1 — Command/Insight/Essence, in engine order. */
export const curveAt = turn => { const r = resourceCurve(turn); return RESOURCE_KEYS.map(k => r[k]).join('/'); };
/** `6/5/4` — the caps, in the same order. */
export const CAPS_LABEL = RESOURCE_KEYS.map(k => RESOURCE_CAPS[k]).join('/');
/** The turn at which every pool has reached its cap. */
export const FULL_RAMP_TURN = (() => {
  for (let turn = 1; turn <= 32; turn++) if (curveAt(turn) === CAPS_LABEL) return turn;
  return 32;
})();

export const RESOURCE_RAMP_SENTENCE =
  `Command ramps fastest to a cap of ${RESOURCE_CAPS.command}, Insight to ${RESOURCE_CAPS.insight}, Essence to ` +
  `${RESOURCE_CAPS.essence}. Turn 1 gives ${curveAt(1)}; turn ${FULL_RAMP_TURN} and after gives ${CAPS_LABEL}.`;
