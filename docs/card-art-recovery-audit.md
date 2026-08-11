# Card Art Recovery Audit

## Finding

The historical AVIF identified by SHA-256 `16b869ecc71eeaadfd518cdee08fd71486890fb2862a548ca728fcd983ca5a31` was never committed completely. A cryptographic checksum identifies bytes but cannot reconstruct them. No byte-exact copy exists in the repository's branches, pull-request refs, reachable or unreachable Git objects, or GitHub Actions artifacts.

PR #3 nevertheless described the target as an eighteen-chunk, 206,136-byte, 1,134-tile atlas. Its only export workflow run failed and produced no artifact. PR #4 later added `scripts/recover-atlas.mjs` so builds could ship a deterministic geometric fallback.

## Manifest and fragment timeline

| Commit | Evidence |
| --- | --- |
| `0a86908` | Version 1 WebP manifest claimed 301,580 bytes and 21 chunks; no payload chunks existed. |
| `949ba15` | Version 3 AVIF manifest changed the target to 206,136 bytes, SHA-256 `16b869…a31`, and 14 chunks. |
| `74f4c7c` | Manifest was changed to four chunks before any AVIF chunk was committed. |
| `e34b6f7`…`195c26d` | Only files 000, 001, 002, 003, 005, 006, and 007 were added. Chunk 004 was never added; commit labels changed from `001/034` to `002/018` through `008/018`. |
| `a067805` / PR #3 | Verification prose claimed 18 chunks and a passing checksum, but the branch tree contained the same seven incomplete files and a four-file manifest. |
| `8dbd2b5`…`9a8ace1` / PR #4 | Automatic fallback generation was added after the inherited candidate failed checksum validation. |

## Exact inherited inventory

| File | Base64 characters | Referenced by final inherited manifest |
| --- | ---: | :---: |
| `chunk-000.txt` | 8,192 | yes |
| `chunk-001.txt` | 16,384 | yes |
| `chunk-002.txt` | 16,384 | yes |
| `chunk-003.txt` | 32,237 | yes |
| `chunk-004.txt` | missing | no |
| `chunk-005.txt` | 32,767 | no |
| `chunk-006.txt` | 52,620 | no |
| `chunk-007.txt` | 16,384 | no |

The inherited manifest referenced 73,197 base64 characters. A 206,136-byte payload requires 274,848 characters, leaving a 201,651-character deficit in the referenced stream. Node's permissive decoder produced only 54,896 bytes—151,240 bytes short—and SHA-256 `ea134f27…91aba`. The candidate header was real enough to declare a 1680×4320 HEIF image, but full decode failed because its `mdat` extent reaches byte 206,136 while the file ends at byte 54,896. The referenced stream terminates with base64 padding; appending orphan chunks 005–007 after that padding cannot restore the image.

All six remote branch heads and all four closed pull-request heads were inspected. `git fsck --full --no-reflogs --unreachable` found no lost payload object. The failed PR #3 workflow run had zero artifacts. The cited source-sheet filenames also do not exist in the Codex history or Collective Stock repository.

## Source recovery and replacement

The approved generated sheet archive retained 74 exact PNGs surrounding the original atlas build. Fifty-four semantically correct sheets were selected one-for-one for the 54 canon rows:

- 1 Specimen row
- 12 Weapon rows
- 2 Environment rows
- 8 Item rows
- 8 Operative rows
- 23 remaining family rows

Each source is 1672×941 and contains the same 7×3 division grid in canonical order. `scripts/rebuild-atlas-from-sheets.mjs` extracts artwork-only squares, resizes them to 80×80, and encodes the 21×54 AVIF. `assets/card-art-source-manifest.json` binds every row to the exact source filename, byte length, and SHA-256.

Replacement payload:

- Binary bytes: 2,107,628
- SHA-256: `2ec9c9dd8501a6bcd63ddd660aee2c99f4e86a0bf2d7481a0a7c44437658fa83`
- Chunks: 43, all referenced exactly once
- Exact decoded tile hashes: 1,134 / 1,134 unique
- Perceptual dHashes: 1,134 / 1,134 unique
- Closest perceptual pair: Hamming distance 6
- Pairs at distance 4 or less: 0
- Coordinate/family/set/division mismatches: 0
- Fallback-generated canonical tiles: 0

Card IDs, card names, canon records, atlas coordinates, match rules, deck persistence, and offline-only runtime behavior are unchanged.
