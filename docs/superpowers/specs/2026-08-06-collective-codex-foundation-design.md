# Collective Codex Foundation Design

The first repository milestone establishes a deployable, testable product foundation rather than attempting to finish the complete game in one commit.

## Scope

- Preserve all 21 divisions and their locked icon mapping.
- Register all 54 generated sheets and 1,134 card slots.
- Provide an interactive Codex browser.
- Provide a local three-lane battlefield simulation.
- Establish a deterministic, rendering-independent game-state module.
- Prepare a static deployment for Vercel.
- Keep Collective AI's Sovereign Doctrine information internal to PvE systems; do not expose ownership or favoritism in public UI.

## Architecture

- Dependency-free JavaScript modules for interface composition.
- Pure modules for card registry and match state.
- CSS-driven rendering for the first visual prototype.
- JSON-ready records for later art, rules and animation imports.
- Node's built-in test runner for catalog and game-state verification.

## Future work

The generated sheet artwork and exact canonical names must be imported in systematic batches. The structural registry intentionally marks generated records as provisional until each source sheet is transcribed and reviewed.
