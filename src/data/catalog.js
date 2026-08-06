import { DIVISIONS } from "./divisions.js";

const numberedSheets = (family, title, prefix, count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
    title: `${title} ${index + 1}`,
    family,
    setLabel: `${title} Set ${index + 1}`
  }));

export const SHEETS = [
  { id: "specimens-01", title: "Specimens", family: "Specimen", setLabel: "Specimen Series" },
  ...numberedSheets("Weapon", "Arsenal Doctrine", "arsenal", 12),
  { id: "monsters-01", title: "Monsters", family: "Monster", setLabel: "Bestiary Set I" },
  { id: "knights-01", title: "Knights", family: "Knight", setLabel: "Order Set I" },
  { id: "warriors-01", title: "Warriors", family: "Warrior", setLabel: "Vanguard Set I" },
  { id: "magicians-01", title: "Magicians", family: "Magician", setLabel: "Arcana Set I" },
  ...numberedSheets("Environment", "Environment", "environment", 2),
  { id: "disasters-01", title: "Disasters", family: "Disaster", setLabel: "Cataclysm Set I" },
  { id: "defenses-01", title: "Defenses", family: "Defense", setLabel: "Bastion Set I" },
  { id: "bases-01", title: "Bases", family: "Base", setLabel: "Stronghold Set I" },
  ...numberedSheets("Item", "Item Collection", "items", 8),
  ...numberedSheets("Operative", "Classed Operatives", "operatives", 8),
  { id: "actions-01", title: "Actions", family: "Action", setLabel: "Protocol Set I" },
  { id: "traps-01", title: "Traps", family: "Trap", setLabel: "Snare Set I" },
  { id: "reactions-01", title: "Reactions", family: "Reaction", setLabel: "Counter Set I" },
  { id: "responses-01", title: "Responses", family: "Response", setLabel: "Reply Set I" },
  { id: "laws-01", title: "Laws", family: "Law", setLabel: "Codex Set I" },
  { id: "spells-01", title: "Spells", family: "Spell", setLabel: "Arcana Set I" },
  { id: "hexes-01", title: "Hexes", family: "Hex", setLabel: "Curse Set I" },
  { id: "plagues-01", title: "Plagues", family: "Plague", setLabel: "Pestilence Set I" },
  { id: "viruses-01", title: "Viruses", family: "Virus", setLabel: "Strain Set I" },
  { id: "dragons-01", title: "Dragons", family: "Dragon", setLabel: "Wyrm Set I" },
  { id: "deities-01", title: "Deities", family: "Deity", setLabel: "Celestial Set I" },
  { id: "androids-01", title: "Androids", family: "Android", setLabel: "Mech Set I" },
  { id: "gods-01", title: "Gods", family: "God", setLabel: "Pantheon Set I" },
  { id: "rulers-01", title: "Rulers", family: "Ruler", setLabel: "Throne Set I" },
  { id: "rituals-01", title: "Rituals", family: "Ritual", setLabel: "Rite Set I" },
  { id: "worlds-01", title: "Worlds", family: "World", setLabel: "Cosmos Set I" }
];

const PREFIXES = [
  "Aureate", "Null", "Verdant", "Luminous", "Scarlet", "Kinetic", "Orbital",
  "Judicial", "Signal", "Cognitive", "Tectonic", "Binary", "Vector", "Aether",
  "Obsidian", "Civic", "Nomadic", "Vital", "Gaian", "Eonic", "Animus"
];

const NOUNS = {
  Specimen: ["Chimera", "Warden", "Crawler", "Mote"],
  Weapon: ["Halberd", "Lance", "Glaive", "Cannon"],
  Monster: ["Devourer", "Colossus", "Horror", "Maw"],
  Knight: ["Sentinel", "Templar", "Custodian", "Paladin"],
  Warrior: ["Vanguard", "Striker", "Marauder", "Champion"],
  Magician: ["Oracle", "Arcanist", "Weaver", "Seer"],
  Environment: ["Sanctum", "Frontier", "Nexus", "Reach"],
  Disaster: ["Fracture", "Collapse", "Storm", "Rupture"],
  Defense: ["Bulwark", "Ward", "Aegis", "Bastion"],
  Base: ["Citadel", "Foundry", "Haven", "Spire"],
  Item: ["Relic", "Module", "Cache", "Talisman"],
  Operative: ["Marshal", "Agent", "Captain", "Specialist"],
  Action: ["Advance", "Strike", "Surge", "Protocol"],
  Trap: ["Snare", "Mine", "Web", "Lock"],
  Reaction: ["Counter", "Deflect", "Riposte", "Override"],
  Response: ["Reply", "Recovery", "Acknowledgement", "Fallback"],
  Law: ["Mandate", "Statute", "Edict", "Decree"],
  Spell: ["Invocation", "Convergence", "Lance", "Ward"],
  Hex: ["Omen", "Curse", "Knot", "Seal"],
  Plague: ["Blight", "Fever", "Rot", "Swarm"],
  Virus: ["Strain", "Vector", "Worm", "Splice"],
  Dragon: ["Wyrm", "Drake", "Serpent", "Leviathan"],
  Deity: ["Ascendant", "Avatar", "Celestial", "Eidolon"],
  Android: ["Frame", "Unit", "Automaton", "Construct"],
  God: ["Sovereign", "Titan", "Creator", "Overseer"],
  Ruler: ["Regent", "Archon", "Imperator", "Chancellor"],
  Ritual: ["Rite", "Communion", "Consecration", "Accord"],
  World: ["Prime", "Dominion", "Expanse", "Sphere"]
};

const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

function createName(sheet, division, sheetIndex) {
  const nounList = NOUNS[sheet.family];
  const noun = nounList[(sheetIndex + division.id) % nounList.length];
  const suffix = sheetIndex === 0 ? "" : ` ${String(sheetIndex + 1).padStart(2, "0")}`;
  return `${PREFIXES[division.id - 1]} ${noun}${suffix}`;
}

export function buildCatalog() {
  return SHEETS.flatMap((sheet, sheetIndex) =>
    DIVISIONS.map((division) => {
      const rarity = RARITIES[(sheetIndex + division.id) % RARITIES.length];
      const resourceSeed = sheetIndex + division.id;
      return {
        id: `${sheet.id}-${String(division.id).padStart(2, "0")}`,
        canonicalName: createName(sheet, division, sheetIndex),
        divisionId: division.id,
        division,
        family: sheet.family,
        sheetId: sheet.id,
        setLabel: sheet.setLabel,
        rarity,
        command: resourceSeed % 4,
        insight: (resourceSeed + 1) % 4,
        essence: (resourceSeed + 2) % 4,
        power: 2 + (resourceSeed % 9),
        rulesText: `${division.keywords[resourceSeed % division.keywords.length]} — resolve a ${sheet.family.toLowerCase()} effect aligned with ${division.doctrine.toLowerCase()}.`,
        provisional: true
      };
    })
  );
}

export const CATALOG = buildCatalog();
export const FAMILY_OPTIONS = Array.from(new Set(SHEETS.map((sheet) => sheet.family))).sort();
