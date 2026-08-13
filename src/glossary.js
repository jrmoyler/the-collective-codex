/* glossary.js — the single source of truth for rules copy in the UI (IA-7).
   Every definition is a restatement of docs/match-rules.md; do not fork the wording. */

export const GLOSSARY = [
  ['core', 'Core', 'Each side begins at 20 Core. Reduce the opposing Core to 0 — by combat, by card effect, or by deck-out fatigue — and the match ends immediately. Simultaneous collapse is a draw. There is no turn limit.'],
  ['power', 'Power', 'A unit\'s power is simultaneously its attack value and its remaining combat durability. There is no separate health number. A power 6 unit hits for 6 and is destroyed after taking 6.'],
  ['command', 'Command', 'The tempo resource. It ramps fastest and caps at 6. Pools do not carry over between turns.'],
  ['insight', 'Insight', 'The mid resource: it ramps more slowly than Command and caps at 5. Reaction and Spell effects can restore it mid-turn.'],
  ['essence', 'Essence', 'The scarce resource: slowest ramp, cap 4. A doctrine that leans on Essence plays a slower game.'],
  ['lane', 'Lane', 'The board has three lanes — Vanguard, Conduit and Flank. Each lane resolves its combat independently. A lane holds up to 3 units and 4 persistent supports per side.'],
  ['vanguard', 'Vanguard', 'The first of the three lanes. Lanes are otherwise identical; position only matters for what is already standing there.'],
  ['conduit', 'Conduit', 'The middle lane.'],
  ['flank', 'Flank', 'The third lane.'],
  ['entity', 'Entity', 'A card that becomes a unit on the board: Specimen, Monster, Knight, Warrior, Magician, Operative, Dragon, Deity, Android, God, Ruler. Entities are the only cards that hold a lane.'],
  ['support', 'Support', 'A persistent card installed in a lane — Weapon, Environment, Defense, Base, Trap, Reaction, Response, Law, Hex, Plague, Virus, Ritual, World. Item, Action and Disaster resolve immediately instead.'],
  ['exhausted', 'Exhausted', 'An exhausted unit does not attack. Every unit arrives exhausted — deployment fatigue — so it defends the moment it lands but cannot attack until your next refresh. This is the most common cause of "why did my unit not attack?".'],
  ['infected', 'Infected', 'A Plague marks enemy units in its lane. At each end step an infected unit loses 1 power permanently. Moving a unit to another lane clears the infection.'],
  ['guard', 'Guard', 'A Guard unit is prioritised as a defender, and the first combat damage dealt to an allied unit in that lane is reduced by 1 that combat.'],
  ['flying', 'Flying', 'A Flying attacker bypasses ground defenders and hits the Core directly, unless the opposing lane holds a Flying unit or a Guard.'],
  ['breakthrough', 'Breakthrough', 'If a contested lane\'s defenders are all destroyed, each surviving attacker that fought there deals 1 further Core damage.'],
  ['refresh', 'Refresh', 'The start of your turn: resources refill along the curve, your units un-exhaust and regroup up to 2 power, Bases generate, and you draw 2 cards.'],
  ['channel', 'Channel', 'A Ritual gains one channel counter at each end step. At Channel 3 it is ready.'],
  ['mulligan', 'Mulligan', 'A one-time replacement of any number of opening cards. Replaced cards go to the bottom of your deck and are immediately redrawn. The rival takes its own one-time mulligan in the same step; how greedy it is depends on the difficulty tier.'],
  ['doctrine', 'Doctrine', 'Your 30-card deck. Exactly 30 unique, PvP-legal cards.'],
  ['armour', 'Core armour', 'A raw hit aimed at a Core is cut to min(⌈raw/4⌉, 3) before anything else. An unblocked Flying strike pierces one step: ⌈raw/3⌉, capped at 4. Raw board power is therefore never face damage. Monster deploy damage and fatigue damage are not armoured.'],
  ['regroup', 'Regroup', 'At refresh each surviving unit recovers up to 2 power toward its printed value. Plague damage is permanent — it lowers the printed value too, so infection cannot be regrouped away.'],
  ['fatigue', 'Fatigue', 'You draw 2 cards at every refresh. Drawing from an empty deck instead deals escalating, unpreventable Core damage: the Nth failed draw costs N Core. A match can end this way.'],
  ['seed', 'Seed code', 'Every match is generated from a seed. The code shown in the match bar (e.g. VET-3FAV-FQFE) reproduces the exact match, difficulty included, for anyone who enters it.'],
  ['defense', 'Defense', 'Each active Defense support prevents the first 2 Core damage from its lane each turn. Multiple Defenses stack their prevention.'],
  ['open-lane', 'Open lane', 'A lane with no opposing units. Every unexhausted attacker there strikes the opposing Core — but that raw total is then cut by Core armour, so an open lane is worth at most 3 Core a turn (4 if the strike is Flying).'],
  ['seam', 'The seam', 'The gold band across the middle of the board. It shows, per lane, the damage that will actually land in each direction if the turn ends right now — after Core armour and Defense prevention, not raw board power.'],
];

export const glossaryByTerm = new Map(GLOSSARY.map(([key, title, body]) => [key, { key, title, body }]));

/** Term lookup that tolerates the on-screen casing/pluralisation. */
export function lookupTerm(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/[^a-z-]/g, '');
  return glossaryByTerm.get(key) || glossaryByTerm.get(key.replace(/s$/, '')) || null;
}

export const PRIMER_PANELS = [
  {
    title: 'The Core',
    lead: 'Both sides start at 20 Core. Reduce theirs to 0.',
    body: 'Damage that gets past a lane goes to the Core, reduced by armour on the way. A Core reaching 0 ends the match immediately; if both collapse in the same resolution it is a draw. Running your deck out is the other way to lose: each failed draw deals escalating unpreventable Core damage.',
    demo: 'core',
  },
  {
    title: 'Three lanes',
    lead: 'Vanguard, Conduit and Flank resolve independently.',
    body: 'Each lane holds up to 3 units and 4 persistent supports per side. Winning one lane does not help another — a lane with no defenders lets every attacker there hit the Core.',
    demo: 'lanes',
  },
  {
    title: 'Three resources',
    lead: 'Command, Insight and Essence refill every turn — at different rates.',
    body: 'Command ramps fastest to a cap of 6, Insight to 5, Essence to 4. Turn 1 gives 2/2/2; turn 5 and after gives 6/5/4. Every card costs some mix of the three, so a deck that leans on Essence plays a slower game. Select a card in hand and the pips it would consume are shown as outlines before you commit to a lane.',
    demo: 'resources',
  },
  {
    title: 'Power is both',
    lead: 'A unit\'s power is its attack AND its remaining durability.',
    body: 'There is no separate health number. A power 6 unit attacks for 6, and it is destroyed once it has taken 6. Damage is simultaneous, so two power 6 units trading will destroy each other. Two more things follow: a unit arrives exhausted and cannot attack until your next refresh, and damage that reaches a Core is cut by armour to at most 3 a lane — so board power is never face damage. This is the rule most card games do differently.',
    demo: 'power',
  },
];
