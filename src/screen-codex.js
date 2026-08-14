/* screen-codex.js — the 1,134-card browser.
   Mounted once. Never rebuilt. A windowed grid recycles ~90 tiles over the full
   result set (PF-2), filtering runs off the prebuilt lowercase index (PF-4), and
   the search input is a stable node so the caret survives every keystroke (A-3). */

import { h, setText, setAttr, setClass, clear, delegate, rafThrottle, rove, clamp, pad2 } from './core.js';
import { divisions, families, cards, cardById, divisionById, queryCards, nearestByName, makeTile, paintTile, totalCost, hasNoEffect, NO_EFFECT_BADGE, NO_EFFECT_NOTE, FAMILY_MARK, RARITY_MARK, SORT_LABELS } from './cards.js';
import { toast, announce, hidePopover } from './ui.js';
import { termLink } from './terms.js';

const GAP = 14;
const MIN_TILE = 176;
/* The pitch the windowed grid reserves per row. It must be at least as tall as
 * the tallest tile it can be asked to render, or rows overlap: the rows are
 * absolutely positioned at `rowIndex * ROW_H`, while `.codexRow` itself is a
 * fixed `--tile-h` (272px) whose grid items size to their content.
 *
 * A tile is 272–276px with a single-line contextual note. The 231 cards that
 * carry the "no mechanical effect" disclosure reach 292px when they ALSO carry
 * a note ("In doctrine"), because the note slot is then two lines. 300 leaves
 * that case 8px of clearance. If the design layer ever gives the disclosure a
 * treatment that costs no line, this can come back down to `--tile-h` + GAP. */
const ROW_H = 300;
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const COSTS = [['all', 'Any cost'], ['0-3', '0–3 total'], ['4-6', '4–6 total'], ['7+', '7+ total']];

/* ---------- IA-2: the URL is user input ----------
   Anyone can type, bookmark or share `#/codex?d=NOPE`. Every value that comes
   out of the query string is checked against the set it is allowed to belong to
   before it reaches the store, so an unknown value degrades to "no filter"
   rather than throwing halfway through the route handler and leaving the shell
   (nav highlight, <title>, body[data-view]) pointing at the previous screen. */

const FAMILY_VALUES = new Set(families);
const RARITY_VALUES = new Set(RARITIES);
const COST_VALUES = new Set(COSTS.map(([value]) => value));
const SORT_VALUES = new Set(Object.keys(SORT_LABELS));

function validDivision(raw) {
  if (raw === null || raw === undefined || raw === 'all' || raw === '') return 'all';
  const n = Number(raw);
  return Number.isInteger(n) && divisionById.has(n) ? String(n) : 'all';
}

const oneOf = (raw, allowed, fallback) => (allowed.has(raw) ? raw : fallback);

/** Query params → a store patch that is guaranteed to be renderable. */
function normalizeQuery(query) {
  const q = query || {};
  return {
    d: validDivision(q.d),
    f: oneOf(q.f, FAMILY_VALUES, 'all'),
    r: oneOf(q.r, RARITY_VALUES, 'all'),
    c: oneOf(q.c, COST_VALUES, 'all'),
    q: typeof q.q === 'string' ? q.q : '',
    sort: oneOf(q.sort, SORT_VALUES, 'division'),
  };
}

const sameQuery = (a, b) => a.d === b.d && a.f === b.f && a.r === b.r && a.c === b.c && a.q === b.q && a.sort === b.sort;

export function createCodex({ store, router, deck }) {
  let results = cards;
  let cols = 5, rows = 0, cursor = 0;
  let pool = [];              // row elements, each holding `cols` tiles
  let poolCols = 0;
  let detailCard = null;
  let mounted = false;

  /* ---------- static DOM, built once ---------- */

  const search = h('input', {
    id: 'codexSearch', type: 'search', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Name, rule, ID, division, keyword', 'aria-describedby': 'codexCount',
  });
  const familySel = h('select', { id: 'codexFamily' }, h('option', { value: 'all' }, 'All families'), ...families.map(f => h('option', { value: f }, f)));
  const raritySel = h('select', { id: 'codexRarity' }, h('option', { value: 'all' }, 'Any rarity'), ...RARITIES.map(r => h('option', { value: r }, r)));
  const costSel = h('select', { id: 'codexCost' }, ...COSTS.map(([v, l]) => h('option', { value: v }, l)));
  const sortSel = h('select', { id: 'codexSort' }, ...Object.entries(SORT_LABELS).map(([v, l]) => h('option', { value: v }, l)));

  const countEl = h('h1', { class: 'screenTitle', id: 'codexCount', tabindex: '-1' });
  const chipsEl = h('div', { class: 'filterChips', 'aria-label': 'Active filters' });
  const emptyEl = h('div', { class: 'emptyState', hidden: true });

  const railList = h('div', { class: 'divisionRailList', role: 'listbox', 'aria-label': 'Filter by division' });
  const railButtons = [];
  for (const d of [{ id: 'all', name: 'All divisions', icon: '∞', color: 'var(--gold)' }, ...divisions]) {
    const b = h('button', {
      type: 'button', class: 'railBtn', role: 'option', tabindex: '-1',
      dataset: { action: 'division', division: d.id },
      style: { '--division': d.color },
    },
      h('span', { class: 'divisionIcon', 'aria-hidden': 'true', text: d.icon }),
      h('span', { class: 'railName' }, h('small', { text: d.id === 'all' ? '∞' : pad2(d.id) }), d.name),
    );
    railButtons.push(b); railList.append(b);
  }

  const rowsHost = h('div', { class: 'codexRows' });
  const scroller = h('div', {
    class: 'codexScroller', role: 'grid', tabindex: '-1',
    'aria-label': 'Card canon', 'aria-readonly': 'true',
  }, rowsHost);

  const detail = createDetailPanel({ onClose: () => closeDetail(), onStep: (d) => stepDetail(d), deck });

  const el = h('div', { class: 'screen codexScreen' },
    h('aside', { class: 'divisionRail' }, railList),
    h('section', { class: 'codexMain' },
      h('header', { class: 'toolbar' },
        h('div', { class: 'toolbarHead' },
          h('span', { class: 'eyeline' }, 'Canonical card registry'),
          countEl,
          chipsEl,
        ),
        h('div', { class: 'toolbarControls' },
          h('label', { class: 'field fieldSearch' }, h('span', {}, 'Search'), search, h('kbd', { class: 'fieldHint' }, '/')),
          h('label', { class: 'field' }, h('span', {}, 'Family'), familySel),
          h('label', { class: 'field' }, h('span', {}, 'Rarity'), raritySel),
          h('label', { class: 'field' }, h('span', {}, 'Cost'), costSel),
          h('label', { class: 'field' }, h('span', {}, 'Sort'), sortSel),
        ),
      ),
      scroller,
      emptyEl,
    ),
    detail.el,
  );

  /* ---------- filter plumbing ---------- */

  function filters() {
    const q = store.state.codex;
    return { division: q.d, family: q.f, rarity: q.r, cost: q.c, query: q.q, sort: q.sort };
  }

  function syncControls() {
    const f = filters();
    if (search.value !== f.query) search.value = f.query;
    if (familySel.value !== f.family) familySel.value = f.family;
    if (raritySel.value !== f.rarity) raritySel.value = f.rarity;
    if (costSel.value !== f.cost) costSel.value = f.cost;
    if (sortSel.value !== f.sort) sortSel.value = f.sort;
    railButtons.forEach(b => {
      const active = String(b.dataset.division) === String(f.division);
      setClass(b, 'active', active);
      setAttr(b, 'aria-selected', active ? 'true' : 'false');
    });
    rove(railButtons, Math.max(0, railButtons.findIndex(b => b.classList.contains('active'))));
  }

  function renderChips() {
    clear(chipsEl);
    const f = filters();
    const chips = [];
    // Belt and braces: normalizeQuery already guarantees a real division, but a
    // chip is not worth throwing the whole route handler for if that ever slips.
    const d = divisionById.get(Number(f.division));
    if (f.division !== 'all' && d) chips.push(['d', `${d.icon} ${d.name}`]);
    if (f.family !== 'all') chips.push(['f', `${FAMILY_MARK[f.family] || '✦'} ${f.family}`]);
    if (f.rarity !== 'all') chips.push(['r', `${RARITY_MARK[f.rarity]} ${f.rarity}`]);
    if (f.cost !== 'all') chips.push(['c', `Cost ${f.cost}`]);
    if (f.query) chips.push(['q', `“${f.query}”`]);
    for (const [key, label] of chips) {
      chipsEl.append(h('button', { type: 'button', class: 'chip', dataset: { action: 'clearFilter', key } },
        label, h('span', { class: 'chipX', 'aria-hidden': 'true' }, '✕'),
        h('span', { class: 'srOnly' }, ' — remove filter')));
    }
    if (chips.length > 1) chipsEl.append(h('button', { type: 'button', class: 'chip chipClearAll', dataset: { action: 'clearFilter', key: 'ALL' } }, 'Clear all filters'));
  }

  function renderEmpty() {
    const f = filters();
    if (results.length) { emptyEl.hidden = true; clear(emptyEl); return; }
    emptyEl.hidden = false;
    clear(emptyEl);
    const scope = [
      f.division !== 'all' ? divisionById.get(Number(f.division))?.name : null,
      f.family !== 'all' ? f.family : null,
      f.rarity !== 'all' ? f.rarity : null,
    ].filter(Boolean).join(' · ');
    emptyEl.append(
      h('p', { class: 'emptyLead' }, f.query ? `No cards match “${f.query}”` : 'No cards match these filters', scope ? ` in ${scope}.` : '.'),
      h('button', { type: 'button', class: 'btn', dataset: { action: 'clearFilter', key: 'ALL' } }, 'Clear all filters'),
    );
    const near = nearestByName(f.query);
    if (near.length) {
      emptyEl.append(h('p', { class: 'emptyHint' }, 'Closest names in the canon:'),
        h('ul', { class: 'emptyList' }, ...near.map(c => h('li', {}, h('button', { type: 'button', class: 'linkBtn', dataset: { action: 'openCard', card: c.id } }, c.name)))));
    }
  }

  /* ---------- windowed grid (PF-2) ---------- */

  function measure() {
    const width = scroller.clientWidth - 2; // border
    if (width <= 0) return false;
    const next = Math.max(1, Math.floor((width + GAP) / (MIN_TILE + GAP)));
    const changed = next !== cols;
    cols = next;
    scroller.style.setProperty('--cols', cols);
    return changed;
  }

  function ensurePool() {
    const visibleRows = Math.ceil(scroller.clientHeight / ROW_H) + 2;
    if (pool.length >= visibleRows && poolCols === cols) return;
    if (poolCols !== cols) { pool.forEach(r => r.el.remove()); pool = []; poolCols = cols; }
    while (pool.length < visibleRows) {
      const tiles = [];
      const rowEl = h('div', { class: 'codexRow', role: 'row' });
      for (let i = 0; i < cols; i++) {
        const tile = makeTile({ role: 'gridcell' });
        tile.dataset.action = 'openCard';
        tiles.push(tile); rowEl.append(tile);
      }
      rowsHost.append(rowEl);
      pool.push({ el: rowEl, tiles });
    }
  }

  function layout() {
    rows = Math.ceil(results.length / cols);
    rowsHost.style.height = `${Math.max(0, rows * ROW_H - GAP)}px`;
  }

  const paint = rafThrottle(() => {
    if (!mounted || el.hidden) return;
    ensurePool();
    const top = scroller.scrollTop;
    const firstRow = clamp(Math.floor(top / ROW_H) - 1, 0, Math.max(0, rows - 1));
    for (let p = 0; p < pool.length; p++) {
      const rowIndex = firstRow + p;
      const slot = pool[p];
      if (rowIndex >= rows) { slot.el.hidden = true; continue; }
      slot.el.hidden = false;
      slot.el.style.transform = `translateY(${rowIndex * ROW_H}px)`;
      setAttr(slot.el, 'aria-rowindex', rowIndex + 1);
      for (let ci = 0; ci < slot.tiles.length; ci++) {
        const index = rowIndex * cols + ci;
        const tile = slot.tiles[ci];
        const card = results[index];
        if (!card) { tile.hidden = true; tile.tabIndex = -1; continue; }
        tile.hidden = false;
        setAttr(tile, 'aria-colindex', ci + 1);
        tile.dataset.index = index;
        paintTile(tile, card, {
          selected: detailCard?.id === card.id,
          note: deck.has(card.id) ? 'In doctrine' : '',
          noteKind: deck.has(card.id) ? 'ok' : null,
        });
        tile.tabIndex = index === cursor ? 0 : -1;
      }
    }
    setAttr(scroller, 'aria-rowcount', rows);
    setAttr(scroller, 'aria-colcount', cols);
  });

  function tileFor(index) {
    for (const slot of pool) for (const t of slot.tiles) if (!t.hidden && Number(t.dataset.index) === index) return t;
    return null;
  }

  function focusCell(index, { scroll = true } = {}) {
    cursor = clamp(index, 0, Math.max(0, results.length - 1));
    if (scroll) {
      const row = Math.floor(cursor / cols);
      const top = row * ROW_H, bottom = top + ROW_H;
      if (top < scroller.scrollTop) scroller.scrollTop = top;
      else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
    }
    ensurePool();
    paint();
    requestAnimationFrame(() => { const t = tileFor(cursor); if (t) { t.tabIndex = 0; t.focus({ preventScroll: true }); } });
  }

  /* ---------- results ---------- */

  function recompute({ keepCursor = false } = {}) {
    results = queryCards(filters());
    if (!keepCursor) {
      cursor = 0;
      // The result set just changed under the viewport. Resetting the cursor is
      // not enough: the browser keeps the old scroll offset and merely clamps it
      // to the new (much smaller) maximum, so narrowing 1,134 cards to 21 parks
      // the reader at the bottom of the matches with the best ones off-screen
      // above. Filtering always starts you at the first result.
      scroller.scrollTop = 0;
    } else {
      cursor = clamp(cursor, 0, Math.max(0, results.length - 1));
    }
    setText(countEl, `${results.length.toLocaleString()} card${results.length === 1 ? '' : 's'} visible`);
    renderChips();
    renderEmpty();
    layout();
    scroller.hidden = results.length === 0;
    paint();
  }

  /* ---------- detail (P0-2) ---------- */

  function openCard(id, { push = true } = {}) {
    const card = cardById.get(id);
    if (!card) return;
    detailCard = card;
    const idx = results.findIndex(c => c.id === id);
    detail.show(card, {
      position: idx >= 0 ? `${idx + 1} of ${results.length.toLocaleString()}` : 'Outside the current filter',
      hasPrev: idx > 0, hasNext: idx >= 0 && idx < results.length - 1,
      inDeck: deck.has(id), deckCount: deck.size(),
    });
    el.classList.add('detailOpen');
    if (push) router.go({ view: 'codex', id, query: queryOf() });
    paint();
    announce(`${card.name} opened.`);
  }

  function closeDetail() {
    if (!detailCard) return;
    const id = detailCard.id;
    detailCard = null;
    detail.hide();
    el.classList.remove('detailOpen');
    router.go({ view: 'codex', id: null, query: queryOf() });
    paint();
    const idx = results.findIndex(c => c.id === id);
    if (idx >= 0) focusCell(idx);
    else scroller.focus({ preventScroll: true });
  }

  function stepDetail(delta) {
    if (!detailCard) return;
    const idx = results.findIndex(c => c.id === detailCard.id);
    const next = results[idx + delta];
    if (next) { openCard(next.id); focusCellSilently(idx + delta); }
  }

  function focusCellSilently(index) {
    cursor = clamp(index, 0, Math.max(0, results.length - 1));
    const row = Math.floor(cursor / cols) * ROW_H;
    if (row < scroller.scrollTop || row + ROW_H > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = row - scroller.clientHeight / 2 + ROW_H / 2;
    paint();
  }

  function queryOf() {
    const f = store.state.codex;
    return { d: f.d, f: f.f, r: f.r, c: f.c, q: f.q, sort: f.sort === 'division' ? '' : f.sort };
  }

  function setFilter(patch, { replace = false } = {}) {
    store.set({ codex: { ...store.state.codex, ...patch } });
    syncControls();
    recompute();
    router.go({ view: 'codex', id: detailCard?.id || null, query: queryOf() }, { replace });
  }

  /* ---------- events ---------- */

  delegate(el, 'click', {
    division: (b) => setFilter({ d: b.dataset.division }),
    openCard: (b) => { if (b.dataset.card) openCard(b.dataset.card, { push: true }); },
    clearFilter: (b) => {
      const key = b.dataset.key;
      if (key === 'ALL') setFilter({ d: 'all', f: 'all', r: 'all', c: 'all', q: '' });
      else setFilter({ [key]: key === 'q' ? '' : 'all' });
      search.focus();
    },
    closeDetail: () => closeDetail(),
    prevCard: () => stepDetail(-1),
    nextCard: () => stepDetail(1),
    addToDeck: (b) => deck.add(b.dataset.card, { source: 'codex' }),
    removeFromDeck: (b) => deck.remove(b.dataset.card, { source: 'codex' }),
    copyLink: (b) => {
      const url = `${location.origin}${location.pathname}#/codex/${encodeURIComponent(b.dataset.card)}`;
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast('Card link copied.'), () => toast(url));
      else toast(url);
    },
  });

  search.addEventListener('input', () => setFilter({ q: search.value }, { replace: true }));
  familySel.addEventListener('change', () => setFilter({ f: familySel.value }));
  raritySel.addEventListener('change', () => setFilter({ r: raritySel.value }));
  costSel.addEventListener('change', () => setFilter({ c: costSel.value }));
  sortSel.addEventListener('change', () => setFilter({ sort: sortSel.value }));

  scroller.addEventListener('scroll', paint, { passive: true });

  scroller.addEventListener('keydown', ev => {
    if (!results.length) return;
    const perPage = Math.max(1, Math.floor(scroller.clientHeight / ROW_H)) * cols;
    let next = null;
    switch (ev.key) {
      case 'ArrowRight': next = cursor + 1; break;
      case 'ArrowLeft': next = cursor - 1; break;
      case 'ArrowDown': next = cursor + cols; break;
      case 'ArrowUp': next = cursor - cols; break;
      case 'Home': next = ev.ctrlKey ? 0 : Math.floor(cursor / cols) * cols; break;
      case 'End': next = ev.ctrlKey ? results.length - 1 : Math.min(results.length - 1, Math.floor(cursor / cols) * cols + cols - 1); break;
      case 'PageDown': next = cursor + perPage; break;
      case 'PageUp': next = cursor - perPage; break;
      case 'Enter': case ' ': {
        const card = results[cursor];
        if (card) { ev.preventDefault(); openCard(card.id); }
        return;
      }
      case 'a': case 'A': {
        const card = results[cursor];
        if (card) { ev.preventDefault(); deck.add(card.id, { source: 'codex' }); paint(); }
        return;
      }
      default: return;
    }
    if (next === null) return;
    ev.preventDefault();
    focusCell(next);
  });

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(rafThrottle(() => { if (measure()) { pool.forEach(r => r.el.remove()); pool = []; poolCols = 0; } layout(); paint(); })) : null;

  /* ---------- lifecycle ---------- */

  return {
    el,
    mount() {
      mounted = true;
      if (ro) ro.observe(scroller);
      measure(); ensurePool(); syncControls(); recompute();
    },
    show(route, { focus = true } = {}) {
      el.hidden = false;
      // Route query is authoritative on entry (IA-2) — after validation.
      const q = normalizeQuery(route.query);
      // Typing in the search field already applied the filter and recomputed
      // before it rewrote the URL, and that URL rewrite lands back here. Without
      // this guard every keystroke costs two full passes over the canon; the
      // route-level guard in core.js cannot help, because the URL really did
      // change. If the store already says what the URL says, there is nothing
      // to do but repaint.
      const stale = !sameQuery(store.state.codex, q);
      const colsChanged = measure();
      if (colsChanged) { pool.forEach(r => r.el.remove()); pool = []; poolCols = 0; }
      ensurePool();
      if (stale) {
        store.set({ codex: q });
        syncControls();
        recompute({ keepCursor: true });
      } else if (colsChanged) {
        layout(); paint();
      } else {
        paint();
      }
      if (route.id && cardById.has(route.id)) { if (detailCard?.id !== route.id) openCard(route.id, { push: false }); }
      else if (detailCard) { detailCard = null; detail.hide(); el.classList.remove('detailOpen'); paint(); }
      // Never steal focus on a self-initiated route change — the user may be typing.
      if (focus) countEl.focus({ preventScroll: true });
    },
    hide() { el.hidden = true; },
    focusSearch() { search.focus(); search.select(); },
    escape() {
      if (detailCard) { closeDetail(); return true; }
      if (document.activeElement === search && search.value) { setFilter({ q: '' }); return true; }
      return false;
    },
    refreshDeckState() { paint(); if (detailCard) detail.setDeckState(deck.has(detailCard.id), deck.size()); },
  };
}

/* ---------- the detail panel (IA-11) ---------- */

function createDetailPanel({ onClose, onStep, deck }) {
  const title = h('h2', { class: 'detailName', tabindex: '-1' });
  const sub = h('p', { class: 'detailSub' });
  const art = h('div', { class: 'detailArt cardArt', 'aria-hidden': 'true' });
  const rules = h('p', { class: 'detailRules', id: 'detailRules' });
  const specs = h('dl', { class: 'detailSpecs' });
  const behaviour = h('div', { class: 'detailBehaviour' });
  const position = h('span', { class: 'detailPosition' });
  const deckBtn = h('button', { type: 'button', class: 'btn primary' });
  const prevBtn = h('button', { type: 'button', class: 'btn iconBtn', dataset: { action: 'prevCard' }, 'aria-label': 'Previous card' }, '‹');
  const nextBtn = h('button', { type: 'button', class: 'btn iconBtn', dataset: { action: 'nextCard' }, 'aria-label': 'Next card' }, '›');
  let current = null;

  const el = h('aside', {
    class: 'cardDetail', hidden: true, role: 'complementary', 'aria-label': 'Card detail',
  },
    h('header', { class: 'detailHead' },
      h('div', { class: 'detailNav' }, prevBtn, position, nextBtn),
      h('button', { type: 'button', class: 'btn iconBtn', dataset: { action: 'closeDetail' }, 'aria-label': 'Close card detail' }, '✕'),
    ),
    h('div', { class: 'detailBody' },
      art, title, sub, rules, specs, behaviour,
    ),
    h('footer', { class: 'detailFoot' },
      deckBtn,
      h('button', { type: 'button', class: 'btn', dataset: { action: 'copyLink' } }, 'Copy card link'),
    ),
  );

  el.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.stopPropagation(); onClose(); }
    else if (ev.key === '[') { ev.preventDefault(); onStep(-1); }
    else if (ev.key === ']') { ev.preventDefault(); onStep(1); }
  });

  function row(term, value) {
    if (value === null || value === undefined || value === '') return;
    specs.append(h('div', { class: 'specRow' }, h('dt', { text: term }), h('dd', { text: value })));
  }

  return {
    el,
    show(c, { position: pos, hasPrev, hasNext, inDeck, deckCount }) {
      current = c;
      const d = divisionById.get(c.divisionId);
      el.hidden = false;
      el.style.setProperty('--division', d.color);
      el.dataset.division = c.divisionId;
      el.dataset.rarity = c.rarity;
      art.style.setProperty('--art-x', c.art.col);
      art.style.setProperty('--art-y', c.art.row);
      art.dataset.glyph = d.icon;
      setText(title, c.name);
      setText(sub, `${d.icon} ${pad2(d.id)} ${d.name} · ${FAMILY_MARK[c.family] || '✦'} ${c.family} · ${RARITY_MARK[c.rarity]} ${c.rarity}`);
      setText(rules, c.rulesText);
      setText(position, pos);
      prevBtn.disabled = !hasPrev; nextBtn.disabled = !hasNext;
      clear(specs);
      row('Subtype', c.subtype);
      row('Cost', `${c.cost.command} Command · ${c.cost.insight} Insight · ${c.cost.essence} Essence (${totalCost(c)} total)`);
      row('Power', `${c.power} — attack and durability`);
      row('Timing', c.timing);
      row('Targeting', c.targeting);
      row('Duration', c.duration);
      row('Keywords', c.keywords.join(' · '));
      row('Counterplay', c.counterplay.join(' · '));
      row('Set', c.setLabel);
      row('Card ID', c.id);
      row('Doctrine', d.doctrine);
      clear(behaviour);
      behaviour.append(
        h('h3', { class: 'detailSubhead' }, 'How this behaves in a match'),
        // Stated before the family flavour text, not after it: on these 231
        // cards the flavour text is what misleads.
        hasNoEffect(c) ? h('p', { class: 'detailBlank' }, h('strong', {}, NO_EFFECT_BADGE), ' — ', NO_EFFECT_NOTE) : null,
        h('p', {}, matchBehaviour(c)),
        h('p', { class: 'detailFootnote' }, 'Full rules: ', termLink('power'), ' · ', termLink('lane'), ' · ', termLink('refresh')),
      );
      this.setDeckState(inDeck, deckCount);
      requestAnimationFrame(() => title.focus({ preventScroll: true }));
    },
    setDeckState(inDeck, deckCount) {
      if (!current) return;
      deckBtn.dataset.action = inDeck ? 'removeFromDeck' : 'addToDeck';
      deckBtn.dataset.card = current.id;
      setText(deckBtn, inDeck ? `Remove from doctrine (${deckCount}/30)` : `Add to doctrine (${deckCount}/30)`);
      setClass(deckBtn, 'primary', !inDeck);
    },
    hide() { el.hidden = true; current = null; hidePopover(); },
  };
}

/* Quotes the engine's deterministic interpretation per family (docs/match-rules.md). */
const BEHAVIOUR = {
  Specimen: 'Deployed into a lane holding an enemy unit, it gains +1 power until end of turn.',
  Weapon: 'Attaches to the strongest friendly unit in the lane. That unit\'s first attack each turn gains +2 power — the board shows the combined figure, not the printed one.',
  Monster: 'On deployment, if its power exceeds every enemy unit already in the lane, it deals 1 Core damage.',
  Knight: 'Guard: prioritised as a defender, and the first combat damage to an allied unit in the lane is reduced by 1.',
  Warrior: 'After surviving its attack it may shift one lane, but only when that improves the lane balance and a slot is free.',
  Magician: 'On play, keeps the next card of your deck and puts the one after it on the bottom.',
  Environment: 'While active, the first card played into each lane each turn costs 1 less of its highest non-zero resource.',
  Disaster: 'Deals 1 damage to the highest-power enemy in every lane, then exhausts each survivor it hit.',
  Defense: 'Prevents the first 2 Core damage from its lane each turn. Multiple Defenses stack.',
  Base: 'At refresh, generates 1 resource matching the dominant cost among friendly cards in its lane.',
  Item: 'Gives the strongest friendly unit in the lane +1 power until end of turn.',
  Operative: 'Records its division keyword trigger. Needs no target; no undefined numeric effect is invented.',
  Action: 'Gives the strongest friendly unit in the chosen lane +2 power until end of turn.',
  Trap: 'Installed face down. The next enemy entity entering the lane is exhausted, its deploy trigger suppressed, and the Trap is consumed.',
  Reaction: 'Set as a support. Reduces the next effect-damage by 1 and grants 1 Insight, then is consumed.',
  Response: 'Copies one numeric keyword trigger from a friendly card that just resolved, at half value rounded down.',
  Law: 'A persistent global rule limiting repeated triggers with the same name to once per turn per side.',
  Spell: 'Resolves its two canonical keyword applications against a legal target.',
  Hex: 'Attaches to an opposing unit in the lane. Requires an enemy unit to be there.',
  Plague: 'Infects the enemy units in its lane. Infected units lose 1 power at each end step; moving lanes clears it.',
  Virus: 'A persistent system threat: it delays the first automated or repeated enemy trigger each turn to the end step.',
  Dragon: 'Flying: bypasses ground defenders unless the lane holds a Flying unit or a Guard. On deployment it disables opposing Defense/Base infrastructure there.',
  Deity: 'A unique entity. Converts one resource type into another once per turn at refresh.',
  Android: 'At refresh, repeats its last lane action if the target is still legal.',
  God: 'A unique entity. Its decree is visible canonical text; the engine adds no new global rule.',
  Ruler: 'A leader entity. Its optional mixed-resource activation is not auto-fired.',
  Ritual: 'Gains one channel counter at each end step; at Channel 3 it is marked ready.',
  World: 'A persistent global World card. Division matching is preserved as metadata.',
};

function matchBehaviour(c) {
  const base = BEHAVIOUR[c.family] || 'Resolves its canonical text with the engine\'s smallest consistent interpretation.';
  const needsUnit = ['Item', 'Action', 'Weapon'].includes(c.family) ? ' It cannot be played into a lane with no friendly unit.' : '';
  const needsEnemy = c.family === 'Hex' ? ' It cannot be played into a lane with no opposing unit.' : '';
  return base + needsUnit + needsEnemy;
}
