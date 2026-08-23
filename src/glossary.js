/* glossary.js — the single source of truth for rules copy in the UI (IA-7).
   Every definition is a restatement of docs/match-rules.md; do not fork the wording.

   Any definition that states an engine number takes it from src/rules-copy.js,
   which derives it from match-engine.js. Four entries here — armour, open-lane,
   breakthrough and the "Power is both" primer panel — were hand-typed and had
   drifted a full rebalance behind the engine. */

import {
  ARMOUR_SENTENCE, OPEN_LANE_SENTENCE, BREAKTHROUGH_SENTENCE, REFRESH_SENTENCE,
  FATIGUE_SENTENCE, RESOURCE_RAMP_SENTENCE, ARMOUR_CONTESTED, ARMOUR_OPEN,
  CONTESTED_CEILING,
} from './rules-copy.js';
import {
  STARTING_CORE, DECK_SIZE, MAX_UNITS_PER_LANE, MAX_SUPPORTS_PER_LANE,
  REGROUP_RECOVERY, RESOURCE_CAPS, ENTITY_FAMILIES, SUPPORT_FAMILIES,
  CORE_PREVENTION_PER_DEFENSE, RITUAL_CHANNEL,
  IMMEDIATE_FAMILIES, LANE_NAMES,
} from '../match-engine.js';

const list = set => [...set].join(', ');

export const GLOSSARY = [
  ['core', 'Core', `Each side begins at ${STARTING_CORE} Core. Reduce the opposing Core to 0 — by combat, by card effect, or by deck-out fatigue — and the match ends immediately. Simultaneous collapse is a draw. There is no turn limit.`],
  ['power', 'Power', 'A unit\'s power is simultaneously its attack value and its remaining combat durability. There is no separate health number. A power 6 unit hits for 6 and is destroyed after taking 6.'],
  ['command', 'Command', `The tempo resource. It ramps fastest and caps at ${RESOURCE_CAPS.command}. Pools do not carry over between turns.`],
  ['insight', 'Insight', `The mid resource: it ramps more slowly than Command and caps at ${RESOURCE_CAPS.insight}. Reaction and Spell effects can restore it mid-turn.`],
  ['essence', 'Essence', `The scarce resource: slowest ramp, cap ${RESOURCE_CAPS.essence}. A doctrine that leans on Essence plays a slower game.`],
  ['lane', 'Lane', `The board has three lanes — ${LANE_NAMES.join(', ')}. Each lane resolves its combat independently. A lane holds up to ${MAX_UNITS_PER_LANE} units and ${MAX_SUPPORTS_PER_LANE} persistent supports per side.`],
  ['vanguard', 'Vanguard', 'The first of the three lanes. Lanes are otherwise identical; position only matters for what is already standing there.'],
  ['conduit', 'Conduit', 'The middle lane.'],
  ['flank', 'Flank', 'The third lane.'],
  ['entity', 'Entity', `A card that becomes a unit on the board: ${list(ENTITY_FAMILIES)}. Entities are the only cards that hold a lane.`],
  ['support', 'Support', `A persistent card installed in a lane — ${list(SUPPORT_FAMILIES)}. ${list(IMMEDIATE_FAMILIES)} resolve immediately instead.`],
  ['exhausted', 'Exhausted', 'An exhausted unit does not attack. Every unit arrives exhausted — deployment fatigue — so it defends the moment it lands but cannot attack until your next refresh. This is the most common cause of "why did my unit not attack?".'],
  ['infected', 'Infected', 'A Plague marks enemy units in its lane. At each end step an infected unit loses 1 power permanently. Moving a unit to another lane clears the infection.'],
  ['guard', 'Guard', 'A Guard unit is prioritised as a defender, and the first combat damage dealt to an allied unit in that lane is reduced by 1 that combat.'],
  ['flying', 'Flying', 'A Flying attacker bypasses ground defenders and hits the Core directly, unless the opposing lane holds a Flying unit or a Guard.'],
  ['breakthrough', 'Breakthrough', BREAKTHROUGH_SENTENCE],
  ['refresh', 'Refresh', REFRESH_SENTENCE],
  ['channel', 'Channel', `A Ritual gains one channel counter at each end step. At Channel ${RITUAL_CHANNEL} it is ready.`],
  ['mulligan', 'Mulligan', 'A one-time replacement of any number of opening cards. Replaced cards go to the bottom of your deck and are immediately redrawn. The rival takes its own one-time mulligan in the same step; how greedy it is depends on the difficulty tier.'],
  ['doctrine', 'Doctrine', `Your ${DECK_SIZE}-card deck. Exactly ${DECK_SIZE} unique, PvP-legal cards.`],
  ['armour', 'Core armour', ARMOUR_SENTENCE],
  ['regroup', 'Regroup', `At refresh each surviving unit recovers up to ${REGROUP_RECOVERY} power toward its printed value. Plague damage is permanent — it lowers the printed value too, so infection cannot be regrouped away.`],
  ['fatigue', 'Fatigue', FATIGUE_SENTENCE],
  ['seed', 'Seed code', 'Every match is generated from a seed. The code shown in the match bar (e.g. VET-3FAV-FQFE) reproduces the exact match, difficulty included, for anyone who enters it.'],
  ['defense', 'Defense', `Each active Defense support prevents the first ${CORE_PREVENTION_PER_DEFENSE} Core damage from its lane each turn. Multiple Defenses stack their prevention.`],
  ['open-lane', 'Open lane', OPEN_LANE_SENTENCE],
  ['seam', 'The seam', 'The gold band across the middle of the board. It shows, per lane, the damage that will actually land in each direction if the turn ends right now — after Core armour and Defense prevention, not raw board power.'],
];

const glossaryByTerm = new Map(GLOSSARY.map(([key, title, body]) => [key, { key, title, body }]));

/** Term lookup that tolerates the on-screen casing/pluralisation. */
export function lookupTerm(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/[^a-z-]/g, '');
  return glossaryByTerm.get(key) || glossaryByTerm.get(key.replace(/s$/, '')) || null;
}

export const PRIMER_PANELS = [
  {
    title: 'The Core',
    lead: `Both sides start at ${STARTING_CORE} Core. Reduce theirs to 0.`,
    body: 'Damage that gets past a lane goes to the Core, reduced by armour on the way. A Core reaching 0 ends the match immediately; if both collapse in the same resolution it is a draw. Running your deck out is the other way to lose: each failed draw deals escalating unpreventable Core damage.',
    demo: 'core',
  },
  {
    title: 'Three lanes',
    lead: 'Vanguard, Conduit and Flank resolve independently.',
    body: `Each lane holds up to ${MAX_UNITS_PER_LANE} units and ${MAX_SUPPORTS_PER_LANE} persistent supports per side. Winning one lane does not help another — a lane with no defenders lets every attacker there hit the Core, and nothing caps what an undefended lane lets through.`,
    demo: 'lanes',
  },
  {
    title: 'Three resources',
    lead: 'Command, Insight and Essence refill every turn — at different rates.',
    body: `${RESOURCE_RAMP_SENTENCE} Every card costs some mix of the three, so a deck that leans on Essence plays a slower game. Select a card in hand and the pips it would consume are shown as outlines before you commit to a lane.`,
    demo: 'resources',
  },
  {
    title: 'Power is both',
    lead: 'A unit\'s power is its attack AND its remaining durability.',
    body: `There is no separate health number. A power 6 unit attacks for 6, and it is destroyed once it has taken 6. Damage is simultaneous, so two power 6 units trading will destroy each other. Two more things follow: a unit arrives exhausted and cannot attack until your next refresh, and damage that reaches a Core is divided down on the way — ${ARMOUR_CONTESTED} against a defended lane, ${ARMOUR_OPEN} and uncapped against an empty one. Board power is never face damage, but leaving a lane empty is not a ${CONTESTED_CEILING}-damage decision either. This is the rule most card games do differently.`,
    demo: 'power',
  },
];
