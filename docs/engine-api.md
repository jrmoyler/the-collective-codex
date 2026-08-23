# Match Engine API

The contract between `match-engine.js` / `deck-store.js` and everything that consumes them
(`app.js`, tests, tools). Everything here is deterministic: given the same two decks, the same
seed and the same difficulty, the engine produces a byte-identical event stream.

`docs/match-rules.md` is the player-facing statement of the same rules and is now reconciled
with this document; see [Relationship to `match-rules.md`](#10-relationship-to-match-rulesmd).

---

## 1. Compatibility

Every export that existed before still exists with the same signature and the same meaning:

`DECK_SIZE`, `STARTING_CORE`, `OPENING_HAND`, `MAX_UNITS_PER_LANE`, `MAX_SUPPORTS_PER_LANE`,
`LANE_NAMES`, `ENTITY_FAMILIES`, `resourceCurve`, `createMatch`, `mulligan`, `effectiveCost`,
`getPlayability`, `playCard`, `resolveCombat`, `completePlayerTurn`.

One export was added: `armourBreach(raw, { pierce, cap })` — the single Core-armour
calculation, exported so a UI can preview a strike without duplicating the formula (§4.3).
`MAX_LANE_BREACH` still exists and still means 3, but it is now the ceiling for a
**contested** lane rather than for every lane.

Five further exports were added, all of them constants the engine already used as inline
literals and the UI already restated as prose:

| Export | Value | Why it is exported |
| --- | --- | --- |
| `SUPPORT_FAMILIES` | 13 families | The deck builder kept its own copy of this list. |
| `IMMEDIATE_FAMILIES` | `Item, Action, Spell, Disaster` | The complement of the other two sets; the glossary names it. |
| `ON_THE_DRAW_BONUS` | `1` | The extra card the second seat draws (§4.5), previously inline in `completePlayerTurn`. |
| `CORE_PREVENTION_PER_DEFENSE` | `2` | Stated verbatim in the in-app Defense definition. |
| `RITUAL_CHANNEL` | `3` | Stated verbatim in the in-app Channel definition. |

None of them changes behaviour. They exist so that `src/rules-copy.js` can derive every
number the player reads from the engine instead of a contributor retyping it — see
[§10](#10-relationship-to-match-rulesmd).

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
| `seed` | `number \| string` | A 32-bit number, **or** a shareable seed code (see §6). A code also carries the difficulty and a doctrine fingerprint. |
| `shuffle` | `boolean` | `false` deals the decks in the given order (used by tests). |
| `difficulty` | `'recruit' \| 'veteran' \| 'sovereign'` | The rival AI tier. Defaults to `DEFAULT_DIFFICULTY` (`'veteran'`), which reproduces pre-upgrade behaviour for existing callers. An unrecognised value throws. |
| `playerDifficulty` | tier | Only used when something drives the *player* seat with AI (hints, demos, `simulateMatch`). Defaults to `difficulty`. |

New fields on the returned state:

```js
state.difficulty        // 'veteran'      — the rival AI tier
state.playerDifficulty  // 'veteran'      — tier used when the player seat is driven by AI
state.seed              // 3735928559     — normalised 32-bit seed
state.seedCode          // 'VET-3FAV-FQF9-TZ8M' — shareable code for this match
state.doctrine          // 0..32767       — fingerprint of the player deck (§6)
state.doctrineMatch     // true | false | null — did the code's doctrine match? null = not claimed
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
| `trap-sprung` | `cardId` = the Trap, `uid`/`targetCardId` = the intruder. `side` is the **Trap owner**. | A Trap consumes an arriving enemy entity, holding it exhausted through its next refresh and arming `triggerSuppressed` (§4.2). | yes |
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
| `keyword-note` | `family`, `keyword?`, `uid?`, `trigger?` | A family whose canon text has no numeric definition announces itself without changing state (`Operative`, `God`, `Ruler`, `World`, `Hex`), plus `Disaster`/`Plague`/`Weapon` bookkeeping notes. Two carry real information: `keyword:'Exhausted'` marks a unit that stayed exhausted through its own refresh because it was held (`family` is `'Trap'` or `'Disaster'`, whichever held it — §4.2), and `keyword:'Suppressed'` with a `trigger` of `'Deity'`/`'Android'`/`'Warrior'`/`'Weapon'` names the triggered ability a Trap consumed. | mostly |
| `match-end` | `winner: 'player'\|'rival'\|'draw'`, `reason: 'core'\|'fatigue'`, `amount` = final round | Emitted exactly once. | yes |

### 3.2 Ordering guarantees

* `play` → `resource-spend` → (`trap-sprung` **or** `deploy-trigger`…) → `response-copy`.
* `combat-strike` (raw intent) → `damage-prevented(Armour)` → `damage-prevented(Defense)` →
  `core-damage` (what actually landed). Any of the middle two may be absent.
* `combat-clash` for a pairing always precedes the `unit-destroyed` it caused.
* `fatigue` → `core-damage{source:'fatigue', lane:null}`.
* **`match-end` is always the last event**, and is emitted exactly once. Nothing may follow
  it: `emit` refuses every type but `match-end` once `state.phase === 'ended'`, and the
  post-combat end step (temp expiry, Plague, Ritual charges, delayed-trigger flush, Warrior
  shifts) does not run at all once a Core has fallen. This is asserted over a
  multi-tier seed sweep in `tests/engine-invariants.test.mjs`.

  > This was documented before it was true. Measured across 1,200 simulated matches,
  > `match-end` was not the last event in 93.8% of them; the trailing entries included
  > `unit-destroyed`, which §9 tells the renderer to animate — so the UI could play a
  > unit-death animation after the victory banner. It is now enforced by a test rather
  > than by this sentence.

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

`unit.stunned` is the *held exhausted* flag. A unit carrying it stays exhausted through
exactly one of its own refreshes and emits `keyword-note{keyword:'Exhausted'}` when that
refresh passes it over. It is set by a sprung Trap and by a Disaster survivor. Ordinary
exhaustion applied by an opponent could never cost anyone an attack, because exhaustion
clears at the victim's refresh and that refresh always precedes the victim's combat.

`unit.triggerSuppressed` is the Trap's "prevent its next triggered ability" clause and is now
actually read: it is consumed by whichever of the unit's triggered abilities fires first —
its on-deploy family rule, a Deity conversion, an Android automation, a Warrior shift, or a
Weapon attack trigger — and emits `keyword-note{keyword:'Suppressed', trigger}`. It is
deliberately **not** cleared at refresh; it persists until something consumes it.

`unit.tempHold` holds a temporary buff through one extra end step when the buffed unit could
not attack that turn (§4.6, Specimen/Item/Action).

### 4.3 Core armour and the lane breach ceiling (changed)

Combat damage aimed at a Core is reduced before it lands:

```js
armourBreach(raw, { pierce, cap })
// → min( ceil(raw / (CORE_ARMOUR_DIVISOR - pierce)), cap )
```

**`cap` is a property of the lane being attacked, not a constant.** `resolveCombat` and
`projectLaneDamage` choose it identically:

| Situation | `cap` |
| --- | --- |
| Open lane — no living defender | `Infinity` |
| Air strike, no Flying/Guard blocker, lane otherwise **empty** | `Infinity` |
| Air strike, no Flying/Guard blocker, ground units present | `MAX_LANE_BREACH + FLYING_ARMOUR_PIERCE` (4) |
| Breakthrough — a contested lane whose defenders were all killed | `MAX_LANE_BREACH` (3) |

An unblocked Flying strike pierces one step of the divisor: `4` instead of
`CORE_ARMOUR_DIVISOR` (`5`), via `FLYING_ARMOUR_PIERCE = 1`.

`CORE_ARMOUR_DIVISOR` moved from `4` to `5` in the same change. With the ceiling lifted off
undefended lanes the divisor is the only remaining dampener there, and at `4` the median match
fell to 6–7 rounds with ~30% finishing inside 5 rounds; at `5` the median is 7–9 with ~20%
short, which is where the game sat before. It is a pure pacing scale — `ceil(raw / 5)` is
monotone in `raw`, so it never destroys the ordering the flat ceiling used to flatten.

Active `Defense` prevention (2 per Defense per lane per turn)
applies **after** armour, because the canon text prevents damage *dealt to your Core*.
`Monster` deploy damage and fatigue damage are not armoured — their canon values are literal.

The absorbed portion is reported as `damage-prevented{source:'Armour'}` so the raw number and
the landed number are both animatable.

> Why this changed. A flat ceiling of 3 everywhere meant a lane defended by nothing and a
> lane defended by 20 power both yielded at most 3 Core, so the marginal value of defending
> anything was ≤3 and the three lanes were one lane painted three times. Measured over 800
> matches per policy against sovereign, with card selection held fixed and only lane
> assignment varying, the four policies — spread evenly, stack into the fullest lane, commit
> everything to lane 0, and choose at random — spanned **0.8 percentage points**: 42.0 / 42.5
> / 42.3 / 41.8. After the change the same four span **9.9 points**: 33.8 / 43.6 / 42.0 /
> 35.4. Lane assignment went from statistically indistinguishable to the largest single
> decision in the scripted player's policy. (Concentration still beats dilution against a
> tier that defends well — the point is that the choice now has consequences, not that
> spreading became correct.)
>
> The divisor and the ceiling were also two dampeners stacked on the same damage. They are
> now separated — the ceiling governs contested lanes, the divisor governs undefended ones —
> so board power maps monotonically onto Core damage with no truncation wherever nobody is
> blocking. Under the old rule 14.5% of open and air strikes carried more raw power than the
> ceiling could express and were truncated; that figure is now 0.

Breakthrough damage changed with it: a broken lane now pushes the **remaining power** of the
surviving attackers, not one point per surviving body. Under the old rule an open lane sent
Σpower while winning a fight sent `survivors.length`, so killing the defenders was strictly
worse than the enemy never showing up.

### 4.4 Regroup (new)

At refresh each surviving unit recovers up to `REGROUP_RECOVERY` (2) power toward
`basePower + tempPower`, emitting `power-change{source:'regroup'}`. Plague damage is permanent:
it lowers `basePower` too, so infection cannot be regrouped away.

### 4.5 Card flow and fatigue (new)

`DRAW_PER_REFRESH` is 2, on both sides, on every refresh including the opening one, so the
post-mulligan hand is 7. The **seat on the draw** — the rival seat, which acts second — draws
one extra card at its first refresh only, and opens on 8.

> This replaces a rule that expressed the same one-card difference as a penalty on the first
> seat (`DRAW_PER_REFRESH - 1` at the player's opening refresh), documented as "on-the-play
> compensation" for a tempo advantage that §4.2 deployment fatigue had already removed. The
> compensation now sits on the seat that is actually behind. Changing only that constant is
> worth +11.3 / +12.6 / +14.1 percentage points to the first seat at recruit / veteran /
> sovereign over 800 mirror-deck matches per cell, so it was not a rounding detail: it was
> larger than the entire difficulty ladder. Acting first *is* worth something — the first
> seat swings first in the round that reaches lethal — which is why the compensation exists
> at all, just on the other side of the table.

Drawing from an empty deck no longer silently does nothing. The Nth failed draw of the match
deals **N** unpreventable Core damage to its own controller (`fatigue` → `core-damage`,
`lane: null`, ignores Defense). This guarantees termination and gives the late game a clock.
`state.endReason` is `'fatigue'` when a match ends this way. The *counter* escalates 1, 2, 3…,
but the damage that lands is clamped to the Core that is left, so `stats.fatigueDamage` tracks
the `core-damage` events rather than the raw counter (§5).

### 4.6 Family interpretations added in this generation

These were previously log-only. Each is derived from the card's own canonical text; where the
canon supplies no number, none was invented.

| Family | Canon text relied on | Implementation |
| --- | --- | --- |
| **Spell** | "Choose a target. Apply this division's primary keyword twice; **if both applications affect the same card, gain 1 Insight**." | The Spell picks one target (strongest opposing unit in its lane, else strongest friendly unit). Both applications therefore hit the same card, so the controller gains 1 Insight. The keyword applications themselves stay numeric-free. With no legal target nothing is gained. |
| **Law** | "Global. Each player may trigger only **one repeated ability with the same name per turn**." | While any Law is in play (either side), each side gets one `Base` refresh trigger, one `Weapon` attack trigger and one `Ritual` charge per turn. Suppressed triggers emit `law-restricted`. Defense prevention is a static replacement effect, not a repeated *triggered* ability, so it is not limited. |
| **Virus** | "The first automated or repeated trigger each turn is **delayed until the end step**." | While an opposing Virus is active, the first refresh-time automated trigger (`Base` generation or `Android` automation) is queued and flushed at that side's end step instead. Combat-time triggers are unchanged — the engine has no stack to delay them onto. |
| **Deity** | "Once per turn, convert 1 resource into another type; **after the third conversion, empower this card by +2**." | At refresh, once per Deity, 1 resource moves from the largest pool to the smallest, but only when the gap is ≥2 (otherwise the conversion is pointless). Ties for the *source* (largest) pool resolve Command → Insight → Essence; the *destination* is the last entry of the same ordering, so ties among the smallest resolve in reverse, Essence first. The third conversion permanently adds +2 power and basePower. The *choice* is made deterministically; no number is invented. |
| **Android** | "At refresh, **repeat this card's last non-attack lane action** if its target is still legal." | The only non-attack lane action a unit can take in this engine is a lane transfer. An Android that moved repeats the same directional move at refresh when the destination lane has room. Once per refresh. |
| **Response** | "Copy one non-damage keyword trigger from it at **half numeric value, rounded down**." | A set Response in the lane where a friendly card resolves copies its numeric non-damage trigger at half value and is consumed. Only `Action` (+2 → +1 power) and `Weapon` (+2 → +1 first-attack bonus) have a value that survives halving; everything else halves to 0, so the Response stays set. |
| **Trap** | "Reveal when an enemy enters; **exhaust it and prevent its next triggered ability**." | The intruder is held exhausted (§4.2 `stunned`) so it loses one attack step, and `triggerSuppressed` is armed and consumed by its next triggered ability. Previously the Trap set `exhausted` on a unit that arrives exhausted anyway and whose own refresh would clear it, and suppressed a deploy trigger that only 4 of the 11 entity families have — so against an Operative, Knight, Warrior, God or Ruler it did nothing at all and cost a card. |
| **Disaster** | "Damage the highest-power unit in each lane, then **exhaust surviving units** there." | 1 damage (the minimum non-zero deterministic reading — the canon supplies no number), then survivors are held exhausted. Plain exhaustion here could never fire: it cleared at the victim's refresh, which always precedes the victim's combat. |
| **Specimen** | "When deployed, adapt…; gain **+1 power until end of turn**." | The +1 is held through one end step, because a unit that arrives exhausted can neither attack with an until-end-of-turn buff nor, once it expires at its own end step, defend with it. `Item` and `Action` follow the same rule and additionally target the strongest unit *that can still act*. |
| **Ritual** | "Add one channel counter at each end step; **at 3, resolve** its division effect across all friendly lanes." | Charges once per end step (`ritual-charge`), and at 3 it resolves and goes to discard (`ritual-resolve`). Its division effect has no canonical numbers, so resolution applies no numeric effect. |

Still deliberately inert, because the canon defines no number, no choice, or no game surface:
**Operative**, **God**, **Ruler**, **World**, and **Hex** — Hex surcharges "the first
activated ability each turn" and this engine has no activated abilities. They emit
`keyword-note` so the UI can surface the flavour without the engine fabricating a rule, and
the AI's evaluation gives them no value, so no tier will spend a card on one. Inert is a
documented state here, not a silent failure.

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

Invariants, each asserted in `tests/engine-invariants.test.mjs` over a sweep of 120 matches
across all three tiers (not a single seed):

* `stats[x].cardsPlayed` equals the count of `play` events for that side.
* `resourcesSpent` equals the sum of `resource-spend` costs.
* **`coreDamageTaken === STARTING_CORE - core`**, on both sides, always, and equals the sum of
  that side's `core-damage` event amounts.
* `player.unitsDestroyed === rival.unitsLost`.
* `player.coreDamageDealt === rival.coreDamageTaken - rival.fatigueDamage`.
* `coreHistory[0]` is always `{round:1, turn:1, player:20, rival:20}` and the last row matches
  the final Cores.

> The `coreDamageTaken` invariant was documented as enforced but was not asserted anywhere and
> did not hold: `dealCoreDamageMutable` clamped the Core at 0 but added the *unclamped* figure
> to the stat, so it broke on 25.8% of sides in a 400-match sweep, with a maximum observed
> `coreDamageTaken` of 23 against a 20-point Core. The defeat screen printed it. Damage is now
> clamped to the Core that remains before anything is recorded; `combat-strike` still carries
> the full raw number, so the "18 raw → 3 through" animation is unaffected.

---

## 6. Seeds

```js
doctrineFingerprint(deck)             // Card[] or id[] → 0..32767, order-independent
encodeSeed(seed, difficulty, doctrine) // 3735928559, 'sovereign', 12345 → 'SOV-3FAV-FQF9-TZ8M'
decodeSeed(code)                       // → { seed: 3735928559, difficulty: 'sovereign', doctrine: 12345 }
createMatch({ playerDeck, rivalDeck, seed: 'SOV-3FAV-FQF9-TZ8M' })
```

* Format `TTT-XXXX-XXXX-XXXX`: a three-letter tier (`REC`/`VET`/`SOV`) and twelve Crockford
  base-32 characters — seven of the 32-bit seed, three of the doctrine fingerprint, two of a
  checksum over all of it.
* **A seed alone does not reproduce a match.** The engine shuffles the deck it is handed, so
  the same code played against different cards is a different game. The fingerprint is what
  lets a caller detect that: `state.doctrineMatch` is `true`/`false` when the code stated a
  doctrine and `null` when it did not ask.
* `doctrineFingerprint` hashes the card ids as a **set**. `createMatch` also sorts each deck
  before shuffling it, so the order cards were added in cannot change the match either.
* Codes in the older eleven-character format (`TTT-XXXX-XXXY`, one checksum character) still
  decode, with `doctrine: null`. They replay the shuffle; they make no doctrine claim.
* The checksum is two characters rather than one because a typo that decodes is this feature's
  worst failure — it hands the player a different match under a code they were told was exact.
  One character accepted 2.8% of single-character typos; two accept under 0.1%.
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

No tier cheats. All three see the same public board, obey the same legality checks and pay the same
costs. They differ only in how far they think.

They never see card *identities* they should not: no tier reads the opponent's hand contents or
deck order. `boardEval` and `styleBias` do read `foe.hand.length` and `me.deck.length` — public
counts that any player can see at the table, and which the UI already prints — so the precise claim
is "sizes, never identities", not "never looks".

| | recruit | veteran | sovereign |
| --- | --- | --- | --- |
| Cards committed per main phase | ≤ 2 | ≤ 4 | ≤ 6 |
| Position model | material only | material + static lane-threat projection | material + threat + full combat resolution of its own attack **and** the opponent's reply, resolved after readying the opponent's board |
| Values persistent supports (`supportWeight`) | no | 0.7 | 1.2 |
| Values Defense when Core is low | no | mildly | strongly |
| Detects lethal lines | no | yes | yes, weighted heavily |
| Times Traps, Disaster, Plague and Reactions to the board (`style`) | no | no | yes |
| Mulligan | never | up to 2 cards costing 7+ | up to 3 costing 6+, and dumps a handful with no entity |

Two of these rows were previously untrue and are now real:

* **Support value.** `boardEval` used to score only Core delta, unit power, lane threat and
  Defense count, so every non-combat card evaluated to exactly `0`, never cleared `minGain`
  and was never played. Across 400 sovereign matches the AI played zero Traps, Bases,
  Environments, Laws, Rituals, Responses, Plagues, Viruses, Spells, Actions or Disasters —
  including the Ritual, Law, Response, two Environments and two Hexes sitting in its own
  starter deck — and eleven event types fired zero times. `supportScore` now gives each
  implementable persistent family a contextual value (a Trap is worth more against a full
  hand, a Ritual more as its counters climb, a Plague scaled by how many enemies it infected),
  and an opposing support is scored as a standing liability. Families the engine leaves inert
  are deliberately excluded — see §4.6. Measured on the shipped decks over 500 sovereign
  matches, families never played fell from 16 of 28 to 12, and event types that never fired
  from 11 to 6: `ritual-charge`, `ritual-resolve`, `law-restricted`, `response-copy` and
  `support-removed` now fire in ordinary matches. The remaining six need cards neither deck
  contains — see §11.
* **The opponent's reply.** `replyLook` resolved the opponent's combat directly from the
  current position, where everything they had just deployed was still exhausted, so the
  deepest tier modelled every fresh enemy unit as harmless. It now readies the opponent's
  board first, which is what will actually be true when their combat arrives.

The row that claimed sovereign "holds Traps / Disaster / **Hex** for value" was vacuous in a
second way: Hex is inert (§4.6), so holding it for value meant holding it forever. The
`style` profile now covers Trap, Disaster, Plague, Reaction and Defense — families that do
something — and `AI_TIER_PROFILES.sovereign.style` is reachable.

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

`match-end` closes the stream (§3.2), so a renderer can drain its animation queue on that
event and be certain nothing else will arrive. Nothing needs to be replayed or discarded after
the victory banner.

Two more things worth surfacing outside the animation loop:

* `state.stats.coreHistory` is ready to plot as a two-line chart with no transformation.
* `laneThreat(state, 'player')` gives each lane's `incoming` / `outgoing`, which is the honest
  version of "this lane is about to kill you" — it uses only public board state.

---

## 10. Relationship to `match-rules.md`

The two documents are reconciled. `docs/match-rules.md` is the player-facing statement of the
same rules — resource curve, draw schedule and on-the-draw compensation, deployment fatigue
and *held exhausted*, Core armour and the lane-dependent breach ceiling, regroup, temporary
buff holds, deck-out fatigue, the family table, the inert families, and the difficulty tiers.
This document adds the parts a renderer or a tool needs: the event envelope and catalogue,
the ordering guarantees, the statistics contract, seeds, and the AI helper surface.

Where a rules change lands in both, both were edited in the same commit. If they ever
disagree again, this document is the one checked by `tests/engine-invariants.test.mjs`.

### 10.1 The third copy: what the player reads

Both documents being right was not enough. A rules change also has to reach the glossary, the
pre-match dialog, the mulligan panel, the lane seam tooltip and the deck analysis — and for
three changes in a row it did not. The armour divisor moved 4 → 5, the breach ceiling stopped
applying to undefended lanes and the opening refresh went 1 card → 2; all three were written
up here and in `match-rules.md`, and all three were contradicted in the product by prose that
had been typed by hand. The worst of them inverted the lesson: the glossary told players an
open lane was "worth at most 3 Core a turn" in the same build that removed that ceiling
precisely so abandoning a lane would be dangerous.

**Prose containing an engine number is engine output.** `src/rules-copy.js` computes every
such string from the exports above, the UI imports it, and `tests/rules-copy.test.mjs`
re-derives each claim from `armourBreach`, the draw schedule and `resourceCurve` rather than
comparing strings to strings. A number that appears on screen and is not derived there is a
bug, whatever the docs say.

## 11. Known limits

Two problems in this area are **not** engine defects and are not fixed here, because their
cause is in `card-canon.js` and `deck-store.js`:

* **Resources barely bind.** Over a 500-match sovereign sweep the curve grants far more than
  players spend (utilisation is under a third), and turns end with an empty hand far more
  often than with an empty pool. The engine-side ratio is as tight as it can honestly be made:
  the canon's cost and power are drawn from independent hashes, so cost carries no information
  about strength, and `deck-store.js`'s `draftScore` therefore sorts strictly cheapest-first —
  the shipped 30-card starter deck averages **1.10 total cost** with an average power of 7.17,
  and every card in the canon is castable by turn 3. No resource curve that leaves the canon's
  9-cost cards castable can constrain a deck that costs 1.1 per card. `RESOURCE_CAPS`,
  `castableTurn` and `deckProfile.curve` are correct instrumentation for a constraint that a
  cost-correlated canon would restore.
* **Families that never reach the table.** With support value in `boardEval` the AI now plays
  the persistent families that have an implementable effect. The ones still absent from real
  matches are absent because they are **not in the decks**: `buildStarterDeck` and
  `buildRivalDeck` draft cheapest-first from the canon and neither deck contains a Monster,
  Defense, Base, Action, Trap, Reaction, Plague, Virus, Spell, Disaster or World. Their event
  types (`trap-sprung`, `spell-resolve`, `virus-delay`, `support-disabled`, `resource-gain`)
  are reachable — `tests/engine-invariants.test.mjs` fires them from a support-rich deck — but
  cannot fire from a deck that holds none of the cards. That is a drafting question, not an
  evaluation one.
