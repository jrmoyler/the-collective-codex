# Local Match Rules

The Collective Codex local match is a deterministic, three-lane rules implementation over the existing 1,134-card canon. It does not change card names or card text. When canonical text contains an effect whose numeric or procedural meaning is not fully defined, the engine uses the smallest consistent interpretation documented below instead of inventing new card text.

Everything here is reproducible: the same two decks, the same seed and the same difficulty always produce the same match. The engine contains no clock and no random source of its own.

## Match setup

- **Deck size:** 30 unique, PvP-legal cards.
- **Starter doctrine:** 30 cards drafted deterministically to a **cost curve** — four cards castable on turn 1, then 5/7/6/5/3 across the later bands — taking the highest-power card available in each band and rotating across divisions so no single division dominates. The engine grants it no special treatment. It was previously drafted cheapest-first, which under a cost-correlated canon meant drafting the *weakest* thirty cards in the game: it lost to every other archetype 0–1% of the time. It now beats a cheap-swarm deck 98% and a top-heavy deck 98%, and sits roughly even against a hand-optimised curve deck. The rival is drafted by `buildRivalDeck` to mirror the player's own cost and power profile, so the matchup stays close whatever the player brings.
- **Persistence:** the active deck, including an in-progress edit shorter than 30 cards, is stored in `localStorage` under `collectiveCodex.activeDeck.v1`.
- **Core:** each side begins at 20.
- **Opening hand:** each side draws 5 cards.
- **Mulligan:** the player may replace any number of opening cards once. Replaced cards go to the bottom of the deck and are immediately redrawn. The rival takes its own one-time mulligan in the same step, and how greedy it is depends on the difficulty tier (see [Rival doctrine](#rival-doctrine)).
- **Seed code:** every match carries a shareable seed code (`state.seedCode`, e.g. `VET-3FAV-FQF9-TZ8M`). The three-letter prefix is the rival tier; the rest encodes the 32-bit seed, a fingerprint of the doctrine the match was played with, and a checksum. Entering a code replays that shuffle at that tier — it is the *same match* only when the doctrine also matches, and the pre-match screen says so when it does not.
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

Pools do not carry over between turns; they are overwritten by the refill. The single exception is a resource a hostile Virus delayed to the end step, which is carried across the next refill so that a delay is a delay and not a confiscation (see the Virus row of the family table). A functioning Base may generate one additional dominant-cost resource on refresh, up to the engine's hard resource ceiling of 10, which bounds card-generated resources only.

> **The curve is deliberately slack, and that is a trade rather than an oversight.** Players still spend well under half of what the curve grants; turns end with an empty hand more often than an empty pool, so the match is draw-limited rather than resource-limited. Tightening `RESOURCE_CAPS` to 3/3/3 does gate the curve properly — every card becomes castable on schedule and the three resource types stop being interchangeable — but it was measured and rejected. At those caps a turn buys either one expensive body or three cheap ones, and three small bodies beat one large one in this combat model, so a cheap-swarm deck went from losing every matchup to winning 92–100% of them. The looser caps keep raw power decisive, which is what makes a balanced curve the strongest archetype rather than the weakest. Low utilisation is the price of that.

### Card draw

Each refresh draws **2** cards, on both sides, including the opening refresh. A kept opening hand is therefore 5 + 2 = 7 cards when the first main phase begins.

**On the draw.** The seat that acts second is compensated once, at its first refresh, with **one extra card and one extra Command, Insight and Essence** — its first main phase begins on 5 + 3 = 8 cards with a resource pool one step ahead of the curve. The grant appears in the event stream as `resource-gain` with `source: 'On the draw'`, is paid exactly once per match, and is about seat order rather than about who is human. The amounts are ruleset data (`onTheDraw` in `ruleset.js`); see **Seat parity** below for what they are worth and why the card alone was not enough.

Weapon and Magician triggers draw outside this schedule; they are described in the family table.

### Playing cards

Cards are played only during the active side's main phase unless their existing family rule is represented as a set reaction/trap. In this local minimum loop, Reaction/Response timing is armed during the controller's main phase because the automated rival turn has no interactive stack pause; their canonical timing remains visible on the card and the deterministic simplification is documented here. Playing a card pays its existing `cost.command`, `cost.insight`, and `cost.essence` exactly, subject only to canonical modifiers such as Environment.

## Combat

Combat resolves all three lanes automatically, in Vanguard → Conduit → Flank order, when the player ends the turn and again after the rival's main phase.

### Deployment fatigue

**A unit arrives exhausted.** It cannot attack on the turn it is played and becomes ready at its controller's next refresh. It defends normally from the moment it arrives, and it can still be buffed, moved or destroyed. Without this rule the match was a first-strike race decided in about two rounds.

### Held exhausted

Some cards exhaust a unit that is *already* exhausted — a Trap sprung on an arriving entity, a Disaster survivor. Because exhaustion clears at the victim's own refresh, and that refresh always precedes the victim's next combat, plain exhaustion applied by an opponent could never cost anyone an attack. It does now:

**A unit that is *held* exhausted stays exhausted through exactly one of its own refreshes.** It misses one attack step, defends normally throughout, and readies at the refresh after that. The lost turn is announced in the log so it is never silent.

### Core armour and the lane breach ceiling

Combat damage aimed at a Core is scaled down before it lands:

```text
reaching_core = min( ceil(raw / 5), lane breach ceiling )
```

**The ceiling is a property of the lane being attacked, not a constant.**

| Lane the attack is resolving into | Ceiling |
| --- | --- |
| No living defender — an open lane, or an air strike into an empty lane | **none**; only the divisor applies |
| A living defender is present (a contested lane, or an air strike over ground units) | 3, or 4 for an unblocked Flying strike |

An unblocked Flying strike **pierces one step** of the divisor: it divides by 4 instead of 5. So a 15-power ground swing into a defended lane lands 3, a 15-power unblocked air swing over defenders lands 4, and a 15-power ground swing into a lane nobody is holding lands 3 — while a 40-power swing into that same open lane lands 8 rather than being truncated to 3.

This is what makes lane assignment a decision. When the ceiling was a flat 3 everywhere, a lane defended by nothing and a lane defended by 20 power both yielded at most 3 Core, so the marginal value of defending anything was at most 3 and committing everything to one lane while abandoning two cost almost nothing. In a controlled test — identical card choices, only the lane policy varying, 800 matches per policy against sovereign — spreading, stacking, committing everything to one lane and choosing at random previously finished within **0.8 percentage points** of one another. They now span **9.9 points**. Leaving a lane empty is genuinely dangerous, and power above the old ceiling is no longer thrown away.

The divisor moved from 4 to 5 at the same time. With the ceiling lifted off undefended lanes, the divisor became the only thing standing between a stacked lane and a Core, and at 4 the median match dropped to 6–7 rounds with roughly 30% of matches finishing inside 5. At 5 the median is 7–9 with about 20% short, which is where the game sat before. It is a pacing dial, and — unlike the old flat ceiling — it never destroys information: `ceil(raw / 5)` is strictly increasing in raw power, so more power on the board always means at least as much damage.

Armour applies only to combat damage. `Monster` deployment damage and fatigue damage are literal canonical values and are not armoured.

The absorbed portion is reported separately in the log, so the raw number and the number that actually landed are both visible.

### Regroup

At each refresh, every surviving friendly unit recovers up to **2** power toward its printed power (plus any buff still active). Chip damage from an inconclusive clash therefore heals over a turn, and trading two 4-power units into one 6-power unit is no longer automatically correct.

**Plague damage is the exception: it is permanent.** Infection lowers a unit's base power as well as its current power, so regroup cannot restore it.

### Lane resolution

- **Open lane:** non-exhausted attackers in a lane with no defenders sum their current total power (including any Weapon bonus on a first attack) into one **raw** strike at the opposing Core. The armour divisor decides how much of it lands; there is no ceiling on an undefended lane.
- **Contested lane:** attackers and defenders are paired deterministically by combat power, Guards defending first. Damage is simultaneous. Current power serves as both attack value and remaining combat durability for this local rules implementation. Attackers beyond the number of defenders deal no damage this combat, and defenders beyond the number of attackers take none.
- **Broken lane:** if a contested lane's defenders are all destroyed, the attackers that participated and survived push their **remaining power** into the Core as one raw breakthrough strike, armoured and capped at 3 like any other contested lane. Previously a breakthrough was worth 1 raw per surviving body, which made winning a fight strictly worse than the enemy not showing up: three attackers that cleared a lane pushed 3 raw where the same three into an empty lane pushed their whole power. Killing the defenders is now rewarded, and still costs the attackers the damage they took doing it.
- **Guard:** a Guard unit is prioritized as a defender, and the first combat damage dealt to an allied unit in that lane is reduced by 1 that combat, once per side.
- **Flying:** a Flying attacker bypasses ground defenders and strikes the Core if the lane contains neither an opposing Flying unit nor Guard. Flying/Guard therefore provides deterministic interception. An unblocked air strike pierces one step of Core armour.
- **Defense:** each active Defense in a lane prevents 2 Core damage from that lane per turn cycle, and multiple Defenses stack their prevention capacity. **Prevention applies after Core armour**, not before — the canon text prevents damage *dealt to your Core*, and armour has already decided how much that is. A single Defense therefore fully absorbs a contested-lane breakthrough of up to 2 and any open-lane strike whose raw power the divisor reduces to 2 or less; beyond that, an undefended lane can now out-scale it, which is the point.
- **Exhausted units:** do not attack until refreshed. Every unit is exhausted on the turn it arrives.
- **Defeated units:** are removed from the lane and placed into discard.

### Temporary buffs

A temporary buff (Specimen's deploy adaptation, Item, Action, a Response copy) normally expires at its controller's end step. **A buff granted to a unit that could not attack that turn is instead held through one end step**, so it is still on the unit while the opponent attacks and is still there for that unit's own next attack.

Without this rule, every Specimen deploy trigger was structurally dead: the Specimen arrives exhausted so it cannot attack with the +1, and the buff expired at its own controller's end step so it could not defend with it either. The trigger fired constantly and could never have mattered once.

### End step

The end step that follows combat expires temporary buffs, applies Plague, charges Rituals, flushes triggers a Virus delayed, and performs Warrior shifts.

**The end step does not run once a Core has reached 0.** The match ends the moment the Core falls, the board is left exactly as it stood, and no further event is recorded — the match-end announcement is always the final entry in the log and the event stream.

### Deck-out fatigue

Drawing from an empty deck does not silently do nothing. The **Nth failed draw of the match deals N Core damage to its own controller** — unpreventable, unarmoured, ignored by Defense, and not attributable to any lane. The second failed draw deals 2, the third 3, and so on, so a match between two exhausted decks terminates quickly. A match that ends this way reports `endReason: 'fatigue'` rather than `'core'`.

**This is a real clock, not a rare edge case, and it moved.** A 30-card doctrine draws 5 up front and 2 at every refresh, so it is empty around round 13 — which is close to where matches now end. Measured over 120 veteran mirrors with the shipped ruleset, **43% of curve-deck matches and 66% of cheap-swarm matches end on fatigue rather than on combat damage**. The swarm figure barely moved (62% before the seat-parity compensation); the curve figure went from 17%, because both seats now survive long enough to reach the clock. The median curve match went from 11 rounds to 13.

That is a deliberate acceptance, not an oversight. Bringing combat back to being the usual finish means letting more damage through — `coreArmourDivisor: 4` was re-measured under the new numbers and gives 38% fatigue endings at a median of 12 rounds with seat parity unchanged — but the divisor's current value carries the pacing on its own for undefended lanes and was set by a separate measurement that is still valid. It is one ruleset value and `npm run balance` re-measures the whole trade in under a minute; it has not been changed on this pass because a second balance target should not ride along with the first.

## Implemented family rules

The engine reads the existing card fields (`cost`, `power`, `rulesText`, `keywords`, `targeting`, `timing`, and `duration`) and applies the following deterministic interpretations.

| Family / keyword | Local deterministic interpretation |
| --- | --- |
| Specimen | When deployed into a lane containing an enemy unit, gains +1 power. Because a unit arrives exhausted, a buff that expired at its controller's own end step could be used neither to attack nor to defend, so the +1 is **held through one end step**: the Specimen defends with it during the opponent's turn and attacks with it on its own next turn, then it expires. See [Temporary buffs](#temporary-buffs). |
| Weapon | Attaches to the strongest friendly unit in the chosen lane. That unit's first attack each turn gains +2 power. If the equipped unit moved before that first attack, the trigger draws 1 card and then deterministically discards the highest-total-cost card in hand; cost ties resolve by card ID. |
| Monster | On deployment, if its power exceeds every enemy unit already in that lane, deals 1 Core damage. That damage is not armoured, but Defense and a set Reaction still apply to it. |
| Knight / Guard | Guard combat rule described above. |
| Warrior | After surviving its attack, may shift once to an adjacent lane. The local engine performs the shift only when it improves lane balance and a legal slot exists. Moving clears Plague infection as written. |
| Magician | On play, inspects the next two cards deterministically: keeps the first and puts the second on the bottom. |
| Environment | While an Environment is active in a lane — either side's — the first card each side plays into that lane each turn costs 1 less of its highest non-zero resource cost. Ties resolve Command, then Insight, then Essence. |
| Disaster | The source text gives no damage number. The minimum non-zero deterministic interpretation is used: 1 damage to the highest-power enemy in each lane, then each survivor hit is **held exhausted** — it misses one attack step rather than being handed an exhaustion its own next refresh would clear before it could ever have attacked. |
| Defense | Prevents 2 Core damage from its lane per turn cycle, **after** Core armour has been applied. Multiple Defenses stack their prevention capacity. |
| Base | At refresh, generates 1 resource matching the dominant summed cost among the other friendly cards in its lane. Ties resolve Command, Insight, then Essence. Subject to Law and to an enemy Virus. |
| Item | Gives a friendly unit in the lane +1 power until end of turn. The target is the strongest unit **that can still act**, falling back to the strongest unit overall when the whole lane is exhausted. Previously the bonus went to the strongest unit unconditionally, which routinely meant a unit deployed that turn and therefore unable to attack with it. The division keyword is recorded, but no undefined numeric keyword effect is invented. |
| Operative | Records the named division keyword trigger. If the keyword has no canonical numeric definition, no additional statistic is fabricated. |
| Action | Gives a friendly unit in the chosen lane +2 power until end of turn, choosing the strongest unit that can still act (as Item). The reposition clause uses the same legal lane-shift model when applicable. |
| Trap | Installed face down. The next enemy entity entering that lane is **held exhausted** — it stays exhausted through its own next refresh, so it loses an attack step — and has its **next triggered ability** suppressed; the Trap is consumed. A unit's triggered abilities here are its on-deploy family rule, a Deity conversion, an Android automation, a Warrior shift and a Weapon attack trigger, so the suppression is real even against the seven entity families that have no on-deploy rule. Rival Trap identity remains hidden in the UI until used. |
| Reaction | A set local Reaction reduces the next numeric effect damage by 1 and grants 1 Insight, then is consumed. This is used for effect-tagged damage such as Monster deployment damage, not normal combat. |
| Response | Set as a support. When its controller next resolves a card in that lane, the Response copies that card's numeric non-damage trigger at **half value, rounded down**, and is discarded. Only Action (+2 → +1 power) and Weapon (+2 → +1 first-attack bonus) carry a value that survives halving; against anything else the Response stays set and waits. |
| Law | Global, and it counts while **either** side controls one. Each side may then trigger each repeated ability only **once per turn**: one Base refresh generation, one Weapon attack trigger, one Ritual charge. Further triggers of the same name that turn are suppressed and logged. Defense prevention is a static replacement effect, not a repeated triggered ability, so it is not limited. |
| Spell | Chooses one target — the strongest opposing unit in its lane, otherwise the strongest friendly unit there. Both canonical keyword applications therefore land on the same card, which satisfies the printed "if both applications affect the same card, gain 1 Insight", so the controller gains 1 Insight. The keyword applications themselves remain numeric-free. With no legal target in that lane, nothing is gained. |
| Hex | **Deliberately inert.** Its text surcharges an opposing card's *first activated ability each turn*, and this engine has no activated abilities for it to surcharge — nothing a player may choose to pay for at will. It attaches to an opposing unit reference and changes nothing else. Because it is inert, the rival AI does not value it and will not spend a card on it; see [Families that are still deliberately inert](#families-that-are-still-deliberately-inert). |
| Plague | Current enemy units in the lane become infected. At each end step an infected unit loses 1 power **permanently** — its base power drops too, so regroup can never restore it. A unit that changed lanes clears the infection instead. |
| Virus | Persistent system threat. While an opposing Virus is active, the **first** automated refresh trigger that side would take — a Base generation or an Android automation — is delayed and resolves at that side's end step instead. One trigger per refresh is delayed. A resource granted by a delayed Base is **carried across the next refill** rather than being wiped by it: pools do not otherwise carry over, so without this the "delay" was a permanent confiscation — the resource arrived when nothing could be bought and was destroyed before the next main phase, which is strictly harsher than the printed text. The cost of a Virus is therefore one turn of tempo on that trigger, not the trigger itself. Combat-time triggers are unchanged; the engine has no stack to delay them onto. |
| Dragon / Flying | Flying combat rule applies. On deployment, opposing Defense and Base infrastructure in the chosen lane is disabled; it comes back online at its owner's refresh in a later round, so the owner loses one full cycle of that infrastructure. |
| Deity | Unique entity. At refresh, once per Deity, it converts 1 resource from its controller's largest pool into its smallest, but only when the gap is at least 2 — otherwise the conversion is pointless and is skipped. Ties for the largest pool resolve Command, Insight, Essence; ties for the smallest resolve in the reverse order. The **third** conversion permanently empowers the Deity by +2 power, base power included. The choice is deterministic; no number is invented. |
| Android | Entity with automation metadata. At refresh, an Android that has already changed lanes repeats that same directional move — once per refresh — provided the destination lane is on the board and has a free unit slot. Repeating counts as moving, so it also clears infection. An Android that has never moved does nothing. |
| God | Remains a unique entity. Its decree text is intentionally not expanded into a new battlefield rule because the card canon does not define which rule to choose. |
| Ruler | Remains a leader entity. Its optional mixed-resource activation is not auto-fired when the division keyword lacks deterministic numeric semantics. |
| Ritual | Gains one channel counter at each end step, up to Channel 3. There are two end steps per round, so an uncontested Ritual completes in a round and a half; with a Law in play, each side charges only one Ritual per turn. At 3 it resolves across friendly lanes and goes to discard. Its division-wide effect is not numerically defined by the canon, so resolution applies no invented numeric effect. |
| World | Remains a persistent global World card. Division matching is preserved as metadata; no new global modifier is fabricated beyond the existing text. |

### Families that are still deliberately inert

Five families — **Operative**, **God**, **Ruler**, **World** and **Hex** — still change nothing when they resolve, and that is a decision rather than an omission. Their canonical text names an effect but supplies neither the number, the choice, nor the game surface needed to run it: Operative's division keyword trigger has no value, God's battlefield decree does not say which rule it writes, Ruler's mixed-resource activation is optional with no defined activation target, World's global modifier is not quantified, and Hex surcharges an activated ability in an engine that has none. Implementing them would mean inventing card text, which this engine does not do. The three entity families announce themselves in the log when they deploy so the flavour is visible; World and Hex sit on the battlefield as metadata.

**Inert is a documented state, not a silent one.** The rival AI's evaluation deliberately assigns these families no value, so it will not spend a card to play one — an AI that paid a card for an effect that does nothing would be worse, not better. If a later canon revision gives any of them a number, they get an evaluation term at the same time.

Every other family in the table now resolves to a real board effect. These remaining simplifications are intentionally conservative: they let existing deterministic numbers and targets function while leaving pure flavour and underspecified division-keyword semantics as visible canonical information.

## Rival doctrine

The rival uses the exact same Core total, deck size, resource curve, deployment fatigue, Core armour, lane capacities, legal-play checks, combat engine, and card effects as the human player. There are no hidden stat or resource bonuses, and no tier is exempt from any of it. The one difference is the on-the-draw card described under [Card draw](#card-draw), which belongs to the seat that acts second rather than to the rival as such — whoever sits there gets it.

Its deck is drafted from the full canon to mirror the player's own deck profile — comparable entity count, average power, and average total cost — so a cheap aggressive doctrine is answered by a cheap aggressive doctrine rather than by a fixed list. As noted under [Match setup](#match-setup), matching *cost* as well as power currently works against the rival, because cost and power are uncorrelated in the canon. The battlefield HUD's "Kinetic Edge · Terra Axis · Gaia Synthesis" line is doctrine flavour, not a restriction on the cards the rival may draft.

During the main phase it scores legal plays using current card power, lane pressure, open-Core opportunities, the standing value of its own and the opposing persistent supports, and whether a card has a legal target. The scoring heuristic changes decisions, not rules.

**Supports are scored.** The evaluation previously counted only Core totals, unit power, lane threat and Defenses, which meant every non-combat card scored exactly zero and was never played — Traps, Bases, Rituals, Laws, Responses, Environments, Plagues and Viruses simply accumulated in hand for the whole match, including the ones in the rival's own starter deck. Each of those families now carries a value that depends on the board: a Trap is worth more against a full enemy hand, a Ritual more as its channel counters climb, a Plague in proportion to how many enemy units it infected, a Response only while an Action or Weapon is still in hand to copy. Families this engine leaves inert carry no value at all, so no tier will ever spend a card on one.

### Difficulty tiers

Three tiers are available, selected before the match and recorded in the seed code: **recruit**, **veteran** (the default), and **sovereign**.

| | recruit | veteran | sovereign |
| --- | --- | --- | --- |
| Cards committed per main phase | up to 2 | up to 4 | up to 6 |
| Position model | material only | material plus static lane-threat projection | material, threat, and full combat resolution of its own attack **and** the opponent's reply, resolved against a readied enemy board |
| Values persistent supports | no | yes | yes, more highly |
| Values Defense when its Core is low | no | mildly | strongly |
| Detects lethal lines | no | yes | yes, weighted heavily |
| Times Traps, Disaster, Plague and Reactions to the board | no | no | yes |
| Mulligan | never | up to 2 cards costing 7 or more | up to 3 costing 6 or more, and dumps a hand with no entity in it |

**What differs is search depth and evaluation weight — nothing else.** All three tiers see the same public battlefield, obey the same legality checks, pay the same costs, draw on the same schedule, and take the same damage. None of them peeks at the opponent's hand contents or at either deck's order; the only hidden-zone information any tier uses is the *number* of cards in a hand or deck, which is public in any card game. A higher tier does not get more resources, better cards, or a second look at the shuffle. It simply thinks further ahead before committing.

The tiers are measurably ordered. Over 500 seeds per matchup on mirrored decks, with every pairing played from **both** seats and the two results averaged — so the figure is the tier's strength, with the advantage of acting first cancelled out:

| Matchup | Win rate | Previously |
| --- | --- | --- |
| veteran over recruit | 67.6% | 66.4% |
| sovereign over veteran | 56.0% | 53.3% |
| sovereign over recruit | 71.6% | 67.4% |

The gap narrows at the top, which is what a healthy ladder looks like: recruit loses to basic threat awareness, while sovereign has to earn its edge over veteran through lookahead and support play.

### Seat parity

**The seat you sit in used to decide the match, and this document said otherwise.** It claimed the first seat won 44.8% at veteran; the engine's own source comment, in the same release, put it at 72–81% and called the fix out of scope ("Fixing it properly means revisiting combat, not the opening hand"). Re-measured over 150 veteran mirrors on the starter doctrine, the first seat won **77.3%**.

The cause is structural and it compounds, which is why the extra opening card never touched it. Each round the first seat attacks into a board the second seat has not yet attacked with, so it removes blockers *before* they swing; the second seat's answer arrives a full turn late, every round, not just in the round that reaches lethal. Sweeping the compensating card at 0, 1 and 2 moved the result by less than run-to-run noise, because a card you cannot pay for is not tempo — resources were the binding constraint, not cards.

The compensation is therefore resource tempo: **+1 Command, +1 Insight, +1 Essence, once, at the second seat's first refresh**, on top of the extra card. Measured at 150 seeds per cell:

| Mirror doctrine | first seat, before | first seat, now |
| --- | --- | --- |
| starter / curve, veteran | 77% | 53% |
| top-heavy, veteran | 65% | 48% |
| cheap swarm, veteran | 49% | 51% |
| starter / curve, sovereign | 83% | 44% |
| top-heavy, sovereign | 69% | 51% |
| cheap swarm, sovereign | 52% | 51% |

An aggregate can hide the very defect it claims to fix, so the measurement is also split by **how** the match ended, and parity has to hold inside each population:

| Decided by | before | now |
| --- | --- | --- |
| Core damage (the combat race) | 84.4% first seat | **49.1%** |
| Deck-out fatigue | 58.5% first seat | 56.0% |

The combat race — the thing that was actually broken — is now even. The residual sits in fatigue endings, where the first seat draws first and therefore reaches its empty deck first; at 56% over n=84 it is small, and it is the population the clock decides rather than the board.

The response curve is not a knife edge: 1/1/1 and 2/2/1 both land within a point of even, and 3/3/2 overcorrects to 32% before the second seat starts running away with it. The one cell that stays off is **recruit against a cheap-swarm mirror at 60%**, and the reason is recruit's own two-card play limit rather than the seat — a rival that may commit two cards a turn cannot convert the extra resources into board presence. Raising that limit fixes the mirror and collapses the veteran-over-recruit gap, so recruit keeps its limit.

`npm run balance` reproduces every number in this section, and `tests/seat-parity.test.mjs` fails if any of it drifts.

### Where the tiers stand

Seat-averaged over 60 seeds on the starter doctrine: veteran beats recruit 60%, sovereign beats veteran 68%, sovereign beats recruit 77%. The ladder is monotonic and the gap at the top widened with the parity fix — a deeper search converts the second seat's extra resources better than a shallow one does.

## Balance is data

Every number in this document — Core totals, resource caps, the armour divisor, the breach ceiling, the fatigue step, the on-the-draw grant, and the AI tier weights — lives in `ruleset.js` as one deeply frozen object, and reaches a match through `state.rules`. A match is played under the ruleset it started with, and `state.rules.digest` identifies which one that was.

Three consequences worth knowing:

* **A retune is a config change, not a deploy.** `createRuleset(overrides)` validates untrusted input: out-of-range values are clamped, unknown keys are dropped, cross-field impossibilities (a resource ceiling below the per-turn cap; an opening hand larger than the doctrine) are repaired, and everything corrected is listed on `rules.warnings`. It never throws — a client that refuses to start a match is worse than one that starts a repaired one.
* **A retuned match says so.** When the active ruleset is not the shipped one the match bar carries a warning chip naming it, the debrief records it, and the dialog behind the chip lists every value that differs. Seed codes do not encode the ruleset, so a code minted under an override only replays against that same override — the same honesty the doctrine fingerprint already applies to decks.
* **An in-progress match saved under one ruleset will not resume under another.** `match-codec.js` refuses the restore rather than playing out the remainder of a match under numbers it did not start with.

## Match end and reset

When either Core reaches 0 — from combat, from a card effect, or from fatigue — the battlefield enters an ended state and displays the final Core scores, the turn count, and the seed code for a rematch. **Play again** starts a fresh match from the currently saved player deck. **Return to Codex** exits the match while preserving the active deck in local storage. **Reset match** abandons current match state and returns to deck construction.

**A match in progress survives the tab.** The board is written to local storage after every state change and read back at boot, so a reload, a crashed tab, or a phone the OS reclaimed returns to the same round with the same hand, deck order, discard pile and log. A restored board is refused rather than approximated: a save from a different schema, a different ruleset, or one referencing a card this build does not have is discarded and the app starts clean. Abandoning a match clears the save.
