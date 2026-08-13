# Card Canon + Embedded Art Pipeline

The runtime maps all 1,134 canonical cards to a hard-embedded 21×54 AVIF atlas. The complete payload lives in `assets/card-art-atlas.base64/` and is reconstructed by `scripts/materialize-atlas.mjs` after strict byte-length and SHA-256 validation.

## Repaired canonical payload

- Format: AVIF, 4:4:4 chroma
- Dimensions: 1680×4320
- Grid: 21 columns × 54 rows
- Tile: 80×80
- Binary bytes: 2,107,628
- Base64 chunks: 43
- SHA-256: `2ec9c9dd8501a6bcd63ddd660aee2c99f4e86a0bf2d7481a0a7c44437658fa83`
- Runtime path: `assets/card-art-atlas.avif`

Every row is derived from one byte-exact approved 1672×941 generated source sheet. Columns follow division IDs 1–21; rows follow `sheets` order in `card-canon.js`. The deterministic crop/resize/encode recipe and every source hash are recorded in `assets/card-art-source-manifest.json`. With the original source sheets available locally, run:

```bash
npm run rebuild:art -- /path/to/recovered-sheets
```

The in-app renderer uses hybrid division/family frames and exposes card name, division, family, artwork, Command/Insight/Essence costs, power, rules, rarity, set label, and card ID. `scripts/export-card-masters.mjs` renders standalone 1500×2100 PNG masters. The 1500×2100 is the native size of the composited *frame*; the artwork panel inside it is drawn from an 80×80 atlas tile, so the art itself is upscaled. See the Artwork resolution section of the README.

The unrecoverable historical target and surviving fragment inventory are documented in `docs/card-art-recovery-audit.md`. It is not represented as successfully restored.
