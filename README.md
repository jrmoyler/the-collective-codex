# The Collective Codex

**Twenty-One Divisions. Infinite Outcomes.**

A living digital collectible card game where cards materialize as animated battlefield entities, weapons visibly equip to units, Laws alter match rules, Rituals build over several turns, and Worlds transform the board.

## Current vertical slice

- All 21 divisions and locked divisional icons
- Canonical registry for 54 generated sheets
- 1,134 indexed card slots
- 28 card families
- Searchable and filterable Codex browser
- Three-lane local battlefield simulation
- Command, Insight, and Essence resources
- Deploy-card and end-turn interactions
- Responsive Collective AI visual system
- Dependency-free static build for Vercel

## Local development

```bash
npm run dev
```

## Verification

```bash
npm run check
```

## Deployment

The project is configured for Vercel through `vercel.json`.

## Important registry note

The 1,134 slots are structurally registered and uniquely identified. Entries are marked `provisional: true` until the exact canonical names, mechanical rules, and generated art references from every approved sheet are transcribed into the registry.
