# Card Art Verification

Run the focused art audit with `npm run audit:art`, then the full application gate with `npm run check`. `npm run export:cards -- --limit=3` provides a bounded master-card export smoke test.

Acceptance invariants:

- 21 divisions
- 54 sheets and source-provenance rows
- 28 families
- 1,134 canonical cards
- 1,134 unique card IDs and names
- 1,134 valid 54×21 art coordinates
- 1,134 pixel-distinct decoded art cells
- 1,134 distinct perceptual dHashes; minimum observed pair distance 6
- zero fallback-generated cells in the canonical payload
- zero family, set, division, or coordinate mismatches
- 43 referenced payload chunks and zero orphan chunks
- strict canonical base64 round-trip
- reconstructed byte length 2,107,628
- reconstructed SHA-256 `2ec9c9dd8501a6bcd63ddd660aee2c99f4e86a0bf2d7481a0a7c44437658fa83`
- AVIF is used consistently by canon data, styles, provenance, exporter, and build
- standalone exports are 1500×2100 PNG (frame native; the art panel is composited from an 80×80 atlas tile)
- production static build and match tests succeed
