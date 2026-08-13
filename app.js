/* app.js — shell, routing and screen orchestration.
 *
 * There is no global render(). Each screen is mounted exactly once and patches
 * its own DOM in place. `#app.innerHTML` is never assigned after boot, so the
 * search field, the caret inside it, and the grid scroll position survive every
 * state change (A-1 … A-4).
 */

import { h, delegate, createStore, router, settings, applyMotion, storageAvailable, pad2 } from './src/core.js';
import { cards, cardById, divisions, gateAtlas } from './src/cards.js';
import { mountUI, toast, announce, dialogOpen, closeDialog, hidePopover, popoverOpen } from './src/ui.js';
import { installTermHandler } from './src/terms.js';
import { createCodex } from './src/screen-codex.js';
import { createDeck } from './src/screen-deck.js';
import { createMatchScreen } from './src/screen-match.js';
import { createHome, createRules, runPrimer } from './src/screen-static.js';
import { buildRivalDeck } from './deck-store.js';
import { preMatchDialog } from './src/prematch.js';
import * as engine from './match-engine.js';

const app = document.querySelector('#app');

const store = createStore({
  codex: { d: 'all', f: 'all', r: 'all', c: 'all', q: '', sort: 'division' },
  deck: { d: 'all', f: 'all', c: 'all', q: '' },
  match: null,
});

applyMotion();
gateAtlas();

/* ---------- shell ---------- */

const skipLink = h('a', { class: 'skipLink', href: '#main' }, 'Skip to main content');
const navButtons = [
  ['home', 'Home', '#/'],
  ['codex', 'Codex', '#/codex'],
  ['deck', 'Doctrine', '#/deck'],
  ['match', 'Battlefield', '#/match'],
  ['rules', 'Rules', '#/rules'],
].map(([view, label, href]) => h('a', { class: 'navLink', href, dataset: { view } }, label));

const topbar = h('header', { class: 'topbar', role: 'banner' },
  h('a', { class: 'brand', href: '#/' },
    h('b', { 'aria-hidden': 'true' }, '✦'),
    h('span', {}, h('strong', {}, 'THE COLLECTIVE CODEX'), h('small', {}, 'TWENTY-ONE DIVISIONS · INFINITE OUTCOMES')),
  ),
  h('nav', { 'aria-label': 'Primary' }, ...navButtons),
  h('div', { class: 'topbarRight' },
    h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'keys' } }, 'Keys ', h('kbd', {}, '?')),
  ),
);

const main = h('main', { id: 'main', class: 'appMain', tabindex: '-1' });
const siteFooter = h('footer', { class: 'siteFooter', role: 'contentinfo' },
  h('span', {}, 'COLLECTIVE AI INC · ARCHITECTING A HUMANE FUTURE'),
  h('span', {}, '1,134 cards · 54 sheets · 28 families · 21 divisions'),
  h('a', { href: '#/rules' }, 'Rules and glossary'),
);

app.append(skipLink, topbar, main, siteFooter);
mountUI(document.body);
installTermHandler(document.body);

/* ---------- screens ---------- */

/** Build a match. `options` comes from the pre-match dialog (difficulty, seed). */
function launch(ids, options = {}) {
  const playerDeck = ids.map(id => cardById.get(id)).filter(Boolean);
  // buildRivalDeck mirrors the player's own profile over the FULL canon. The old
  // three-division starter pool was a 96/4 structural handicap.
  const rivalDeck = buildRivalDeck(cards, playerDeck).map(id => cardById.get(id)).filter(Boolean);
  try {
    const match = engine.createMatch({
      playerDeck, rivalDeck,
      seed: options.seed ?? (Date.now() >>> 0),
      difficulty: options.seed ? undefined : (options.difficulty || settings.get('difficulty') || undefined),
    });
    matchScreen.setMatch(match);
    router.go({ view: 'match', id: null, query: {} });
  } catch (error) {
    console.error('[app] could not start match', error);
    toast(error.message, { kind: 'warn' });
  }
}

async function startMatch(ids) {
  const deckCards = ids.map(id => cardById.get(id)).filter(Boolean);
  const options = await preMatchDialog({ deckCards });
  if (!options) return;
  launch(ids, options);
}

const deckScreen = createDeck({ store, router, onStart: startMatch });
const codexScreen = createCodex({ store, router, deck: deckScreen.api });
const matchScreen = createMatchScreen({
  store,
  onExit: () => { matchScreen.clear(); router.go({ view: 'deck', id: null, query: {} }); },
  onRematch: () => launch(deckScreen.api.ids()),
  onReplaySeed: (seed) => launch(deckScreen.api.ids(), { seed }),
  onEditDoctrine: () => router.go({ view: 'deck', id: null, query: {} }),
});
const homeScreen = createHome({ deck: deckScreen.api, hasMatch: () => matchScreen.hasMatch() });
const rulesScreen = createRules();

const screens = { home: homeScreen, codex: codexScreen, deck: deckScreen, match: matchScreen, rules: rulesScreen };
for (const key in screens) {
  screens[key].el.hidden = true;
  main.append(screens[key].el);
  screens[key].mount();
}

deckScreen.api.onChange(() => { codexScreen.refreshDeckState(); });

/* ---------- routing ---------- */

let currentView = null;

router.onChange(route => {
  let view = screens[route.view] ? route.view : 'home';
  if (view === 'match' && !matchScreen.hasMatch()) {
    // Nothing to show: send the player where a match actually starts.
    view = 'deck';
    if (route.view === 'match') { announce('No match in progress. Opening doctrine construction.'); }
  }
  const viewChanged = currentView !== view;
  if (currentView && viewChanged) screens[currentView].hide();
  currentView = view;
  hidePopover();
  // IX-6: focus moves to the new view's heading on a real navigation only.
  screens[view].show(route, { focus: viewChanged || !router.selfNav });
  for (const link of navButtons) {
    const active = link.dataset.view === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  document.body.dataset.view = view;
  document.title = `${{ home: 'The Collective Codex', codex: 'Codex', deck: 'Doctrine', match: 'Battlefield', rules: 'Rules' }[view]} — The Collective Codex`;
});

/* ---------- global keyboard (§3.1) ---------- */

let goPending = false, goTimer = null;

function typing() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
}

addEventListener('keydown', ev => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === 'Escape') {
    if (dialogOpen()) return;              // the dialog handles its own Escape
    if (popoverOpen()) { hidePopover(); return; }
    if (screens[currentView]?.escape?.()) return;
    if (typing()) document.activeElement.blur();
    return;
  }
  if (typing()) return;                     // IX-3
  if (ev.key === '/') { ev.preventDefault(); screens[currentView]?.focusSearch?.(); return; }
  if (ev.key === '?') { ev.preventDefault(); showKeys(); return; }
  if (goPending) {
    const map = { c: 'codex', d: 'deck', b: 'match', r: 'rules', h: 'home' };
    const target = map[ev.key.toLowerCase()];
    goPending = false; clearTimeout(goTimer);
    if (target) { ev.preventDefault(); router.go({ view: target, id: null, query: {} }); }
    return;
  }
  if (ev.key === 'g') { goPending = true; goTimer = setTimeout(() => { goPending = false; }, 1200); }
}, true);

delegate(topbar, 'click', { keys: () => showKeys() });

function showKeys() {
  import('./src/ui.js').then(({ openDialog }) => {
    openDialog(({ close }) => {
      const ok = h('button', { type: 'button', class: 'btn primary', onclick: () => close(true) }, 'Close');
      const rows = [
        ['g then c / d / b / r', 'Go to Codex · Doctrine · Battlefield · Rules'],
        ['/', 'Focus search'],
        ['← ↑ → ↓', 'Move the grid cursor (the grid is one tab stop)'],
        ['Enter / Space', 'Open the focused card'],
        ['a', 'Add the focused card to your doctrine'],
        ['[ / ]', 'Previous / next card in the detail panel'],
        ['1–9, 0', 'Select a hand card in a match'],
        ['a / s / d', 'Target Vanguard / Conduit / Flank'],
        ['e', 'End turn (arms a confirm)'],
        ['b', 'Read the board state aloud'],
        ['Esc', 'Close · disarm · clear selection'],
      ];
      return {
        node: h('div', { class: 'dialogPanel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gkeys' },
          h('h2', { class: 'dialogTitle', id: 'gkeys' }, 'Keyboard'),
          h('table', { class: 'keyTable' }, h('tbody', {}, ...rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))),
          h('div', { class: 'dialogActions' }, ok),
        ),
        initial: ok,
      };
    });
  });
}

/* ---------- boot ---------- */

if (!location.hash) history.replaceState(null, '', '#/');
router.start();

if (!storageAvailable()) toast('Your doctrine will not be saved in this browser.', { duration: 8000, kind: 'warn' });
if (!settings.get('onboarded')) runPrimer();

addEventListener('error', ev => console.error('[app] uncaught', ev.error || ev.message));

export { store };
