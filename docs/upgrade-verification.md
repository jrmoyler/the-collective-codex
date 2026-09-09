# Upgrade verification

## Scope

Four agents implemented and reviewed the lobby, match controls, offline bundle,
and native packaging scaffold. Cross-review corrected atlas crop leakage,
focus-related title movement, and unaffordable hand-card accessibility semantics.
The canonical card data and match engine are unchanged.

## Evidence

- Full local `npm run check` passed: tests, generated CSS parity, production
  build, deterministic balance simulations, and the high-severity audit gate.
- The final hand-card accessibility correction has a regression test; the final
  suite contains 242 tests.
- Vercel successfully deployed the initial PR revision.
- Hosted Chrome: visually inspected lobby and battle layout; exercised start,
  difficulty choice, opening hand, turn cancellation/confirmation, rival turn,
  card inspection, card deployment, and reload restoration at round 2.
- Android project generation and asset synchronization succeeded in an isolated
  temporary project. This does not establish native compilation or device quality.
- Production dependency audit reported zero vulnerabilities. Three moderate
  findings remain in development-only Capacitor CLI dependencies.

## Outstanding release evidence

GitHub Actions could not start: its annotation reports the account is locked due
to a billing issue. No workflow gate was removed or weakened.

Physical iOS/Android testing, native compilation/signing, mobile visual review,
actual offline browser reload, store assets and submission are not verified.
See [native-release.md](native-release.md). Reviewers found no remaining known
defects in their bounded source-review scopes; none certified the entire game
as perfect or approved for an app store.
