/* match-codec.js — a match in progress, written down and read back.
 *
 * WHAT THIS FIXES
 * A match lived entirely in one JavaScript closure. A reload, a crashed tab, a
 * phone backgrounded long enough for the OS to reclaim it, or the app's own
 * "reload the page if it stops responding" advice all had the same cost: round
 * eleven, gone, with no warning that it was going to be. That is the single
 * most expensive failure a local game can have, and it needed no server to fix.
 *
 * HOW IT SURVIVES ENGINE CHANGES
 * The codec does NOT enumerate the engine's state fields. Every attempt to keep
 * such a list correct fails the same way: someone adds `stunSource` to a unit,
 * every test passes, and restored matches quietly lose a rule. Instead it walks
 * the state generically and rewrites only the two things that are not JSON:
 *   · canon cards, which are shared frozen singletons, become {$card: id};
 *   · the ruleset, which is verified rather than trusted, becomes a digest.
 * A field added to the engine tomorrow round-trips tomorrow, with no edit here.
 *
 * WHAT IT REFUSES
 * Restoring a wrong board is far worse than restoring none: the player cannot
 * see that the state they are looking at is not the state they left. So the
 * decoder is strict — wrong schema version, wrong ruleset digest, a card id the
 * canon no longer has, a Core outside its legal range, a non-monotonic event
 * sequence — and every refusal returns null with a reason instead of a board.
 */

import { CANONICAL_RULES } from './ruleset.js';

/** Bumped whenever the encoded SHAPE changes. Old payloads are dropped, never
 *  guessed at. */
export const MATCH_SCHEMA = 1;
export const MATCH_STORAGE_KEY = 'collectiveCodex.activeMatch.v1';

/* The same test the engine's clone() uses, so "is this a canon card" has one
 * definition on both sides of the boundary. */
const isCard = v => Boolean(v) && typeof v === 'object' && typeof v.id === 'string' && typeof v.family === 'string' && Boolean(v.cost) && typeof v.cost === 'object';
const PHASES = new Set(['mulligan', 'main', 'ended']);
/* A stored payload is parsed JSON, and `JSON.parse('{"__proto__": {...}}')`
 * yields a real own key. Assigning it would set the rehydrated object's
 * prototype from a value an attacker (or a corrupted key) controls. There is no
 * legitimate state field by any of these names, so they are dropped. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function pack(value) {
  if (value === null || typeof value !== 'object') return value === undefined ? null : value;
  if (isCard(value)) return { $card: value.id };
  if (Array.isArray(value)) return value.map(pack);
  const out = {};
  for (const key of Object.keys(value)) out[key] = pack(value[key]);
  return out;
}

function unpack(value, cardById, missing) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => unpack(v, cardById, missing));
  if (typeof value.$card === 'string') {
    const card = cardById.get(value.$card);
    if (!card) missing.push(value.$card);
    return card || null;
  }
  const out = {};
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    out[key] = unpack(value[key], cardById, missing);
  }
  return out;
}

/**
 * A match state as a JSON-safe object.
 * `rules` is replaced by its digest: a ruleset is not player data, it is build
 * data, and re-adopting a stored copy of it would let a stale payload smuggle
 * old balance into a new build. The decoder checks the digest and re-attaches
 * the live ruleset object instead.
 */
export function encodeMatch(state) {
  if (!state || typeof state !== 'object') throw new TypeError('encodeMatch needs a match state.');
  const { rules, quiet, ...rest } = state;
  return {
    schema: MATCH_SCHEMA,
    rulesDigest: (rules || CANONICAL_RULES).digest,
    rulesVersion: (rules || CANONICAL_RULES).version,
    savedAt: null,             // stamped by saveMatch; kept out of the pure codec
    state: pack(rest),
  };
}

/**
 * @returns {{state: object}|{error: string}} — never a partially valid board.
 */
export function decodeMatch(payload, { cardById, rules = CANONICAL_RULES } = {}) {
  if (!payload || typeof payload !== 'object') return { error: 'no saved match' };
  if (payload.schema !== MATCH_SCHEMA) return { error: `saved match uses schema ${payload.schema}, this build reads ${MATCH_SCHEMA}` };
  if (payload.rulesVersion !== rules.version || payload.rulesDigest !== rules.digest) {
    /* The balance changed under the saved board. Resuming would silently play
     * out the rest of a match under numbers it did not start with — exactly the
     * dishonesty the seed code's doctrine fingerprint exists to prevent. */
    return { error: 'saved match was played under a different ruleset' };
  }
  if (!cardById || typeof cardById.get !== 'function') return { error: 'no card index supplied' };

  const missing = [];
  let state;
  try { state = unpack(payload.state, cardById, missing); }
  catch { return { error: 'saved match could not be read' }; }
  if (missing.length) return { error: `saved match references ${missing.length} card${missing.length === 1 ? '' : 's'} this build does not have` };

  const problem = validateMatch(state, rules);
  if (problem) return { error: problem };

  state.rules = rules;
  /* Re-frozen on the way in for the same reason the engine freezes them on the
   * way out: clone() shares frozen objects by reference, and an event record
   * that two states share must not be writable by either of them. */
  for (const event of state.events) Object.freeze(event);
  return { state };
}

/** Structural invariants a real match always satisfies. Cheap, and the only
 *  thing standing between a hand-edited localStorage value and the engine. */
export function validateMatch(state, rules = CANONICAL_RULES) {
  if (!state || typeof state !== 'object') return 'saved match is not an object';
  if (!PHASES.has(state.phase)) return `saved match has an unknown phase "${state.phase}"`;
  if (state.active !== null && state.active !== 'player' && state.active !== 'rival') return 'saved match has an unknown active side';
  for (const key of ['round', 'turnCount', 'uidCounter', 'eventSeq', 'seed']) {
    if (!Number.isInteger(state[key]) || state[key] < 0) return `saved match has a corrupt ${key}`;
  }
  if (!Array.isArray(state.events) || !Array.isArray(state.log)) return 'saved match has no event stream';
  let previous = 0;
  for (const event of state.events) {
    if (!event || !Number.isInteger(event.seq) || event.seq <= previous) return 'saved match has a broken event sequence';
    previous = event.seq;
  }
  if (previous > state.eventSeq) return 'saved match has more events than it counted';
  if (!state.players || typeof state.players !== 'object') return 'saved match has no players';
  for (const side of ['player', 'rival']) {
    const p = state.players[side];
    if (!p) return `saved match is missing the ${side} seat`;
    if (!Number.isInteger(p.core) || p.core < 0 || p.core > rules.startingCore) return `saved ${side} Core is outside 0..${rules.startingCore}`;
    for (const zone of ['deck', 'hand', 'discard']) {
      if (!Array.isArray(p[zone]) || p[zone].some(c => !isCard(c))) return `saved ${side} ${zone} is corrupt`;
    }
    if (!Array.isArray(p.lanes) || p.lanes.length !== 3) return `saved ${side} board is not three lanes`;
    for (const lane of p.lanes) {
      if (!lane || !Array.isArray(lane.units) || !Array.isArray(lane.supports)) return `saved ${side} lane is corrupt`;
      if (lane.units.length > rules.maxUnitsPerLane || lane.supports.length > rules.maxSupportsPerLane) return `saved ${side} lane is over capacity`;
      for (const unit of lane.units) if (!isCard(unit.card) || !Number.isFinite(unit.power)) return `saved ${side} unit is corrupt`;
      for (const support of lane.supports) if (!isCard(support.card)) return `saved ${side} support is corrupt`;
    }
    for (const k of ['command', 'insight', 'essence']) {
      const v = p.resources?.[k];
      if (!Number.isInteger(v) || v < 0 || v > rules.resourceCeiling) return `saved ${side} ${k} is outside 0..${rules.resourceCeiling}`;
    }
  }
  return null;
}

/* ---------- storage ----------
 * Everything below is best-effort by design. Persistence is a courtesy: it must
 * never be able to interrupt a match, so every path swallows its failure and
 * reports it as a boolean the caller may ignore.
 */

/** Roughly the point at which one match's event stream stops being worth its
 *  space. A long match is ~400 events; the trim only fires on a quota error. */
const EVENT_TAIL = 150;

export function saveMatch(storage, state, { now = () => Date.now() } = {}) {
  if (!storage || !state) return false;
  let payload;
  try {
    payload = encodeMatch(state);
    payload.savedAt = now();
    storage.setItem(MATCH_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    /* Quota is the expected failure, not an exceptional one: a long match on a
     * browser with a nearly full origin. The log is decoration — the board is
     * the match — so the retry keeps the board and drops the oldest history.
     * `eventSeq` is left alone so the sequence stays monotonic on resume. */
    if (!payload) return false;
    try {
      payload.state.events = payload.state.events.slice(-EVENT_TAIL);
      payload.state.log = payload.state.log.slice(0, 20);
      storage.setItem(MATCH_STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch { return false; }
  }
}

export function loadMatch(storage, cardById, { rules = CANONICAL_RULES } = {}) {
  if (!storage) return { error: 'no storage' };
  let raw;
  try { raw = storage.getItem(MATCH_STORAGE_KEY); }
  catch { return { error: 'storage unreadable' }; }
  if (!raw) return { error: 'no saved match' };
  let payload;
  try { payload = JSON.parse(raw); }
  catch { return { error: 'saved match is not valid JSON' }; }
  const result = decodeMatch(payload, { cardById, rules });
  if (result.error) return result;
  return { state: result.state, savedAt: Number(payload.savedAt) || null };
}

export function clearMatch(storage) {
  try { storage?.removeItem?.(MATCH_STORAGE_KEY); return true; }
  catch { return false; }
}
