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

The atlas payload inherited from the current `main` history is incomplete: the manifest checksum describes the intended compiled AVIF, but not all referenced binary payload was committed. When exact materialization is unavailable, `scripts/recover-atlas.mjs` produces a deterministic 21×54 canon-mapped AVIF locally at build time. This fallback does **not** overwrite the inherited source chunks or `assets/card-art-provenance.json`, so a future byte-exact restoration of the missing payload can replace the fallback without changing card IDs, coordinates, runtime URLs, or match code.

Every registry record retains a unique `(row, col)` coordinate in the 21×54 atlas. `assets/card-art-provenance.json` records the source-sheet and transformation history. The fallback exists only to keep the repository buildable and runtime-local when the inherited binary source package is incomplete; it should not be represented as a byte-exact recovery of missing historical artwork.

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
