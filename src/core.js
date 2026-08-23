/* core.js — DOM builder, delegated events, store, hash router, focus + motion utilities.
   Every other module builds on this. Its only import is the engine's difficulty
   tier list, so persisted settings can be validated against the real allow-list
   rather than a second copy of it that would drift. */

import { DIFFICULTY_TIERS, DEFAULT_DIFFICULTY } from '../match-engine.js';

/* ---------- DOM ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    // There is deliberately no `html:` escape hatch. Nothing in this app needs
    // one, and not having it means the bundle contains no innerHTML write at
    // all — the whole injection class is structurally absent, not merely unused.
    // Custom properties are invisible to Object.assign — CSSStyleDeclaration only
    // exposes them through setProperty, so `--x` keys are silently dropped otherwise.
    else if (k === 'style' && typeof v === 'object') for (const s in v) { if (v[s] == null) continue; if (s.startsWith('--')) el.style.setProperty(s, String(v[s])); else el.style[s] = v[s]; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') for (const d in v) { if (v[d] != null) el.dataset[d] = v[d]; }
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Write text only when it actually changed — avoids needless layout + avoids
 *  clobbering a selection/caret inside the node. */
export function setText(el, value) {
  const v = value === null || value === undefined ? '' : String(value);
  if (el && el.textContent !== v) el.textContent = v;
  return el;
}

export function setAttr(el, name, value) {
  if (!el) return el;
  if (value === null || value === undefined || value === false) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else {
    const v = value === true ? '' : String(value);
    if (el.getAttribute(name) !== v) el.setAttribute(name, v);
  }
  return el;
}

export function setClass(el, name, on) {
  if (el) el.classList.toggle(name, Boolean(on));
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function svg(tag, props) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in props || {}) if (props[k] != null) el.setAttribute(k, props[k]);
  return el;
}

/* ---------- Delegated events (PF-8) ----------
   One listener per root per event type. Handlers are keyed by data-action. */

/** The lookup goes through a Map, never a plain object: `data-action` is
 *  attacker-controllable markup, and an object lookup would resolve
 *  "constructor" / "toString" / "__proto__" to Object.prototype members and
 *  call them. A Map only ever contains what was registered here. */
export function delegate(root, type, handlers, opts) {
  const table = handlers instanceof Map ? handlers : new Map(Object.entries(handlers));
  root.addEventListener(type, (ev) => {
    const start = ev.target instanceof Element ? ev.target : null;
    if (!start) return;
    const el = start.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = table.get(el.dataset.action);
    if (typeof fn === 'function') fn(el, ev);
  }, opts);
  return root;
}

export function on(root, type, selector, fn, opts) {
  root.addEventListener(type, (ev) => {
    const start = ev.target instanceof Element ? ev.target : null;
    if (!start) return;
    const el = start.closest(selector);
    if (el && root.contains(el)) fn(el, ev);
  }, opts);
  return root;
}

/* ---------- Store ---------- */

/** A shared, mutable bag of screen state.
 *
 *  There is deliberately no subscribe/notify machinery: every screen in this app
 *  patches its own DOM directly from its own event handlers, so a pub/sub layer
 *  had no subscribers and only made the update order harder to follow. If a
 *  screen ever needs to react to another screen's writes, add a real observer
 *  then — a half-wired one that nobody calls is worse than none. */
export function createStore(initial) {
  const state = { ...initial };
  const listeners = new Set();
  return {
    state,
    /** Merge a patch of top-level keys. Returns the state for chaining. */
    set(patch) {
      for (const k in patch) state[k] = patch[k];
      /* Subscribers are notified with the KEYS that changed, not just the state,
       * so a listener interested in one slice (match persistence is interested
       * in exactly one) does not have to diff the whole store to find out
       * whether it has work to do. A throwing listener is contained: persistence
       * is a courtesy and must never be able to interrupt the screen that was
       * mid-update when it ran. */
      const keys = Object.keys(patch);
      for (const listener of listeners) {
        try { listener(state, keys); }
        catch (error) { console.error('[store] listener failed', error); }
      }
      return state;
    },
    /** @returns {() => void} unsubscribe */
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/* ---------- rAF throttle ---------- */

export function rafThrottle(fn) {
  let pending = false, lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(...lastArgs); });
  };
}

/* ---------- Focus ---------- */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root) {
  return $$(FOCUSABLE, root).filter(el => el.offsetParent !== null || el === document.activeElement);
}

/** Trap focus inside `container`. Returns a release() that restores focus. */
export function trapFocus(container, { initial } = {}) {
  const restoreTo = document.activeElement;
  function onKey(ev) {
    if (ev.key !== 'Tab') return;
    const items = focusables(container);
    if (!items.length) { ev.preventDefault(); container.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      ev.preventDefault(); last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault(); first.focus();
    }
  }
  container.addEventListener('keydown', onKey);
  const target = initial || focusables(container)[0] || container;
  requestAnimationFrame(() => { try { target.focus(); } catch { /* detached */ } });
  return function release() {
    container.removeEventListener('keydown', onKey);
    if (restoreTo && restoreTo.isConnected && typeof restoreTo.focus === 'function') {
      try { restoreTo.focus(); } catch { /* gone */ }
    }
  };
}

/** Roving tabindex over a list of elements produced on demand. */
export function rove(items, activeIndex) {
  items.forEach((el, i) => { if (el) el.tabIndex = i === activeIndex ? 0 : -1; });
}

/* ---------- Persisted settings ---------- */

const SETTINGS_KEY = 'collectiveCodex.settings.v1';
const storage = (() => { try { return globalThis.localStorage || null; } catch { return null; } })();

/* Persisted settings are untrusted input.
 *
 * They used to be spread in wholesale: `{...defaults, ...JSON.parse(raw)}`. Any
 * value that a future build, an older build, an extension or a shared machine
 * had left in this key was adopted verbatim and handed straight to the engine.
 * `difficulty` made that a real failure rather than a theoretical one: a value
 * outside the tier list reaches `normalizeDifficulty`, which throws, so
 * `createMatch` fails, `launch()` catches it and toasts — and the player cannot
 * start a match at all. The bad value is in localStorage, so a reload does not
 * clear it; nothing inside the app recovers unless the player happens to click
 * a difficulty tile. One malformed key permanently disables the game's only
 * interactive feature.
 *
 * Every key is now validated on the way in and on the way out. Unknown keys are
 * dropped, a value that fails its check falls back to the default, and the
 * sanitised object is what gets written back — so a poisoned key self-heals on
 * the next write instead of persisting.
 */
const boolean = v => typeof v === 'boolean';
const oneOf = (...allowed) => v => allowed.includes(v);
const SETTINGS_SCHEMA = {
  motion:       { value: 'auto',              valid: oneOf('auto', 'full', 'reduce') },
  onboarded:    { value: false,               valid: boolean },
  logOpen:      { value: true,                valid: boolean },
  usedKeyboard: { value: false,               valid: boolean },
  difficulty:   { value: DEFAULT_DIFFICULTY,  valid: oneOf(...DIFFICULTY_TIERS) },
};

/** Defaults, overlaid with only the stored keys the schema recognises and accepts. */
function sanitizeSettings(stored) {
  const out = {};
  for (const key in SETTINGS_SCHEMA) out[key] = SETTINGS_SCHEMA[key].value;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;
  for (const key in SETTINGS_SCHEMA) {
    if (!Object.hasOwn(stored, key)) continue;
    const candidate = stored[key];
    if (SETTINGS_SCHEMA[key].valid(candidate)) out[key] = candidate;
  }
  return out;
}

export { SETTINGS_SCHEMA, sanitizeSettings };

export const settings = (() => {
  let value = sanitizeSettings(null);
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) value = sanitizeSettings(JSON.parse(raw));
  } catch { /* unreadable or unparseable: the defaults already stand */ }
  return {
    get(key) { return value[key]; },
    all() { return { ...value }; },
    /** Writing the same value again is a no-op. A synchronous localStorage write
     *  plus applyMotion() (which rewrites a <html> dataset attribute and a
     *  custom property, invalidating style for the whole document) is far too
     *  expensive to run per keystroke, which is what unguarded flag-setting
     *  call sites were doing. */
    set(key, v) {
      // A write the schema does not recognise is refused rather than stored: the
      // reader would drop it on the next load anyway, and a setting that appears
      // to stick until reload is worse than one that never claimed to.
      const rule = SETTINGS_SCHEMA[key];
      if (!rule || !rule.valid(v)) return value[key];
      if (Object.is(value[key], v)) return v;
      value[key] = v;
      try { storage?.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch { /* private mode */ }
      applyMotion();
      return v;
    },
  };
})();

/** The one localStorage handle in the app, already guarded against the throw a
 *  blocked-cookies origin raises on mere property access. Null when there is no
 *  usable storage, which every caller must treat as normal rather than broken. */
export const localStore = storage;

export function storageAvailable() {
  try { storage?.setItem('collectiveCodex.probe', '1'); storage?.removeItem('collectiveCodex.probe'); return Boolean(storage); }
  catch { return false; }
}

/* ---------- Motion (MO-6/7/8) ---------- */

const osReduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };

export function motionReduced() {
  const pref = settings.get('motion');
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  return Boolean(osReduce.matches);
}

/** One custom property + one attribute drive every animation decision. */
export function applyMotion() {
  const reduced = motionReduced();
  document.documentElement.dataset.motion = reduced ? 'reduce' : 'full';
  document.documentElement.style.setProperty('--motion-scale', reduced ? '0' : '1');
}
if (typeof osReduce.addEventListener === 'function') osReduce.addEventListener('change', applyMotion);

/* ---------- Hash router (IA-1/IA-2) ---------- */

export const router = (() => {
  const listeners = new Set();
  let current = { view: 'home', id: null, query: {} };

  /** Total: a hash is user input and may be anything, including a malformed
   *  percent escape (`%E0%A4%A`), which makes decodeURIComponent throw. */
  function decodeSegment(seg) {
    try { return decodeURIComponent(seg); } catch { return seg; }
  }

  function parse(hash = location.hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const [pathPart, queryPart] = raw.split('?');
    const segs = pathPart.split('/').filter(Boolean);
    const query = {};
    if (queryPart) for (const [k, v] of new URLSearchParams(queryPart)) query[k] = v;
    const view = segs[0] || 'home';
    return { view, id: segs[1] ? decodeSegment(segs[1]) : null, query };
  }

  function serialize({ view, id, query }) {
    let path = '#/' + (view === 'home' ? '' : view);
    if (id) path += (path.endsWith('/') ? '' : '/') + encodeURIComponent(id);
    const params = new URLSearchParams();
    for (const k in query || {}) {
      const v = query[k];
      if (v === null || v === undefined || v === '' || v === 'all') continue;
      params.set(k, v);
    }
    const q = params.toString();
    return q ? `${path}?${q}` : path;
  }

  /** A canonical, order-independent string for a route's query. Two routes with
   *  the same params in a different order are the same route. */
  function queryKey(query) {
    const params = new URLSearchParams();
    for (const k of Object.keys(query || {}).sort()) params.set(k, query[k]);
    return params.toString();
  }

  const sameRoute = (a, b) => a.view === b.view && a.id === b.id && queryKey(a.query) === queryKey(b.query);

  /** Idempotent by design.
   *
   *  Chromium fires BOTH `hashchange` and `popstate` for a same-document
   *  fragment navigation, so a single Back press used to run every listener
   *  twice — two full passes over the 1,134-card canon on #/codex, and two
   *  identical live-region announcements to a screen reader. Dropping one of
   *  the listeners would make correctness depend on which browser you are in;
   *  comparing the parsed route instead does not. */
  function emit(force = false) {
    const next = parse();
    if (!force && sameRoute(current, next)) return;
    current = next;
    for (const fn of listeners) { try { fn(current); } catch (err) { console.error('[router]', err); } }
  }

  let selfNav = false;

  return {
    parse, serialize,
    get current() { return current; },
    /** True while a route change originated from the app itself rather than from
     *  the Back/Forward buttons. Screens use it to avoid stealing focus from a
     *  field the user is typing in (A-3). */
    get selfNav() { return selfNav; },
    /** `replace:true` for refinements (typing) so Back doesn't walk keystrokes (IA-2).
     *
     *  `force:true` re-runs the listeners even when the URL is unchanged. A route
     *  does not always resolve to the same screen: `#/match` shows the board when
     *  a match exists and redirects to the deck builder when one does not. So
     *  starting a match while already sitting on `#/match` changes the resolved
     *  view without changing the URL, and de-duplicating on the URL alone left
     *  the deck builder mounted and the board unreachable from the nav bar. */
    go(route, { replace = false, force = false } = {}) {
      const url = serialize({ ...current, ...route });
      if (url === location.hash) {
        current = parse();
        if (force) emit(true);
        return;
      }
      if (replace) history.replaceState(null, '', url);
      else history.pushState(null, '', url);
      selfNav = true;
      try { emit(force); } finally { selfNav = false; }
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start() {
      // Both listeners stay registered — between them they cover every browser.
      // emit() de-duplicates, so the double delivery costs one route parse.
      addEventListener('hashchange', () => emit());
      addEventListener('popstate', () => emit());
      emit(true);   // the boot route must render even though `current` matches it
    },
  };
})();

/* ---------- misc ---------- */

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const pad2 = n => String(n).padStart(2, '0');
