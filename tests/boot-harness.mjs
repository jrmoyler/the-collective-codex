/* boot-harness.mjs — start the whole application, in Node, on the DOM stub.
 *
 * `app.js` had no coverage of any kind, and its failure mode is the worst one a
 * static site has: a throw during boot leaves a blank page with a console line
 * nobody has open. Every other test in this directory imports a module; none of
 * them proved the modules can be assembled into a running app at all.
 *
 * This adds exactly the globals `app.js` touches beyond what `dom-stub.mjs`
 * models, and nothing else — the point is to run the real boot path, not to
 * simulate around it.
 *
 * Node caches modules by URL, so one process can boot the app once. The two
 * boot tests are therefore separate files; the test runner gives each file its
 * own process.
 */
import { installDom } from './dom-stub.mjs';

export function prepare({ storage = new Map() } = {}) {
  const dom = installDom();

  globalThis.localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  // `navigator` is a getter-only global in Node, so it cannot simply be assigned.
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: null, userAgent: 'node' }, configurable: true });
  // src/cards.js probes the art atlas with one of these before showing artwork.
  globalThis.Image = class { set src(value) { this._src = value; } addEventListener() {} };

  const root = dom.document.createElement('div');
  root.setAttribute('id', 'app');
  dom.body.append(root);
  return { dom, storage, root };
}

/** Import the real entry point. `tag` makes the module URL unique per call. */
export async function boot(tag = 'default') {
  return import(`../app.js?boot=${encodeURIComponent(tag)}`);
}
