# Card Canon + Embedded Art Pipeline

This release maps all 1,134 canonical cards to a hard-embedded 21×54 AVIF art atlas. The atlas payload lives in `assets/card-art-atlas.base64/` and is reconstructed by `scripts/materialize-atlas.mjs` after SHA-256 and byte-length validation.

The in-app card renderer uses hybrid division/family frames and exposes the locked front-face information: card name, division icon/name, family, artwork, Command/Insight/Essence costs, power, canonical rules text, rarity, set label, and card ID.

Standalone card masters are rendered by `scripts/export-card-masters.mjs` at 1500×2100 PNG.

Atlas SHA-256: `16b869ecc71eeaadfd518cdee08fd71486890fb2862a548ca728fcd983ca5a31`.

Art provenance: the atlas is derived/refined from the available approved/generated Collective Codex sheet-art corpus. Where a standalone original source asset was unavailable, a deterministic refined projection from the approved visual corpus is used. Every runtime card maps to its own pixel-distinct art region.
