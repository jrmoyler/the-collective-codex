# THE COLLECTIVE CODEX
## Master Game Design Document — Version 1.0

**Tagline:** Twenty-One Divisions. Infinite Outcomes.  
**Format:** Living digital collectible card game with animated battlefields  
**Current content scope:** 54 generated sheets, 1,134 indexed concepts, 28 card families, 21 divisions

## High concept

The Collective Codex is a living digital card game in which cards visibly alter a three-lane battlefield. Units materialize as animated combatants, weapons attach to their wielders, bases construct themselves, traps remain concealed until triggered, Laws rewrite match rules, Environments transform terrain, Rituals grow over several turns, and Dragons, Deities, Gods, Plagues, Viruses and Disasters enter as cinematic events.

Every division is publicly presented as a complete peer faction. Collective AI is internally the hidden Sovereign Doctrine: the most adaptive and difficult PvE opponent. Nothing in public-facing copy, balance labels, account data or presentation may identify Collective AI as personally owned, developer-favored or explicitly superior.

## Non-negotiable pillars

1. All 21 divisions are represented from the beginning.
2. All 1,134 generated concepts enter the canonical registry.
3. The locked divisional icon system remains consistent across cards, UI, effects and worlds.
4. Every card has readable counterplay.
5. Ranked PvP uses normalized public card rules.
6. Sovereign-only advantages remain restricted to PvE campaigns, raids and challenge encounters.
7. Monetization avoids pay-to-win systems.
8. The rules simulation remains deterministic and independent from rendering.

## Match format

- 50-card constructed deck
- 1 Ruler
- 1 World
- 1 primary division
- Up to 2 allied divisions
- 20 starting Core Integrity
- 5-card starting hand
- One mulligan
- Target match time: 12–20 minutes

### Battlefield

Each player controls:

- Three combat lanes: Vanguard, Conduit and Flank
- Three unit positions per lane
- Two infrastructure sockets per lane
- One Ruler position
- One World zone
- One Environment overlay
- One active Law slot
- One Ritual channel
- One hidden Reaction window
- One Doctrine Reserve

## Resources

### Command
Used for Characters, Warriors, Knights, Weapons, Actions and Bases.

### Insight
Used for Spells, Responses, Reactions, Laws, Magicians and prediction effects.

### Essence
Used for Monsters, Specimens, Dragons, Deities, Gods, Rituals and biological or cosmic effects.

## Turn structure

1. Refresh
2. Draw
3. Resource
4. World
5. Main
6. Engagement
7. Response
8. End

Effects resolve through a visible last-in, first-out stack. Laws and Worlds apply continuously. Replacement effects resolve before triggered effects.

## Card families

### Entities
Specimens, Characters, Knights, Warriors, Magicians, Monsters, Androids, Dragons, Deities, Gods and Rulers.

### Equipment and infrastructure
Weapons, Items, Bases, Defenses and Traps.

### Tactics
Actions, Reactions, Responses, Spells, Hexes and Rituals.

### Systems
Laws, Environments, Worlds, Disasters, Plagues and Viruses.

## Division doctrines

1. **Collective AI:** synthesis, observation, convergence and adaptive command
2. **ZenFlow:** prediction, sequencing and neural links
3. **The Collective:** recruitment, economy and compound value
4. **Hybrid Living:** learning, adaptation and evolution
5. **Nexus Labs:** recording, replay and authored outcomes
6. **Kinetic Edge:** momentum, movement and repeated attacks
7. **Quantum Ledger:** exchange, escrow and delayed value
8. **Juris Guard:** laws, judgment and punishment
9. **Signal Velocity:** broadcasts, amplification and cascading effects
10. **Cognara Mind:** psychic control and hand disruption
11. **Terra Axis:** structures, armor and terrain permanence
12. **Binary Loom:** modular synthesis and card construction
13. **Vector Shift:** logistics, routing and repositioning
14. **Aether Link:** portals, summoning and cross-lane support
15. **Obsidian Arc:** security, lockdown and retaliation
16. **Civic Core:** cooperation, healing and shared benefit
17. **Nomad Nexus:** mobility, reserves and temporary camps
18. **Vital Helix:** regeneration, mutation and medicine
19. **Gaia Synthesis:** ecosystems, living terrain and swarms
20. **Eon Core:** time manipulation, delay and recursion
21. **Animus Prime:** androids, drones and automation

## Living-card presentation

- Entity cards produce animated 3D units.
- Weapons attach to compatible sockets and replace attack animations.
- Bases and Defenses physically construct on the board.
- Traps show only concealed sockets until detected or triggered.
- Laws modify interface permissions, targeting, costs or timing.
- Worlds and Environments alter terrain, lighting, audio and lane rules.
- Rituals visibly build through multiple stages.
- Dragons, Deities, Gods and Disasters receive short cinematic entrances without hiding unresolved information.

## Sovereign Doctrine

Collective AI's public pool is balanced and playable. PvE-only systems may use:

- Observation of repeated player habits
- Temporary hybrid-card synthesis
- Visible Law reinterpretation
- Reconstruction under explicit rules
- Cross-division convergence
- Telegraphed override effects

### Encounter phases

1. Observation
2. Assimilation
3. Override
4. Sovereign State
5. Final Convergence

The encounter must not manipulate hidden randomness, apply invisible statistics or break declared rules without telegraphing and counterplay.

## Canonical registry requirements

Every generated concept receives:

- Stable card ID
- Canonical name
- Division and locked icon
- Family and subtype
- Cost and rarity
- Rules text and keywords
- Targeting and timing
- Counterplay tags
- Art and animation references
- Audio profile
- Lore entry
- AI-use profile
- PvP legality
- Sovereign-only flag

Untranscribed entries remain explicitly marked provisional until approved source-sheet names, visuals and mechanics are imported.

## Modes

- Story Campaign
- Constructed PvP
- Draft
- Roguelike Expedition
- Co-op Raids
- World Boss Events
- Puzzle Codex
- Division Trials

## Technical architecture

- Browser-native modular client
- Deterministic event-sourced game state
- Seeded randomness
- Server-authoritative future PvP
- JSON-driven versioned content registry
- Replayable command stream
- Separate render and rules layers
- Vercel deployment target

## First repository milestone

The foundation vertical slice must include:

- Overview and division browser
- Searchable Codex registry
- All 21 locked icons
- All 54 sheet manifests
- 1,134 structural card slots
- Three-lane battlefield
- Command, Insight and Essence
- Card selection and lane deployment
- Turn advancement
- Automated registry and state tests
- Vercel-ready production build

## Definition of full release

The first full release is complete when all 21 divisions are playable; all 1,134 concepts have approved rules and art mappings; every family functions; each division supports multiple deck archetypes; ranked PvP is auditable; the Sovereign encounter is the hardest PvE challenge; and a complete match can be reproduced from its deterministic event log.
