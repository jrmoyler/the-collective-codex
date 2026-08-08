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

The runtime atlas is stored inside the repository as chunked base64 source data under `assets/card-art-atlas.base64/`. `npm run build` reconstructs `assets/card-art-atlas.avif`, validates its SHA-256 checksum, and packages it into `dist/assets/` for Vercel. No external image host is required.

Every registry record has a unique `(row, col)` coordinate in the 21×54 atlas. `assets/card-art-provenance.json` records the source sheet and transformation strategy for every sheet row.

Available approved source-sheet artwork is directly cropped/refined. When a specific one of the 54 historical source sheets was not locally available during this implementation, its slot is explicitly marked `derived-refined` in provenance and receives a deterministic refinement from an approved same-family or semantically related source sheet. Nothing is silently represented as an exact historical source when it is not.

## Playing a match

Open **Battlefield** from the main navigation. A default 30-card starter doctrine is ready immediately, or build your own from all 1,134 cards using division, family, total-cost, and search filters. Deck edits persist in local storage.

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
