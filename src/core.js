/* core.js — DOM builder, delegated events, store, hash router, focus + motion utilities.
   No dependencies. Every other module builds on this. */

/* ---------- DOM ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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

export function delegate(root, type, handlers, opts) {
  root.addEventListener(type, (ev) => {
    const start = ev.target instanceof Element ? ev.target : null;
    if (!start) return;
    const el = start.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.action];
    if (fn) fn(el, ev);
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

export function createStore(initial) {
  const state = { ...initial };
  const subs = new Set();
  let queued = null;
  function flush() {
    const changed = queued; queued = null;
    for (const fn of subs) { try { fn(changed, state); } catch (err) { console.error('[store] subscriber failed', err); } }
  }
  return {
    state,
    /** Merge a patch. Subscribers receive the Set of changed top-level keys.
     *  Notification is synchronous-but-coalesced within a microtask. */
    set(patch) {
      const changed = queued || new Set();
      for (const k in patch) {
        if (state[k] !== patch[k]) { state[k] = patch[k]; changed.add(k); }
        else changed.add(k); // allow forced signals for mutable containers (Set/Map/match)
      }
      if (!queued) { queued = changed; queueMicrotask(flush); }
      return state;
    },
    /** Signal that a mutable container changed without replacing it. */
    touch(...keys) { this.set(Object.fromEntries(keys.map(k => [k, state[k]]))); },
    sub(fn) { subs.add(fn); return () => subs.delete(fn); },
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

export function focusables(root) {
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

export const settings = (() => {
  let value = { motion: 'auto', onboarded: false, logOpen: true, usedKeyboard: false };
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) value = { ...value, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return {
    get(key) { return value[key]; },
    all() { return { ...value }; },
    set(key, v) {
      value[key] = v;
      try { storage?.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch { /* private mode */ }
      applyMotion();
      return v;
    },
  };
})();

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

  function parse(hash = location.hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const [pathPart, queryPart] = raw.split('?');
    const segs = pathPart.split('/').filter(Boolean);
    const query = {};
    if (queryPart) for (const [k, v] of new URLSearchParams(queryPart)) query[k] = v;
    const view = segs[0] || 'home';
    return { view, id: segs[1] ? decodeURIComponent(segs[1]) : null, query };
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

  function emit() {
    current = parse();
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
    /** `replace:true` for refinements (typing) so Back doesn't walk keystrokes (IA-2). */
    go(route, { replace = false } = {}) {
      const url = serialize({ ...current, ...route });
      if (url === location.hash) { current = parse(); return; }
      if (replace) history.replaceState(null, '', url);
      else history.pushState(null, '', url);
      selfNav = true;
      try { emit(); } finally { selfNav = false; }
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start() {
      addEventListener('hashchange', emit);
      addEventListener('popstate', emit);
      emit();
    },
  };
})();

/* ---------- misc ---------- */

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const pad2 = n => String(n).padStart(2, '0');
export const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 1));
