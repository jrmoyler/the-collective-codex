# Local Match Rules

The Collective Codex local match is a deterministic, three-lane rules implementation over the existing 1,134-card canon. It does not change card names or card text. When canonical text contains an effect whose numeric or procedural meaning is not fully defined, the engine uses the smallest consistent interpretation documented below instead of inventing new card text.

Everything here is reproducible: the same two decks, the same seed and the same difficulty always produce the same match. The engine contains no clock and no random source of its own.

## Match setup

- **Deck size:** 30 unique, PvP-legal cards.
- **Starter doctrine:** 18 entity cards and 12 non-entity cards, selected deterministically across available divisions with a bias toward lower total costs. It exists only as a jump-start deck; it receives no statistical advantage.
- **Persistence:** the active deck, including an in-progress edit shorter than 30 cards, is stored in `localStorage` under `collectiveCodex.activeDeck.v1`.
- **Core:** each side begins at 20.
- **Opening hand:** each side draws 5 cards.
- **Mulligan:** the player may replace any number of opening cards once. Replaced cards go to the bottom of the deck and are immediately redrawn. The rival takes its own one-time mulligan in the same step, and how greedy it is depends on the difficulty tier (see [Rival doctrine](#rival-doctrine)).
- **Seed code:** every match carries a shareable seed code (`state.seedCode`, e.g. `VET-3FAV-FQFS`). The three-letter prefix is the rival tier and the rest encodes the 32-bit seed, so entering a code replays that exact match, difficulty included.
- **Lanes:** Vanguard, Conduit, Flank.
- **Capacity:** up to 3 units and 4 persistent supports per side per lane.
- **Play legality:** a card may only be played during its controller's main phase, into a lane with a free slot of the right kind, and only if the resource pool covers its cost. Item, Action and Weapon additionally require a friendly unit already in that lane; Hex requires an opposing unit there.
- **Win conditions:** reduce the opposing Core to 0, by combat, by card effect, or by **fatigue** (see [Deck-out fatigue](#deck-out-fatigue)). A Core reaching 0 ends the match immediately. Simultaneous Core collapse is a draw. There is no turn limit in the interactive match.

## Turn and resource flow

A round consists of the player's main phase and combat, followed by the rival's main phase and combat. If neither Core reaches 0, the next round begins with the player.

### Resource curve

At the start of each side's turn, its normal resources refill according to that side's own turn number `t`. The three types **ramp at different rates to different caps** — Command is the tempo resource, Insight the mid resource, Essence the scarce one:

```text
Command = min(6, 1 + t)
Insight = min(5, 1 + ceil(2t / 3))
Essence = min(4, 1 + ceil(t / 2))
```

| Turn | Command | Insight | Essence | Total |
| --- | --- | --- | --- | --- |
| 1 | 2 | 2 | 2 | 6 |
| 2 | 3 | 3 | 2 | 8 |
| 3 | 4 | 3 | 3 | 10 |
| 4 | 5 | 4 | 3 | 12 |
| 5 and later | 6 | 5 | 4 | 15 |

Turn 1 therefore still begins at **2 Command / 2 Insight / 2 Essence**, but the three pools separate immediately and are fully ramped by turn 5. This paced, staggered opening keeps the 20-Core game from becoming a five-card opening-hand dump, and it makes Essence-heavy cards genuinely late-game while Command-heavy cards stay available early.

Pools do not carry over between turns; they are overwritten by the refill. A functioning Base may generate one additional dominant-cost resource on refresh, up to the engine's hard resource ceiling of 10, which bounds card-generated resources only.

### Card draw

Each refresh draws **2** cards. The one exception is standard on-the-play compensation: the player, who takes the first turn, draws **1** on their opening refresh. A kept opening hand is therefore 5 + 1 = 6 cards when the first main phase begins, and the rival's hand is 5 + 2 = 7 when its first main phase begins.

Weapon and Magician triggers draw outside this schedule; they are described in the family table.

### Playing cards

Cards are played only during the active side's main phase unless their existing family rule is represented as a set reaction/trap. In this local minimum loop, Reaction/Response timing is armed during the controller's main phase because the automated rival turn has no interactive stack pause; their canonical timing remains visible on the card and the deterministic simplification is documented here. Playing a card pays its existing `cost.command`, `cost.insight`, and `cost.essence` exactly, subject only to canonical modifiers such as Environment.

## Combat

Combat resolves all three lanes automatically, in Vanguard → Conduit → Flank order, when the player ends the turn and again after the rival's main phase.

### Deployment fatigue

**A unit arrives exhausted.** It cannot attack on the turn it is played and becomes ready at its controller's next refresh. It defends normally from the moment it arrives, and it can still be buffed, moved or destroyed. Without this rule the match was a first-strike race decided in about two rounds.

### Core armour

Combat damage aimed at a Core is scaled down before it lands:

```text
reaching_core = min( ceil(raw / 4), 3 )
```

An unblocked Flying strike **pierces one step** of that armour: it divides by 3 instead of 4 and its ceiling is 4 instead of 3. So a 12-power ground swing lands 3, while a 12-power unblocked air swing lands 4.

Armour applies only to combat damage. `Monster` deployment damage and fatigue damage are literal canonical values and are not armoured.

The absorbed portion is reported separately in the log, so the raw number and the number that actually landed are both visible.

### Regroup

At each refresh, every surviving friendly unit recovers up to **2** power toward its printed power (plus any buff still active). Chip damage from an inconclusive clash therefore heals over a turn, and trading two 4-power units into one 6-power unit is no longer automatically correct.

**Plague damage is the exception: it is permanent.** Infection lowers a unit's base power as well as its current power, so regroup cannot restore it.

### Lane resolution

- **Open lane:** non-exhausted attackers in a lane with no defenders sum their current total power (including any Weapon bonus on a first attack) into one **raw** strike at the opposing Core. Core armour then decides how much of it lands.
- **Contested lane:** attackers and defenders are paired deterministically by combat power, Guards defending first. Damage is simultaneous. Current power serves as both attack value and remaining combat durability for this local rules implementation. Attackers beyond the number of defenders deal no damage this combat, and defenders beyond the number of attackers take none.
- **Broken lane:** if a contested lane's defenders are all destroyed, each surviving attacker that participated contributes 1 raw breakthrough damage. That total is armoured like any other combat damage.
- **Guard:** a Guard unit is prioritized as a defender, and the first combat damage dealt to an allied unit in that lane is reduced by 1 that combat, once per side.
- **Flying:** a Flying attacker bypasses ground defenders and strikes the Core if the lane contains neither an opposing Flying unit nor Guard. Flying/Guard therefore provides deterministic interception. An unblocked air strike pierces one step of Core armour.
- **Defense:** each active Defense in a lane prevents 2 Core damage from that lane per turn cycle, and multiple Defenses stack their prevention capacity. **Prevention applies after Core armour**, not before — the canon text prevents damage *dealt to your Core*, and armour has already decided how much that is. Because a ground breach is capped at 3, a single Defense fully absorbs any raw ground strike of 8 power or less.
- **Exhausted units:** do not attack until refreshed. Every unit is exhausted on the turn it arrives.
- **Defeated units:** are removed from the lane and placed into discard.

The end step that follows combat expires temporary buffs, applies Plague, charges Rituals, flushes triggers a Virus delayed, and performs Warrior shifts.

### Deck-out fatigue

Drawing from an empty deck does not silently do nothing. The **Nth failed draw of the match deals N Core damage to its own controller** — unpreventable, unarmoured, ignored by Defense, and not attributable to any lane. The second failed draw deals 2, the third 3, and so on, so a match between two exhausted decks terminates quickly. A match that ends this way reports `endReason: 'fatigue'` rather than `'core'`.

## Implemented family rules

The engine reads the existing card fields (`cost`, `power`, `rulesText`, `keywords`, `targeting`, `timing`, and `duration`) and applies the following deterministic interpretations.

| Family / keyword | Local deterministic interpretation |
| --- | --- |
| Specimen | When deployed into a lane containing an enemy unit, gains +1 power until end of turn. |
| Weapon | Attaches to the strongest friendly unit in the chosen lane. That unit's first attack each turn gains +2 power. If the equipped unit moved before that first attack, the trigger draws 1 card and then deterministically discards the highest-total-cost card in hand; cost ties resolve by card ID. |
| Monster | On deployment, if its power exceeds every enemy unit already in that lane, deals 1 Core damage. That damage is not armoured, but Defense and a set Reaction still apply to it. |
| Knight / Guard | Guard combat rule described above. |
| Warrior | After surviving its attack, may shift once to an adjacent lane. The local engine performs the shift only when it improves lane balance and a legal slot exists. Moving clears Plague infection as written. |
| Magician | On play, inspects the next two cards deterministically: keeps the first and puts the second on the bottom. |
| Environment | While an Environment is active in a lane — either side's — the first card each side plays into that lane each turn costs 1 less of its highest non-zero resource cost. Ties resolve Command, then Insight, then Essence. |
| Disaster | The source text gives no damage number. The minimum non-zero deterministic interpretation is used: 1 damage to the highest-power enemy in each lane, then exhaust each survivor hit. |
| Defense | Prevents 2 Core damage from its lane per turn cycle, **after** Core armour has been applied. Multiple Defenses stack their prevention capacity. |
| Base | At refresh, generates 1 resource matching the dominant summed cost among the other friendly cards in its lane. Ties resolve Command, Insight, then Essence. Subject to Law and to an enemy Virus. |
| Item | Gives the strongest friendly unit in the lane +1 power until end of turn. The division keyword is recorded, but no undefined numeric keyword effect is invented. |
| Operative | Records the named division keyword trigger. If the keyword has no canonical numeric definition, no additional statistic is fabricated. |
| Action | Gives the strongest friendly unit in the chosen lane +2 power until end of turn. The reposition clause uses the same legal lane-shift model when applicable. |
| Trap | Installed face down. The next enemy entity entering that lane has its on-deploy trigger suppressed and is held exhausted; the Trap is consumed. Under deployment fatigue the arriving unit was exhausted anyway, so trigger suppression is the operative half of the effect. Rival Trap identity remains hidden in the UI until used. |
| Reaction | A set local Reaction reduces the next numeric effect damage by 1 and grants 1 Insight, then is consumed. This is used for effect-tagged damage such as Monster deployment damage, not normal combat. |
| Response | Set as a support. When its controller next resolves a card in that lane, the Response copies that card's numeric non-damage trigger at **half value, rounded down**, and is discarded. Only Action (+2 → +1 power) and Weapon (+2 → +1 first-attack bonus) carry a value that survives halving; against anything else the Response stays set and waits. |
| Law | Global, and it counts while **either** side controls one. Each side may then trigger each repeated ability only **once per turn**: one Base refresh generation, one Weapon attack trigger, one Ritual charge. Further triggers of the same name that turn are suppressed and logged. Defense prevention is a static replacement effect, not a repeated triggered ability, so it is not limited. |
| Spell | Chooses one target — the strongest opposing unit in its lane, otherwise the strongest friendly unit there. Both canonical keyword applications therefore land on the same card, which satisfies the printed "if both applications affect the same card, gain 1 Insight", so the controller gains 1 Insight. The keyword applications themselves remain numeric-free. With no legal target in that lane, nothing is gained. |
| Hex | Attaches to an opposing unit reference for the existing activated-ability surcharge rule. The current local UI exposes no generic activated-ability button, so no unrelated cost is invented. |
| Plague | Current enemy units in the lane become infected. At each end step an infected unit loses 1 power **permanently** — its base power drops too, so regroup can never restore it. A unit that changed lanes clears the infection instead. |
| Virus | Persistent system threat. While an opposing Virus is active, the **first** automated refresh trigger that side would take — a Base generation or an Android automation — is delayed and resolves at that side's end step instead. One trigger per refresh is delayed. Combat-time triggers are unchanged; the engine has no stack to delay them onto. |
| Dragon / Flying | Flying combat rule applies. On deployment, opposing Defense and Base infrastructure in the chosen lane is disabled; it comes back online at its owner's refresh in a later round, so the owner loses one full cycle of that infrastructure. |
| Deity | Unique entity. At refresh, once per Deity, it converts 1 resource from its controller's largest pool into its smallest, but only when the gap is at least 2 — otherwise the conversion is pointless and is skipped. Ties for the largest pool resolve Command, Insight, Essence; ties for the smallest resolve in the reverse order. The **third** conversion permanently empowers the Deity by +2 power, base power included. The choice is deterministic; no number is invented. |
| Android | Entity with automation metadata. At refresh, an Android that has already changed lanes repeats that same directional move — once per refresh — provided the destination lane is on the board and has a free unit slot. Repeating counts as moving, so it also clears infection. An Android that has never moved does nothing. |
| God | Remains a unique entity. Its decree text is intentionally not expanded into a new battlefield rule because the card canon does not define which rule to choose. |
| Ruler | Remains a leader entity. Its optional mixed-resource activation is not auto-fired when the division keyword lacks deterministic numeric semantics. |
| Ritual | Gains one channel counter at each end step, up to Channel 3. There are two end steps per round, so an uncontested Ritual completes in a round and a half; with a Law in play, each side charges only one Ritual per turn. At 3 it resolves across friendly lanes and goes to discard. Its division-wide effect is not numerically defined by the canon, so resolution applies no invented numeric effect. |
| World | Remains a persistent global World card. Division matching is preserved as metadata; no new global modifier is fabricated beyond the existing text. |

### Families that are still deliberately inert

Four families — **Operative**, **God**, **Ruler** and **World** — still change nothing when they resolve, and that is a decision rather than an omission. Their canonical text names an effect but supplies neither the number nor the choice needed to run it: Operative's division keyword trigger has no value, God's battlefield decree does not say which rule it writes, Ruler's mixed-resource activation is optional with no defined activation target, and World's global modifier is not quantified. Implementing them would mean inventing card text, which this engine does not do. The three entity families announce themselves in the log when they deploy so the flavour is visible; a World card simply sits on the battlefield as metadata and prints no note.

Every other family in the table now resolves to a real board effect. These remaining simplifications are intentionally conservative: they let existing deterministic numbers and targets function while leaving pure flavour and underspecified division-keyword semantics as visible canonical information.

## Rival doctrine

The rival uses the exact same Core total, deck size, hand size, resource curve, draw schedule, deployment fatigue, Core armour, lane capacities, legal-play checks, combat engine, and card effects as the human player. There are no hidden stat or resource bonuses, and no tier is exempt from any of it.

Its deck is drafted from the full canon to mirror the player's own deck profile — comparable entity count, average power, and average total cost — so a cheap aggressive doctrine is answered by a cheap aggressive doctrine rather than by a fixed list. The battlefield HUD's "Kinetic Edge · Terra Axis · Gaia Synthesis" line is doctrine flavour, not a restriction on the cards the rival may draft.

During the main phase it scores legal plays using current card power, cost, lane pressure, open-Core opportunities, infrastructure needs, and whether a support has a legal friendly target. The scoring heuristic changes decisions, not rules.

### Difficulty tiers

Three tiers are available, selected before the match and recorded in the seed code: **recruit**, **veteran** (the default), and **sovereign**.

| | recruit | veteran | sovereign |
| --- | --- | --- | --- |
| Cards committed per main phase | up to 2 | up to 4 | up to 6 |
| Position model | material only | material plus static lane-threat projection | material, threat, and full combat resolution of its own attack **and** the opponent's reply |
| Values Defense when its Core is low | no | mildly | strongly |
| Detects lethal lines | no | yes | yes, weighted heavily |
| Holds Traps, Disaster and Hex for value | no | no | yes |
| Mulligan | never | up to 2 cards costing 7 or more | up to 3 costing 6 or more, and dumps a hand with no entity in it |

**What differs is search depth and evaluation weight — nothing else.** All three tiers see the same public battlefield, obey the same legality checks, pay the same costs, draw on the same schedule, and take the same damage. None of them peeks at the opponent's hand contents or at either deck's order; the only hidden-zone information any tier uses is the *number* of cards in a hand or deck, which is public in any card game. A higher tier does not get more resources, better cards, or a second look at the shuffle. It simply thinks further ahead before committing.

The tiers are measurably ordered. Over 300 seeds per matchup, with each pairing played from both seats on mirrored decks:

| Matchup | Win rate |
| --- | --- |
| veteran over recruit | 62.5% |
| sovereign over veteran | 54.7% |

The gap narrows at the top, which is what a healthy ladder looks like: recruit loses to basic threat awareness, while sovereign has to earn its edge over veteran through lookahead.

## Match end and reset

When either Core reaches 0 — from combat, from a card effect, or from fatigue — the battlefield enters an ended state and displays the final Core scores, the turn count, and the seed code for a rematch. **Play again** starts a fresh match from the currently saved player deck. **Return to Codex** exits the match while preserving the active deck in local storage. **Reset match** abandons current match state and returns to deck construction.
