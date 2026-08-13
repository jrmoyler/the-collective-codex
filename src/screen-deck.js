/* screen-deck.js — doctrine construction.
   Three panes: pool (windowed) · deck rail (sticky) · analysis (always visible,
   never a modal). Validation is predictive: warnings never block, one error does. */

import { h, setText, setAttr, setClass, clear, delegate, pad2 } from './core.js';
import { divisions, families, cards, cardById, divisionById, queryCards, totalCost, FAMILY_MARK } from './cards.js';
import { createVGrid } from './vgrid.js';
import { toast, confirmDialog, announce, setInlineError } from './ui.js';
import { loadDeckIds, saveDeckIds, buildStarterDeck, deckProfile, castableTurn } from '../deck-store.js';
import * as engine from '../match-engine.js';

const DECK_SIZE = engine.DECK_SIZE;
const ENTITY = engine.ENTITY_FAMILIES;
const SUPPORT = new Set(['Weapon', 'Environment', 'Defense', 'Base', 'Trap', 'Reaction', 'Response', 'Law', 'Hex', 'Plague', 'Virus', 'Ritual', 'World']);
const COSTS = [['all', 'Any cost'], ['0-3', '0–3 total'], ['4-6', '4–6 total'], ['7+', '7+ total']];

export function createDeck({ store, router, onStart }) {
  const storage = (() => { try { return globalThis.localStorage || null; } catch { return null; } })();
  let ids = loadDeckIds(storage, cards);
  let mounted = false;

  const persist = () => { saveDeckIds(storage, ids); };

  /* ---------- pool controls ---------- */

  const search = h('input', { id: 'deckSearch', type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'Name, rule, ID or division' });
  const divisionSel = h('select', { id: 'deckDivision' }, h('option', { value: 'all' }, 'All divisions'), ...divisions.map(d => h('option', { value: d.id }, `${pad2(d.id)} · ${d.name}`)));
  const familySel = h('select', { id: 'deckFamily' }, h('option', { value: 'all' }, 'All families'), ...families.map(f => h('option', { value: f }, f)));
  const costSel = h('select', { id: 'deckCost' }, ...COSTS.map(([v, l]) => h('option', { value: v }, l)));
  const poolCount = h('span', { class: 'poolCount' });

  const grid = createVGrid({
    label: 'Card pool',
    onActivate: (id) => add(id, { source: 'pool' }),
    paintOpts: (card) => ({
      selected: ids.includes(card.id),
      note: ids.includes(card.id) ? 'In doctrine' : '',
      noteKind: ids.includes(card.id) ? 'ok' : null,
      label: `${card.name}. ${divisionById.get(card.divisionId).name}, ${card.family}. Power ${card.power}. ${ids.includes(card.id) ? 'In your doctrine. Activate to remove.' : 'Activate to add to your doctrine.'}`,
    }),
  });

  /* ---------- deck rail ---------- */

  const countEl = h('strong', { class: 'deckCount' });
  const progress = h('div', { class: 'deckProgress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(DECK_SIZE) });
  for (let i = 0; i < DECK_SIZE; i++) progress.append(h('span', { class: 'deckSeg', 'aria-hidden': 'true' }));
  const listEl = h('div', { class: 'deckList' });
  const curveEl = h('div', { class: 'analysisCurve' });
  const curveCaption = h('p', { class: 'analysisCaption' });
  const splitEl = h('div', { class: 'analysisSplit' });
  const spreadEl = h('div', { class: 'analysisSpread', 'aria-hidden': 'true' });
  const spreadLabel = h('p', { class: 'analysisCaption' });
  const warnEl = h('ul', { class: 'analysisWarnings' });
  const errorEl = h('p', { class: 'fieldError', hidden: true, role: 'status' });
  const startBtn = h('button', { type: 'button', class: 'btn primary', dataset: { action: 'startMatch' } }, 'Start local match');

  const el = h('div', { class: 'screen deckScreen' },
    h('section', { class: 'deckPool' },
      h('header', { class: 'deckPoolHead' },
        h('div', { class: 'toolbarHead' },
          h('span', { class: 'eyeline' }, 'Doctrine construction'),
          h('h1', { class: 'screenTitle', id: 'deckTitle', tabindex: '-1' }, 'Build your doctrine'),
        ),
        h('div', { class: 'toolbarControls' },
          h('label', { class: 'field fieldSearch' }, h('span', {}, 'Search'), search),
          h('label', { class: 'field' }, h('span', {}, 'Division'), divisionSel),
          h('label', { class: 'field' }, h('span', {}, 'Family'), familySel),
          h('label', { class: 'field' }, h('span', {}, 'Cost'), costSel),
        ),
        h('div', { class: 'poolMeta' }, poolCount, h('span', {}, 'Select a card to add it · Enter adds the focused card')),
      ),
      grid.el,
    ),
    h('aside', { class: 'deckRail', 'aria-label': 'Your doctrine' },
      h('header', { class: 'deckRailHead' },
        h('div', {}, h('span', { class: 'eyeline' }, 'Active doctrine'), countEl),
        h('div', { class: 'deckRailActions' },
          h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'starter' } }, 'Starter'),
          h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'clear' } }, 'Clear'),
        ),
      ),
      progress,
      listEl,
      h('section', { class: 'deckAnalysis', 'aria-label': 'Doctrine analysis' },
        h('h2', { class: 'analysisTitle' }, 'Cost curve'),
        curveEl, curveCaption,
        h('h2', { class: 'analysisTitle' }, 'Composition'),
        splitEl,
        h('h2', { class: 'analysisTitle' }, 'Division spread'),
        spreadEl, spreadLabel,
        warnEl,
      ),
      h('footer', { class: 'deckLaunch' }, errorEl, startBtn),
    ),
  );

  /* ---------- mutation ---------- */

  function add(id, { source } = {}) {
    if (ids.includes(id)) { remove(id, { source }); return; }
    if (ids.length >= DECK_SIZE) {
      toast(`Your doctrine already holds ${DECK_SIZE} cards. Remove one before adding another.`, { kind: 'warn' });
      return;
    }
    ids = [...ids, id];
    persist(); refresh();
    const card = cardById.get(id);
    toast(`${card.name} added.`, { undo: () => { ids = ids.filter(x => x !== id); persist(); refresh(); } });
  }

  function remove(id, { source } = {}) {
    const at = ids.indexOf(id);
    if (at < 0) return;
    ids = ids.filter((_, i) => i !== at);
    persist(); refresh();
    const card = cardById.get(id);
    toast(`${card.name} removed.`, { undo: () => { ids = [...ids.slice(0, at), id, ...ids.slice(at)]; persist(); refresh(); } });
  }

  /* ---------- analysis (IA-13) ---------- */

  function deckCards() { return ids.map(id => cardById.get(id)).filter(Boolean); }

  function renderList() {
    const list = deckCards()
      .map((c, i) => ({ c, i }))
      .sort((a, b) => totalCost(a.c) - totalCost(b.c) || a.c.family.localeCompare(b.c.family) || a.c.name.localeCompare(b.c.name));
    clear(listEl);
    if (!list.length) {
      listEl.append(h('div', { class: 'emptyDeck' },
        h('p', {}, 'Your doctrine is empty. Three fast ways forward:'),
        h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'starter' } }, 'Restore the starter doctrine'),
        h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'focusDivision' } }, 'Filter the pool by a division'),
        h('a', { class: 'btn btnSmall', href: '#/rules' }, 'Learn deck building'),
      ));
      return;
    }
    let lastFamily = null;
    for (const { c } of list) {
      if (c.family !== lastFamily) {
        lastFamily = c.family;
        listEl.append(h('div', { class: 'deckGroup', 'aria-hidden': 'true' }, `${FAMILY_MARK[c.family] || '✦'} ${c.family}`));
      }
      listEl.append(h('button', {
        type: 'button', class: 'deckEntry', dataset: { action: 'removeEntry', card: c.id },
        'aria-label': `Remove ${c.name}, ${c.family}, total cost ${totalCost(c)}`,
        style: { '--division': divisionById.get(c.divisionId).color },
      },
        h('span', { class: 'deckEntryCost' }, String(totalCost(c))),
        h('b', { class: 'deckEntryName' }, c.name),
        h('span', { class: 'deckEntryX', 'aria-hidden': 'true' }, '✕'),
      ));
    }
  }

  function renderAnalysis() {
    const list = deckCards();
    const profile = deckProfile(list);
    // The staggered economy means "total cost" is a lie; castableTurn is the truth.
    const buckets = new Array(8).fill(0);
    for (const c of list) buckets[Math.min(7, castableTurn(c) - 1)] += 1;
    const max = Math.max(1, ...buckets);
    clear(curveEl);
    buckets.forEach((n, i) => {
      const label = i === 7 ? '8+' : String(i + 1);
      curveEl.append(h('div', { class: 'curveCol', title: `${n} card${n === 1 ? '' : 's'} first castable on turn ${label}` },
        h('span', { class: 'curveBar', style: { height: `${Math.round((n / max) * 100)}%` } }),
        h('small', { class: 'curveTick' }, label),
        h('b', { class: 'curveNum' }, String(n)),
      ));
    });
    const curveAt = t => { const r = engine.resourceCurve(t); return `${r.command}/${r.insight}/${r.essence}`; };
    setText(curveCaption, `Earliest castable turn. Resources ramp C/I/E ${curveAt(1)} → ${curveAt(3)} → ${curveAt(5)} (caps 6/5/4). This doctrine leans ${profile.primaryResource || '—'}; the average card lands on turn ${profile.averageCastableTurn || '—'}.`);

    const entities = list.filter(c => ENTITY.has(c.family)).length;
    const supports = list.filter(c => SUPPORT.has(c.family)).length;
    const immediate = list.length - entities - supports;
    clear(splitEl);
    for (const [label, n, hint] of [['Entities', entities, 'hold lanes'], ['Supports', supports, 'persist in a lane'], ['Immediate', immediate, 'resolve at once']]) {
      splitEl.append(h('div', { class: 'splitCell' }, h('b', {}, String(n)), h('span', {}, label), h('small', {}, hint)));
    }

    clear(spreadEl);
    const perDivision = new Map();
    for (const c of list) perDivision.set(c.divisionId, (perDivision.get(c.divisionId) || 0) + 1);
    for (const d of divisions) {
      const n = perDivision.get(d.id) || 0;
      spreadEl.append(h('span', { class: 'spreadSeg', dataset: { n: n ? '1' : '0' }, style: { '--division': d.color }, title: `${pad2(d.id)} ${d.name}: ${n}` }));
    }
    setText(spreadLabel, `${perDivision.size} of 21 divisions represented.`);

    clear(warnEl);
    const warn = (text) => warnEl.append(h('li', { class: 'analysisWarn' }, text));
    if (list.length && entities < 12) warn(`Only ${entities} entity card${entities === 1 ? '' : 's'} — you will have nothing to hold lanes with after turn 3.`);
    const needsUnit = list.filter(c => ['Item', 'Action', 'Weapon'].includes(c.family)).length;
    if (needsUnit > entities) warn(`${needsUnit} Item/Action/Weapon cards but only ${entities} entities — those cards are unplayable in a lane with no friendly unit.`);
    const late = list.filter(c => castableTurn(c) >= 5).length;
    if (late > 10) warn(`${late} cards cannot be cast before turn 5 — with a 6-card opening hand most of it will sit dead while the rival develops.`);
    const early = list.filter(c => castableTurn(c) <= 2).length;
    if (list.length >= 20 && early < 6) warn(`Only ${early} card${early === 1 ? '' : 's'} castable by turn 2 — you will not contest a lane before the rival does.`);

    setText(countEl, `${list.length} / ${DECK_SIZE}`);
    setAttr(progress, 'aria-valuenow', String(list.length));
    setAttr(progress, 'aria-valuetext', `${list.length} of ${DECK_SIZE} cards`);
    [...progress.children].forEach((seg, i) => setClass(seg, 'filled', i < list.length));

    const short = DECK_SIZE - list.length;
    const legal = list.length === DECK_SIZE;
    setInlineError(startBtn, errorEl, legal ? '' : short > 0 ? `A legal doctrine needs exactly ${DECK_SIZE} cards — add ${short} more.` : `Remove ${-short} card${-short === 1 ? '' : 's'}.`);
    setAttr(startBtn, 'aria-disabled', legal ? null : 'true');
    setClass(startBtn, 'isDisabled', !legal);
    setText(startBtn, legal ? 'Start local match' : `Add ${short} more card${short === 1 ? '' : 's'}`);
  }

  function refreshPool() {
    const f = store.state.deck;
    const list = queryCards({ division: f.d, family: f.f, cost: f.c, query: f.q, sort: 'division' });
    setText(poolCount, `${list.length.toLocaleString()} cards match`);
    grid.setItems(list, { keepCursor: true });
  }

  function refresh() {
    renderList(); renderAnalysis(); grid.repaint();
    if (onDeckChange) onDeckChange();
  }

  let onDeckChange = null;

  /* ---------- events ---------- */

  delegate(el, 'click', {
    removeEntry: (b) => remove(b.dataset.card, { source: 'rail' }),
    starter: async () => {
      if (ids.length && !(await confirmDialog({
        title: 'Replace your doctrine?',
        body: `Restoring the starter doctrine discards the ${ids.length} card${ids.length === 1 ? '' : 's'} you have selected.`,
        confirmLabel: 'Replace it',
      }))) return;
      const before = ids;
      ids = buildStarterDeck(cards); persist(); refresh();
      toast('Starter doctrine restored.', { undo: () => { ids = before; persist(); refresh(); } });
    },
    clear: async () => {
      if (!ids.length) return;
      if (!(await confirmDialog({
        title: `Discard your ${ids.length}-card doctrine?`,
        body: 'Every card is removed from the active doctrine. This is stored locally and can be undone from the toast.',
        confirmLabel: 'Discard it',
      }))) return;
      const before = ids;
      ids = []; persist(); refresh();
      toast('Doctrine cleared.', { undo: () => { ids = before; persist(); refresh(); } });
    },
    focusDivision: () => { divisionSel.focus(); },
    startMatch: () => {
      if (ids.length !== DECK_SIZE) {
        errorEl.hidden = false;
        announce(errorEl.textContent, { assertive: true });
        return;
      }
      onStart(ids.slice());
    },
  });

  const setPool = (patch) => { store.set({ deck: { ...store.state.deck, ...patch } }); refreshPool(); };
  search.addEventListener('input', () => setPool({ q: search.value }));
  divisionSel.addEventListener('change', () => setPool({ d: divisionSel.value }));
  familySel.addEventListener('change', () => setPool({ f: familySel.value }));
  costSel.addEventListener('change', () => setPool({ c: costSel.value }));

  const api = {
    has: id => ids.includes(id),
    size: () => ids.length,
    ids: () => ids.slice(),
    add: (id) => { add(id, { source: 'external' }); },
    remove: (id) => { remove(id, { source: 'external' }); },
    onChange(fn) { onDeckChange = fn; },
  };

  return {
    el, api,
    mount() { mounted = true; grid.observe(); refreshPool(); refresh(); },
    show() {
      el.hidden = false;
      grid.observe(); refreshPool(); refresh();
      document.getElementById('deckTitle')?.focus({ preventScroll: true });
    },
    hide() { el.hidden = true; },
    focusSearch() { search.focus(); search.select(); },
    escape() { if (document.activeElement === search && search.value) { search.value = ''; setPool({ q: '' }); return true; } return false; },
  };
}
