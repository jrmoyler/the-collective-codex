# Local Match Rules

The Collective Codex local match is a deterministic, three-lane rules implementation over the existing 1,134-card canon. It does not change card names or card text. When canonical text contains an effect whose numeric or procedural meaning is not fully defined, the engine uses the smallest consistent interpretation documented below instead of inventing new card text.

## Match setup

- **Deck size:** 30 unique, PvP-legal cards.
- **Starter doctrine:** 18 entity cards and 12 non-entity cards, selected deterministically across available divisions with a bias toward lower total costs. It exists only as a jump-start deck; it receives no statistical advantage.
- **Persistence:** the active deck, including an in-progress edit shorter than 30 cards, is stored in `localStorage` under `collectiveCodex.activeDeck.v1`.
- **Core:** each side begins at 20.
- **Opening hand:** each side draws 5 cards.
- **Mulligan:** the player may replace any number of opening cards once. The rival uses the same one-time mulligan and replaces up to two opening cards whose combined Command + Insight + Essence cost is 7 or more.
- **Lanes:** Vanguard, Conduit, Flank.
- **Capacity:** up to 3 units and 4 persistent supports per side per lane.
- **Win condition:** reduce the opposing Core to 0. A Core reaching 0 ends the match immediately. Simultaneous Core collapse is a draw.

## Turn and resource flow

A round consists of the player's main phase and combat, followed by the rival's main phase and combat. If neither Core reaches 0, the next round begins with the player.

At the start of each side's turn, its normal resources refill according to that side's turn number `t`:

```text
Command = min(10, 5 + floor((t - 1) / 2))
Insight = min(10, 5 + floor((t - 1) / 3))
Essence = min(10, 4 + floor((t - 1) / 4))
```

Turn 1 therefore begins at **5 Command / 5 Insight / 4 Essence**. The curve is deliberately broad enough for the generated three-resource costs while still creating progression. All three resources cap at 10 before card effects. A functioning Base may generate one additional dominant-cost resource on refresh, also capped at 10.

Cards are played only during the active side's main phase unless their existing family rule is represented as a persistent reaction/trap. Playing a card pays its existing `cost.command`, `cost.insight`, and `cost.essence` exactly, subject only to canonical modifiers such as Environment.

## Combat

Combat resolves all three lanes automatically when the player ends the turn and again after the rival's main phase.

- **Open lane:** non-exhausted attackers deal their current total power directly to the opposing Core.
- **Contested lane:** attackers and defenders are paired deterministically by combat power. Damage is simultaneous. Current power serves as both attack value and remaining combat durability for this local rules implementation.
- **Broken lane:** if a contested lane's defenders are destroyed, each surviving attacker that participated deals 1 breakthrough Core damage.
- **Guard:** a Guard unit is prioritized as a defender, and the first combat damage dealt to an allied unit in that lane is reduced by 1 that combat.
- **Flying:** a Flying attacker bypasses ground defenders and deals its power to the Core if the lane contains neither an opposing Flying unit nor Guard. Flying/Guard therefore provides deterministic interception.
- **Defense:** each active Defense in a lane prevents the first 2 Core damage from that lane during its controller's turn cycle.
- **Exhausted units:** do not attack until refreshed.
- **Defeated units:** are removed from the lane and placed into discard.

## Implemented family rules

The engine reads the existing card fields (`cost`, `power`, `rulesText`, `keywords`, `targeting`, `timing`, and `duration`) and applies the following deterministic interpretations.

| Family / keyword | Local deterministic interpretation |
| --- | --- |
| Specimen | When deployed into a lane containing an enemy unit, gains +1 power until end of turn. |
| Weapon | Attaches to the strongest friendly unit in the chosen lane. That unit's first attack each turn gains +2 power. The draw/discard clause is only relevant when that equipped unit moved; movement bookkeeping is preserved. |
| Monster | On deployment, if its power exceeds every enemy unit already in that lane, deals 1 Core damage. |
| Knight / Guard | Guard combat rule described above. |
| Warrior | After surviving its attack, may shift once to an adjacent lane. The local engine performs the shift only when it improves lane balance and a legal slot exists. Moving clears Plague infection as written. |
| Magician | On play, inspects the next two cards deterministically: keeps the first and puts the second on the bottom. |
| Environment | While active, the first card played into each lane each turn costs 1 less of its highest non-zero resource cost. Ties resolve Command, then Insight, then Essence. |
| Disaster | The source text gives no damage number. The minimum non-zero deterministic interpretation is used: 1 damage to the highest-power enemy in each lane, then exhaust each survivor hit. |
| Defense | Prevents the first 2 Core damage from its lane each turn. Multiple Defenses stack their prevention capacity. |
| Base | At refresh, generates 1 resource matching the dominant summed cost among friendly cards in its lane. Ties resolve Command, Insight, then Essence. |
| Item | Gives the strongest friendly unit in the lane +1 power until end of turn. The division keyword is recorded, but no undefined numeric keyword effect is invented. |
| Operative | Records the named division keyword trigger. If the keyword has no canonical numeric definition, no additional statistic is fabricated. |
| Action | Gives the strongest friendly unit in the chosen lane +2 power until end of turn. The reposition clause uses the same legal lane-shift model when applicable. |
| Trap | Installed face down. The next enemy entity entering that lane is exhausted and has its on-deploy trigger suppressed; the Trap is consumed. Rival Trap identity remains hidden in the UI until used. |
| Reaction | A persistent local Reaction reduces the next numeric effect damage by 1 and grants 1 Insight, then is consumed. This is used for effect-tagged damage such as Monster deployment damage, not normal combat. |
| Response | May remain set as a persistent support. Canonical division keywords without numeric definitions are not copied into invented effects. |
| Law | Remains a visible persistent global rule card. The engine does not synthesize new repeated-ability names beyond the canon's existing trigger bookkeeping. |
| Spell | Resolves its two canonical keyword applications. When that division keyword has no numeric definition in the canon, the application is logged without fabricating a number. |
| Hex | Attaches to an opposing unit reference for the existing activated-ability surcharge rule. The current local UI exposes no generic activated-ability button, so no unrelated cost is invented. |
| Plague | Current enemy units in the lane become infected. At end step an infected unit loses 1 power; a unit that changed lanes clears the infection. |
| Virus | Remains a persistent system-threat support. The current engine has no generic repeat-trigger stack on which to invent extra timing behavior. |
| Dragon / Flying | Flying combat rule applies. On deployment, opposing Defense/Base infrastructure in the chosen lane is disabled until the Dragon controller's next refresh window. |
| Deity | Remains a unique entity. The written resource-conversion ability is not auto-fired because it is an optional activated choice and the canon does not specify an activation UI target sequence. |
| Android | Remains an entity with automation metadata. Only already-defined lane actions may repeat; the engine does not invent a missing target/action history. |
| God | Remains a unique entity. Its decree text is intentionally not expanded into a new battlefield rule because the card canon does not define which rule to choose. |
| Ruler | Remains a leader entity. Its optional mixed-resource activation is not auto-fired when the division keyword lacks deterministic numeric semantics. |
| Ritual | Gains one channel counter at each end step up to Channel 3. At 3 it is marked ready. If its division-wide effect is not numerically defined by the canon, readiness is logged without inventing a new effect. |
| World | Remains a persistent global World card. Division matching is preserved as metadata; no new global modifier is fabricated beyond the existing text. |

These simplifications are intentionally conservative. They allow existing deterministic numbers and targets to function while leaving pure flavor or underspecified division-keyword semantics as visible canonical information.

## Rival doctrine

The rival uses the exact same Core total, deck size, hand size, resource curve, lane capacities, legal-play checks, combat engine, and card effects as the human player. There are no hidden stat or resource bonuses.

Its default deck is generated from the same starter-deck algorithm over a visible doctrine preference for **Kinetic Edge, Terra Axis, and Gaia Synthesis**. During the main phase it scores legal plays using current card power, cost, lane pressure, open-Core opportunities, infrastructure needs, and whether a support has a legal friendly target. It may play up to five cards in one main phase if resources and board space allow. The scoring heuristic changes decisions, not rules.

## Match end and reset

When either Core reaches 0, the battlefield enters an ended state and displays the final Core scores and turn count. **Play again** starts a fresh match from the currently saved player deck. **Return to Codex** exits the match while preserving the active deck in local storage. **Reset match** abandons current match state and returns to deck construction.
