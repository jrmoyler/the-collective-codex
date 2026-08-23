/* dom-stub.mjs — the smallest DOM the presentation layer actually uses.
 *
 * jsdom is not a dependency of this repo (the only devDependency is sharp, for
 * the art pipeline) and adding a ~60-package tree to assert that `h()` calls
 * setProperty would be a poor trade. This stub implements exactly the surface
 * src/core.js, src/cards.js and src/vgrid.js touch, and it is deliberately
 * faithful on the two points the code depends on:
 *
 *   - `style` only stores a custom property when it goes through setProperty().
 *     Assigning `style['--x']` does nothing a stylesheet could ever read, which
 *     is precisely why h() special-cases `--` keys.
 *   - layout metrics (clientWidth/clientHeight/scrollTop) are plain, settable
 *     numbers, so a test can put the grid at any viewport and scroll offset.
 *
 * Anything a test relies on is modelled here; nothing else is invented.
 */

class Style {
  constructor() {
    Object.defineProperty(this, '_custom', { value: new Map(), enumerable: false });
  }
  setProperty(name, value) { this._custom.set(name, String(value)); }
  getPropertyValue(name) { return this._custom.get(name) ?? ''; }
  removeProperty(name) { this._custom.delete(name); }
}

class ClassList {
  constructor(owner) { this.owner = owner; }
  get _set() { return new Set(String(this.owner.className || '').split(/\s+/).filter(Boolean)); }
  _write(set) { this.owner.className = [...set].join(' '); }
  add(...names) { const s = this._set; names.forEach(n => s.add(n)); this._write(s); }
  remove(...names) { const s = this._set; names.forEach(n => s.delete(n)); this._write(s); }
  contains(name) { return this._set.has(name); }
  toggle(name, force) {
    const s = this._set;
    const on = force === undefined ? !s.has(name) : Boolean(force);
    if (on) s.add(name); else s.delete(name);
    this._write(s);
    return on;
  }
}

class Node {
  constructor(nodeType) { this.nodeType = nodeType; this.parentNode = null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === documentStub || n._root === true; }
}

class Text extends Node {
  constructor(data) { super(3); this.data = String(data); }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}

/** Supports the selector forms this codebase actually writes:
 *  `tag`, `.class`, `[attr]`, `[attr="value"]` and comma-separated lists. */
function matchesOne(el, sel) {
  sel = sel.trim();
  if (!sel) return false;
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  if (sel.startsWith('#')) return el.getAttribute('id') === sel.slice(1);
  if (sel.startsWith('[')) {
    const body = sel.slice(1, -1);
    const eq = body.indexOf('=');
    if (eq === -1) return el.hasAttribute(body);
    const name = body.slice(0, eq);
    const want = body.slice(eq + 1).replace(/^["']|["']$/g, '');
    return el.getAttribute(name) === want;
  }
  return el.tagName === sel.toUpperCase();
}

const dataAttr = key => 'data-' + String(key).replace(/[A-Z]/g, m => '-' + m.toLowerCase());
const dataKey = attr => attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class ElementStub extends Node {
  constructor(tag, ns = null) {
    super(1);
    this.tagName = String(tag).toUpperCase();
    this.namespaceURI = ns;
    this.childNodes = [];
    this.className = '';
    this.style = new Style();
    this.classList = new ClassList(this);
    this.tabIndex = -1;
    this.hidden = false;
    // Layout metrics. Real ones are computed and read-only; here they are the
    // knobs a test uses to place the grid in a viewport.
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.scrollTop = 0;
    this.offsetParent = documentStub.body;
    this.focused = 0;
    Object.defineProperty(this, '_attrs', { value: new Map(), enumerable: false });
    Object.defineProperty(this, '_listeners', { value: new Map(), enumerable: false });
    // dataset reflects into attributes, exactly as the real one does — the
    // delegated-event model depends on `data-action` being findable by
    // closest('[data-action]') after being written through el.dataset.
    const attrs = this._attrs;
    this.dataset = new Proxy(Object.create(null), {
      get: (_t, key) => (typeof key === 'string' ? attrs.get(dataAttr(key)) : undefined),
      set: (_t, key, value) => { attrs.set(dataAttr(key), String(value)); return true; },
      has: (_t, key) => attrs.has(dataAttr(key)),
      deleteProperty: (_t, key) => { attrs.delete(dataAttr(key)); return true; },
      ownKeys: () => [...attrs.keys()].filter(k => k.startsWith('data-')).map(dataKey),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
  }

  setAttribute(name, value) {
    this._attrs.set(name, String(value));
    if (name === 'hidden') this.hidden = true;
    if (name === 'tabindex') this.tabIndex = Number(value);
  }
  getAttribute(name) { return this._attrs.has(name) ? this._attrs.get(name) : null; }
  hasAttribute(name) { return this._attrs.has(name) || (name === 'hidden' && this.hidden === true); }
  removeAttribute(name) { this._attrs.delete(name); if (name === 'hidden') this.hidden = false; }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type) || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  /** Fires listeners on this element, then bubbles to ancestors — enough for
   *  the delegated-event model core.js uses. */
  dispatch(type, init = {}) {
    const ev = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { ev._stopped = true; }, ...init };
    let node = this;
    while (node) {
      for (const fn of (node._listeners.get(type) || []).slice()) fn(ev);
      if (ev._stopped) break;
      node = node.parentNode;
    }
    return ev;
  }

  append(...kids) {
    for (const kid of kids) {
      if (kid.parentNode) kid.parentNode.removeChild(kid);
      kid.parentNode = this;
      this.childNodes.push(kid);
    }
  }
  removeChild(kid) {
    const i = this.childNodes.indexOf(kid);
    if (i >= 0) { this.childNodes.splice(i, 1); kid.parentNode = null; }
    return kid;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get firstChild() { return this.childNodes[0] || null; }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }

  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(v) {
    this.childNodes.splice(0).forEach(n => { n.parentNode = null; });
    if (v !== '') this.append(new Text(v));
  }

  contains(other) { let n = other; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  closest(selector) {
    const parts = selector.split(',');
    let n = this;
    while (n && n.nodeType === 1) {
      if (parts.some(p => matchesOne(n, p))) return n;
      n = n.parentNode;
    }
    return null;
  }
  querySelectorAll(selector) {
    const parts = selector.split(',');
    const out = [];
    const walk = (node) => {
      for (const kid of node.childNodes) {
        if (kid.nodeType !== 1) continue;
        if (parts.some(p => matchesOne(kid, p))) out.push(kid);
        walk(kid);
      }
    };
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.focused += 1; documentStub.activeElement = this; }
  getBoundingClientRect() { return { top: 0, left: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight }; }
}

/* Document-level listeners are modelled because two behaviours depend on them
 * and on nothing else: the dialog layer owns exactly one capture-phase `keydown`
 * on the document for Escape (src/ui.js), and the glossary popover dismisses the
 * same way. Without this the module cannot even be imported under test, which is
 * how the overlay layer ended up with no coverage of the promise it returns. */
const documentListeners = new Map();
const documentStub = {
  _root: true,
  createElement: (tag) => new ElementStub(tag),
  createElementNS: (ns, tag) => new ElementStub(tag, ns),
  createTextNode: (data) => new Text(data),
  querySelector: (sel) => documentStub.body.querySelector(sel),
  querySelectorAll: (sel) => documentStub.body.querySelectorAll(sel),
  activeElement: null,
  addEventListener(type, fn) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const list = documentListeners.get(type) || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  },
  /** Dispatch straight at the document, as a capture-phase listener sees it. */
  dispatch(type, init = {}) {
    const ev = { type, target: documentStub, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...init };
    for (const fn of (documentListeners.get(type) || []).slice()) fn(ev);
    return ev;
  },
  listenerCount: (type) => (documentListeners.get(type) || []).length,
};

/** Installs the stub on globalThis and returns a handle for driving it.
 *  Call this BEFORE dynamically importing any src/ module. */
export function installDom() {
  documentListeners.clear();
  documentStub.documentElement = new ElementStub('html');
  documentStub.documentElement._root = true;      // the top of the tree: isConnected stops here
  documentStub.body = new ElementStub('body');
  documentStub.documentElement.append(documentStub.body);
  documentStub.activeElement = null;

  const rafQueue = [];
  const events = new Map();

  globalThis.document = documentStub;
  globalThis.Element = ElementStub;
  globalThis.Node = Node;
  // rAF runs its callback immediately: the modules under test use it only to
  // coalesce work, and a synchronous flush makes assertions deterministic
  // without changing what the work is.
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); fn(); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.addEventListener = (type, fn) => {
    if (!events.has(type)) events.set(type, []);
    events.get(type).push(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    const list = events.get(type) || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
  globalThis.innerWidth = 1440;
  globalThis.innerHeight = 900;

  let hash = '#/';
  globalThis.location = {
    get hash() { return hash; },
    set hash(v) { hash = v; fire('hashchange'); },
    origin: 'http://localhost', pathname: '/',
  };
  globalThis.history = {
    entries: [],
    pushState(_s, _t, url) { hash = url; this.entries.push(url); },
    replaceState(_s, _t, url) { hash = url; },
  };

  function fire(type) { for (const fn of (events.get(type) || []).slice()) fn({ type }); }

  return {
    document: documentStub,
    body: documentStub.body,
    Element: ElementStub,
    /** Set the URL without firing anything — simulates the browser having
     *  already navigated, which is what a hashchange/popstate handler sees. */
    setHash(v) { hash = v; },
    getHash() { return hash; },
    fire,
    listenerCount(type) { return (events.get(type) || []).length; },
    /** Fire an event at `document` itself — where the dialog layer's single
     *  Escape handler and the popover's dismissal listener live. */
    fireOnDocument(type, init) { return documentStub.dispatch(type, init); },
    documentListenerCount(type) { return documentStub.listenerCount(type); },
  };
}

export { ElementStub, Text };
