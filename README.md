# The Collective Codex

**Twenty-One Divisions. Infinite Outcomes.**

The Collective Codex is a living digital card game spanning 21 divisions, 54 source sheets, 28 card families, and **1,134 canonical cards**.

## Card Canon + Embedded Art System

The current canon includes:

- 1,134 unique canonical card records
- hybrid division × family card frames
- embedded artwork mapped to every card slot
- finalized costs, power values, rarity, timing, targets, keywords, counterplay and rules text
- full Codex browser with search and filters
- a complete local three-lane match loop
- 1500×2100 PNG master export pipeline
- GitHub Actions artifact export for all 1,134 masters

### Hard-embedded artwork

The runtime remains fully offline: no card art is fetched from a remote host. The build first attempts checksum-verified reconstruction of `assets/card-art-atlas.avif` from the canonical chunk manifest under `assets/card-art-atlas.base64/`.

The inherited PR #3 payload was forensically incomplete. Its historical 206,136-byte target (`16b869…a31`) does not exist in any reachable branch, pull-request ref, Git object, or workflow artifact, so it cannot be reconstructed byte-for-byte from repository data or its checksum. The exact missing-fragment inventory and commit history are recorded in [`docs/card-art-recovery-audit.md`](docs/card-art-recovery-audit.md).

The canonical payload is now repaired from the surviving byte-exact approved source sheets. All 54 canon rows use deterministic artwork-panel crops in the locked 21-division order, producing a fully embedded 2,107,628-byte AVIF (`2ec9c9…fa83`). The payload is split into 43 complete chunks and validated before use. Every registry record retains its original ID and unique `(row, col)` coordinate; no match code changed.

`assets/card-art-source-manifest.json` records the exact SHA-256, byte length, family, set, and atlas row for every recovered source sheet. `npm run audit:art` verifies strict base64 round-trip, manifest size/checksum, full AVIF decoding, 1,134 unique decoded tiles, source-row provenance, canon coordinate mapping, and consistent runtime AVIF references. The emergency deterministic recovery generator remains available, but the repaired build does not use it and CI rejects an incomplete canonical payload before building.

## Playing a match

Open **Battlefield** from the main navigation. A default 30-card starter doctrine is ready immediately, or build your own from all 1,134 cards using division, family, total-cost, and search filters. Deck edits persist in local storage, including an in-progress deck shorter than 30 cards.

Start the match, keep or mulligan the five-card opening hand, then play cards into **Vanguard**, **Conduit**, or **Flank**. Each Core begins at 20. Ending your turn resolves all three lanes, runs the rival's main phase and combat using the same legal rules, then refreshes your next turn. Reduce the rival Core to 0 to win.

The implemented resource curve, combat model, family-rule interpretations, AI behavior, and intentional conservative handling of underspecified card text are documented in [`docs/match-rules.md`](docs/match-rules.md).

## Commands

```bash
npm install
npm run test
npm run build
npm run check
npm run audit:art
npm run export:cards
```

`npm run export:cards` writes all final **1500×2100 PNG** card masters to `exports/cards/`. For a quick local smoke test:

```bash
node scripts/export-card-masters.mjs --limit=3 --out=tmp/card-check
```

## Vercel

`vercel.json` builds the static application with:

- Build command: `npm run build`
- Output directory: `dist`

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

Collective AI is presented publicly as a peer division. Public card data contains no ownership messaging, no visible favoritism, and no hidden PvP stat advantages.
