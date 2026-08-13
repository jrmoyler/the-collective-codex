# Match Engine API

The contract between `match-engine.js` / `deck-store.js` and everything that consumes them
(`app.js`, tests, tools). Everything here is deterministic: given the same two decks, the same
seed and the same difficulty, the engine produces a byte-identical event stream.

`docs/match-rules.md` describes the previous rules generation. Where the two disagree, **this
document is current**; the required corrections to `match-rules.md` are listed in
[Changes needed in `match-rules.md`](#changes-needed-in-match-rulesmd).

---

## 1. Compatibility

Every export that existed before still exists with the same signature and the same meaning:

`DECK_SIZE`, `STARTING_CORE`, `OPENING_HAND`, `MAX_UNITS_PER_LANE`, `MAX_SUPPORTS_PER_LANE`,
`LANE_NAMES`, `ENTITY_FAMILIES`, `resourceCurve`, `createMatch`, `mulligan`, `effectiveCost`,
`getPlayability`, `playCard`, `resolveCombat`, `completePlayerTurn`.

`state.log` is still a plain array of newest-first strings capped at 60 entries. It is now
**derived** from the event stream — a log line exists for every event that carries a non-empty
`text`. Reading `state.log` requires no changes.

State objects are still treated as immutable by the public API: `mulligan`, `playCard`,
`resolveCombat` and `completePlayerTurn` return a new state and never mutate their argument.

> Internal note: the deep-clone used between turns preserves canonical card objects by
> reference instead of copying them (cards are never mutated by the engine). Card identity is
> therefore stable: `state.players.player.hand[0] === cardById.get(id)`.

---

## 2. Creating a match

```js
createMatch({ playerDeck, rivalDeck, seed = 1, shuffle = true, difficulty, playerDifficulty })
```

| Option | Type | Meaning |
| --- | --- | --- |
| `playerDeck`, `rivalDeck` | `Card[]` | Exactly `DECK_SIZE` (30) cards each, else it throws. |
| `seed` | `number \| string` | A 32-bit number, **or** a shareable seed code (see §6). A code also carries the difficulty. |
| `shuffle` | `boolean` | `false` deals the decks in the given order (used by tests). |
| `difficulty` | `'recruit' \| 'veteran' \| 'sovereign'` | The rival AI tier. Defaults to `DEFAULT_DIFFICULTY` (`'veteran'`), which reproduces pre-upgrade behaviour for existing callers. An unrecognised value throws. |
| `playerDifficulty` | tier | Only used when something drives the *player* seat with AI (hints, demos, `simulateMatch`). Defaults to `difficulty`. |

New fields on the returned state:

```js
state.difficulty        // 'veteran'      — the rival AI tier
state.playerDifficulty  // 'veteran'      — tier used when the player seat is driven by AI
state.seed              // 3735928559     — normalised 32-bit seed
state.seedCode          // 'VET-0000-001C' — shareable code for this match
state.endReason         // null | 'core' | 'fatigue'
state.events            // Event[]        — see §3
state.eventSeq          // number         — highest seq emitted so far
state.stats             // MatchStats     — see §5
```

---

## 3. The event stream

`state.events` is an append-only array. Every entry has this envelope:

```ts
{
  seq: number,        // 1-based, gapless, strictly increasing for the whole match
  round: number,      // state.round when the event fired
  turn: number,       // state.turnCount when the event fired
  type: string,       // one of EVENT_TYPES
  side: 'player'|'rival'|null,
  lane: 0|1|2|null,
  cardId: string|null,
  uid: string|null,   // board instance id ('u7', 's3') when the event is about a unit/support
  amount: number|null,
  text: string,       // '' when the event is silent; non-empty text also appears in state.log
  ...extras           // per-type fields listed below
}
```

`EVENT_TYPES` is exported so a consumer can assert it handles every type. **The stream is the
source of truth for animation:** every Core point, power point and resource point that changes
is attributable to exactly one event.

To follow a match incrementally, remember the last `seq` you rendered and replay
`state.events.filter(e => e.seq > lastSeq)`.

### 3.1 Event catalogue

| `type` | Extra fields | Fired when | `text`? |
| --- | --- | --- | --- |
| `phase` | `phase: 'mulligan'\|'refresh'\|'main'\|'combat'\|'end-step'` | Phase boundaries. `side` is the side the phase belongs to. | round/main only |
| `mulligan` | `amount` = cards replaced | A side finishes its one-time mulligan. | no |
| `draw` | `cardId`, `reason: 'opening'\|'mulligan'\|'refresh'\|'Weapon'\|'Magician'` | One card moves deck → hand. | no |
| `discard` | `cardId`, `reason: 'resolved'\|'Weapon'\|'trap'\|'reaction'\|'response'\|'ritual'` | One card enters a discard pile. | no |
| `fatigue` | `amount` = escalating fatigue counter | A draw was attempted from an empty deck. Immediately followed by `core-damage` with `source:'fatigue'`. | yes |
| `play` | `lane`, `cardId`, `family`, `cost:{command,insight,essence}`, `amount` = total cost | A card leaves hand for a lane. Always the first event of a play. | yes |
| `resource-spend` | `cost`, `amount` | Always immediately after `play`. Separated so the resource bar can animate on its own. | no |
| `resource-gain` | `resource`, `amount`, `source: 'Base'\|'Spell'\|'Reaction'` | A resource pool grows (capped at `RESOURCE_CEILING`). | yes |
| `deploy-trigger` | `uid`, `cardId`, `trigger: 'Specimen'\|'Monster'\|'Magician'\|'Dragon'`, `amount?` | An entity's on-deploy family rule fires. | yes |
| `trap-sprung` | `cardId` = the Trap, `uid`/`targetCardId` = the exhausted intruder. `side` is the **Trap owner**. | A Trap consumes an arriving enemy entity. | yes |
| `power-change` | `uid`, `cardId`, `amount` (signed), `source: 'Specimen'\|'Weapon'\|'Response'\|'Disaster'\|'Plague'\|'Deity'\|'regroup'\|'expire'\| card name`, `sourceCardId?` | Any unit power change outside combat. | buffs only |
| `unit-moved` | `lane` = from, `toLane`, `uid`, `cardId`, `source: 'Action'\|'Warrior'` | A unit changes lane. | yes |
| `combat-clash` | `uid`/`cardId` = attacker, `targetUid`/`targetCardId` = defender, `amount` = damage dealt to the defender, `taken` = damage dealt back. `side` = attacker. | One paired exchange in a contested lane. | no |
| `combat-strike` | `amount` = **raw** damage aimed at the Core, `kind: 'open'\|'air'\|'breakthrough'` | An attack reaches the Core before armour/Defense. | no |
| `damage-prevented` | `amount`, `source: 'Armour'\|'Defense'\|'Guard'\|'Reaction'`, `cardId?`, `uid?`. `side` = the protected side. | Damage is reduced. `Armour` is the always-on Core reduction (§4.3). | Defense/Reaction only |
| `core-damage` | `amount`, `source: 'combat'\|'Monster'\|'fatigue'`. `side` = the **damaged** side, `lane` = `null` for fatigue. | A Core actually loses points. | yes |
| `unit-destroyed` | `uid`, `cardId`. `side` = the **owner**. | A unit hits 0 power and goes to discard. | yes |
| `support-disabled` | `cardId`, `untilRound` | Dragon disables enemy infrastructure. | no |
| `support-removed` | `cardId`, `reason: 'reaction'\|'response'` | A support leaves the board without being destroyed in combat. | no |
| `ritual-charge` | `cardId`, `amount` = counters now on the card (1‥3) | End step Ritual charge. | no |
| `ritual-resolve` | `cardId` | Ritual reached Channel 3 and left play. | yes |
| `spell-resolve` | `cardId`, `targetCardId\|null`, `uid\|null`, `keyword` | A Spell picks its single target. | yes |
| `law-restricted` | `trigger: 'Base'\|'Weapon'\|'Ritual'`, `cardId?` | A Law suppressed a repeated ability. | yes |
| `virus-delay` | `trigger: 'Base'\|'Android'`, `resource?` | An enemy Virus pushed a refresh trigger to the end step. | yes |
| `deity-convert` | `uid`, `cardId`, `from`, `to`, `amount`, `count` = lifetime conversions | Deity converts a resource. | yes |
| `android-automate` | `lane` = from, `toLane`, `uid`, `cardId` | Android repeats its last lane transfer. | yes |
| `response-copy` | `cardId` = the Response, `sourceCardId`, `amount` = halved value | A set Response copies a friendly trigger. | yes |
| `keyword-note` | `family`, `keyword?`, `uid?` | A family whose canon text has no numeric definition announces itself without changing state (`Operative`, `God`, `Ruler`, `World`), plus `Disaster`/`Plague`/`Weapon` bookkeeping notes. | mostly |
| `match-end` | `winner: 'player'\|'rival'\|'draw'`, `reason: 'core'\|'fatigue'`, `amount` = final round | Emitted exactly once. | yes |

### 3.2 Ordering guarantees

* `play` → `resource-spend` → (`trap-sprung` **or** `deploy-trigger`…) → `response-copy`.
* `combat-strike` (raw intent) → `damage-prevented(Armour)` → `damage-prevented(Defense)` →
  `core-damage` (what actually landed). Any of the middle two may be absent.
* `combat-clash` for a pairing always precedes the `unit-destroyed` it caused.
* `fatigue` → `core-damage{source:'fatigue', lane:null}`.
* `match-end` is always the last event.

---

## 4. Rules the UI must know about

### 4.1 Resource economy (changed)

```js
resourceCurve(turn) // → { command, insight, essence }
```

| turn | command | insight | essence | total |
| --- | --- | --- | --- | --- |
| 1 | 2 | 2 | 2 | 6 |
| 2 | 3 | 3 | 2 | 8 |
| 3 | 4 | 3 | 3 | 10 |
| 4 | 5 | 4 | 3 | 12 |
| 5+ | 6 | 5 | 4 | 15 |

The three types now ramp at different rates to different caps
(`RESOURCE_CAPS = {command:6, insight:5, essence:4}`), so Command is the tempo resource,
Insight the mid resource and Essence the scarce one. Pools do not carry over between turns;
`RESOURCE_CEILING` (10) still bounds card-generated resources.

### 4.2 Deployment fatigue (new)

A unit enters play **exhausted** (`unit.exhausted === true`, `unit.deployedTurn` records the
turn) and cannot attack until its controller's next refresh. It defends normally the moment it
arrives. Without this the game was a first-strike race decided in two rounds.

### 4.3 Core armour and the lane breach ceiling (new)

Combat damage aimed at a Core is reduced before it lands:

```
reaching_core = min( ceil(raw / CORE_ARMOUR_DIVISOR), MAX_LANE_BREACH )   // 4 and 3
```

An unblocked Flying strike pierces one step: divisor `3`, ceiling `4`
(`FLYING_ARMOUR_PIERCE = 1`). Active `Defense` prevention (2 per Defense per lane per turn)
applies **after** armour, because the canon text prevents damage *dealt to your Core*.
`Monster` deploy damage and fatigue damage are not armoured — their canon values are literal.

The absorbed portion is reported as `damage-prevented{source:'Armour'}` so the raw number and
the landed number are both animatable.

### 4.4 Regroup (new)

At refresh each surviving unit recovers up to `REGROUP_RECOVERY` (2) power toward
`basePower + tempPower`, emitting `power-change{source:'regroup'}`. Plague damage is permanent:
it lowers `basePower` too, so infection cannot be regrouped away.

### 4.5 Card flow and fatigue (new)

`DRAW_PER_REFRESH` is 2. The player, who acts first, draws `DRAW_PER_REFRESH - 1` on their
opening refresh — the standard on-the-play compensation, and the reason the post-mulligan hand
is 6 rather than 5.

Drawing from an empty deck no longer silently does nothing. The Nth failed draw of the match
deals **N** unpreventable Core damage to its own controller (`fatigue` → `core-damage`,
`lane: null`, ignores Defense). This guarantees termination and gives the late game a clock.
`state.endReason` is `'fatigue'` when a match ends this way.

### 4.6 Family interpretations added in this generation

These were previously log-only. Each is derived from the card's own canonical text; where the
canon supplies no number, none was invented.

| Family | Canon text relied on | Implementation |
| --- | --- | --- |
| **Spell** | "Choose a target. Apply this division's primary keyword twice; **if both applications affect the same card, gain 1 Insight**." | The Spell picks one target (strongest opposing unit in its lane, else strongest friendly unit). Both applications therefore hit the same card, so the controller gains 1 Insight. The keyword applications themselves stay numeric-free. With no legal target nothing is gained. |
| **Law** | "Global. Each player may trigger only **one repeated ability with the same name per turn**." | While any Law is in play (either side), each side gets one `Base` refresh trigger, one `Weapon` attack trigger and one `Ritual` charge per turn. Suppressed triggers emit `law-restricted`. Defense prevention is a static replacement effect, not a repeated *triggered* ability, so it is not limited. |
| **Virus** | "The first automated or repeated trigger each turn is **delayed until the end step**." | While an opposing Virus is active, the first refresh-time automated trigger (`Base` generation or `Android` automation) is queued and flushed at that side's end step instead. Combat-time triggers are unchanged — the engine has no stack to delay them onto. |
| **Deity** | "Once per turn, convert 1 resource into another type; **after the third conversion, empower this card by +2**." | At refresh, once per Deity, 1 resource moves from the largest pool to the smallest, but only when the gap is ≥2 (otherwise the conversion is pointless). Ties resolve Command → Insight → Essence. The third conversion permanently adds +2 power and basePower. The *choice* is made deterministically; no number is invented. |
| **Android** | "At refresh, **repeat this card's last non-attack lane action** if its target is still legal." | The only non-attack lane action a unit can take in this engine is a lane transfer. An Android that moved repeats the same directional move at refresh when the destination lane has room. Once per refresh. |
| **Response** | "Copy one non-damage keyword trigger from it at **half numeric value, rounded down**." | A set Response in the lane where a friendly card resolves copies its numeric non-damage trigger at half value and is consumed. Only `Action` (+2 → +1 power) and `Weapon` (+2 → +1 first-attack bonus) have a value that survives halving; everything else halves to 0, so the Response stays set. |
| **Ritual** | "Add one channel counter at each end step; **at 3, resolve** its division effect across all friendly lanes." | Charges once per end step (`ritual-charge`), and at 3 it resolves and goes to discard (`ritual-resolve`). Its division effect has no canonical numbers, so resolution applies no numeric effect. |

Still deliberately inert, because the canon defines no number or no choice:
**Operative**, **God**, **Ruler**, **World**. They emit `keyword-note` so the UI can surface
the flavour without the engine fabricating a rule.

---

## 5. Statistics

```ts
state.stats = {
  player: SideStats,
  rival:  SideStats,
  coreHistory: Array<{ round, turn, player, rival }>,   // chart-ready, one row per round
  rounds: number                                        // rounds completed
}

SideStats = {
  coreDamageDealt,    // to the opponent's Core (excludes their self-inflicted fatigue)
  coreDamageTaken,    // includes own fatigue
  damagePrevented,    // Armour + Defense + Guard + Reaction
  unitsDestroyed,     // opposing units this side removed
  unitsLost,
  cardsPlayed,
  cardsDrawn,
  cardsDiscarded,
  fatigueDamage,
  largestLaneSwing,   // most Core damage this side pushed through one lane in one combat
  resourcesSpent: { command, insight, essence, total }
}
```

Invariants the tests enforce: `stats[x].cardsPlayed` equals the count of `play` events for that
side; `resourcesSpent` equals the sum of `resource-spend` costs; `coreDamageTaken` equals
`20 - core`; `player.unitsDestroyed === rival.unitsLost`. `coreHistory[0]` is always
`{round:1, turn:1, player:20, rival:20}` and the last row matches the final Cores.

---

## 6. Seeds

```js
encodeSeed(seed, difficulty)  // 3735928559, 'sovereign' → 'SOV-3FAV-FQFS'
decodeSeed(code)              // 'sov 3fav fqfs'          → { seed: 3735928559, difficulty: 'sovereign' }
createMatch({ playerDeck, rivalDeck, seed: 'SOV-3FAV-FQFS' })
```

* Format `TTT-XXXX-XXXY`: a three-letter tier (`REC`/`VET`/`SOV`), seven Crockford base-32
  characters of the 32-bit seed, and one checksum character.
* Decoding is forgiving about case, spacing and punctuation, and maps `I`/`L` → `1`, `O` → `0`,
  `U` → `V`. A wrong checksum, unknown tier or wrong length throws with a readable message.
* An explicit `difficulty` argument to `createMatch` overrides the tier inside the code.
* Seed + both decks + difficulty fully determine the match. The engine contains no
  `Math.random`, no `Date.now` and no locale-sensitive comparison; all ordering uses explicit
  tiebreakers. Whoever calls `createMatch` owns seed generation — that is the only place a
  clock or RNG belongs.

---

## 7. Difficulty and AI

```js
DIFFICULTY_TIERS      // ['recruit','veteran','sovereign']
DEFAULT_DIFFICULTY    // 'veteran'
normalizeDifficulty(value, fallback?)   // validates; throws on anything else
AI_TIER_PROFILES      // read-only introspection of the tuned weights
```

No tier cheats. All three see the same public board, obey the same legality checks, pay the same
costs and never look at the opponent's hand or deck. They differ only in how far they think.

| | recruit | veteran | sovereign |
| --- | --- | --- | --- |
| Cards committed per main phase | ≤ 2 | ≤ 4 | ≤ 6 |
| Position model | material only | material + static lane-threat projection | material + threat + full combat resolution of its own attack **and** the opponent's reply |
| Values Defense when Core is low | no | mildly | strongly |
| Detects lethal lines | no | yes | yes, weighted heavily |
| Holds Traps / Disaster / Hex for value | no | no | yes |
| Mulligan | never | up to 2 cards costing 7+ | up to 3 costing 6+, and dumps a handful with no entity |

Helpers a UI can use directly:

```js
laneThreat(state, side)
// → [{ lane, name, outgoing, incoming }, …] — Core damage each lane would deal / take
//   right now, after armour and Defense. Good for lane danger badges and a hint button.

projectLaneDamage(state, attackerSide, laneIndex)  // the single number behind the above
planAiPlays(state, side, tier?)   // → [{ handIndex, laneIndex, score }] — pure, no mutation
aiTakeMainPhase(state, side, tier?)   // → new state after that side's AI main phase
aiMulliganIndices(state, side, tier?) // → hand indices that tier would replace
simulateMatch({ playerDeck, rivalDeck, seed, difficulty, playerDifficulty, maxRounds })
// → { state, winner, rounds, turns, reason: 'core'|'fatigue'|'timeout', stats, timedOut }
```

`planAiPlays` returns hand indices **relative to the evolving hand**, i.e. apply them in order
with `playCard` and each index is correct at the moment it is used.

---

## 8. `deck-store.js`

Unchanged: `DECK_STORAGE_KEY`, `buildStarterDeck`, `normalizeDeckIds`, `filterDeckPool`,
`loadDeckIds`, `saveDeckIds`.

```js
castableTurn(card)          // earliest turn the resource curve can pay for this card (1‥16, 99 = never)
deckProfile(deckCards)      // → { size, entities, supports, totalCost, byResource, curve,
                            //     families, averageCastableTurn, averagePower, primaryResource }
buildRivalDeck(pool, opponentCards)
// 30 ids drafted from `pool`, aimed at the opponent deck's average power and average cost.
// Used to give the rival a deck of comparable strength instead of an arbitrary one.
```

`deckProfile` is what a deck-builder UI should render: the `curve` histogram
(`{ '1': 24, '2': 6 }`) and `primaryResource` are the visible payoff of the staggered economy.

---

## 9. What the UI should animate

Priority order, highest first. Each maps to one event type, so a renderer can be a switch.

1. **`core-damage`** — the only thing that decides the match. Shake the Core, count the number
   down, tint by `source`. Pair it with the preceding `combat-strike` so the player sees
   "18 raw → 3 through".
2. **`damage-prevented`** — the reason a big hit did not land. `Armour` is the constant Core
   reduction (a shield pulse), `Defense`/`Guard`/`Reaction` are card-driven (flash the card).
   Skipping these makes the numbers look arbitrary.
3. **`play`** — card flies from hand to lane; `resource-spend` drains the resource bar on the
   same beat.
4. **`combat-clash`** — the lane exchange: two units lunge, both `amount` and `taken` appear.
5. **`unit-destroyed`** — removal from the lane to the discard pile.
6. **`deploy-trigger`, `trap-sprung`, `spell-resolve`, `response-copy`, `deity-convert`,
   `android-automate`, `ritual-charge`/`ritual-resolve`, `law-restricted`, `virus-delay`** —
   the "something interesting happened" tier. All carry `cardId` (and usually `uid`), so the
   card art can be pulled from the canon and pulsed.
7. **`power-change`** — floating `+2` / `-1` on the unit. `source:'regroup'` and
   `source:'expire'` are routine; consider rendering them quieter than buffs.
8. **`unit-moved`** — slide between lanes.
9. **`draw` / `discard` / `fatigue`** — hand and deck counters. `fatigue` deserves a real
   warning treatment; it means the deck is gone.
10. **`phase`** — round banners and turn handoff. `phase:'combat'` is the cue to start the
    combat sequence and stop accepting input.

Two more things worth surfacing outside the animation loop:

* `state.stats.coreHistory` is ready to plot as a two-line chart with no transformation.
* `laneThreat(state, 'player')` gives each lane's `incoming` / `outgoing`, which is the honest
  version of "this lane is about to kill you" — it uses only public board state.

---

## 10. Changes needed in `match-rules.md`

`docs/match-rules.md` is owned by another workstream. It is now wrong in these places and needs
the following edits:

1. **Resource curve.** The `Base = min(8, t + 1)` block and the "Turn 1 therefore begins at
   2/2/2 … caps at 8" paragraph must be replaced with the staggered table in §4.1 above
   (caps 6 / 5 / 4).
2. **Card draw.** Add: each refresh draws 2; the player draws 1 on their opening refresh as
   on-the-play compensation.
3. **Combat — new subsections.** Add *deployment fatigue* (§4.2), *Core armour and the lane
   breach ceiling* (§4.3) and *regroup* (§4.4). The bullet "Open lane: non-exhausted attackers
   deal their current total power directly to the opposing Core" is now only true of the *raw*
   strike and must say the Core armour formula applies.
4. **Defense.** Note that prevention applies after armour.
5. **Win condition / match end.** Add deck-out fatigue: the Nth failed draw deals N
   unpreventable Core damage. Matches can now end with `endReason: 'fatigue'`.
6. **Family table.** Replace the rows for `Spell`, `Law`, `Virus`, `Deity`, `Android`,
   `Response` and `Ritual` with the interpretations in §4.6. Rows for `Operative`, `God`,
   `Ruler` and `World` stay as-is (still deliberately inert). The `Plague` row should note that
   its damage is permanent (it lowers base power).
7. **Rival doctrine.** The section promises no hidden advantages — still true, and should now
   also name the three difficulty tiers and state that they differ only in search depth and
   evaluation, never in resources, card access or information.
8. **Match setup.** Mention `state.seedCode` / shareable seed codes.
