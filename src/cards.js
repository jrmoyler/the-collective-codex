/* cards.js — canon-derived indexes, the atlas decode gate, and the card tile
   component (mount once / paint in place). Nothing here writes innerHTML. */

import { divisions, families, cards, cardById } from '../card-canon.js';
import { h, setText, setAttr, setClass, pad2 } from './core.js';

export const divisionById = new Map(divisions.map(d => [d.id, d]));

export const FAMILY_MARK = {
  Specimen: '◉', Weapon: '⚔', Monster: '◆', Knight: '♜', Warrior: '▲', Magician: '✦',
  Environment: '⌁', Disaster: '⚠', Defense: '⬡', Base: '▣', Item: '◇', Operative: '◎',
  Action: '➤', Trap: '⌖', Reaction: '↶', Response: '↳', Law: '§', Spell: '✧', Hex: '⛧',
  Plague: '☣', Virus: '⌬', Dragon: '♢', Deity: '☀', Android: '◈', God: '✹', Ruler: '♛',
  Ritual: '⟲', World: '◌',
};

/* VD-20: rarity is frame construction + a pip glyph, never colour alone. */
export const RARITY_MARK = { Common: '○', Uncommon: '◔', Rare: '◑', Epic: '◕', Legendary: '●' };
const RARITY_ORDER = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };

export const totalCost = c => c.cost.command + c.cost.insight + c.cost.essence;

/* ---------- Disclosure: families the engine resolves to nothing ----------
   231 of the 1,134 cards (20.4%) belong to a family whose canonical text the
   engine records but never turns into a numeric effect: an Operative logs a
   keyword trigger, a God's decree is text, a Ruler's activation is not
   auto-fired, a World keeps its division as metadata. That is a defensible
   engine decision, but it is not one a player can infer from rules copy like
   "Division matching is preserved as metadata" — they read it as a mechanic.
   Every surface that shows a card says so plainly instead. */
export const NO_EFFECT_FAMILIES = new Set(['Operative', 'God', 'Ruler', 'World']);
export const NO_EFFECT_BADGE = '⚠ NO MECHANICAL EFFECT';
/** Used on a tile that already carries a contextual reason, so the pair stays
 *  inside the two lines the note slot is clamped to. */
export const NO_EFFECT_SHORT = '⚠ NO EFFECT';
export const NO_EFFECT_NOTE = 'This card is played and held like any other, but the engine resolves no numeric effect from it.';
export const hasNoEffect = c => NO_EFFECT_FAMILIES.has(c.family);

/* ---------- PF-4: prebuilt lowercase search index ----------
   1,134 strings built once. Filtering is then a single indexOf pass. */

const searchIndex = cards.map(c => {
  const d = divisionById.get(c.divisionId);
  return `${c.name} ${c.id} ${d.name} ${pad2(d.id)} ${c.family} ${c.subtype} ${c.rarity} ${c.setLabel} ${c.rulesText} ${c.keywords.join(' ')}`.toLowerCase();
});

/* Maps, not object literals, for the same reason core.js's `delegate` uses one:
 * both of these keys arrive from the URL query string, which is shareable and
 * therefore attacker-authored, and an object lookup answers for keys that were
 * never registered. `SORTS['__proto__']` is Object.prototype — truthy, not a
 * function — so `out.sort(cmp)` throws `The comparison function must be either a
 * function or undefined` in the middle of rendering the Codex, and the link that
 * does it (`#/codex?sort=__proto__`) is one someone can send you.
 * `SORTS['constructor']` is worse in a quieter way: it IS a function, so it is
 * accepted as a comparator and silently produces an arbitrary order.
 *
 * screen-codex.js already validates `sort` against an allow-list before it gets
 * here, and that guard stays. This is the structural half: the lookup cannot
 * answer for a key nobody registered, so a second caller that forgets to
 * validate — screen-deck.js also calls queryCards — is not one refactor away
 * from the same defect.
 */
const COST_BANDS = new Map([['0-3', [0, 3]], ['4-6', [4, 6]], ['7+', [7, Infinity]]]);

/* One table, so the labels the <select> renders and the comparators the sort
 * uses cannot drift apart. When they were two literals, a label without a
 * matching comparator passed the allow-list and then sorted nothing, silently. */
const SORTS = new Map([
  ['division', { label: 'Division order', cmp: (a, b) => a.divisionId - b.divisionId || a.family.localeCompare(b.family) || a.name.localeCompare(b.name) }],
  ['name',     { label: 'Name',           cmp: (a, b) => a.name.localeCompare(b.name) }],
  ['cost',     { label: 'Total cost',     cmp: (a, b) => totalCost(a) - totalCost(b) || a.name.localeCompare(b.name) }],
  ['power',    { label: 'Power',          cmp: (a, b) => b.power - a.power || a.name.localeCompare(b.name) }],
  ['rarity',   { label: 'Rarity',         cmp: (a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name) }],
  ['set',      { label: 'Set',            cmp: (a, b) => a.family.localeCompare(b.family) || a.set - b.set || a.divisionId - b.divisionId }],
]);
/** Derived, never re-typed: the <select> and the allow-list both read this. */
export const SORT_LABELS = Object.fromEntries([...SORTS].map(([key, { label }]) => [key, label]));

/** Returns an array of card objects. Never allocates per-card strings. */
export function queryCards({ division = 'all', family = 'all', rarity = 'all', cost = 'all', query = '', sort = 'division' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const div = division === 'all' ? null : Number(division);
  const band = COST_BANDS.get(cost) || null;
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (div !== null && c.divisionId !== div) continue;
    if (family !== 'all' && c.family !== family) continue;
    if (rarity !== 'all' && c.rarity !== rarity) continue;
    if (band) { const t = totalCost(c); if (t < band[0] || t > band[1]) continue; }
    if (q && searchIndex[i].indexOf(q) === -1) continue;
    out.push(c);
  }
  /* 'division' is skipped because the canon is already stored in division order,
   * so the comparator would be a no-op over 1,134 records on every keystroke. */
  const entry = sort === 'division' ? null : SORTS.get(sort);
  return entry ? out.sort(entry.cmp) : out;
}

/** IA-8: "no results" needs nearest matches, not a shrug. */
export function nearestByName(query, limit = 4) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (let i = 0; i < cards.length; i++) {
    const name = cards[i].name.toLowerCase();
    let score = 0;
    for (const token of q.split(/\s+/)) if (token && name.includes(token)) score += token.length;
    if (!score) { const first = q.slice(0, 3); if (first.length >= 2 && name.includes(first)) score = 1; }
    if (score) scored.push([score, cards[i]]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(s => s[1]);
}

/* ---------- AX-4: authored accessible names ---------- */

export function cardLabel(c) {
  const d = divisionById.get(c.divisionId);
  const blank = hasNoEffect(c) ? ' No mechanical effect.' : '';
  return `${c.name}. ${d.name} ${pad2(d.id)}, ${c.family}. Cost ${c.cost.command} command, ${c.cost.insight} insight, ${c.cost.essence} essence. Power ${c.power}. ${c.rarity}.${blank}`;
}

/* ---------- PF-6: atlas decode gate ----------
   Until the atlas decodes, every .cardArt shows the division glyph fallback.
   `data-art` on <html> is the single switch; no per-card work, no layout shift. */

const ATLAS_SRC = 'assets/card-art-atlas.avif';

export function gateAtlas() {
  const root = document.documentElement;
  root.dataset.art = 'loading';
  const img = new Image();
  img.decoding = 'async';
  img.src = ATLAS_SRC;
  const ready = () => { root.dataset.art = 'ready'; };
  const failed = () => { root.dataset.art = 'failed'; console.warn('[codex] card art atlas failed to decode; using glyph fallback'); };
  if (typeof img.decode === 'function') img.decode().then(ready, failed);
  else { img.onload = ready; img.onerror = failed; }
  return img;
}

/* ---------- The card tile (PF-5: 12 nodes, no rules text) ---------- */

/** Build an empty tile once. `paintTile` rebinds it to any card. */
export function makeTile({ tag = 'button', role = null, cls = 'codexCard' } = {}) {
  const glyph = h('span', { class: 'cardDiv', 'aria-hidden': 'true' });
  const fam = h('span', { class: 'cardFam', 'aria-hidden': 'true' });
  const rar = h('span', { class: 'cardRarity', 'aria-hidden': 'true' });
  const art = h('span', { class: 'cardArt', 'aria-hidden': 'true' });
  const name = h('span', { class: 'cardName', 'aria-hidden': 'true' });
  const cc = h('span', { class: 'cost command', 'aria-hidden': 'true' });
  const ci = h('span', { class: 'cost insight', 'aria-hidden': 'true' });
  const ce = h('span', { class: 'cost essence', 'aria-hidden': 'true' });
  const pow = h('span', { class: 'cardPower', 'aria-hidden': 'true' });
  // The disclosure shares the single contextual-reason slot rather than adding
  // a block of its own. The row pitch is a fixed 272px + 14px gap set from CSS
  // (`--tile-h`) and mirrored by ROW_H in JS; a permanently extra line pushed
  // the tallest tiles to 300px and made them overlap the row below. The
  // disclosure is written into `.cardNote` first, in front of whatever
  // contextual reason the screen supplied, and marked with `data-blank` on the
  // tile so the design layer can give it a treatment of its own later.
  const note = h('span', { class: 'cardNote', 'aria-hidden': 'true' });
  const el = h(tag, { class: cls, type: tag === 'button' ? 'button' : null, tabindex: '-1' },
    h('span', { class: 'cardTop', 'aria-hidden': 'true' }, glyph, fam, rar),
    art,
    name,
    h('span', { class: 'cardFoot', 'aria-hidden': 'true' }, cc, ci, ce, pow),
    note,
  );
  if (role) el.setAttribute('role', role);
  el._refs = { glyph, fam, rar, art, name, cc, ci, ce, pow, note };
  return el;
}

/**
 * Rebind a tile to a card. Only touches nodes whose value changed.
 * opts: { selected, disabled, note, label, action, index, dim }
 */
export function paintTile(el, c, opts = {}) {
  const r = el._refs;
  if (el._cardId !== c.id) {
    const d = divisionById.get(c.divisionId);
    el._cardId = c.id;
    el.dataset.card = c.id;
    el.dataset.division = String(c.divisionId);
    el.dataset.family = c.family;
    el.dataset.rarity = c.rarity;
    el.style.setProperty('--art-x', c.art.col);
    el.style.setProperty('--art-y', c.art.row);
    el.style.setProperty('--division', d.color);
    setText(r.glyph, `${d.icon}${pad2(d.id)}`);
    setText(r.fam, `${FAMILY_MARK[c.family] || '✦'} ${c.family}`);
    setText(r.rar, RARITY_MARK[c.rarity] || '○');
    setText(r.name, c.name);
    setText(r.cc, c.cost.command);
    setText(r.ci, c.cost.insight);
    setText(r.ce, c.cost.essence);
    setText(r.pow, c.power);
    setAttr(r.art, 'data-glyph', d.icon);
    setAttr(el, 'data-blank', hasNoEffect(c) ? 'true' : null);
  }
  setAttr(el, 'aria-label', opts.label || cardLabel(c));
  /* `action` and `index` are owned by the caller and set once when the tile is
   * built, so they are only ever written here, never cleared. `data-note` is the
   * opposite: it is derived from this card, so it must be rewritten on every
   * paint (see below) or a recycled tile keeps the previous card's treatment. */
  if (opts.action) el.dataset.action = opts.action;
  if (opts.index !== undefined) el.dataset.index = opts.index;
  if (opts.selected !== undefined) {
    setClass(el, 'selected', opts.selected);
    setAttr(el, el.getAttribute('role') === 'gridcell' ? 'aria-selected' : 'aria-pressed', opts.selected ? 'true' : 'false');
  }
  if (opts.disabled !== undefined) {
    // IX-11/AX-2: never `disabled` — stay focusable so the reason is reachable.
    setAttr(el, 'aria-disabled', opts.disabled ? 'true' : null);
    setClass(el, 'isDisabled', opts.disabled);
  }
  // The disclosure always leads. When the screen also has something to say
  // (in-doctrine, playability) the short form is used so the pair still fits
  // the two lines the note slot is clamped to.
  const blank = hasNoEffect(c);
  const reason = opts.note || '';
  const text = blank ? (reason ? `${NO_EFFECT_SHORT} · ${reason}` : NO_EFFECT_BADGE) : reason;
  setText(r.note, text);
  setClass(el, 'hasNote', Boolean(text));
  // A card that does nothing is a warning regardless of what else is true of it.
  setAttr(el, 'data-note', blank ? 'warn' : (opts.noteKind || null));
  return el;
}

export { divisions, families, cards, cardById };
