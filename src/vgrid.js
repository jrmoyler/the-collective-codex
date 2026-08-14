/* vgrid.js — a minimal windowed card grid used by the deck pool.
   Same technique as the Codex grid: fixed row height, a spacer for the scrollbar,
   and a recycled pool of row elements. Node count stays ~(visibleRows × cols). */

import { h, setAttr, rafThrottle, clamp } from './core.js';
import { makeTile, paintTile } from './cards.js';

export function createVGrid({ minTile = 168, rowH = 262, gap = 12, label = 'Cards', onActivate, paintOpts }) {
  let items = [], cols = 4, rows = 0, pool = [], poolCols = 0, cursor = 0;
  const rowsHost = h('div', { class: 'vgridRows' });
  const el = h('div', { class: 'vgrid', role: 'grid', tabindex: '-1', 'aria-label': label }, rowsHost);

  function measure() {
    const w = el.clientWidth - 2;
    if (w <= 0) return false;
    const next = Math.max(1, Math.floor((w + gap) / (minTile + gap)));
    if (next === cols) return false;
    cols = next; el.style.setProperty('--cols', cols); return true;
  }

  function ensurePool() {
    const need = Math.ceil(el.clientHeight / rowH) + 2;
    if (poolCols !== cols) { pool.forEach(p => p.el.remove()); pool = []; poolCols = cols; }
    while (pool.length < need) {
      const tiles = []; const rowEl = h('div', { class: 'vgridRow', role: 'row' });
      for (let i = 0; i < cols; i++) { const t = makeTile({ role: 'gridcell', cls: 'codexCard compact' }); tiles.push(t); rowEl.append(t); }
      rowsHost.append(rowEl); pool.push({ el: rowEl, tiles });
    }
  }

  const paint = rafThrottle(() => {
    if (!el.isConnected || el.offsetParent === null) return;
    ensurePool();
    const first = clamp(Math.floor(el.scrollTop / rowH) - 1, 0, Math.max(0, rows - 1));
    for (let p = 0; p < pool.length; p++) {
      const r = first + p, slot = pool[p];
      if (r >= rows) { slot.el.hidden = true; continue; }
      slot.el.hidden = false;
      slot.el.style.transform = `translateY(${r * rowH}px)`;
      setAttr(slot.el, 'aria-rowindex', r + 1);
      for (let c = 0; c < slot.tiles.length; c++) {
        const i = r * cols + c, tile = slot.tiles[c], card = items[i];
        if (!card) { tile.hidden = true; tile.tabIndex = -1; continue; }
        tile.hidden = false;
        setAttr(tile, 'aria-colindex', c + 1);
        tile.dataset.index = i;
        paintTile(tile, card, paintOpts ? paintOpts(card, i) : {});
        tile.tabIndex = i === cursor ? 0 : -1;
      }
    }
    setAttr(el, 'aria-rowcount', rows);
    setAttr(el, 'aria-colcount', cols);
  });

  function layout() { rows = Math.ceil(items.length / cols); rowsHost.style.height = `${Math.max(0, rows * rowH - gap)}px`; }

  function focusCell(i) {
    cursor = clamp(i, 0, Math.max(0, items.length - 1));
    const top = Math.floor(cursor / cols) * rowH;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowH > el.scrollTop + el.clientHeight) el.scrollTop = top + rowH - el.clientHeight;
    paint();
    requestAnimationFrame(() => {
      for (const slot of pool) for (const t of slot.tiles) if (!t.hidden && Number(t.dataset.index) === cursor) { t.tabIndex = 0; t.focus({ preventScroll: true }); }
    });
  }

  el.addEventListener('scroll', paint, { passive: true });
  el.addEventListener('click', ev => {
    const tile = ev.target.closest('.codexCard');
    if (tile && tile.dataset.card && onActivate) { cursor = Number(tile.dataset.index) || 0; onActivate(tile.dataset.card, cursor); }
  });
  el.addEventListener('keydown', ev => {
    if (!items.length) return;
    const page = Math.max(1, Math.floor(el.clientHeight / rowH)) * cols;
    let n = null;
    switch (ev.key) {
      case 'ArrowRight': n = cursor + 1; break;
      case 'ArrowLeft': n = cursor - 1; break;
      case 'ArrowDown': n = cursor + cols; break;
      case 'ArrowUp': n = cursor - cols; break;
      case 'Home': n = 0; break;
      case 'End': n = items.length - 1; break;
      case 'PageDown': n = cursor + page; break;
      case 'PageUp': n = cursor - page; break;
      case 'Enter': case ' ': if (onActivate && items[cursor]) { ev.preventDefault(); onActivate(items[cursor].id, cursor); } return;
      default: return;
    }
    ev.preventDefault(); focusCell(n);
  });

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(rafThrottle(() => { if (measure()) { pool.forEach(p => p.el.remove()); pool = []; poolCols = 0; } layout(); paint(); })) : null;

  return {
    el,
    observe() { if (ro) ro.observe(el); measure(); ensurePool(); },
    setItems(next, { keepCursor = false } = {}) {
      items = next;
      if (keepCursor) {
        cursor = clamp(cursor, 0, Math.max(0, items.length - 1));
      } else {
        cursor = 0;
        // Resetting the cursor without resetting the scroll offset leaves the
        // browser clamping the old offset to the new, smaller maximum — i.e.
        // parked at the bottom of a freshly narrowed result set. A new list
        // starts at its first item.
        el.scrollTop = 0;
      }
      measure(); layout(); paint();
    },
    repaint: paint,
    get length() { return items.length; },
  };
}
