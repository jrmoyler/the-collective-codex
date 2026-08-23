/* presentation.test.mjs — the first tests for src/.
 *
 * Everything else in tests/ imports the engine, the canon or deck-store; the
 * ~2,800 lines under src/ that decide what a person actually sees had no
 * coverage at all, which is how a double-firing router, a throwing route
 * handler, a grid that parks you at the bottom of a filtered list and a modal
 * you could navigate out from under all shipped at once.
 *
 * These tests exercise behaviour a user could observe — what ends up in the
 * DOM, what the URL round-trips to, which tile is on screen — not internals.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-stub.mjs';

const dom = installDom();

// Dynamic, because the stub must be on globalThis before src/ evaluates.
const { h, delegate, router, createStore, setText, setAttr } = await import('../src/core.js');
const { createVGrid } = await import('../src/vgrid.js');
const cardsMod = await import('../src/cards.js');
const { cards } = await import('../card-canon.js');

/* ============================== store ============================== */

test('the store notifies subscribers with the keys that changed', () => {
  const store = createStore({ match: null, codex: {} });
  const seen = [];
  const off = store.onChange((state, keys) => seen.push([keys, state.match]));
  store.set({ codex: { q: 'x' } });
  store.set({ match: { id: 1 } });
  assert.deepEqual(seen, [[['codex'], null], [['match'], { id: 1 }]]);
  off();
  store.set({ match: null });
  assert.equal(seen.length, 2, 'unsubscribing actually unsubscribes');
});

test('a throwing subscriber cannot take the screen down with it', () => {
  // Match persistence rides on this: a full localStorage must not be able to
  // interrupt the screen that was mid-update when it filled up.
  const store = createStore({ match: null });
  const reached = [];
  store.onChange(() => { throw new Error('quota'); });
  store.onChange(() => reached.push(true));
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try { assert.doesNotThrow(() => store.set({ match: 1 })); } finally { console.error = original; }
  assert.deepEqual(reached, [true], 'later subscribers still run');
  assert.equal(errors.length, 1, 'and the failure is reported rather than swallowed');
});

/* ============================== h() ============================== */

test('h writes CSS custom properties through setProperty', () => {
  // Object.assign / plain assignment silently drops `--x` on a real
  // CSSStyleDeclaration, so the division colour would never reach the card.
  const el = h('div', { style: { '--division': '#D4A843', height: '10px', width: null } });
  assert.equal(el.style.getPropertyValue('--division'), '#D4A843');
  assert.equal(el.style.height, '10px');
  assert.equal(el.style.getPropertyValue('--not-set'), '');
  assert.equal('width' in el.style, false, 'a null style value is skipped entirely');
});

test('h coerces custom property values to strings', () => {
  const el = h('span', { style: { '--art-x': 0, '--art-y': 12 } });
  assert.equal(el.style.getPropertyValue('--art-x'), '0');
  assert.equal(el.style.getPropertyValue('--art-y'), '12');
});

test('h binds on* function props as listeners with a lowercased event name', () => {
  let clicks = 0, keys = 0;
  const el = h('button', {
    onclick: () => { clicks += 1; },
    onKeyDown: () => { keys += 1; },
    onnotafunction: 'javascript:alert(1)',
  });
  el.dispatch('click');
  el.dispatch('keydown');
  assert.equal(clicks, 1);
  assert.equal(keys, 1);
  // Non-function `on*` values are not listeners; they take the attribute path.
  assert.equal(el.getAttribute('onnotafunction'), 'javascript:alert(1)');
});

test('h writes dataset entries and skips null/undefined ones', () => {
  const el = h('button', { dataset: { action: 'openCard', card: 'D01-ITEM-S01-01', index: 0, note: null, kind: undefined } });
  assert.equal(el.dataset.action, 'openCard');
  assert.equal(el.dataset.card, 'D01-ITEM-S01-01');
  assert.equal(el.dataset.index, '0', 'zero is a value, not an absence');
  assert.equal('note' in el.dataset, false);
  assert.equal('kind' in el.dataset, false);
  // dataset must reflect into attributes or delegation cannot find it.
  assert.equal(el.getAttribute('data-action'), 'openCard');
});

test('h skips only null, undefined and false — never 0 or the empty string', () => {
  const el = h('input', {
    hidden: false, disabled: null, placeholder: undefined,
    tabindex: 0, value: '', required: true,
  });
  assert.equal(el.hasAttribute('hidden'), false);
  assert.equal(el.hasAttribute('disabled'), false);
  assert.equal(el.hasAttribute('placeholder'), false);
  assert.equal(el.getAttribute('tabindex'), '0');
  assert.equal(el.getAttribute('value'), '');
  assert.equal(el.getAttribute('required'), '', 'true becomes a bare boolean attribute');
});

test('h flattens children and skips the falsy ones', () => {
  const el = h('p', {}, 'a', 0, null, false, undefined, ['b', ['c']], h('b', {}, 'd'));
  assert.equal(el.textContent, 'a0bcd');
});

test('h has no markup-parsing prop — an `html` key is an ordinary attribute', () => {
  // The `html:` branch was the only innerHTML write in the shipped bundle.
  // With it gone there is no way to get a string parsed as markup through h().
  const payload = '<img src=x onerror=alert(1)>';
  const el = h('div', { html: payload });
  assert.equal(el.childNodes.length, 0, 'nothing was parsed into children');
  assert.equal(el.textContent, '');
  assert.equal(el.getAttribute('html'), payload);
  assert.equal(el.innerHTML, undefined, 'innerHTML was never assigned');
});

test('setText and setAttr only write when the value actually changed', () => {
  const el = h('span', {}, 'first');
  setText(el, 'first');
  assert.equal(el.textContent, 'first');
  setText(el, 'second');
  assert.equal(el.textContent, 'second');
  setText(el, null);
  assert.equal(el.textContent, '');

  setAttr(el, 'aria-selected', 'true');
  assert.equal(el.getAttribute('aria-selected'), 'true');
  setAttr(el, 'aria-selected', null);
  assert.equal(el.hasAttribute('aria-selected'), false);
  setAttr(el, 'aria-disabled', true);
  assert.equal(el.getAttribute('aria-disabled'), '');
});

/* ============================ delegate() ============================ */

test('delegate dispatches a registered data-action', () => {
  const root = h('div', {});
  dom.body.append(root);
  const btn = h('button', { dataset: { action: 'openCard', card: 'X' } });
  root.append(btn);
  const seen = [];
  delegate(root, 'click', { openCard: (el) => seen.push(el.dataset.card) });
  btn.dispatch('click');
  assert.deepEqual(seen, ['X']);
});

test('delegate never resolves a data-action off Object.prototype', () => {
  // `data-action` comes from markup. With an object lookup, "constructor",
  // "toString" or "valueOf" all resolve to a real function and get called with
  // (element, event).
  const root = h('div', {});
  dom.body.append(root);
  let ran = 0;
  delegate(root, 'click', { real: () => { ran += 1; } });

  for (const action of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    const btn = h('button', { dataset: { action } });
    root.append(btn);
    assert.doesNotThrow(() => btn.dispatch('click'), `data-action="${action}" must be inert`);
    btn.remove();
  }
  assert.equal(ran, 0);

  const good = h('button', { dataset: { action: 'real' } });
  root.append(good);
  good.dispatch('click');
  assert.equal(ran, 1, 'registered actions still work');
});

/* ============================= store ============================= */

test('createStore merges patches into a shared state object', () => {
  const store = createStore({ codex: { q: '' }, match: null });
  const before = store.state;
  store.set({ codex: { q: 'knight' } });
  assert.equal(store.state, before, 'the state object identity is stable');
  assert.equal(store.state.codex.q, 'knight');
  assert.equal(store.state.match, null, 'untouched keys survive');
});

/* ============================= router ============================= */

test('router.serialize drops empty and "all" filter values', () => {
  assert.equal(router.serialize({ view: 'home', id: null, query: {} }), '#/');
  assert.equal(router.serialize({ view: 'codex', id: null, query: {} }), '#/codex');
  assert.equal(
    router.serialize({ view: 'codex', id: null, query: { d: 'all', f: '', r: null, c: undefined, q: 'knight' } }),
    '#/codex?q=knight',
  );
  assert.equal(
    router.serialize({ view: 'codex', id: 'D07-ITEM-S03-07', query: {} }),
    '#/codex/D07-ITEM-S03-07',
  );
});

test('router round-trips a real codex route through the URL', () => {
  const route = { view: 'codex', id: 'D07-ITEM-S03-07', query: { d: '7', q: 'relic' } };
  const url = router.serialize(route);
  const back = router.parse(url);
  assert.equal(back.view, 'codex');
  assert.equal(back.id, 'D07-ITEM-S03-07');
  assert.deepEqual(back.query, { d: '7', q: 'relic' });
  assert.equal(router.serialize(back), url, 'serialize ∘ parse ∘ serialize is stable');
});

test('router round-trips a card id that needs percent-encoding', () => {
  const route = { view: 'codex', id: 'weird id/with?chars', query: {} };
  const back = router.parse(router.serialize(route));
  assert.equal(back.id, 'weird id/with?chars');
});

test('router.parse never throws on garbage', () => {
  const cases = [
    ['', 'home', null],
    ['#', 'home', null],
    ['#/', 'home', null],
    ['#////', 'home', null],
    ['#/codex?', 'codex', null],
    ['#/codex?=&&d', 'codex', null],
    ['#/codex/%E0%A4%A', 'codex', '%E0%A4%A'],   // malformed percent escape
    ['#/codex/%', 'codex', '%'],
    ['#/nope/x/extra?y=1', 'nope', 'x'],
    ['not-even-a-hash', 'not-even-a-hash', null],
  ];
  for (const [input, view, id] of cases) {
    let out;
    assert.doesNotThrow(() => { out = router.parse(input); }, `parse(${JSON.stringify(input)})`);
    assert.equal(out.view, view, `view for ${JSON.stringify(input)}`);
    assert.equal(out.id, id, `id for ${JSON.stringify(input)}`);
    assert.equal(typeof out.query, 'object');
  }
});

test('router.parse keeps unknown query params as strings for the screen to validate', () => {
  const out = router.parse('#/codex?d=NOPE&sort=zzz');
  assert.deepEqual(out.query, { d: 'NOPE', sort: 'zzz' });
});

test('a single navigation runs the route handler exactly once', () => {
  // Chromium fires BOTH hashchange and popstate for a same-document fragment
  // navigation. Before the guard in emit(), one Back press ran every listener
  // twice — two full passes over 1,134 cards and two identical screen-reader
  // announcements.
  const seen = [];
  const off = router.onChange(route => seen.push(route.view + (route.id ? '/' + route.id : '')));
  dom.setHash('#/');
  router.start();
  assert.deepEqual(seen, ['home'], 'the boot route renders even though it matches the initial state');

  seen.length = 0;
  dom.setHash('#/codex');
  dom.fire('hashchange');
  dom.fire('popstate');
  assert.deepEqual(seen, ['codex'], 'both browser events, one handler run');

  seen.length = 0;
  dom.fire('hashchange');
  dom.fire('popstate');
  assert.deepEqual(seen, [], 're-notifying the same route does nothing');

  seen.length = 0;
  dom.setHash('#/codex?q=knight');
  dom.fire('popstate');
  dom.fire('hashchange');
  assert.deepEqual(seen, ['codex'], 'a query-only change is a real change, still once');

  seen.length = 0;
  dom.setHash('#/codex?q=knight');
  dom.fire('hashchange');
  assert.deepEqual(seen, [], 'identical query is not a change');

  seen.length = 0;
  dom.setHash('#/deck');
  dom.fire('hashchange');
  dom.fire('popstate');
  assert.deepEqual(seen, ['deck']);
  off();
});

/* ============================ createVGrid ============================ */

const ROW_H = 262;
const tilesOf = grid => grid.el.querySelectorAll('.codexCard');
/** A tile is on screen only if neither it nor the row recycling it is hidden —
 *  the grid parks whole surplus rows, not individual cells. */
const isShown = (el) => { let n = el; while (n && n.nodeType === 1) { if (n.hidden) return false; n = n.parentNode; } return true; };
const visibleOf = grid => tilesOf(grid).filter(isShown);

/** width 722 → 4 columns, width 362 → 2 columns (measure() uses clientWidth-2). */
function makeGrid({ width = 722, height = 524, onActivate } = {}) {
  const grid = createVGrid({ minTile: 168, rowH: ROW_H, gap: 12, label: 'Test pool', onActivate });
  grid.el.clientWidth = width;
  grid.el.clientHeight = height;
  dom.body.append(grid.el);
  grid.observe();
  return grid;
}

test('createVGrid renders nothing, and claims nothing, for zero results', () => {
  const grid = makeGrid();
  grid.setItems([]);
  assert.equal(grid.length, 0);
  assert.equal(grid.el.getAttribute('aria-rowcount'), '0');
  assert.equal(visibleOf(grid).length, 0);
  assert.equal(grid.el.querySelector('.vgridRows').style.height, '0px');
});

test('createVGrid lays out exactly one row when the results fit one row', () => {
  const grid = makeGrid();
  grid.setItems(cards.slice(0, 4));
  assert.equal(grid.el.getAttribute('aria-colcount'), '4');
  assert.equal(grid.el.getAttribute('aria-rowcount'), '1');
  assert.equal(grid.el.querySelector('.vgridRows').style.height, `${ROW_H - 12}px`);
  const visible = visibleOf(grid);
  assert.deepEqual(visible.map(t => t.dataset.index), ['0', '1', '2', '3']);
  assert.deepEqual(visible.map(t => t.dataset.card), cards.slice(0, 4).map(c => c.id));
  const rows = grid.el.querySelectorAll('.vgridRow').filter(r => !r.hidden);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].getAttribute('aria-rowindex'), '1');
});

test('createVGrid hides the unused cells of a partly filled row', () => {
  const grid = makeGrid();
  grid.setItems(cards.slice(0, 3));
  assert.equal(grid.el.getAttribute('aria-rowcount'), '1');
  assert.deepEqual(visibleOf(grid).map(t => t.dataset.index), ['0', '1', '2']);
  const firstRow = grid.el.querySelectorAll('.vgridRow')[0];
  assert.equal(firstRow.querySelectorAll('.codexCard').length, 4, 'the pool keeps a full row of tiles');
});

test('createVGrid windows the correct index range when scrolled', () => {
  const grid = makeGrid();
  grid.setItems(cards.slice(0, 10));            // 4 cols → 3 rows
  assert.equal(grid.el.getAttribute('aria-rowcount'), '3');

  grid.el.scrollTop = ROW_H * 2;                // last row in view
  grid.repaint();
  const indexes = visibleOf(grid).map(t => Number(t.dataset.index)).sort((a, b) => a - b);
  assert.equal(indexes[0], 4, 'starts one row above the viewport');
  assert.equal(indexes[indexes.length - 1], 9, 'never paints past the end of the list');
  assert.ok(indexes.every(i => i < 10));
});

test('createVGrid recomputes the index maths when the column count changes mid-scroll', () => {
  const grid = makeGrid();
  grid.setItems(cards.slice(0, 10));
  grid.el.scrollTop = ROW_H;
  grid.repaint();

  grid.el.clientWidth = 362;                     // narrow → 2 columns
  grid.setItems(cards.slice(0, 10), { keepCursor: true });

  assert.equal(grid.el.getAttribute('aria-colcount'), '2');
  assert.equal(grid.el.getAttribute('aria-rowcount'), '5');
  for (const row of grid.el.querySelectorAll('.vgridRow')) {
    assert.equal(row.querySelectorAll('.codexCard').length, 2, 'the tile pool was rebuilt at the new width');
  }
  const visible = visibleOf(grid);
  assert.equal(new Set(visible.map(t => t.dataset.index)).size, visible.length, 'no duplicated indexes');
  for (const tile of visible) {
    const i = Number(tile.dataset.index);
    assert.ok(i >= 0 && i < 10, `index ${i} is inside the list`);
    assert.equal(tile.dataset.card, cards[i].id, 'the tile shows the card its index names');
  }
});

test('createVGrid returns to the top of a newly filtered list', () => {
  // Resetting the cursor without resetting the offset left the browser clamping
  // 45,000px to the new maximum — i.e. the bottom of the matches, with the best
  // ones off-screen above.
  const grid = makeGrid();
  grid.setItems(cards.slice(0, 400));
  grid.el.scrollTop = 20000;
  grid.repaint();

  grid.setItems(cards.slice(0, 4));              // the filter narrowed
  assert.equal(grid.el.scrollTop, 0);
  assert.deepEqual(visibleOf(grid).map(t => t.dataset.index), ['0', '1', '2', '3']);
});

test('createVGrid keeps the offset when the list is re-rendered without a filter change', () => {
  const grid = makeGrid();
  grid.setItems(cards.slice(0, 400));
  grid.el.scrollTop = 1000;
  grid.setItems(cards.slice(0, 400), { keepCursor: true });
  assert.equal(grid.el.scrollTop, 1000, 'remounting a screen must not scroll the reader away');
});

test('createVGrid clamps a kept cursor into a shrunken list', () => {
  const grid = makeGrid();
  grid.setItems(cards.slice(0, 10));
  grid.el.dispatch('keydown', { key: 'End' });
  assert.equal(visibleOf(grid).find(t => t.tabIndex === 0)?.dataset.index, '9');

  grid.setItems(cards.slice(0, 5), { keepCursor: true });
  assert.equal(visibleOf(grid).find(t => t.tabIndex === 0)?.dataset.index, '4');
});

test('createVGrid activates the clicked card', () => {
  const seen = [];
  const grid = makeGrid({ onActivate: (id, index) => seen.push([id, index]) });
  grid.setItems(cards.slice(0, 8));
  const tile = visibleOf(grid).find(t => t.dataset.index === '5');
  tile.dispatch('click');
  assert.deepEqual(seen, [[cards[5].id, 5]]);
});

test('createVGrid ignores keyboard navigation on an empty list', () => {
  const grid = makeGrid();
  grid.setItems([]);
  for (const key of ['ArrowRight', 'ArrowDown', 'End', 'PageDown', 'Enter']) {
    assert.doesNotThrow(() => grid.el.dispatch('keydown', { key }));
  }
  assert.equal(visibleOf(grid).length, 0);
});

/* ================== "no mechanical effect" disclosure ================== */

test('the disclosure covers exactly the four families the engine resolves to nothing', () => {
  const { hasNoEffect, NO_EFFECT_FAMILIES } = cardsMod;
  assert.deepEqual([...NO_EFFECT_FAMILIES].sort(), ['God', 'Operative', 'Ruler', 'World']);
  const affected = cards.filter(hasNoEffect);
  assert.equal(affected.length, 231, '231 of 1,134 cards — 20.4% of the pool');
  assert.equal(cards.filter(c => c.family === 'Knight').every(c => !hasNoEffect(c)), true);
});

test('a tile for an affected card carries a visible badge and says so in its accessible name', () => {
  const { makeTile, paintTile, hasNoEffect, NO_EFFECT_BADGE } = cardsMod;
  const blankCard = cards.find(c => c.family === 'Operative');
  const realCard = cards.find(c => c.family === 'Knight');

  const tile = makeTile({ role: 'gridcell' });
  paintTile(tile, blankCard, {});
  assert.equal(tile.querySelector('.cardNote').textContent, NO_EFFECT_BADGE);
  assert.equal(tile.getAttribute('data-blank'), 'true');
  assert.equal(tile.getAttribute('data-note'), 'warn');
  assert.match(tile.getAttribute('aria-label'), /No mechanical effect\./);

  // Recycling the same tile onto an ordinary card must clear the badge — and the
  // treatment that went with it. `data-note` used to be written only when the
  // caller supplied a `noteKind`, so a grid that paints without one (the default)
  // left `warn` on the next card to land in that cell.
  paintTile(tile, realCard, {});
  assert.equal(tile.querySelector('.cardNote').textContent, '');
  assert.equal(tile.hasAttribute('data-blank'), false);
  assert.equal(tile.hasAttribute('data-note'), false, "the previous card's warning treatment does not survive recycling");
  assert.equal(hasNoEffect(realCard), false);
  assert.equal(/No mechanical effect/.test(tile.getAttribute('aria-label')), false);
});

test('the disclosure leads, and survives a contextual note being added', () => {
  const { makeTile, paintTile, NO_EFFECT_SHORT } = cardsMod;
  const blankCard = cards.find(c => c.family === 'World');
  const tile = makeTile({});
  // Adding the card to a doctrine must not hide the reason that may be a bad idea.
  paintTile(tile, blankCard, { note: 'In doctrine', noteKind: 'ok' });
  assert.equal(tile.querySelector('.cardNote').textContent, `${NO_EFFECT_SHORT} · In doctrine`);
  assert.equal(tile.getAttribute('data-note'), 'warn', 'a card that does nothing is never an "ok" note');

  // An ordinary card keeps the note exactly as the screen wrote it.
  paintTile(tile, cards.find(c => c.family === 'Knight'), { note: 'In doctrine', noteKind: 'ok' });
  assert.equal(tile.querySelector('.cardNote').textContent, 'In doctrine');
  assert.equal(tile.getAttribute('data-note'), 'ok');
});

test('the tile note never grows past two lines worth of content', () => {
  // The row pitch is fixed; a permanently extra line made tiles overlap the row
  // below. The disclosure therefore shares the note slot rather than adding one.
  const { makeTile, paintTile } = cardsMod;
  const tile = makeTile({});
  paintTile(tile, cards.find(c => c.family === 'Operative'), { note: 'Playable here', noteKind: 'ok' });
  assert.equal(tile.querySelectorAll('.cardNote').length, 1);
});

/* ================= canon query: prototype-shaped input ================= */

/* These are the URL-facing lookups. `#/codex?sort=…&c=…` is a shareable link, so
 * whatever is in it is authored by whoever sent it. core.js already refuses to
 * resolve a data-action off Object.prototype for exactly this reason; the canon
 * query tables are the other place a raw string indexes a table, and they used
 * to be object literals. */

const { queryCards, SORT_LABELS } = cardsMod;

test('queryCards never resolves a sort comparator off Object.prototype', () => {
  // '__proto__' resolved to Object.prototype: truthy, not callable, so
  // Array#sort threw mid-render and took the whole Codex screen down.
  const canonical = queryCards({ sort: 'division', family: 'Warrior' }).map(c => c.id);
  for (const hostile of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    let out;
    assert.doesNotThrow(() => { out = queryCards({ sort: hostile, family: 'Warrior' }); }, `sort=${hostile} threw during render`);
    assert.ok(Array.isArray(out), `sort=${hostile} did not return a list`);
    // Unknown sort falls back to the stored canon order, exactly like 'division'.
    assert.deepEqual(out.map(c => c.id), canonical);
  }
});

test('queryCards never resolves a cost band off Object.prototype', () => {
  const everything = queryCards({}).length;
  for (const hostile of ['__proto__', 'constructor', 'toString']) {
    // An inherited member used as a [min,max] pair filtered nothing while
    // looking like a filter had been applied.
    assert.equal(queryCards({ cost: hostile }).length, everything, `cost=${hostile} was treated as a band`);
  }
  assert.ok(queryCards({ cost: '0-3' }).length < everything, 'a real band must still filter');
});

test('every sort the UI offers has a comparator behind it', () => {
  // SORT_LABELS is derived from the comparator table, so a label can no longer
  // exist without one — this pins that they stay one table.
  const ids = queryCards({ sort: 'division' }).map(c => c.id);
  for (const key of Object.keys(SORT_LABELS)) {
    const sorted = queryCards({ sort: key });
    assert.equal(sorted.length, ids.length);
    if (key !== 'division') {
      assert.notEqual(sorted.map(c => c.id).join(), ids.join(), `sort=${key} is offered in the UI but changes nothing`);
    }
  }
});
