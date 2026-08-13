/* glossary.js — the single source of truth for rules copy in the UI (IA-7).
   Every definition is a restatement of docs/match-rules.md; do not fork the wording. */

export const GLOSSARY = [
  ['core', 'Core', 'Each side begins at 20 Core. Reduce the opposing Core to 0 and the match ends immediately. Simultaneous collapse is a draw.'],
  ['power', 'Power', 'A unit\'s power is simultaneously its attack value and its remaining combat durability. There is no separate health number. A power 6 unit hits for 6 and is destroyed after taking 6.'],
  ['command', 'Command', 'One of the three resources. It refills at the start of your turn along your resource curve; every card costs some mix of Command, Insight and Essence.'],
  ['insight', 'Insight', 'One of the three resources, refilled each turn on its own curve. Reaction supports can restore it mid-match.'],
  ['essence', 'Essence', 'One of the three resources, the scarcest of the three at every turn number.'],
  ['lane', 'Lane', 'The board has three lanes — Vanguard, Conduit and Flank. Each lane resolves its combat independently. A lane holds up to 3 units and 4 persistent supports per side.'],
  ['vanguard', 'Vanguard', 'The first of the three lanes. Lanes are otherwise identical; position only matters for what is already standing there.'],
  ['conduit', 'Conduit', 'The middle lane.'],
  ['flank', 'Flank', 'The third lane.'],
  ['entity', 'Entity', 'A card that becomes a unit on the board: Specimen, Monster, Knight, Warrior, Magician, Operative, Dragon, Deity, Android, God, Ruler. Entities are the only cards that hold a lane.'],
  ['support', 'Support', 'A persistent card installed in a lane — Weapon, Environment, Defense, Base, Trap, Reaction, Response, Law, Hex, Plague, Virus, Ritual, World. Item, Action and Disaster resolve immediately instead.'],
  ['exhausted', 'Exhausted', 'An exhausted unit does not attack. Units are exhausted the turn they are deployed and refresh at the start of your next turn.'],
  ['infected', 'Infected', 'A Plague marks enemy units in its lane. At each end step an infected unit loses 1 power permanently. Moving a unit to another lane clears the infection.'],
  ['guard', 'Guard', 'A Guard unit is prioritised as a defender, and the first combat damage dealt to an allied unit in that lane is reduced by 1 that combat.'],
  ['flying', 'Flying', 'A Flying attacker bypasses ground defenders and hits the Core directly, unless the opposing lane holds a Flying unit or a Guard.'],
  ['breakthrough', 'Breakthrough', 'If a contested lane\'s defenders are all destroyed, each surviving attacker that fought there deals 1 further Core damage.'],
  ['refresh', 'Refresh', 'The start of your turn: resources refill along the curve, your units un-exhaust and regroup, Bases generate, and you draw a card.'],
  ['channel', 'Channel', 'A Ritual gains one channel counter at each end step. At Channel 3 it is ready.'],
  ['mulligan', 'Mulligan', 'A one-time replacement of any number of opening cards. Replaced cards go to the bottom of your deck and you draw that many new ones.'],
  ['doctrine', 'Doctrine', 'Your 30-card deck. Exactly 30 unique, PvP-legal cards.'],
  ['defense', 'Defense', 'Each active Defense support prevents the first 2 Core damage from its lane each turn. Multiple Defenses stack their prevention.'],
  ['open-lane', 'Open lane', 'A lane with no opposing units. Every attacker there deals its full power straight to the opposing Core.'],
  ['seam', 'The seam', 'The gold band across the middle of the board. It shows, per lane, the damage that will land in each direction if the turn ends right now.'],
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
    body: 'Damage that gets past a lane goes straight to the Core. A Core reaching 0 ends the match immediately; if both collapse in the same resolution it is a draw.',
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
    lead: 'Command, Insight and Essence refill every turn.',
    body: 'Each resource climbs its own curve as the turn number rises, and every card costs some mix of the three. Select a card in hand and the pips it would consume are shown as outlines before you commit to a lane.',
    demo: 'resources',
  },
  {
    title: 'Power is both',
    lead: 'A unit\'s power is its attack AND its remaining durability.',
    body: 'There is no separate health number. A power 6 unit attacks for 6, and it is destroyed once it has taken 6. Damage is simultaneous, so two power 6 units trading will destroy each other. This is the rule most card games do differently — it is the one to remember.',
    demo: 'power',
  },
];
