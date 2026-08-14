# The Collective Codex — Design + UX Polish Brief

**Status:** build specification, phase 1 (spec only, no code in this document)
**Owner:** Design + UX Direction
**Audience:** UI engineer, visual designer
**Scope:** `index.html`, `app.js`, `styles.css`, `match.css`, plus a small, additive event contract in `match-engine.js`

Every requirement below is numbered so it can be checked off. Requirements are written as
"must / must not" and are testable. Where a number is asserted it was measured against the
repository at commit `9f22b8c`; the measurement method is stated so it can be re-run.

**The engine is not the problem.** `match-engine.js`, `card-canon.js`, `deck-store.js` and the
test suite are sound and no test imports `app.js` — the entire presentation layer can be
rebuilt without touching a passing test. The only engine change this brief requires is
**additive** (§4.2: a structured event stream emitted next to the existing log strings).

---

## 0. The one-paragraph verdict

The Codex has a real visual identity — deep navy, amber gold, a hard hairline grid, monospaced
data, 21 division accents — and that identity is worth deepening. What it does not have is a
*product*. Search accepts one character and then stops working. Clicking a card selects it and
shows you nothing. A 1,134-card grid is rebuilt from a 1.14 MB HTML string on every state
change. The board renders the result of combat but never the combat, so the player reads a
14-line text log to find out what happened to them. A new player is dropped into a 30-card
deck-builder with no explanation of what Command, Insight, Essence, lanes or Core are. The fixes
are not a re-skin — they are architecture (render model, event model, notification model,
focus model) plus a disciplined tightening of a visual language that is already 70% right.

---

## 1. Audit — what is actually wrong today

### 1.1 The render model (root cause of most of the rest)

**A-1. `render()` destroys and rebuilds the world on every state change.**
`app.js:61` — `app.innerHTML = …; bind();`. There is no diffing, no keyed reconciliation, no
partial update. This runs on: view change (`:63`), division filter (`:64`), **card click**
(`:65`), **every keystroke in search** (`:66`), family change (`:67`), every deck-pool filter
keystroke (`:68`), every deck add/remove (`:72`, `:73`), every mulligan toggle (`:77`), every
hand selection (`:80`), every play (`:81`), every inspect click (`:82`), end turn (`:83`).

**A-2. Measured cost of one Codex render.** Reconstructing `card()` (`app.js:20-25`) over the
full canon and measuring the produced string:

| Metric | Value | How measured |
| --- | --- | --- |
| Cards in the unfiltered grid | 1,134 | `cards.length` |
| HTML string for the grid | **1,194,477 bytes (1.14 MB)** | `Buffer.byteLength(cards.map(card).join(''))` |
| Bytes per card | 1,052 | same |
| Elements per card | **31** | `/<[a-z]/g` match count |
| Elements in the grid | **35,154** | 31 × 1,134 |
| String construction alone, Node/V8, warm | **12.4 ms** | 5-run average |

12.4 ms is *only* the template-literal concatenation with no DOM involved. On top of that, each
render pays: HTML parsing of 1.14 MB, construction of 35,154 elements plus ~46,000 text nodes,
style resolution against a 12,700-character stylesheet, layout of a 5-column grid, and paint of
1,134 background-image layers. Then `bind()` (`app.js:62-87`) runs **twelve** `querySelectorAll`
passes over that 35k-node tree and attaches ~1,200 closures — `[data-card]` alone attaches 1,134
of them. A realistic mid-tier laptop budget for this is **300–900 ms per keystroke**. It is
several hundred milliseconds to move a 1px highlight ring (`app.js:65`).

**A-3. Search is functionally broken, not merely janky.** `app.js:66` binds `oninput`, which
synchronously calls `render()`, which replaces `#app.innerHTML` — destroying the `<input>` the
user is typing into. Focus falls to `<body>`. **The second character never reaches the field.**
The Codex search box accepts exactly one character per click into it. Same defect on the deck
pool search (`app.js:68`). This is a P0 functional outage, not a polish item.

**A-4. Filtering re-derives everything per keystroke.** `app.js:31` builds, for each of 1,134
cards, a fresh template literal joining name + family + division name + rules text + id, then
lowercases it — 1,134 string allocations and 1,134 `toLowerCase()` calls per keystroke, plus
1,134 `divMap.get()` lookups. There is no precomputed search index.

**A-5. The CSS has no source form.** `styles.css:2` is a single 12,700-character line;
`match.css:3-10` are single lines of 2,000–7,000 characters each. This was authored minified.
Two designers cannot work in it concurrently, diffs are unreviewable, and there is no token
layer — `#D4A843` and its cousins are hard-coded dozens of times. There is no build step for
CSS even though `scripts/build.mjs` already exists and copies files.

### 1.2 Missing product surfaces

**A-6. The card detail view does not exist.** `state.selected` is initialised to `cards[0]`
(`app.js:7`), set on click (`app.js:65`), and read in exactly one place — the `selected` CSS
class in `card()` (`app.js:23`). Nothing ever renders the record. Consequences: on first load an
arbitrary card ("Aureate Chimera of the Last Horizon") is highlighted gold for no reason; and the
canon's own **card front contract** in `README.md:62-76` (10 required fields) is unsatisfiable at
grid density — the grid tile shows a 9.4px rules paragraph and drops `subtype`, `counterplay`,
`duration`, `keywords[3+]` entirely. There is nowhere in the product to read a card.

**A-7. There is no routing and no deep links.** State lives only in the `state` object
(`app.js:6-10`). No `pushState`, no hash parsing, no `popstate` handler (verified by grep: zero
matches for `history.pushState`). The browser Back button leaves the app. A division filter, a
search, a specific card, or "the battlefield" cannot be linked, bookmarked, or shared. For a
1,134-card catalogue this is the single largest missed affordance.

**A-8. There is no onboarding of any kind.** A first-time player lands on a marketing hero
(`app.js:29`) and one click later is in a deck builder (`app.js:33-36`) told to "Choose exactly
30 unique cards from the full canon." Nothing anywhere defines Command, Insight, Essence, Core,
lane, entity vs. support, exhausted, or Guard/Flying. `docs/match-rules.md` is excellent and is
not linked from the UI. Worse, a rule the player *must* know is invisible: per
`docs/match-rules.md:39`, **power is simultaneously attack value and remaining durability** —
the board shows a single `PWR n` (`app.js:43`) and every card game convention the player brings
says that number is attack and there is a separate health.

**A-9. Deck construction gives no feedback about deck quality.** No cost curve, no
entity/support ratio, no division spread, no duplicate protection beyond a notice string. The
engine will happily accept 30 cards that cannot be played: `getPlayability` rejects
Item/Action/Weapon with no friendly unit in the lane (`match-engine.js:120`) and Hex with no
opposing unit (`:121`), and `buildStarterDeck` deliberately ships 18 entities / 12 non-entities
(`deck-store.js:27`) because that ratio matters. The builder never says so.

**A-10. Post-match is a scoreboard, not a debrief.** `endOverlay()` (`app.js:55`) shows Core,
turns, Core. The log that explains the whole match is discarded on the same screen.

### 1.3 Interaction, input and feedback

**A-11. Everything is click-only.** Zero keyboard handlers in the codebase (grep:
`addEventListener('key` → no matches). No arrow-key navigation of a 1,134-cell grid, no digit
keys for the hand, no Enter to commit, no Escape. A keyboard user must Tab through **1,134
card buttons** to reach the site footer; there is no skip link and no roving tabindex.

**A-12. No drag and drop.** Playing a card is: click card → read three lane buttons → click the
one that says "Play selected here" (`app.js:50-51`). The board itself is inert. Every card game
the audience has played uses drag-to-lane.

**A-13. No focus management.** View changes, overlays, and the match-end modal
(`app.js:55`, `match.css:7`) never move focus, never trap focus, and never restore it. The
`.matchEnd` overlay is `position:fixed` over the page with no `role="dialog"`, no
`aria-modal`, no Escape handler; a screen reader user is still reading the board behind it.

**A-14. `state.notice` is a single string that silently overwrites itself.** It is written at
`app.js:59, 72, 73, 74, 75, 81, 83` and blanked at `app.js:63, 65, 80, 84, 86`. Two errors in a
row show only the second. Any subsequent click erases the message. In the match view the notice
renders at the very top of the page (`app.js:53`) while the player is interacting with the hand
tray at the bottom — an error about an illegal play is rendered **off-screen**. It has no
`aria-live`, so it is never announced.

**A-15. Rejection reasons are hidden in `title` attributes on disabled buttons.**
`app.js:50` — `<button data-play-lane … disabled title="${play.reason}">`. `title` is
unreachable by touch, unreliable by keyboard, and `disabled` elements are removed from the
accessibility tree. The reason is also the visible label in the enabled case, so the same string
is doing two different jobs.

**A-16. Affordability is invisible until after you commit.** `getPlayability` is only ever
called for lane buttons (`app.js:50`). Hand cards carry no "you cannot afford this" state, no
"no legal lane" state. The player selects a card, then discovers from three greyed buttons that
it was never playable. The resource bar (`app.js:53`) renders the *player's pools* with
`costs({cost:p.resources})` — literally the same component and the same styling as a card's
*cost*, so the two most-confusable numbers in the game are drawn identically.

**A-17. The displayed power is not the number combat uses.** `unitTile` (`app.js:43`) prints
`PWR ${unit.power}` and a separate `WEAPON +n` chip. `combatValue()`
(`match-engine.js:181`) returns `power + weaponBonus` when attacking and unused. So a unit
displayed as "PWR 6 / WEAPON +2" attacks for 8, and the UI never says 8. Temporary buffs
(`tempPower`, `match-engine.js:131,153,154`) are folded into `power` and expire silently at
`:194`.

**A-18. Lane headers show the wrong statistic.** `app.js:50` renders
`${rival.units.length} rival ÷ ${player.units.length} allied` — unit *counts*. Combat is decided
by *power* (`match-engine.js:211-221`). The header shows the number that does not matter.

**A-19. The economy is silent.** The Environment discount (`match-engine.js:102-109`) changes
what a card costs, and the card still shows its printed cost. Base generation
(`match-engine.js:81-88`) adds a resource at refresh with no forewarning. Defense prevention
capacity and `corePreventionUsed` (`match-engine.js:38-42`) — the thing that decides whether
you survive a lane — is never shown.

**A-20. Ending a turn is a single unconfirmed click that runs the opponent's entire game.**
`#endTurn` (`app.js:83`) calls `completePlayerTurn` (`match-engine.js:232-238`) which resolves
player combat, refreshes the rival, lets the AI play **up to five cards** (`:227-230`), resolves
rival combat, and refreshes the player — then one `render()` paints the outcome. The board
teleports. Up to ~20 log lines are generated; the UI shows 14 (`app.js:53`), newest-first, of an
engine buffer capped at 60 (`match-engine.js:27`). Events are permanently lost from view.

**A-21. Duplicate mulligan controls with identical behaviour.** `#keepHand` calls
`mulligan(state,'player',[])`; `#mulliganSelected` with an empty selection calls
`mulligan(state,'player',[])` and is labelled "Begin match" (`app.js:40, 78, 79`). Two buttons,
same effect. Nothing tells the player that mulliganed cards go to the *bottom of their deck*
(`match-engine.js:68`), which is a strategically relevant fact.

**A-22. Destructive actions are instant and unrecoverable.** "Clear" wipes a 30-card deck
(`app.js:75`), "Reset match" abandons a match in progress (`app.js:84`), "Restore starter
doctrine" overwrites the deck (`app.js:74`). No confirmation, no undo. Deck writes go straight
to `localStorage` (`deck-store.js:58`).

**A-23. Hidden information is hidden from assistive tech too.** A face-down rival Trap renders
as a `disabled` button (`app.js:44`), which removes "SET TRAP / HIDDEN" from the accessibility
tree entirely — a sighted player knows a trap is there, a screen-reader player does not.

### 1.4 Accessibility

**A-24. Cards are `<button>` elements containing `<header>`, `<section>`, `<p>` and `<footer>`.**
`app.js:24`. This violates the HTML content model (a `button` may not contain sectioning or
heading content) and, more practically, the accessible name is computed by flattening everything
inside. One card announces as roughly: *"Collective AI · Specimen, Aureate Chimera of the Last
Horizon, 7, Artwork for Aureate Chimera of the Last Horizon, Common, Specimen Set 1, Specimen,
C2 I1 E0, Synthesize — When deployed, adapt to the strongest opposing unit in this lane; gain +1
power until end of turn., Synthesize Observe Specimen, D01-SPECIMEN-S01-01, Main · Self, button."*
That is a ~45-word name, repeated 1,134 times. The single `role="img"` + `aria-label` in the
entire application (`app.js:24`) exists only to make this worse.

**A-25. Nothing is announced.** Grep for `aria-live`: zero matches. The match log
(`app.js:53`), the notice bar (`:53`), the Core totals, and the match-end result are all
silent. A blind player cannot know they took damage.

**A-26. Type is below the legibility floor across the product.** Measured from the stylesheets
(1rem = 16px):

| Selector | Declared | Computed | File |
| --- | --- | --- | --- |
| `.battleUnit footer small` | `.35rem` | **5.6 px** | `match.css:6` |
| `.codexCard>footer` | `.38rem` | **6.1 px** | `styles.css:2` |
| `.tags span` | `.39rem` | **6.2 px** | `styles.css:2` |
| `.supportChip span` | `.42rem` | **6.7 px** | `match.css:6` |
| `.laneCommand>span` | `.43rem` | **6.9 px** | `match.css:6` |
| `.cardMeta` | `.45rem` | **7.2 px** | `styles.css:2` |
| `.cardHead small` | `.46rem` | **7.4 px** | `styles.css:2` |
| `.laneCommand button` | `.45rem` | **7.2 px** | `match.css:6` |
| `.rules p` (the rules text!) | `.59rem` | **9.4 px** | `styles.css:2` |

All of these are monospaced, most are uppercase with positive letter-spacing, and several are
coloured with a division accent. 5.6px uppercase mono is decoration, not text.

**A-27. Measured contrast failures.** Relative-luminance contrast against the page background
`#050A18` (WCAG 2.x formula):

*Division accents — used as small text in `.cardMeta`, `.ruleTop>b`, `.divisionGrid footer span`,
`.divisionRail small`:*

| Fails 4.5:1 | Ratio | | Overpowers body text (>13:1) | Ratio |
| --- | --- | --- | --- | --- |
| 11 Terra Axis `#8C2B2B` | **2.35** | | 12 Binary Loom `#A3E635` | 13.10 |
| 02 ZenFlow `#7C3AED` | 3.47 | | 13 Vector Shift `#CBD5E1` | 13.31 |
| 14 Aether Link `#B5451B` | 3.60 | | 16 Civic Core `#F7CFCF` | 13.90 |
| 03 The Collective `#067A56` | 3.69 | | 15 Obsidian Arc `#E2E8F0` | 16.02 |
| 19 Gaia Synthesis `#2F7D4B` | 3.91 | | 20 Eon Core `#FFFBEB` | **19.05** |
| 05 Nexus Labs `#DC2626` | 4.09 | | *(body text `#F5F5F5` = 18.12)* | |
| 10 Cognara Mind `#E0267E` | 4.47 | | | |

Seven of twenty-one accents fail body-text contrast; one (Terra Axis) fails even the 3:1
non-text minimum. Five are brighter than the card name, so the *frame* out-shouts the *content*.
Eon Core is brighter than the primary text colour. Total spread across the system: **8.1×**.

*Secondary UI greys, all used at 6–9px:*
`#42506a` 2.43 · `#4d5b72` 2.87 · `#53627a` 3.19 · `#58667d` 3.40 · `#5f6e88` 3.83 ·
`#65728a` 4.07 · `#68758b` 4.24 · `#6b7890` 4.43 — every one fails 4.5:1, at sizes where the
large-text exemption does not apply. And `.primary:disabled{opacity:.42}` (`match.css:3`)
composites gold onto navy at roughly **2.2:1**.

**A-28. No reduced-motion handling.** Grep for `prefers-reduced-motion`: zero matches.
`.codexCard{transition:.2s ease}` (`styles.css:2`) animates *all* properties on 1,134 elements,
`:hover` applies `translateY(-4px)` plus a 50px-blur shadow, and on touch devices that hover
state sticks. There are no `:active` states anywhere in either stylesheet.

**A-29. No forced-colors / high-contrast support**, and several states are conveyed by opacity
alone: `.battleUnit.exhausted{opacity:.56}`, `.supportChip.disabled{opacity:.45}`,
`.deckCardGrid .codexCard.selected{opacity:.48}` (`match.css:4,6`). Opacity is not a signal in
forced-colors mode, and "faded" is not distinguishable from "far away" for many users.

### 1.5 Assets and loading

**A-30. The atlas is 2,107,628 bytes and there is no loading state.** No `<link rel="preload">`
in `index.html:1`, no decode gate, no skeleton. Cards paint as 1,134 empty `#060b16` rectangles
with hairline borders until the AVIF decodes.

**A-31. The art is 80 × 80 pixels per card.** Measured: the atlas is **1680 × 4320** (21 columns
× 54 rows → 80 × 80 per tile). `.cardArt` displays it at ~180–250 px wide in the grid — a
**2.2×–3.1× upscale** with `image-rendering:auto`. `scripts/export-card-masters.mjs` exports
"1500×2100 PNG masters" (`README.md:49`) — an **18.75× upscale** of an 80px source. This is a
hard ceiling on how good the product can look and it is not a CSS problem.

**A-32. Each `.cardArt` element rasterises the atlas at 21× its own width.**
`background-size:2100% 5400%` (`styles.css:2`, `match.css:2`). At a 180px-wide card the scaled
backdrop is 3,780 × 5,292 px ≈ **20 megapixels**, and each distinct card box size in the app
(codex tile, compact deck tile, hand card, hero fan card, battle unit) can force its own scaled
copy. The decoded atlas alone is 1680×4320×4 ≈ **29 MB** of RAM.

**A-33. Fonts are `@import`ed from Google at the top of `styles.css:1`.** This is a
render-blocking CSS `@import` (the worst way to load a font — the browser must fetch and parse
`styles.css` before it even discovers the font request), it adds two cross-origin connections,
and it directly contradicts `README.md:22` ("The runtime remains fully offline"). There is no
`font-display` control and no local fallback metric matching, so the entire product FOUTs.

**A-34. `index.html:1` ships no favicon, no `og:`/`twitter:` metadata, no canonical URL, no
`<link rel="manifest">`.** A card game with 1,134 shareable objects has no share preview.

### 1.6 Anti-slop violations already in the code

These are called out because the brief bans them going forward and they must be removed, not
merely not-repeated.

**A-35. Decorative floating blobs.** `.divisionGrid>button:after` (`styles.css:2`) — a
250 × 250 px radial-gradient circle bled off the bottom-right corner of all 21 division tiles.
It carries no information.

**A-36. Glassmorphism by default.** `.topbar{backdrop-filter:blur(18px)}` and
`.matchEnd{backdrop-filter:blur(14px)}` (`styles.css:2`, `match.css:7`). The topbar blur forces a
full-width backdrop rasterisation on every scroll frame of a 35,000-element page.

**A-37. AI-SaaS landing-page rhythm.** `overview()` (`app.js:29`) is: oversized hero + two
buttons → a 4-up metrics strip (`1,134 / 54 / 28 / 21`) → a 3-column feature grid. That is the
default template. This is the front door of a *game*; it should offer "resume your match",
"your doctrine", "browse the canon" — not conversion-funnel furniture.

---

## 2. Information architecture and flows

### 2.1 Route map (required)

**IA-1.** The app must own its URL. Hash routing (no server config needed, works on Vercel
static):

| Route | Screen |
| --- | --- |
| `#/` | Front door |
| `#/codex` | Codex browser |
| `#/codex?d=6&f=Weapon&q=lance&sort=cost` | Filtered Codex (all filter state in the query) |
| `#/codex/D06-WEAPON-S03-06` | Codex with the card detail panel open on that card |
| `#/deck` | Deck construction |
| `#/match` | Active match (mulligan / board / result are phases, not routes) |
| `#/rules` | Rules primer + glossary |

**IA-2.** Filter/search/selection state must serialise to the query string, restore on load, and
push history entries for *navigations* (view change, card open) but **replace** for
*refinements* (typing in search) so Back does not walk backwards through 12 keystrokes.

**IA-3.** An in-progress match must survive reload. Serialise `state.match` to
`sessionStorage` under `collectiveCodex.match.v1`; on load, offer "Resume match" rather than
silently restoring (the state is large; validate before trusting it, mirroring the defensive
pattern in `deck-store.js:48-56`).

### 2.2 First run

**IA-4.** On first visit (`localStorage` key `collectiveCodex.onboarding.v1` absent) the front
door leads with a single primary action: **"Learn the basics — 90 seconds"**, secondary
"Browse the Codex". Never open the deck builder as a first experience.

**IA-5.** The primer is four panels, each one screen, each with a live miniature of the real UI
(not illustrations):
1. **The Core.** Both sides start at 20. Reduce theirs to 0. *Shows the Core HUD.*
2. **Three lanes.** Vanguard, Conduit, Flank resolve independently. *Shows an empty board.*
3. **Three resources.** Command / Insight / Essence refill to `min(8, turn+1)` each turn
   (`match-engine.js:17-21`); every card costs some of each. *Shows the resource HUD with a card
   selected and the ghost-spend preview.*
4. **Power is both.** A unit's power is its attack **and** its remaining durability
   (`docs/match-rules.md:39`). *Shows one clash, animated once.*

**IA-6.** After the primer, the first match must run in **coached mode**: three
non-blocking coach marks — (a) "pick a card", (b) "drop it in a lane", (c) "ending your turn
resolves all three lanes and plays the rival's whole turn". Each dismisses on completion of the
action it describes. Coached mode is skippable and never repeats.

**IA-7.** A `#/rules` glossary page must exist, linked from the footer and from every glossary
term. Terms that must be defined and must be popover-linked *everywhere they appear*: Core,
Command, Insight, Essence, lane, Vanguard/Conduit/Flank, entity, support, exhausted, infected,
Guard, Flying, breakthrough, refresh, channel, mulligan, doctrine. Source of truth is
`docs/match-rules.md` — do not fork the wording.

### 2.3 Codex browsing at 1,134-card scale

**IA-8.** Screen hierarchy, in order:
1. **Result count + active filter chips** (removable). The count is the primary orientation
   device at this scale.
2. **Search** (single field, matches name / rules / id / division / family / keyword).
3. **Structural filters**: division rail (21 + All), family, rarity, cost band, set.
4. **Sort**: Division order (default) · Name · Total cost · Power · Rarity · Set.
5. **The grid.**
6. **Card detail panel** (right-side drawer at ≥1200px, full-screen sheet below that).

**IA-9.** The grid tile shows **only** what distinguishes one card from another. Measured: only
**726 distinct `rulesText` strings exist across 1,134 cards** — cards of the same family share
rules text verbatim. Rendering that paragraph 1,134 times at 9.4px is noise. The tile carries:
art, name, division glyph + 2-digit index, family glyph, cost triad, power, rarity mark. Rules
text lives in the detail panel only.

**IA-10.** Grouping must be available: "Group by division" and "Group by family" insert sticky
section headers with per-group counts. At 1,134 items, ungrouped infinite scroll is a maze.

**IA-11.** The detail panel must satisfy the full card front contract (`README.md:62-76`) plus:
`subtype`, `duration`, `timing`, `targeting`, `counterplay`, all keywords, the division doctrine
line, the set/sheet label, and a **"how this behaves in a match"** block quoting the engine's
deterministic interpretation for that family from `docs/match-rules.md:51-81`. Add: "Add to
doctrine" (with current deck count), "Copy card link", prev/next navigation within the current
filtered result set.

### 2.4 Deck construction

**IA-12.** Three-pane layout: **pool** (left/main) · **deck** (right rail, sticky) ·
**analysis** (bottom of the right rail, always visible, never a modal).

**IA-13.** The deck rail must show, at all times:
1. `n / 30` with a segmented progress bar.
2. **Cost curve** — a 0–9+ histogram of total cost, with the resource curve
   (`min(8, t+1)`) overlaid so "turn 3 is a 4-drop turn" is visible.
3. **Entity / support / immediate split** with the engine's own categories
   (`match-engine.js:8-10`) and a warning band when entities < 12 (a deck that cannot hold a
   lane) or when Item/Action/Weapon count > entity count (cards that will be unplayable per
   `match-engine.js:120`).
4. **Division spread** — a 21-segment bar.
5. The list, removable, grouped by family, sorted by cost.

**IA-14.** Validation must be *predictive*, not terminal. `startMatch` (`app.js:59`) currently
throws a notice at launch time. Instead, surface deck problems continuously as
warnings (yellow, non-blocking) and one error (red, blocks launch: "≠ 30 cards"). Warning
copy must state consequence, not rule: "Only 6 entity cards — you will have nothing to hold
lanes with after turn 3."

**IA-15.** Multiple saved decks with names, plus an import/export deck code (a compact,
copy-pasteable string of card IDs). P2, but design the storage key for it now
(`collectiveCodex.decks.v2` as an array; migrate from `.activeDeck.v1`).

### 2.5 Pre-match

**IA-16.** A pre-match screen (currently absent — `startMatch` jumps straight into mulligan)
showing: your doctrine's curve and division spread, the rival's declared bias (Kinetic Edge /
Terra Axis / Gaia Synthesis — `app.js:59`), the match rules in one line each (20 Core, 3 lanes,
30 cards, resources `min(8, turn+1)`), and **Begin**.

**IA-17.** Mulligan screen must state the cost: "Replaced cards go to the **bottom of your
deck** and you draw that many new ones." One primary action whose label reflects state
("Keep this hand" / "Replace 2 cards"), one secondary ("Back to deck"). Delete the duplicate
button (A-21).

### 2.6 In-match

**IA-18.** The board must fit one viewport at ≥1024×700 with **no page scroll**. Fixed regions,
top to bottom:

```
┌───────────────────────────────────────────────────────────────┐
│ RIVAL   Core ████████████░░░░░░ 12/20   hand 4  deck 21       │  rival HUD
├───────────────────────────────────────────────────────────────┤
│  VANGUARD          │  CONDUIT           │  FLANK              │  rival supports
│  [unit][unit]      │  [unit]            │  —                  │  rival units
├════════════════════╪════════════════════╪═════════════════════┤  the seam:
│  pwr 11  ▸▸ 4      │  pwr 6  ◂◂ 9       │  ▸▸ 7 open          │  lane verdict
├────────────────────┼────────────────────┼─────────────────────┤
│  [unit][unit][unit]│  [unit][unit]      │  —                  │  your units
│  [Defense][Base]   │  —                 │  [Trap]             │  your supports
├───────────────────────────────────────────────────────────────┤
│ YOU  Core ████████████████░░ 16/20   C●●●○○ I●●●●○ E●●○○○     │  your HUD
├───────────────────────────────────────────────────────────────┤
│ HAND  [card][card][card][card][card]        [ End turn ⏎ ]    │  hand tray
└───────────────────────────────────────────────────────────────┘
                                              log rail (collapsible, right)
```

**IA-19.** The **seam** is the most important new element. For each lane it must show, without
the player doing arithmetic: total attacking power on each side, the direction and size of the
damage that will land if the turn ends now, and whether the lane is open (no defenders → Core
damage) or contested. This is the board-reading device the game currently lacks entirely.

**IA-20.** The log is a right rail, collapsible, **grouped by turn**, newest turn at top but
events within a turn in chronological order (the engine currently unshifts single lines —
`match-engine.js:27`). It must show every event of the current turn (never truncate to 14) and
support "jump to turn". Each entry carries an icon matching its event type (§4.2) so it is
scannable.

**IA-21.** Card inspection must not reflow the board. The inspector becomes an overlay panel
anchored to the inspected element, dismissible with Escape.

### 2.7 Post-match

**IA-22.** The result screen must include, below the outcome: turns played, Core swing chart per
turn, the three highest-damage events with the cards responsible, cards never drawn, cards that
sat in hand unplayed for ≥3 turns (a direct read on curve problems), and actions: **Rematch
(same deck)** · **Edit doctrine** · **Back to Codex**. It is a `role="dialog"` with focus trap
and Escape.

---

## 3. Interaction specification

### 3.1 Keyboard map (complete, required)

Global — always active unless a text field has focus:

| Key | Action |
| --- | --- |
| `?` | Open keyboard help sheet (lists this table, generated from one source of truth) |
| `Esc` | Close top-most overlay → else clear selection → else blur field |
| `/` | Focus search (Codex, deck pool) |
| `g` then `c` / `d` / `b` / `r` | Go to Codex / Deck / Battlefield / Rules |
| `Tab` / `Shift+Tab` | Move between **regions**, not between 1,134 cards (§3.2) |

Codex grid (roving tabindex — the grid is **one** tab stop):

| Key | Action |
| --- | --- |
| `←` `→` `↑` `↓` | Move the grid cursor by one cell / one row |
| `Home` / `End` | First / last card in the current group |
| `PageUp` / `PageDown` | One viewport of rows |
| `Enter` / `Space` | Open detail panel for the focused card |
| `a` | Add focused card to the doctrine (toast confirms, with Undo) |
| `[` / `]` | Previous / next card while the detail panel is open |

Deck builder: `Enter` add · `Delete` / `Backspace` remove focused deck entry ·
`Shift+Delete` clear deck (still confirms).

Match — the whole match must be completable with these keys alone:

| Key | Action |
| --- | --- |
| `1`–`9`, `0` | Select hand card *n* (0 = 10th). Repeat press deselects. |
| `←` `→` | Move the lane cursor (Vanguard ↔ Conduit ↔ Flank) |
| `a` `s` `d` | Jump the lane cursor directly to lane 1 / 2 / 3 |
| `Enter` | Commit the selected card into the lane under the cursor |
| `i` | Inspect the focused unit / support / hand card |
| `Tab` | Cycle regions: hand → your lanes → seam → rival lanes → log → HUD |
| `↑` `↓` | Move within the focused region |
| `e` | End turn (opens the confirm, see IX-11) |
| `l` | Focus the log rail |
| `Esc` | Cancel selection / close inspector / close overlay |

**IX-1.** Every keyboard action must have a visible counterpart; no keyboard-only features.
**IX-2.** Key hints appear on the controls themselves once the user has used any keyboard
command in the session (the End-turn button reads `End turn ⏎` from that point).
**IX-3.** No single-key shortcut fires while focus is inside `input`/`select`/`textarea`.

### 3.2 Focus model

**IX-4.** Exactly one skip link, first in tab order: "Skip to card grid" / "Skip to board".
**IX-5.** Composite widgets (Codex grid, hand tray, lane rows, deck list) use roving
`tabindex="0"`/`-1` so each is a single tab stop.
**IX-6.** Route change moves focus to the new view's `<h1>` (which must be `tabindex="-1"`)
and announces the view name via a polite live region.
**IX-7.** Opening an overlay stores the trigger, traps focus, and restores to the trigger on
close. Escape always closes.
**IX-8.** Focus indicator is identical everywhere and legible on every surface including the
21 division accents: `outline: 2px solid var(--focus)` (`#00D9B5`, 10.9:1 on navy) with
`outline-offset: 2px` and `box-shadow: 0 0 0 4px var(--bg)` behind it so the ring reads against
both the card fill and the page. Never remove the ring on `:focus-visible`. Cards must not use
`overflow:hidden` in a way that clips their own focus ring (`styles.css:2` currently does).

### 3.3 State matrix for every interactive element

Applies to card tiles, lane drop zones, hand cards, buttons, filter chips, deck entries:

| State | Requirement |
| --- | --- |
| Rest | Hairline border `--line`; no shadow. |
| Hover | Border → division `edge` tone; `translateY(-2px)` (cards only); 90 ms. **Must be inside `@media (hover:hover)`** so touch devices never latch it. |
| Focus-visible | Ring per IX-8. Independent of hover; both may show. |
| Press / active | `scale(0.985)`, 60 ms, no translate. Required on every button — currently absent everywhere. |
| Selected | 2px division `edge` border + a **filled corner tab** + `aria-selected`/`aria-pressed`. Never opacity. |
| Disabled | `--text-dim` (≥4.5:1) + hatched 4px diagonal overlay at 6% + `aria-disabled="true"` (keep it focusable so the reason is reachable) + the reason rendered as text, never in `title`. |
| Loading | Static placeholder block at the final size; no shimmer, no spinner under 400 ms. |
| Invalid drop target | 1px `--danger` dashed border + a "✕" badge + reason on the seam. |

### 3.4 Drag and drop

**IX-9.** Pointer Events (not HTML5 DnD — it cannot be styled reliably and does not work on
touch). Drag threshold 6 px or 120 ms long-press on touch. On drag start:
- Compute `getPlayability(match,'player',handIndex,lane)` for **all three lanes once** and mark
  each lane zone valid/invalid, with the invalid reason printed in the zone (this is the
  natural home for the strings currently stranded in `title` — A-15).
- Lift the card 6 px, 3° rotation max, 92% opacity ghost, cursor `grabbing`.
- Dim non-target chrome by 30%, never blur it.

**IX-10.** Drop on a valid lane commits. Drop elsewhere or `Esc` cancels and the card returns to
its hand slot with a 180 ms spring. **Tap-card-then-tap-lane must remain fully supported** and is
the canonical path for touch and for the keyboard equivalent (`1`–`0` then `a`/`s`/`d` then
`Enter`). Drag is an accelerator, never the only way.

### 3.5 Confirmable vs. instant

| Action | Model |
| --- | --- |
| Add / remove a card from deck | **Instant**, with a 5 s Undo in the toast |
| Filter, sort, search, select, inspect | **Instant**, no confirmation, no toast |
| Play a card into a lane | **Instant** (it is legal or it is not — the engine already validates) |
| End turn | **Confirm inline**, not a modal: the button becomes a two-step "End turn → Confirm (⏎)" with a 400 ms arm delay and a summary of what will resolve ("3 lanes resolve · 11 damage projected"). Escape or 3 s of inactivity disarms. |
| Clear deck / Restore starter over a non-empty deck | **Modal confirm** naming what is lost ("Discard your 30-card doctrine?") + Undo toast after |
| Reset / abandon match | **Modal confirm** |
| Leaving the app mid-match | `beforeunload` guard only while a match is in progress |

### 3.6 Notification model (replaces `state.notice` entirely)

**IX-11.** Four channels, never mixed:

1. **Inline field error** — attached to the control that failed, persists until resolved,
   `aria-describedby` on the control. Used for: deck validation, illegal filter combinations.
2. **Contextual reason** — rendered *in the place the action would have happened* (the lane zone,
   the hand card). Used for: every `getPlayability` rejection. Not a toast.
3. **Toast** — transient confirmations and undoable actions. Bottom-centre on the board,
   bottom-right elsewhere. Max 3 stacked, 4 s (7 s if it has an Undo), pause on hover/focus,
   dismissible, `role="status" aria-live="polite"`. Never used for anything blocking.
4. **Dialog** — destructive confirmation only. `role="alertdialog"`, focus trapped, Escape
   cancels, primary action is *not* focused by default.

**IX-12.** Errors thrown by the engine (`playCard` at `match-engine.js:171`,
`completePlayerTurn` at `:233`, `mulligan` at `:93`) must be caught and mapped to channel 2 with
human copy, and additionally logged to console with the raw message. They must never be
swallowed by a subsequent render (A-14).

### 3.7 Empty and error states

Every one of these must be designed, not defaulted:

| Condition | Content |
| --- | --- |
| Search yields 0 cards | "No cards match **"xyz"** in *Kinetic Edge · Weapon*." + the two filters as removable chips + "Clear all filters" + 4 nearest matches by name distance |
| Deck empty | The three fastest paths: "Restore starter doctrine", "Filter by a division", "Learn deck-building" — not a shrug |
| Hand empty | "No cards in hand — you draw 1 at refresh." + deck count |
| Lane empty (yours) | Ghosted slot outline showing capacity `0/3` |
| Lane empty (rival) | "Open — attacks here hit the Core" (this is *good news* and must read as such) |
| Deck exhausted | Explicit state; the engine silently no-ops (`match-engine.js:28`) |
| Log empty | "The match log records every trigger, clash and point of damage." |
| Atlas failed to load / decode | Division glyph on the division `deep` tint, at 40% size, centred — never a broken image box and never an empty rectangle |
| localStorage unavailable | Silent fallback to in-memory (already handled in `deck-store.js:59`), plus one dismissible notice: "Your doctrine won't be saved in this browser." |
| Reduced data / slow atlas | Cards render fully with the glyph fallback and swap to art on decode |

---

## 4. Motion specification

**Principle: motion explains a state change that already happened.** The DOM is updated to the
final state **first**; animation is applied on top of that final state (FLIP for movement, ghost
elements for departures). Consequences: skipping an animation can never produce a different
board; input is never queued behind a timeline; a mid-animation click is always interpreted
against the true state.

### 4.1 Tokens

```
--dur-instant : 60ms    press feedback
--dur-fast    : 120ms   hover, focus, toggle, tooltip
--dur-base    : 200ms   panel/chip enter, selection
--dur-move    : 280ms   card travel, FLIP reflow
--dur-beat    : 420ms   a consequential event (death, core damage)
--dur-scene   : 520ms   match-end overlay

--ease-out    : cubic-bezier(0.16, 1, 0.30, 1)    entering, arriving
--ease-in     : cubic-bezier(0.40, 0.00, 1, 1)    leaving
--ease-move   : cubic-bezier(0.20, 0.00, 0.00, 1) travelling between two known points
--ease-snap   : cubic-bezier(0.34, 1.30, 0.64, 1) return-to-hand only, overshoot ≤ 4%
```

**MO-1.** Only `transform`, `opacity`, and `filter: none→blur` on ghosts may be animated.
Animating `width`, `height`, `top/left`, `box-shadow`, `background-position` or `border-color`
across many nodes is prohibited.
**MO-2.** No animation may exceed `--dur-scene`. No looping animation exists anywhere in the
product except the (bounded) Legendary foil sweep on hover, and the indeterminate-progress bar
if one is ever needed.
**MO-3.** Total resolution timeline for one End-turn is capped at **2,400 ms** including all
rival plays. If the event list would exceed that, per-event durations scale down proportionally
to a floor of 40% before events are batched (e.g. three simultaneous clashes play as one).
**MO-4.** A persistent **Skip** control is visible during any timeline > 600 ms, bound to
`Esc` and to `Space`. Any other input also fast-forwards.

### 4.2 Required engine change: a structured event stream

`match-engine.js` currently emits only prose strings (`addLog`, `:27`). The UI cannot animate
prose. Add — **purely additively, no behaviour change** — `state.events`, appended at the same
call sites:

```js
{ seq, round, turn, type, side, lane, uid, cardId, amount, from, to, meta }
```

| `type` | Emit at | Payload notes |
| --- | --- | --- |
| `draw` | `draw()` — `match-engine.js:28` | `side`, `count` |
| `play` | `playCard()` — `:177` | `side`, `lane`, `cardId`, `cost` (effective, so the UI can show the Environment discount — A-19) |
| `deploy-trigger` | `triggerDeployMutable()` — `:130-139` | `meta.kind` ∈ `trap` \| `adapt` \| `pressure` \| `inspect` \| `disable` \| `keyword` |
| `combat-clash` | pairing loop — `:215-219` | `attackerUid`, `defenderUid`, `lane`, `dealtToD`, `dealtToA` |
| `unit-destroyed` | `pruneDead()` — `:32` | `side`, `lane`, `uid`, `cardId` |
| `core-damage` | `dealCoreDamageMutable()` — `:49-51` | `side` (the one hit), `lane`, `amount`, `coreAfter` |
| `damage-prevented` | same fn — `:47`, `:50` | `amount`, `meta.source` ∈ `defense` \| `reaction` |
| `match-end` | `checkWinner()` — `:33` | `winner` |

Recommended additional types (same cost, large clarity gain): `resource-gain` (`:86`),
`lane-shift` (`:148`, `:197`), `infect` / `plague-tick` (`:195`), `ritual-tick` (`:196`),
`discard` (`:190`), `refresh` (`:72`).

**MO-5.** Events are pure data with no DOM knowledge. The UI consumes
`state.events.slice(lastRenderedSeq)`. The prose log stays exactly as it is — it becomes the
accessible narration track (§5.4) and the two must never disagree.

### 4.3 Named animations

| Name | Trigger | Spec | Reduced-motion |
| --- | --- | --- | --- |
| `card-lift` | select in hand | `translateY(-10px) scale(1.02)`, `--dur-fast`, `--ease-out`; sibling cards shift 4 px apart | border + corner tab only, no transform |
| `card-play` | `play` | FLIP from the hand slot to the lane slot, `--dur-move`, `--ease-move`; rotation from the hand fan resolves to 0°; the lane slot expands from 0.92 scale as the card lands | opacity 0→1 over 100 ms at the destination |
| `deploy-trigger` | `deploy-trigger` | 200 ms pulse of a 2px division-`ink` ring expanding from the unit, opacity 0.9→0; `trap` variant instead flips the trap chip face-up (240 ms, `rotateY`) before the pulse | the ring appears at final size for 200 ms, no scale; trap flips instantly with a 100 ms fade |
| `combat-clash` | `combat-clash` | attacker lunges 10 px toward the seam (140 ms `--ease-in`), returns (160 ms `--ease-out`); both cards flash their damage chip at the moment of contact; lanes stagger by 80 ms | no lunge; damage chips appear simultaneously and hold 400 ms |
| `damage-chip` | any damage | a `-4` chip rises 14 px and fades, 420 ms, mono, `--danger` on the unit that took it | appears in place, holds 500 ms, then fades 120 ms |
| `unit-destroyed` | `unit-destroyed` | card desaturates to 0 (160 ms), fractures — a 2-piece clip-path split — and falls 24 px with 8° rotation into the discard indicator, 420 ms total, `--ease-in` | 160 ms fade to 0 opacity; the discard counter increments with a 1-frame highlight |
| `core-damage` | `core-damage` | the Core bar's segments extinguish left-to-right, 60 ms per segment, max 400 ms; the numeral counts down; the HUD shakes `translateX` ±3 px, 2 oscillations, 180 ms — **only when the damaged side is the player** | segments and numeral update instantly with a 300 ms `--danger` outline flash on the HUD; no shake, ever |
| `damage-prevented` | `damage-prevented` | a hexagonal shield outline flares on the Defense chip, `scale(0.9→1.06→1)`, 260 ms, `--ok` colour, with a `+2 prevented` chip | chip only |
| `draw` | `draw` | card slides from the deck indicator into the hand, 240 ms `--ease-out`, hand re-fans with FLIP | new card fades in at its final slot, 120 ms |
| `lane-verdict` | end of each lane's resolution | the seam's arrow for that lane grows to its final magnitude, 200 ms | value set instantly |
| `match-end` | `match-end` | board dims to 35% (300 ms), overlay panel rises 16 px and fades in, 520 ms `--ease-out`; the losing Core bar empties last | dim + overlay cross-fade, 160 ms |
| `toast-in/out` | notifications | in: `translateY(8px)`→0 + fade, 180 ms `--ease-out`. out: fade + `translateY(-4px)`, 140 ms | fade only |
| `foil-sweep` | Legendary card, hover/focus | a 1.2 s single-pass linear-gradient sweep across the nameplate at 12% max opacity. **Once per hover**, never looping | not rendered |

**MO-6.** `@media (prefers-reduced-motion: reduce)` must collapse *movement*, never
*information*. Damage chips, prevented chips, counters, the order of events, and the Skip control
all survive. Per-event duration compresses to 80 ms and total timeline to ≤ 800 ms.
**MO-7.** Reduced-motion is implemented as a single `--motion-scale: 1 | 0` custom property plus
one media block, not as scattered per-component overrides.
**MO-8.** A user-facing "Reduce animation" toggle in settings must exist and must override the
OS preference in both directions (`localStorage: collectiveCodex.motion.v1`).
**MO-9.** No animation may run on more than ~24 elements simultaneously. Codex grid entrance
animations are prohibited outright — the grid appears, it does not cascade in.

---

## 5. Visual direction

The existing language is correct in kind and wrong in calibration. Keep: deep navy ground, amber
gold as the single authority colour, teal as the live/system colour, hairline rules, two
typefaces, monospace for anything numeric, hard corners on panels and soft corners on cards.
Change: everything is too small, too dim, and too evenly weighted — there is no hierarchy because
every element is a 6px uppercase mono label in a hairline box.

### 5.1 Type

Two families, permanently. **Space Grotesk** (names, headings, UI labels, body) and **JetBrains
Mono** (all numerals, IDs, costs, power, resource pips, log). A third face is banned.

**VD-1.** Self-host both as WOFF2, Latin subset, weights 400/500/700 (Grotesk) and 400/700
(Mono). Remove the Google `@import` (`styles.css:1`). Use `font-display: swap` and declare
`size-adjust`/`ascent-override` on the fallback so the swap does not reflow.

**VD-2.** Type scale (16px root, no clamp below `--t-500`):

| Token | Size | Line | Tracking | Use |
| --- | --- | --- | --- | --- |
| `--t-display` | `clamp(2.75rem, 6vw, 5rem)` | 0.92 | −0.045em | One per screen, maximum |
| `--t-900` | 2.25rem / 36px | 1.05 | −0.03em | Screen `h1` |
| `--t-800` | 1.75rem / 28px | 1.1 | −0.02em | Panel titles, Core numeral |
| `--t-700` | 1.375rem / 22px | 1.2 | −0.01em | Card name, detail panel |
| `--t-600` | 1.125rem / 18px | 1.35 | 0 | Lead paragraph |
| `--t-500` | 1rem / 16px | 1.55 | 0 | Body, rules text |
| `--t-400` | 0.875rem / 14px | 1.5 | 0 | Secondary body, log |
| `--t-300` | 0.8125rem / 13px | 1.4 | 0.02em | Dense data, chips |
| `--t-200` | 0.75rem / 12px | 1.35 | 0.08em | **Floor.** Uppercase mono labels only |

**VD-3. Hard floor: 12px.** No declaration anywhere may compute below 12px. Every size listed in
A-26 is deleted. **Density is managed by removing fields, not by shrinking type** — see the card
anatomy below.
**VD-4.** Uppercase + letter-spacing is reserved for `--t-200` labels and nav. Card names, rules
text and log lines are sentence case.
**VD-5.** Numerals use `font-variant-numeric: tabular-nums` everywhere they can change (Core,
power, costs, counts) so nothing jitters when a value ticks.

### 5.2 Space, line and radius

**VD-6.** 4px base scale: `2, 4, 8, 12, 16, 24, 32, 48, 64, 96` as `--sp-*`. No arbitrary values.
**VD-7.** Radius: `--r-0: 0` (panels, chips, the grid — the product's structure is orthogonal),
`--r-card: 12px` (cards only), `--r-pill: 999px` (resource pips only). The current mix of 14/10/8
across `.codexCard`, its `:before`, and `.rules` reads as three unrelated systems.
**VD-8.** One line weight: 1px. Depth comes from line *colour*, not line thickness.

### 5.3 Surface and depth

Flat, layered, printed — not glassy. **Blur is banned as a surface treatment** (A-36); the only
permitted blur is the 2px backdrop dim behind a modal, and even that is optional.

```
--bg        #050A18   page ground (unchanged)
--surface-1 #0A1122   panels, rails, the board bed
--surface-2 #0E1730   raised: cards, chips, tiles
--surface-3 #14203C   hover/active raise, selected rows
--line      #1E2C4C   default hairline (1.5:1 — structural only, never a border for meaning)
--line-hi   #2C3E66   emphasised hairline, section edges  (2.1:1)
--edge-gold rgba(212,168,67,.42)  authority edges: topbar, board frame, primary CTA
```

**VD-9.** Elevation is a 4-step ladder — `flat` (no shadow) → `raise` (`0 2px 8px
rgba(0,0,0,.4)`) → `lift` (`0 8px 24px rgba(0,0,0,.45)`, cards on hover/drag only) → `scene`
(`0 24px 64px rgba(0,0,0,.55)`, modal only). Maximum **two** shadow layers per element. The
current `0 22px 50px` on every card hover across 1,134 cards is deleted.
**VD-10.** Exactly one ambient light effect exists in the product: the existing single top
vignette on `body` (`styles.css:2`). No additional radial gradients, glows, orbs, or blobs.
`.divisionGrid>button:after` (A-35) is deleted.

### 5.4 The 21 division colours — normalisation, not a rainbow

The problem is measurable (A-27): an 8.1× contrast spread, seven accents illegible, five accents
louder than the primary text. And colour *cannot* identify a division even in principle — after
hue analysis, five pairs sit within 4° of each other:

| Pair | Hue separation |
| --- | --- |
| ZenFlow ↔ Quantum Ledger | **0.3°** (identical violet) |
| Signal Velocity ↔ Civic Core | 1.6° |
| Vector Shift ↔ Obsidian Arc | 2.6° |
| Terra Axis ↔ Nexus Labs | 2.9° |
| Kinetic Edge ↔ Gaia Synthesis | 3.2° |

**VD-11. Colour is never the primary identifier of a division.** Every division reference
carries a **glyph + zero-padded 2-digit index** (`✦01`, `⚔06`, `⛏11`). Both already exist in the
canon (`card-canon.js:2-22`, and `app.js:29` already pads the index — adopt it everywhere).
Colour is the *third* signal.

**VD-12. Six doctrine bands.** The eye can hold six categories, not twenty-one. Every division
belongs to a band; the band is what you perceive at grid scale, the glyph+index is what you read
at card scale:

| Band | Divisions |
| --- | --- |
| **Ember** (6) | 05 Nexus Labs · 09 Signal Velocity · 10 Cognara Mind · 11 Terra Axis · 14 Aether Link · 16 Civic Core |
| **Amber** (4) | 01 Collective AI · 08 Juris Guard · 17 Nomad Nexus · 20 Eon Core |
| **Verdant** (4) | 03 The Collective · 06 Kinetic Edge · 12 Binary Loom · 19 Gaia Synthesis |
| **Aqua** (3) | 04 Hybrid Living · 18 Vital Helix · 21 Animus Prime |
| **Violet** (2) | 02 ZenFlow · 07 Quantum Ledger |
| **Steel** (2) | 13 Vector Shift · 15 Obsidian Arc |

**VD-13. Three tone tiers per division, derived once and frozen as tokens.** Canon colours in
`card-canon.js` are **not edited** — these are display tokens derived from them by converting to
OKLCH, pinning lightness per tier, and clamping chroma to `[0.05, 0.155]` so no division can
shout louder than another. Result: the ink tier spans **10.0:1 – 11.2:1** on navy (was 2.35–19.05).

```css
:root{
  /* tier use — ink: any text/glyph on navy · edge: 1–2px borders, rules, chips · deep: fills only, never text */
  --div-01-ink:#E3B753; --div-01-edge:#A97F00; --div-01-deep:#5C4300; /* 01 Collective AI   amber   ink 10.5:1 edge 5.4:1 */
  --div-02-ink:#C0B0FF; --div-02-edge:#8B71DA; --div-02-deep:#4C3781; /* 02 ZenFlow         violet  ink 10.2:1 edge 5.1:1 */
  --div-03-ink:#76D4AB; --div-03-edge:#3A9A74; --div-03-deep:#00563B; /* 03 The Collective  verdant ink 11.1:1 edge 5.7:1 */
  --div-04-ink:#6FC9FF; --div-04-edge:#0190CD; --div-04-deep:#004D71; /* 04 Hybrid Living   aqua    ink 10.8:1 edge 5.5:1 */
  --div-05-ink:#FEA196; --div-05-edge:#D35A50; --div-05-deep:#7C2621; /* 05 Nexus Labs      ember   ink 10.1:1 edge 5.0:1 */
  --div-06-ink:#6DD985; --div-06-edge:#2B9F4F; --div-06-deep:#005822; /* 06 Kinetic Edge    verdant ink 11.2:1 edge 5.8:1 */
  --div-07-ink:#C0B1FE; --div-07-edge:#8B71DA; --div-07-deep:#4B3781; /* 07 Quantum Ledger  violet  ink 10.3:1 edge 5.1:1 */
  --div-08-ink:#DBBA5F; --div-08-edge:#A2821E; --div-08-deep:#594500; /* 08 Juris Guard     amber   ink 10.5:1 edge 5.4:1 */
  --div-09-ink:#FF9FA4; --div-09-edge:#D35865; --div-09-deep:#7B2430; /* 09 Signal Velocity ember   ink 10.1:1 edge 5.0:1 */
  --div-10-ink:#FF9BBC; --div-10-edge:#CD5884; --div-10-deep:#772446; /* 10 Cognara Mind    ember   ink 10.0:1 edge 5.0:1 */
  --div-11-ink:#FFA099; --div-11-edge:#C9635E; --div-11-deep:#7C2525; /* 11 Terra Axis      ember   ink 10.1:1 edge 5.1:1 */
  --div-12-ink:#9FD15D; --div-12-edge:#699719; --div-12-deep:#355200; /* 12 Binary Loom     verdant ink 11.1:1 edge 5.7:1 */
  --div-13-ink:#A7C0DE; --div-13-edge:#7188A4; --div-13-deep:#38495D; /* 13 Vector Shift    steel   ink 10.6:1 edge 5.4:1 */
  --div-14-ink:#FEA385; --div-14-edge:#D15F37; --div-14-deep:#7A2909; /* 14 Aether Link     ember   ink 10.2:1 edge 5.1:1 */
  --div-15-ink:#A9C0DE; --div-15-edge:#7288A4; --div-15-deep:#39495D; /* 15 Obsidian Arc    steel   ink 10.6:1 edge 5.4:1 */
  --div-16-ink:#DCB1B2; --div-16-edge:#A27A7B; --div-16-deep:#5E3E3E; /* 16 Civic Core      ember   ink 10.3:1 edge 5.3:1 */
  --div-17-ink:#E3B382; --div-17-edge:#A97C4C; --div-17-deep:#663D05; /* 17 Nomad Nexus     amber   ink 10.4:1 edge 5.3:1 */
  --div-18-ink:#4AD7C4; --div-18-edge:#009B8C; --div-18-deep:#00544B; /* 18 Vital Helix     aqua    ink 11.1:1 edge 5.7:1 */
  --div-19-ink:#85D29B; --div-19-edge:#4D9965; --div-19-deep:#00572A; /* 19 Gaia Synthesis  verdant ink 11.0:1 edge 5.7:1 */
  --div-20-ink:#C7BE9A; --div-20-edge:#8F8664; --div-20-deep:#4E482F; /* 20 Eon Core        amber   ink 10.6:1 edge 5.4:1 */
  --div-21-ink:#24D4EF; --div-21-edge:#0097AB; --div-21-deep:#00515D; /* 21 Animus Prime    aqua    ink 11.0:1 edge 5.7:1 */
}
```

**VD-14. Colour budget: a division accent may appear in at most three places on any one card** —
(1) the 1px frame edge / corner brackets, (2) the division glyph, (3) the family mark. Not the
rules text, not the meta row, not the cost chips, not the footer (all currently coloured —
`styles.css:2` `.cardMeta`, `.ruleTop>b`). At grid scale the eye must see navy cards with a
coloured *edge*, not 1,134 coloured cards.
**VD-15.** The three resource colours are fixed and are **never** a division accent:
Command `#E3B753` (gold), Insight `#4AD7C4` (teal), Essence `#B9A6FF` (violet). Each also carries
its letter (`C`/`I`/`E`) and a distinct pip shape (▮ / ◆ / ●) so the triad survives colour
blindness — currently `#A78BFA` on `#00D9B5` at 6px with only a letter to tell them apart.
**VD-16.** Semantic colours, one each, never reused for decoration: `--danger #FF6B6B` (damage,
loss), `--ok #4AD7C4` (prevention, gain, live systems), `--warn #E3B753` (warnings, authority,
primary CTA — the existing gold), `--info #A7C0DE`.

### 5.5 Card frame anatomy

Three densities driven by **container queries** on the card element, not by media queries. Each
density *removes fields*; none shrinks type below 12px (VD-3).

**`card-xs` — grid tile (160–200px wide, 5:7)**
```
┌─ corner bracket ── rarity notch ──┐
│  ✦01              ◉ SPECIMEN      │  12px mono, division ink / silver
│ ┌───────────────────────────────┐ │
│ │           ARTWORK             │ │  55% of height
│ └───────────────────────────────┘ │
│  Aureate Chimera of              │  14px Grotesk, 2 lines max, ellipsis
│  the Last Horizon                │
│  ▮2 ◆1 ●0                  ⟨ 7 ⟩ │  12px mono costs · power in a bracketed cell
└───────────────────────────────────┘
```
7 fields. No rules text, no set label, no ID, no keyword tags, no timing/targeting.
**Element budget: ≤ 14 nodes** (down from 31 — A-2).

**`card-sm` — hand and deck pool (200–260px)** — adds family name, set label, and up to 2 keyword
chips. Rules text still absent.

**`card-lg` — detail panel / inspector (≥340px)** — the complete record: everything in
`README.md:62-76` plus subtype, duration, timing, targeting, counterplay, all keywords, the
division doctrine line, and the match-behaviour block (IA-11).

**VD-17.** Art fills a fixed 55% band with `object-fit`-equivalent framing and a 1px inner rule
in `--div-N-edge`. Given 80×80 sources (A-31), the art band must be treated as a **crest**, not a
photograph: render at ≤ 2× (i.e. ≤ 160px box), apply a subtle inner vignette to hide the upscale
edge, and never exceed 2× upscale in any density. This is a real constraint on layout width.
**VD-18.** The name field is the second-loudest element on a card after the art. Currently it is
12.5px inside a 56px header competing with a 7.4px division line and a 30px power box.
**VD-19.** Power sits in a bracketed cell at bottom-right, always mono, always tabular. When a
unit's effective attack differs from its base power (A-17), the cell shows `⟨7→9⟩` with the
delta in `--ok`, and the tooltip/inspector explains the source (weapon, buff, temp).

### 5.6 Rarity

**Rarity is nearly uniform in this canon** — measured: Common 233, Rare 235, Uncommon 231,
Legendary 219, Epic 216. A "jackpot" treatment would fire on 19% of all cards and would be a lie.

**VD-20.** Rarity is expressed as **frame construction**, escalating in *structure*, not in
*glow*:

| Rarity | Frame | Mark |
| --- | --- | --- |
| Common | Single 1px hairline, `--line-hi` | ○ |
| Uncommon | Hairline + notched top corners | ◔ |
| Rare | Double hairline (1px + 1px inset 3px) + 2 division-`edge` corner brackets | ◑ |
| Epic | Rare frame + 4 brackets + an engraved guilloche in the nameplate (repeating-linear-gradient, ≤ 4% opacity) | ◕ |
| Legendary | Epic frame + a solid 1.5px division-`edge` outer edge + a single-pass foil sweep on hover/focus only | ● |

**VD-21.** Rarity always carries its **word** in the detail panel and its **pip glyph** on the
tile. Never colour-only, never glow-only. No particles, ever.

### 5.7 Board composition

**VD-22.** The board is a bed (`--surface-1`) inside a 1px `--edge-gold` frame, with the three
lanes as equal columns separated by 1px `--line-hi` rules that run the full height — so a lane
reads as a vertical column of conflict, top to bottom.
**VD-23.** Rival territory is tinted 3% cooler and player territory 3% warmer than the bed; the
seam (IA-19) is the only gold-edged horizontal element on the board. This is the entire
"whose side is this" system — no textures, no perspective, no 3D tilt.
**VD-24.** Unit tiles on the board are `card-xs` minus the art band's bottom half — power,
name (1 line), status chips. Status chips are **text + icon**: `EXHAUSTED ⏾`, `INFECTED ☣`,
`GUARD ⛨`, `FLYING ⌃`, `WEAPON +2 ⚔`. Never opacity alone (A-29).
**VD-25.** Face-down rival traps render as a distinct back-face (division-agnostic: navy,
gold hairline, `⌖` glyph, "SET") — visually a *card back*, not a greyed card, and exposed to
assistive tech as "Face-down support, unknown" (A-23).

### 5.8 Core and resource HUD

**VD-26.** Core = a 20-segment bar + a `--t-800` tabular numeral + `/20`. Segments extinguish
right-to-left. Below 6, the bar's remaining segments take `--danger` and a `CRITICAL` label
appears (text, not just colour).
**VD-27.** Resources = three labelled pip rows: `C ▮▮▮▯▯  3/5`. Available pips filled, spent
pips hollow, cap visible. When a hand card is selected, the pips it would consume render as
**ghost pips** (dashed outline) — the player sees affordability *before* choosing a lane (fixes
A-16). If a lane's Environment discount applies (`match-engine.js:102`), the ghost preview shows
the reduced cost with the printed cost struck through (fixes A-19).
**VD-28.** The player's resource HUD and a card's printed cost must never share a component or a
styling (A-16). Costs are chips on a card; resources are pip rows in the HUD.
**VD-29.** Deck / hand / discard counts are one row of three labelled mono counters, clickable —
discard opens a scrollable list (currently the discard pile is unreachable).

### 5.9 Anti-slop rules (binding)

**VD-30.** Banned outright, in review: purple-blue default gradients; glassmorphism / backdrop
blur as a surface; floating decorative blobs, orbs or glows; generic icon-trio feature rows;
hero → 4-up metrics → 3-column features section rhythm; a third typeface; any animation that does
not encode a state change; skeleton shimmer; drop shadows with more than two layers; emoji as UI
iconography; centred marketing copy on any gameplay screen; "AI-generated abstract" background
imagery.
**VD-31.** Every visual decision must be defensible with the sentence *"this makes the board
state faster to read."* If it cannot be, it is decoration and it is cut.
**VD-32.** The front door is rebuilt as a game front door (A-37): resume match / your doctrine
(curve + division spread) / continue browsing where you left off / one canonical hero card. The
metrics strip may survive only as a single line of type in the footer.

---

## 6. Accessibility

Target: **WCAG 2.2 Level AA**, with the additional product requirement that a full match is
completable with keyboard only and with a screen reader only.

**AX-1.** Text and UI text ≥ **4.5:1**, including all 12px mono labels (no large-text exemption
is claimed anywhere). Non-text UI, borders that carry meaning, focus rings, and graph elements
≥ **3:1**. The `--div-*-ink` tier (VD-13) is the only permitted division tone for text.
**AX-2.** Disabled controls must still meet 4.5:1 (`opacity:.42` is deleted — A-27); disabled
state is conveyed by colour token + hatch + `aria-disabled`, and disabled controls remain
focusable so their reason is reachable.
**AX-3.** Focus indicator per IX-8; verified against navy, `--surface-2`, gold CTA, and all 21
`--div-*-deep` fills.
**AX-4.** Semantics: cards become `<article>` inside a `role="grid"` with `role="row"` /
`role="gridcell"`, containing exactly one focusable control. All decorative internals get
`aria-hidden="true"`. The accessible name is authored, not flattened (fixes A-24):

> `"{name}. {division} {NN}, {family}. Cost {c} command, {i} insight, {e} essence. Power {p}. {rarity}."`
> → *"Aureate Chimera of the Last Horizon. Collective AI 01, Specimen. Cost 2 command, 1 insight,
> 0 essence. Power 7. Common."*

Rules text is exposed via `aria-describedby` on the detail panel, not in the name.
**AX-5.** Landmarks: one `<header role="banner">`, one `<nav>` with `aria-current="page"`, one
`<main>`, one `<footer role="contentinfo">`, and on the board four labelled `<section>`s
(`aria-label`: "Rival board", "Lane resolution", "Your board", "Your hand").
**AX-6.** Live regions:
- Match log: `role="log" aria-live="polite" aria-relevant="additions"`, entries appended in
  chronological order. The engine's existing prose (`match-engine.js:27`) is the narration text —
  it is already well written for this purpose.
- Damage to the player's Core, and match end: `aria-live="assertive"`.
- Toasts: `role="status"`.
- **Rate limit:** during an End-turn resolution, announce a *turn summary* first ("Rival turn:
  you took 7 Core damage, lost 2 units, Core 13 of 20"), then the detailed entries. Never fire
  20 assertive announcements.
**AX-7.** A **"Read board state"** control (and `b` shortcut) composes one string per lane:
*"Vanguard: rival 2 units, strongest Wyrm power 8. You 3 units, total power 11. No rival
defenders in Flank — your attacks there hit their Core."* This is the screen-reader equivalent of
the seam (IA-19) and is a hard requirement for AX-9.
**AX-8.** Colour independence — every one of these must carry a non-colour signal:
division (glyph + 2-digit index), rarity (word + pip), resource type (letter + pip shape),
damage vs. heal (sign + icon), exhausted/infected/disabled (text chip + icon), lane legality
(icon + reason text), ownership (position + label, never tint alone).
**AX-9. Acceptance test, non-negotiable:** a complete match — deck load, mulligan, ≥ 6 turns of
play across all three lanes, and reaching a result — performed (a) with keyboard only, no mouse,
and (b) with VoiceOver or NVDA and the screen off. Both are release gates.
**AX-10.** Reduced motion per MO-6/7/8. `@media (forced-colors: active)`: all state that relies
on fill or opacity must fall back to `border-style` and `ButtonText`/`Canvas` system colours;
test the board and the Codex grid.
**AX-11.** Touch targets ≥ 24×24 CSS px (WCAG 2.5.8), ≥ 44×44 for anything on the board.
**AX-12.** 200% zoom and 320px width: no horizontal scroll, no content loss; the board reflows to
stacked lanes (the ≤900px rule already exists in `match.css:9` — keep it and test it at 400%).
**AX-13.** `lang="en"` is present; add `prefers-contrast: more` handling that swaps `--line` for
`--line-hi` and lifts all dim text one step.

---

## 7. Performance budget

Baseline hardware for all targets: a mid-tier 2021 laptop (4× 2.4 GHz) throttled 4× in DevTools,
and a mid-range Android phone. Network: Fast 3G for load metrics.

| Metric | Budget | Notes |
| --- | --- | --- |
| HTML + CSS + JS transfer | **≤ 70 KB gzip** — currently **over budget by ~36%** | Measured, not estimated: **95.0 KB gzip / 303 KB raw** (JS 78.1, CSS 15.8, HTML 1.0 gzip). The old "~66 KB uncompressed" figure was wrong in both the number and the unit, and it is what hid the overrun. There is no headroom: `match-engine.js` and `src/screen-match.js` are over half the JS between them. Re-measure with the command below after any change that adds a module — the number moves. |
| Fonts | **≤ 60 KB total**, 2 files, preloaded | Replaces the blocking Google `@import` (A-33) |
| First Contentful Paint | **≤ 1.0 s** | Must not wait on the atlas |
| Largest Contentful Paint | **≤ 1.8 s** | Atlas preloaded with `fetchpriority="high"` |
| Time to Interactive | **≤ 1.5 s** | |
| Cumulative Layout Shift | **≤ 0.02** | Font metric overrides + fixed card aspect ratios |
| Codex grid first paint after data ready | **≤ 250 ms** | |
| Keystroke → caret echo | **≤ 16 ms** | The input is never re-rendered. Non-negotiable (A-3) |
| Keystroke → filtered grid updated | **≤ 100 ms** | Prebuilt index; no debounce needed |
| Any other interaction → paint | **≤ 100 ms**, scripting ≤ 8 ms | Selection, filter, add-to-deck, inspect |
| End-turn full resolution + timeline | **≤ 2,400 ms**, skippable at any frame | MO-3 |
| Codex scroll | **≥ 55 fps sustained**, no frame > 32 ms | |
| DOM nodes, Codex | **≤ 2,500** at any moment | Currently 35,154 (A-2) |
| JS heap after browsing 300 cards | **≤ 120 MB** | The decoded atlas alone is ~29 MB (A-32) |
| Long tasks > 50 ms after load | **zero** during typing or scrolling | |

Reproduce the transfer figure — it counts every file the browser actually requests for the app
shell (fonts and the art atlas are budgeted separately, on their own rows):

```sh
npm run build
cd dist && for f in index.html styles.css match.css ui.css \
    app.js card-canon.js match-engine.js deck-store.js src/*.js; do
  printf '%-24s raw %7d  gzip %6d\n' "$f" "$(wc -c < "$f")" "$(gzip -9c "$f" | wc -c)"
done
```

Two levers exist before anything is rewritten. **The JS ships its comments.**
`scripts/build.mjs` strips block comments from the CSS (worth ~12.3 KB gzip) but copies the JS
verbatim, and these modules carry their rationale inline by design — the same treatment for the
JS copy list would be the single largest reduction available, and would cost nothing readable
since `src/` stays the source. **And the whole canon is eagerly loaded**: `card-canon.js`
generates all 1,134 cards at module load for every route, including `#/`.

### 7.1 Strategy for 1,134 cards

**PF-1. Never rebuild the tree.** Replace `innerHTML` rendering (`app.js:61`) with a component
model: each screen owns a mount function that builds its DOM once and an update function that
patches only changed nodes. No `innerHTML` assignment on any container holding more than ~50
nodes.

**PF-2. Windowed grid (the real fix).** Render only the rows intersecting the viewport plus 2
rows of overscan (~60–90 cards). Fixed row height is derived from the container query breakpoint,
so a spacer element of `ceil(n/cols) * rowHeight` gives a correct scrollbar. Recycle a pool of
card nodes on scroll (rAF-throttled), rebinding data rather than recreating elements. Node count
becomes ~1,200 instead of 35,154.

**PF-3. Interim (ship-this-week) mitigation if PF-2 slips:** build the 1,134 tiles **once**, keep
them in a `Map<cardId, HTMLElement>`, and filter by toggling a `hidden` attribute — zero
re-creation, focus preserved, plus `content-visibility: auto; contain-intrinsic-size: 0 340px;
contain: layout paint style` on every tile so off-screen cards cost nothing to lay out or paint.
This alone converts a 300–900 ms keystroke into a sub-frame one and unblocks P0-1.

**PF-4. Search index.** Build once at startup: `searchIndex[i] = (name + id + division + family +
rulesText + keywords).toLowerCase()` — 1,134 strings, ~150 KB, ~15 ms one-time. Filtering is then
a single pass of `indexOf` over prebuilt strings (< 2 ms) instead of 1,134 template
concatenations per keystroke (A-4). Store the filtered result as an array of indices.

**PF-5. Card DOM diet.** 31 nodes → ≤ 14 for `card-xs` (VD-5): corner brackets become
`::before`/`::after`, the `<i>` elements inside cost chips become `::before` content, the tags
row and footer are removed at that density.

**PF-6. Atlas handling.**
- `<link rel="preload" as="image" href="assets/card-art-atlas.avif" fetchpriority="high">` in
  `index.html`.
- One `Image()` + `.decode()` promise gates a single `data-art="ready"` attribute on `<html>`;
  until then every `.cardArt` shows the division-glyph fallback (§3.7). No layout shift — the art
  band has a fixed aspect ratio.
- **Cap the number of distinct rendered card widths to three** (`card-xs`, `card-sm`, `card-lg`)
  so the compositor holds at most three scaled rasterisations of the atlas (A-32). The hero fan's
  bespoke 260px width is folded into `card-sm`.
- Serve with a long `Cache-Control` (add to `vercel.json` headers) — it is content-addressed by
  its build.

**PF-7. Paint discipline.** No `backdrop-filter` (A-36). No `filter: drop-shadow` on more than 3
elements at once (the hero fan currently applies it to 7 atlas-painting cards). `will-change` is
applied only during an active drag or timeline and removed after.

**PF-8. Event handling.** One delegated listener per screen on the container, dispatching on
`data-action`/`data-card` — replacing the twelve `querySelectorAll` passes and ~1,200 closures in
`bind()` (`app.js:62-87`).

**PF-9. Match rendering.** `structuredClone` per action (`match-engine.js:11`) is fine and stays.
The UI diffs previous vs. next match state to decide which lane/unit/HUD nodes to patch; the
event stream (§4.2) drives the animation layer separately.

**PF-10. Measurement is part of the definition of done.** Add `scripts/perf-check.mjs` (or a
documented DevTools recipe) that asserts the node-count and keystroke budgets, and record the
numbers in the PR description. Regressions against this table are review-blocking.

---

## 8. Prioritised cut list

### P0 — embarrassing without it

| # | Item | Ref |
| --- | --- | --- |
| P0-1 | **Fix the render architecture.** Search must accept more than one character. Component mount/update, no `innerHTML` rebuilds, delegated events, prebuilt search index, `content-visibility` on tiles. | A-1–A-4, PF-1/3/4/8 |
| P0-2 | **Ship the card detail view.** The drawer/sheet, the full card record, prev/next, and the `#/codex/{id}` deep link. `state.selected` finally does something. | A-6, IA-11 |
| P0-3 | **Type floor and contrast pass.** Delete every size below 12px; adopt the type scale; adopt the `--div-*-ink/edge/deep` tokens; fix every grey below 4.5:1; kill `opacity:.42` disabled. | A-26, A-27, VD-2/3/13 |
| P0-4 | **Keyboard + focus baseline.** Skip link, roving tabindex on the grid/hand/lanes, visible focus everywhere, Escape, focus-trapped match-end dialog, no 1,134 tab stops. | A-11, A-13, IX-1–IX-8 |
| P0-5 | **Notification model.** Replace `state.notice` with inline reasons + contextual lane reasons + toasts with Undo; nothing silently overwrites; nothing renders off-screen. | A-14, A-15, IX-11/12 |
| P0-6 | **Match log made usable and announced.** Turn grouping, chronological within a turn, full turn visible, `role="log" aria-live="polite"`, summary-first announcements. | A-20, A-25, AX-6 |
| P0-7 | **Playability visible before commitment.** Resource pip HUD with ghost-spend preview, affordability + legality state on every hand card, effective cost after Environment discount. | A-16, A-19, VD-27 |
| P0-8 | **Combat you can see.** Engine event stream (additive), then damage chips, unit-destroyed, core-damage, damage-prevented, and the lane seam. Minimum viable but *correct*: final state renders first, animation is decoration. | A-17–A-20, §4.2/4.3 |
| P0-9 | **Onboarding.** 4-panel primer, coached first match, `#/rules` glossary, glossary popovers on every term — especially "power is attack **and** durability". | A-8, IA-4–IA-7 |
| P0-10 | **Loading + fonts.** Self-hosted WOFF2, remove the Google `@import`, preload + decode-gate the atlas, glyph fallback for art, no layout shift. | A-30, A-33, PF-6 |
| P0-11 | **`prefers-reduced-motion`** honoured from the first animation that ships, plus a user toggle. | A-28, MO-6–MO-8 |
| P0-12 | **Confirm destructive actions.** Clear deck, restore starter over a real deck, reset match, end turn (armed two-step). Undo where possible. | A-22, IX-11 |
| P0-13 | **Remove the anti-slop artefacts already in the code:** division-tile blobs, both `backdrop-filter`s, the all-property `transition`, sticky hover on touch. | A-35, A-36, VD-30 |
| P0-14 | **Split the CSS into a readable token/base/component source** concatenated by `scripts/build.mjs`. Nothing else in P0 is reviewable until this exists. | A-5 |

### P1 — the difference between "fixed" and "good"

P1-1 Windowed virtual grid (PF-2) · P1-2 Hash routing, deep links, Back button, resumable match
(IA-1–IA-3) · P1-3 Drag and drop with pointer events and full keyboard parity (IX-9/10) ·
P1-4 The full motion timeline with Skip, staggering and FLIP (§4.3) · P1-5 Board rebuilt to the
fixed one-viewport composition with the seam (IA-18/19, VD-22–VD-25) · P1-6 Deck analytics:
curve, entity/support ratio, division spread, predictive warnings (IA-13/14) · P1-7 Post-match
debrief (IA-22) · P1-8 Pre-match screen and mulligan clarity, duplicate button removed
(IA-16/17, A-21) · P1-9 Rarity frame system and the card anatomy at three densities
(VD-5, VD-20/21) · P1-10 Codex sort, grouping, rarity/cost/set filters, filter chips
(IA-8/10) · P1-11 Keyboard help sheet (`?`) generated from one source · P1-12 `forced-colors`,
`prefers-contrast`, 400% zoom (AX-10/12/13) · P1-13 Discard and deck inspection (VD-29) ·
P1-14 Front door rebuilt as a game front door (VD-32) · P1-15 Favicon, OG/Twitter card, manifest
(A-34).

### P2 — depth, once it is good

P2-1 Multiple named decks + import/export codes (IA-15) · P2-2 Re-render the art at ≥ 512px per
card; 80×80 is the ceiling on everything visual (A-31) · P2-3 Opt-in sound: 6 cues maximum
(play, clash, destroy, core damage, prevent, victory), off by default, one master toggle ·
P2-4 Match replay scrubbed from the event stream · P2-5 Division doctrine pages in the Codex
(21 landing pages built from `card-canon.js:2-22` + that division's card list) · P2-6 Collection
statistics ("you have played 340 of 1,134 cards") · P2-7 PWA + offline install (the runtime is
already fully local) · P2-8 Card comparison view (2–3 cards side by side) · P2-9 Print/export a
deck list.

---

## 9. Definition of done for this phase

A change is complete when: it has a requirement ID from this document; the measured numbers in §7
are met and recorded; AX-9 (keyboard-only and screen-reader-only match completion) still passes;
`npm run check` passes; and no new declaration violates VD-3 (12px floor), VD-14 (three accents
per card), VD-30 (anti-slop), or MO-1 (transform/opacity only).
