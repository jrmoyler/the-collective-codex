/* ruleset.js — every tunable number in the match engine, as data.
 *
 * WHY THIS EXISTS
 * The engine used to hold its balance as eighteen module-level constants.
 * That is fine until you need to answer a live question — "the second seat wins
 * 23% of mirrors, what does the compensation need to be?" — because the only
 * way to ask it was to edit the engine, and the only way to ship the answer was
 * to deploy the engine. Balance that can only move at the speed of a deploy is
 * balance that does not move.
 *
 * A ruleset is a plain, deeply frozen object. `createMatch` snapshots one into
 * the match state, so a match is played under the rules it started with even if
 * a newer ruleset arrives mid-session, and the state carries a digest of them so
 * a replay can say whether it is really the same game (the same honesty the seed
 * code already applies to doctrines).
 *
 * DEEP FREEZING IS LOAD-BEARING, NOT HYGIENE. `match-engine.js` clone() shares
 * frozen objects by reference, so a frozen ruleset costs one pointer copy per
 * cloned state instead of a deep copy of eighty-odd numbers on every card
 * played.
 *
 * HOSTILE INPUT IS THE NORMAL CASE. Overrides may come from a remote config,
 * a query string, or a stale cached payload from three releases ago. None of
 * those are trusted, and none of them may be able to brick a client: every
 * value is range-checked and clamped, unknown keys are dropped, cross-field
 * impossibilities are repaired, and everything that was corrected is reported
 * on `rules.warnings` rather than thrown. A ruleset always comes back playable.
 */

/** Bumped when the SHAPE of a ruleset changes, not when a value is retuned.
 *  Persisted matches and cached remote payloads are rejected across a bump. */
export const RULESET_VERSION = 1;

/* ---------- the defaults ---------- */

export const DEFAULT_RULES = {
  version: RULESET_VERSION,
  /** Human-readable label for the active balance pass. Surfaces in the debrief
   *  when it is not the shipped one, so a player never wonders why their numbers
   *  disagree with the rules screen. */
  label: 'canonical',

  deckSize: 30,
  startingCore: 20,
  openingHand: 5,
  maxUnitsPerLane: 3,
  maxSupportsPerLane: 4,

  /* Deliberately generous relative to the canon's 0..3 per-type cost range.
   * Tightening these to 3/3/3 was measured and rejected: it gates the curve
   * properly, but it also means you can afford one expensive body or three cheap
   * ones, and three small bodies beat one large one in this combat model. A
   * cheap-swarm deck went from losing every matchup to winning 92-100% of them. */
  resourceCaps: { command: 6, insight: 5, essence: 4 },
  resourceCeiling: 10,
  regroupRecovery: 2,

  /* Core damage one active Defense prevents from its lane per turn cycle, and the
   * channel counters a Ritual needs before it resolves. Both are stated verbatim
   * in the in-app glossary, so both are named rather than inlined. */
  corePreventionPerDefense: 2,
  ritualChannel: 3,
  drawPerRefresh: 2,

  /* ON-THE-DRAW COMPENSATION — see docs/match-rules.md § Seat parity.
   *
   * The seat that acts second is structurally behind in this combat model, and
   * not by a little: the first seat attacks into the second seat's board before
   * that board has attacked, so it removes blockers a turn earlier every single
   * round. Measured on mirror doctrines the first seat won 77.3% of matches.
   *
   * `cards` alone does not touch that — sweeping it 0/1/2 moved the result less
   * than run-to-run noise, because cards were never the binding constraint;
   * resources were. The resource grant is what pays for the tempo the second
   * seat cannot take, and it is applied once, at that seat's first refresh. */
  onTheDraw: { cards: 1, command: 1, insight: 1, essence: 1 },

  /* The armour divisor is the only dampener on an undefended lane (the breach
   * ceiling applies to contested lanes only), so it carries the pacing alone.
   *
   * It was set at 5 rather than 4 because at 4 the median match fell to 7 rounds
   * and 26% of matches ended inside 5. That measurement predates the seat-parity
   * compensation, and re-running it now gives a different trade: at 4 the median
   * is 12 rounds against 13, with 38% of curve mirrors ending on deck-out
   * fatigue against 43%, and seat parity unchanged. It has not been moved,
   * because a second balance target should not ride along with the first — but
   * it is one value and `npm run balance` re-measures the whole trade in under a
   * minute, which is the entire point of this file. */
  coreArmourDivisor: 5,
  flyingArmourPierce: 1,
  maxLaneBreach: 3,

  /** Escalating unpreventable damage per failed draw: the nth failed draw of a
   *  match deals n × this. The clock that stops a stalled board being a draw. */
  fatigueStep: 1,

  /** Half-value copy targets for the Response family, by the family it copies. */
  responseCopy: { Action: 2, Weapon: 2 },

  /* AI heuristic weights. Retunable because the rival's *judgement* is the part
   * of difficulty players actually feel, and it is pure numbers. */
  supportValue: {
    Base: 2.2, Trap: 2, Ritual: 1.6, Virus: 1.6, Plague: 1.4,
    Response: 1.4, Reaction: 1.2, Environment: 1.2, Law: 1.1,
  },
  tiers: {
    recruit: {
      maxPlays: 2, minGain: 0, coreWeight: 1, unitWeight: 1, threat: 0, defensiveBias: 1,
      lethalBonus: 0, defenseLow: 0.5, defenseHigh: 0.5, handWeight: 0, deckWeight: 0,
      supportWeight: 0, style: null, combatLook: 0, replyLook: 0, mulliganMax: 0, mulliganCost: 99,
    },
    veteran: {
      maxPlays: 4, minGain: 0.25, coreWeight: 1.6, unitWeight: 1, threat: 0.95, defensiveBias: 1,
      lethalBonus: 45, defenseLow: 1.6, defenseHigh: 0.8, handWeight: 0.3, deckWeight: 0.15,
      supportWeight: 0.7, style: null, combatLook: 0, replyLook: 0, mulliganMax: 2, mulliganCost: 7,
    },
    /* sovereign's unitWeight was 0.8 and threat 1.6. Under the lane-dependent
     * breach ceiling, board power converts to Core damage far more directly, so
     * undervaluing units relative to veteran cost the top tier its edge. */
    sovereign: {
      maxPlays: 6, minGain: 0.4, coreWeight: 1.6, unitWeight: 1, threat: 2.2, defensiveBias: 1.4,
      lethalBonus: 140, defenseLow: 3, defenseHigh: 1, handWeight: 1, deckWeight: 0,
      supportWeight: 1.2, style: { trap: 1, disaster: 1, plague: 1, reaction: 1, defense: 1 },
      combatLook: 2, replyLook: 1.5, mulliganMax: 3, mulliganCost: 6,
    },
  },

  /* Hard ceiling on positions the rival may evaluate in ONE main phase.
   *
   * Deliberately a work budget and not a wall-clock deadline. A deadline would
   * make the rival's decisions depend on how fast the machine is, and this game
   * hands out seed codes that promise to reproduce a match — a rival that plays
   * differently on a cold phone than on a warm desktop breaks that promise in a
   * way no player could ever diagnose. A node budget bounds the same worst case
   * and is identical on every device.
   *
   * At the shipped tiers it never binds: a sovereign main phase peaks at 67
   * evaluations, measured over 25 seeds. It exists so that a retuned tier — 12 plays at combatLook 4,
   * say, which the schema permits — degrades into a slightly shallower rival
   * instead of a frame-rate cliff on the device least able to absorb it. */
  aiNodeBudget: 2000,
};

/* ---------- validation ---------- */

const int = (min, max) => ({ kind: 'int', min, max });
const num = (min, max) => ({ kind: 'num', min, max });

/* One schema entry per tunable. A key with no entry here cannot be overridden —
 * that is what stops a remote payload from smuggling in a field the engine
 * reads but nobody reviewed. */
const SCHEMA = {
  label: { kind: 'label' },
  deckSize: int(10, 60),
  startingCore: int(5, 200),
  openingHand: int(1, 10),
  maxUnitsPerLane: int(1, 6),
  maxSupportsPerLane: int(0, 8),
  resourceCaps: { kind: 'map', of: int(1, 20), keys: ['command', 'insight', 'essence'] },
  resourceCeiling: int(1, 40),
  regroupRecovery: int(0, 20),
  corePreventionPerDefense: int(0, 20),
  ritualChannel: int(1, 12),
  drawPerRefresh: int(0, 6),
  onTheDraw: { kind: 'map', of: int(0, 6), keys: ['cards', 'command', 'insight', 'essence'] },
  coreArmourDivisor: int(1, 20),
  flyingArmourPierce: int(0, 10),
  maxLaneBreach: int(0, 60),
  fatigueStep: int(1, 10),
  responseCopy: { kind: 'map', of: int(0, 12), keys: ['Action', 'Weapon'] },
  supportValue: { kind: 'map', of: num(0, 20), keys: Object.keys(DEFAULT_RULES.supportValue) },
  tiers: { kind: 'tiers' },
  aiNodeBudget: int(50, 200000),
};

const TIER_SCHEMA = {
  maxPlays: int(0, 12), minGain: num(-50, 50), coreWeight: num(0, 20), unitWeight: num(0, 20),
  threat: num(0, 20), defensiveBias: num(0, 20), lethalBonus: num(0, 5000), defenseLow: num(0, 20),
  defenseHigh: num(0, 20), handWeight: num(0, 20), deckWeight: num(0, 20), supportWeight: num(0, 20),
  /* Bounded because these multiply the search: each unit of combatLook is a full
   * combat resolution per candidate move, and replyLook another on top of it. */
  combatLook: num(0, 4), replyLook: num(0, 4), mulliganMax: int(0, 10), mulliganCost: int(0, 99),
};
const STYLE_KEYS = ['trap', 'disaster', 'plague', 'reaction', 'defense', 'overcommit', 'curve'];

/* `JSON.parse('{"__proto__": …}')` produces a real own property, and this module
 * takes its input from exactly that kind of source. Every key lookup below goes
 * through `known()` rather than `in` or a bare index: `'__proto__' in someObject`
 * is true through the prototype chain, and `out['__proto__'].style = x` writes to
 * Object.prototype and corrupts every object in the process. Own-property checks
 * plus this denylist are what make an untrusted key an ignored key. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const known = (table, key) => !FORBIDDEN_KEYS.has(key) && Object.hasOwn(table, key);

const clampNumber = (value, rule, path, warnings) => {
  const n = Number(value);
  if (!Number.isFinite(n)) { warnings.push(`${path}: not a finite number, kept the default`); return null; }
  const rounded = rule.kind === 'int' ? Math.round(n) : n;
  const bounded = Math.min(rule.max, Math.max(rule.min, rounded));
  if (bounded !== rounded) warnings.push(`${path}: ${rounded} is outside ${rule.min}..${rule.max}, clamped to ${bounded}`);
  return bounded;
};

function applyMap(base, override, rule, path, warnings) {
  if (!override || typeof override !== 'object') { warnings.push(`${path}: expected an object, kept the default`); return base; }
  const out = { ...base };
  for (const key of Object.keys(override)) {
    if (FORBIDDEN_KEYS.has(key) || !rule.keys.includes(key)) { warnings.push(`${path}.${key}: not a known field, ignored`); continue; }
    const value = clampNumber(override[key], rule.of, `${path}.${key}`, warnings);
    if (value !== null) out[key] = value;
  }
  return out;
}

function applyTiers(base, override, warnings) {
  if (!override || typeof override !== 'object') { warnings.push('tiers: expected an object, kept the defaults'); return base; }
  const out = {};
  for (const [name, tier] of Object.entries(base)) out[name] = { ...tier, style: tier.style ? { ...tier.style } : null };
  for (const [name, patch] of Object.entries(override)) {
    if (!known(out, name)) { warnings.push(`tiers.${name}: not a known difficulty tier, ignored`); continue; }
    if (!patch || typeof patch !== 'object') { warnings.push(`tiers.${name}: expected an object, kept the default`); continue; }
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'style') {
        if (value === null) { out[name].style = null; continue; }
        if (!value || typeof value !== 'object') { warnings.push(`tiers.${name}.style: expected an object or null, kept the default`); continue; }
        const style = { ...(out[name].style || {}) };
        for (const [sk, sv] of Object.entries(value)) {
          if (FORBIDDEN_KEYS.has(sk) || !STYLE_KEYS.includes(sk)) { warnings.push(`tiers.${name}.style.${sk}: not a known style axis, ignored`); continue; }
          const n = clampNumber(sv, num(0, 10), `tiers.${name}.style.${sk}`, warnings);
          if (n !== null) style[sk] = n;
        }
        out[name].style = style;
        continue;
      }
      if (!known(TIER_SCHEMA, key)) { warnings.push(`tiers.${name}.${key}: not a tunable field, ignored`); continue; }
      const rule = TIER_SCHEMA[key];
      const n = clampNumber(value, rule, `tiers.${name}.${key}`, warnings);
      if (n !== null) out[name][key] = n;
    }
  }
  return out;
}

/* Cross-field repairs. Each of these is a configuration that passes every
 * individual range check and still produces a game that cannot be played. */
function repair(rules, warnings) {
  const capMax = Math.max(rules.resourceCaps.command, rules.resourceCaps.insight, rules.resourceCaps.essence);
  if (rules.resourceCeiling < capMax) {
    warnings.push(`resourceCeiling: ${rules.resourceCeiling} is below the highest per-turn cap (${capMax}); raised to it`);
    rules.resourceCeiling = capMax;
  }
  const handRoom = rules.deckSize - rules.onTheDraw.cards;
  if (rules.openingHand > handRoom) {
    warnings.push(`openingHand: ${rules.openingHand} cannot be drawn from a ${rules.deckSize}-card doctrine; lowered to ${handRoom}`);
    rules.openingHand = Math.max(1, handRoom);
  }
  return rules;
}

/* FNV-1a over the canonical JSON of the ruleset. Short, stable, and comparable
 * across clients — enough to say "these two matches were played under different
 * rules", which is all a replay needs to be honest about. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
export function rulesetDigest(rules) {
  const source = { ...rules };
  delete source.digest; delete source.warnings; delete source.label;
  let x = 2166136261;
  for (const ch of stableStringify(source)) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); }
  return (x >>> 0).toString(32).toUpperCase().padStart(7, '0');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

/**
 * Build a playable ruleset from untrusted overrides.
 * Never throws for bad data: everything correctable is corrected and listed on
 * `rules.warnings`, because a client that refuses to start a match is a worse
 * outcome than a client that starts one under slightly repaired numbers.
 */
export function createRuleset(overrides = {}) {
  const warnings = [];
  const rules = {
    ...DEFAULT_RULES,
    resourceCaps: { ...DEFAULT_RULES.resourceCaps },
    onTheDraw: { ...DEFAULT_RULES.onTheDraw },
    responseCopy: { ...DEFAULT_RULES.responseCopy },
    supportValue: { ...DEFAULT_RULES.supportValue },
    tiers: DEFAULT_RULES.tiers,
  };
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    if ('version' in overrides && Number(overrides.version) !== RULESET_VERSION) {
      warnings.push(`version: payload targets ruleset v${overrides.version}, this build speaks v${RULESET_VERSION}; overrides ignored`);
      return finish(rules, warnings);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (key === 'version') continue;
      if (!known(SCHEMA, key)) { warnings.push(`${key}: not a tunable field, ignored`); continue; }
      const rule = SCHEMA[key];
      if (rule.kind === 'label') { rules.label = String(value).slice(0, 48) || DEFAULT_RULES.label; continue; }
      if (rule.kind === 'map') { rules[key] = applyMap(rules[key], value, rule, key, warnings); continue; }
      if (rule.kind === 'tiers') { rules.tiers = applyTiers(DEFAULT_RULES.tiers, value, warnings); continue; }
      const n = clampNumber(value, rule, key, warnings);
      if (n !== null) rules[key] = n;
    }
  } else if (overrides !== undefined && overrides !== null) {
    warnings.push('ruleset: expected an object of overrides, used the defaults');
  }
  return finish(repair(rules, warnings), warnings);
}

function finish(rules, warnings) {
  rules.version = RULESET_VERSION;
  rules.warnings = warnings;
  rules.digest = rulesetDigest(rules);
  return deepFreeze(rules);
}

/* Frozen here, not only on the copies createRuleset() returns. `DEFAULT_RULES`
 * is the default argument of the engine's pure helpers and the backing object
 * for its exported constants (`RESOURCE_CAPS`, `AI_TIER_PROFILES`, …), so a
 * single write to it would retune every match in the process. That guarantee
 * existed before this module did; it must not be lost in moving the numbers. */
deepFreeze(DEFAULT_RULES);

/** The shipped ruleset, built through the same path every other ruleset takes. */
export const CANONICAL_RULES = createRuleset();

/* ---------- delivery ----------
 *
 * There is no ruleset endpoint, and there cannot be one without a change to the
 * Content-Security-Policy in vercel.json: the app declares `default-src 'none'`
 * and fetches nothing, which is the property that makes it safe to ship as pure
 * static files. So the override channel is deliberately local — a key an
 * operator, a playtest build, or a developer console can set — and the contract
 * is that whatever arrives through it is validated exactly like a remote payload
 * would be, and is never silent: a client running numbers the documentation does
 * not describe has to say so on screen. Swapping this for a real endpoint later
 * is a change to this one function.
 */
export const RULESET_STORAGE_KEY = 'collectiveCodex.ruleset.v1';

/**
 * @param {object} storage           localStorage, or anything with getItem
 * @param {string[]} [options.pin]   fields the CALLER cannot follow a change to,
 *   dropped from the payload before validation. The engine happily plays a
 *   12-card match; a deck builder built around 30 cards does not, and the
 *   failure mode of that mismatch is that no match will start at all — a live
 *   config that bricks the only interactive feature in the app. Pinning is how a
 *   consumer says which knobs its own UI is not built to turn.
 * @returns {{rules, source: 'shipped'|'override', pinned?: string[]}} — always playable.
 */
export function loadRuleset(storage, { pin = [] } = {}) {
  let raw = null;
  try { raw = storage?.getItem?.(RULESET_STORAGE_KEY) ?? null; } catch { raw = null; }
  if (!raw) return { rules: CANONICAL_RULES, source: 'shipped' };
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return { rules: CANONICAL_RULES, source: 'shipped', error: 'stored ruleset is not valid JSON' }; }
  const pinned = [];
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const key of pin) {
      if (!Object.hasOwn(parsed, key)) continue;
      delete parsed[key];
      pinned.push(key);
    }
  }
  const rules = createRuleset(parsed);
  /* `pinned` is returned rather than pushed onto rules.warnings because a
   * ruleset is frozen the moment it is built — which is the property that makes
   * it safe to share across every cloned state — and pinning is the caller's
   * policy anyway, not the ruleset's. */
  const dropped = pinned.length ? { pinned } : null;
  /* An override that survives validation as a no-op is not an override. Saying
   * so keeps the "you are not playing the documented rules" banner truthful. */
  if (rules.digest === CANONICAL_RULES.digest) return { rules: CANONICAL_RULES, source: 'shipped', ...dropped };
  return { rules, source: 'override', ...dropped };
}

/** Fields where `rules` differs from the shipped defaults, for surfaces that
 *  have to tell a player the game they are playing is not the documented one. */
export function rulesetDiff(rules) {
  const out = [];
  const walk = (a, b, path) => {
    for (const key of Object.keys(b)) {
      if (key === 'warnings' || key === 'digest' || key === 'version') continue;
      const left = a?.[key], right = b[key];
      if (right && typeof right === 'object') walk(left, right, path ? `${path}.${key}` : key);
      else if (left !== right) out.push({ key: path ? `${path}.${key}` : key, from: left, to: right });
    }
  };
  walk(CANONICAL_RULES, rules || CANONICAL_RULES, '');
  return out;
}
