import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Hash every shipped byte so CSS, rule and artwork changes all invalidate the
 * bundle together. Atomic precaching keeps an incomplete release uninstalled. */
export async function serviceWorker(files, { read = file => readFile(`dist/${file}`) } = {}) {
  const paths = [...new Set(files)].sort();
  const hash = createHash('sha256');
  for (const path of paths) { hash.update(path); hash.update(await read(path)); }
  const version = hash.digest('hex').slice(0, 20);
  return `/* Generated production offline bundle. Do not force skipWaiting. */
const CACHE = 'collective-codex-${version}';
const FILES = ${JSON.stringify(paths)};
const urls = FILES.map(path => new URL(path === 'index.html' ? './' : path, self.registration.scope).href);
const allowed = new Set(urls);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('collective-codex-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const index = new URL('./', self.registration.scope).href;
  const scope = new URL(self.registration.scope);
  // Hash routing needs only the root document; never mask missing asset URLs.
  const navigation = event.request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL('index.html', self.registration.scope).pathname);
  const key = navigation ? index : url.href;
  if (!navigation && !allowed.has(key)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(key)).then(cached => cached || fetch(event.request)));
});
`;
}
