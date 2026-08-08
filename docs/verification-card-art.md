# Card Art Verification

Final pre-PR verification executes `npm run check`, then exports card masters through `npm run export:cards` and validates the hard-embedded atlas checksum.

Acceptance invariants:

- 21 divisions
- 54 sheets
- 28 families
- 1,134 canonical cards
- 1,134 unique card IDs
- 1,134 unique canonical names
- 1,134 valid 54×21 art mappings
- 1,134 pixel-distinct mapped art cells
- 18 hard-embedded payload chunks
- reconstructed atlas SHA-256 `16b869ecc71eeaadfd518cdee08fd71486890fb2862a548ca728fcd983ca5a31`
- standalone exports are 1500×2100 PNG
- production static build succeeds
