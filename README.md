# The Collective Codex

**Twenty-One Divisions. Infinite Outcomes.**

The Collective Codex is a living digital card game spanning 21 divisions, 54 source sheets, 28 card families, and **1,134 canonical cards**.

## Card Canon + Embedded Art System

The current canon includes:

- 1,134 unique canonical card records
- hybrid division × family card frames
- embedded artwork mapped to every card slot
- finalized costs, rarity, timing, targets, keywords, counterplay and rules text
- power values derived from cost, so paying more buys more (see [Card power](#card-power))
- full Codex browser with search and filters
- a complete local three-lane match loop
- a 1500×2100 PNG card-frame export pipeline, composited around the shipped 80×80 art tiles
- GitHub Actions artifact export for all 1,134 masters

### Hard-embedded artwork

The runtime remains fully offline: no card art is fetched from a remote host. The build first attempts checksum-verified reconstruction of `assets/card-art-atlas.avif` from the canonical chunk manifest under `assets/card-art-atlas.base64/`.

The inherited PR #3 payload was forensically incomplete. Its historical 206,136-byte target (`16b869…a31`) does not exist in any reachable branch, pull-request ref, Git object, or workflow artifact, so it cannot be reconstructed byte-for-byte from repository data or its checksum. The exact missing-fragment inventory and commit history are recorded in [`docs/card-art-recovery-audit.md`](docs/card-art-recovery-audit.md).

The canonical payload is now repaired from the surviving byte-exact approved source sheets. All 54 canon rows use deterministic artwork-panel crops in the locked 21-division order, producing a fully embedded 2,107,628-byte AVIF (`2ec9c9…fa83`). The payload is split into 43 complete chunks and validated before use. Every registry record retains its original ID and unique `(row, col)` coordinate; no match code changed.

### Artwork resolution

The shipped atlas is **1680×4320**: a 21×54 grid of **80×80** tiles, one per card slot. That 80×80 tile is the highest-resolution card art anywhere in this repository.

`assets/card-art-source-manifest.json` records the approved source sheets at 1672×941 with a `crop.size` of **184**, so each card's artwork panel existed at 184×184 and was downscaled to 80×80 (lanczos3, then a 0.65-sigma sharpen) by `scripts/rebuild-atlas-from-sheets.mjs`. The 184px crops themselves are not in the repository.

The 1500×2100 export is therefore a full-resolution card *frame* — background, borders, typography, cost and rules block are all genuinely drawn at 1500×2100 — wrapped around an art panel that is drawn at 1320×900 from that 80×80 tile, a 16.5× linear upscale. The frame is sharp; the artwork inside it cannot be, and resampling does not restore detail the downscale already discarded. If the original source sheets are ever re-supplied, the atlas can be rebuilt at the full crop size instead (see [Commands](#commands)).

That same manifest records the exact SHA-256, byte length, family, set, and atlas row for every recovered source sheet. `npm run audit:art` verifies strict base64 round-trip, manifest size/checksum, full AVIF decoding, 1,134 unique decoded tiles, source-row provenance, canon coordinate mapping, and consistent runtime AVIF references. The emergency deterministic recovery generator remains available, but the repaired build does not use it and CI rejects an incomplete canonical payload before building.

### Card power

Card power is derived from what the card costs: `power = 2 + min(8, totalCost - 1 + jitter)`, where the jitter is a stable per-card hash in `0..2`. Cost, name, artwork, rarity, rules text and card IDs are untouched by this — only the power number is a function of the price.

It did not always work that way. Cost and power were previously drawn from two *independent* hashes, so across the canon the correlation between what a card cost and how strong it was measured **r = 0.0156** — statistically nothing. Power-10 bodies existed at every cost from 1 to 8. The consequence was not subtle: sorting the canon by power-per-cost takes about thirty seconds and produced a 30-card deck that beat the strongest AI **100% of the time**, and 19 of those 30 cards came from the four families that have no mechanical effect at all. Every interesting card in the game was a strictly worse draft pick than a blank one, and no resource curve could bind a deck whose average card cost 1.1.

The correlation is now **r = 0.92**, and that deck loses 0% against both the starter doctrine and a hand-built curve deck. `tests/canon-balance.test.mjs` locks the property in so it cannot quietly regress.

## Playing a match

Open **Battlefield** from the main navigation. A default 30-card starter doctrine is ready immediately, or build your own from all 1,134 cards using division, family, total-cost, and search filters. Deck edits persist in local storage, including an in-progress deck shorter than 30 cards. **A match in progress persists too** — a reload, a crashed tab or a phone the OS reclaimed comes back to the same round, hand, deck order and log.

Before the match starts, pick a rival tier — **recruit**, **veteran** or **sovereign** — or paste a seed code to replay a shuffle. Then keep or mulligan the five-card opening hand and play cards into **Vanguard**, **Conduit**, or **Flank**. Each Core begins at 20; every refresh draws 2 cards and refills a staggered Command / Insight / Essence curve that caps at 6 / 5 / 4. Ending your turn resolves all three lanes, runs the rival's main phase and combat using the same legal rules, then refreshes your next turn. Reduce the rival Core to 0 to win — or outlast a doctrine that runs out of cards, because an empty deck deals escalating unpreventable fatigue damage to its own Core.

The rival tiers differ only in how far ahead they search. No tier gets extra resources, better cards, or a look at your hand.

### Seat parity

The seat you sit in used to decide the match. On mirrored doctrines the side that acts first won **77.3%** of matches at veteran and 83% at sovereign — the engine's own source comment recorded the problem and left it open ("Fixing it properly means revisiting combat, not the opening hand"), while `docs/match-rules.md` told players the seats were even.

The cause compounds rather than deciding one final swing: every round, the first seat attacks into a board the second seat has not yet attacked with, so it removes blockers a turn early, every turn. That is why the extra opening card the second seat already drew never moved the number — a card you cannot pay for is not tempo.

The second seat is now compensated once, at its first refresh, with **one extra card and one extra Command, Insight and Essence**. Measured at 150 seeds per cell:

| Mirror doctrine, veteran | before | now |
| --- | --- | --- |
| starter / curve | 77% | 53% |
| top-heavy | 65% | 48% |
| cheap swarm | 49% | 51% |

And, more importantly, split by how the match ended — an aggregate can hide the very defect it claims to fix:

| Decided by | before | now |
| --- | --- | --- |
| Core damage (the combat race) | 84.4% first seat | **49.1%** |
| Deck-out fatigue | 58.5% first seat | 56.0% |

`npm run balance` reproduces all of it; `tests/seat-parity.test.mjs` fails if it drifts. The full write-up, including what it cost in pacing, is in [`docs/match-rules.md`](docs/match-rules.md#seat-parity).

### Balance is data, not code

Every tuning number the engine reads — Core totals, resource caps, the armour divisor, the breach ceiling, the fatigue step, the on-the-draw grant, and the AI tier weights — lives in [`ruleset.js`](ruleset.js) as one deeply frozen object and reaches a match through `state.rules`. A match is played under the ruleset it started with, and `state.rules.digest` says which one that was.

Overrides are treated as untrusted whatever they came from: out-of-range values are clamped, unknown keys dropped, cross-field impossibilities repaired, and everything corrected is listed on `rules.warnings`. `createRuleset()` never throws — a client that refuses to start a match is a worse outcome than one that starts a repaired one. When a match is not running the shipped balance the match bar says so, the debrief records it, and the chip opens a table of every value that differs.

### Seed codes

A seed code (`VET-3FAV-FQF9-TZ8M`) carries three things: the rival tier, the 32-bit shuffle
seed, and a 15-bit fingerprint of the doctrine the match was played with.

The fingerprint is there because **a seed alone does not reproduce a match**. The engine
shuffles the deck it is handed, so the same code played against different cards is a different
game — on one measured code, one doctrine won in nine rounds and another lost in five. The app
said in three places that a code "reproduces the exact match", which stopped being true the
moment anyone edited their deck. It now records which doctrine it was, and the pre-match screen
tells you before you commit whether yours matches, differs, or is an older code that recorded
none. Decks are also sorted before they are shuffled, so the order cards were *added* in can no
longer change the match either.

The checksum is two characters rather than one for the same reason: a typo that decodes hands
you a different match under a code you were told was exact. One character accepted 2.8% of
single-character typos; two accept under 0.1%. Codes in the older eleven-character format still
decode and still replay their shuffle — they simply make no doctrine claim.

The implemented resource curve, combat model, family-rule interpretations, AI behavior, and intentional conservative handling of underspecified card text are documented in [`docs/match-rules.md`](docs/match-rules.md). The engine's own contract — events, statistics, seeds and difficulty helpers — is in [`docs/engine-api.md`](docs/engine-api.md).

## Commands

```bash
npm install
npm run test
npm run build
npm run balance      # play a few thousand deterministic matches and grade the result
npm run audit        # npm audit --audit-level=high
npm run build:check  # fail if styles.css/match.css/ui.css drift from src/css/
npm run check        # test + build:check + build + balance + audit; this is what CI runs
npm run audit:art
npm run export:cards
npm run rebuild:art
```

`npm run balance` is the instrument every balance claim in this repository comes from, and it
is a blocking CI gate. A balance regression does not throw — it just makes the game worse in a
way no unit test is shaped to notice — so the report plays mirror matches, tier ladders and
archetype matchups over fixed seeds and exits non-zero if the seat starts deciding matches
again (parity outside 35–65%), if the difficulty ladder stops being monotonic, if a match
fails to resolve, or if the rival's search starts hitting the node budget that bounds its
worst frame. It also grades a candidate balance change before a player ever sees it:

```bash
node scripts/balance-report.mjs --seeds=200                    # tighter confidence
node scripts/balance-report.mjs --rules=candidate.json         # grade an override
node scripts/balance-report.mjs --json > balance.json          # machine-readable
```

Node 22 or newer (`engines` in `package.json`; CI pins 22).

`npm run build:check` exists because `styles.css`, `match.css` and `ui.css` are **generated**
from `src/css/` and also committed, so the repository can be opened without a build step.
Nothing enforced that the two agreed: editing a source file and forgetting to rebuild left
every checkout wrong while the deployed site stayed right, because CI regenerates the bundles
before copying them to `dist/`. `check` runs the comparison *before* the build — after it,
the build would only ever be compared against itself.

`npm run check` is the gate. It includes a **blocking** `npm audit --audit-level=high`: the
one devDependency is `sharp`, a native image decoder that the art pipeline and the card-master
export job both run over repository bytes, so an advisory against it is not background noise.
A false alarm costs one pinned bump.

`npm run export:cards` writes all 1,134 card masters to `exports/cards/` as **1500×2100 PNG** frames. The frame is native; the art panel inside it is upscaled from the 80×80 atlas tile, as described under [Artwork resolution](#artwork-resolution). For a quick local smoke test:

```bash
node scripts/export-card-masters.mjs --limit=3 --out=tmp/card-check
```

`npm run rebuild:art` regenerates the atlas from the approved source sheets, which are not committed; it takes the sheet directory as its first argument (default `recovered-sheets`). Tile size is a parameter so that a rebuild is not forced to throw the source resolution away again:

```bash
npm run rebuild:art                                   # default 80×80 tiles — the shipped atlas
npm run rebuild:art -- recovered-sheets --tile=184    # keep the full 184×184 source crop
npm run rebuild:art -- --tile-width=184 --tile-height=184
ATLAS_TILE_SIZE=184 npm run rebuild:art               # same, via environment
```

The default is exactly **80×80** and must stay there: the resulting atlas SHA-256 is a contract enforced by `tests/card-art-integrity.test.mjs`. A non-default tile size produces a larger atlas, a new checksum, and a manifest that no longer matches the committed one — use it only as part of a deliberate, fully re-verified art re-supply.

## Vercel

`vercel.json` builds the static application with:

- Build command: `npm run build`
- Output directory: `dist`

It also sets the response headers. The application is pure static files with no backend, so
the headers are the only server-side control there is:

| Header | Value | Why |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` | Nothing is loaded cross-origin, nothing is fetched, no form posts. |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `no-referrer` | Card ids and deck filters live in the URL fragment. |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | `same-origin` | |
| `Permissions-Policy` | camera, microphone, geolocation, payment, USB, sensors all denied | A card game needs none of them. |

The policy has **no `unsafe-inline` anywhere**, which is possible because `src/core.js`
exposes no markup-parsing escape hatch — there is not one `innerHTML` write in the bundle —
and because `index.html`'s single inline style (the `<noscript>` notice) was moved to a class
in `src/css/03-reset.css`. Custom properties are still written from JavaScript;
`element.style.setProperty()` is CSSOM and is not governed by `style-src`. The whole app —
codex, deck builder, pre-match dialog and a live match — was loaded under this exact policy in
Chromium with zero violations before it was committed.

If you add a stylesheet host, an analytics script or a remote font, the policy is the file to
change, and the app should be re-checked under it rather than the directive relaxed by reflex.

## Card front contract

Every full card displays:

1. Card name
2. Division icon + division name
3. Card family
4. Embedded artwork
5. Command / Insight / Essence cost
6. Power
7. Rules text
8. Rarity
9. Set / sheet label
10. Card ID

Collective AI is presented publicly as a peer division. Public card data contains no ownership messaging, no visible favoritism, and no hidden PvP stat advantages, and the rival AI tiers add none.
