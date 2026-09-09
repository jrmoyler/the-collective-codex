import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { serviceWorker } from '../scripts/service-worker.mjs';

test('installed app has real correctly sized PNG icons and a scoped launch URL', async () => {
  const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    const data = await readFile(icon.src);
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`, icon.sizes);
  }
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
});

test('offline release identity changes for content changes, independent of file order', async () => {
  const read = async file => ({ 'index.html': '<html>', 'app.js': 'v1' }[file]);
  const first = await serviceWorker(['index.html', 'app.js'], { read });
  assert.equal(first, await serviceWorker(['app.js', 'index.html'], { read }));
  assert.notEqual(first, await serviceWorker(['app.js', 'index.html'], { read: async file => file === 'app.js' ? 'v2' : '<html>' }));
});

test('offline routing serves the cached root and files but does not swallow missing assets or external requests', async () => {
  const listeners = {};
  const matches = [];
  const deleted = [];
  const source = await serviceWorker(['index.html', 'app.js'], { read: async file => file });
  const context = {
    URL, Request,
    self: { registration: { scope: 'https://codex.test/' }, location: { origin: 'https://codex.test' }, addEventListener: (type, fn) => { listeners[type] = fn; } },
    caches: {
      open: async () => ({ match: async key => { matches.push(key); return 'cached'; }, addAll: async () => {} }),
      keys: async () => ['unrelated-app', 'collective-codex-old'],
      delete: async key => { deleted.push(key); },
    },
    fetch: () => { throw new Error('unexpected network'); },
  };
  vm.runInNewContext(source, context);
  async function request(url, mode = 'cors', method = 'GET') {
    let response;
    listeners.fetch({ request: { url, mode, method }, respondWith: p => { response = p; } });
    return response && await response;
  }
  assert.equal(await request('https://codex.test/?launch=home', 'navigate'), 'cached');
  assert.equal(matches.pop(), 'https://codex.test/');
  assert.equal(await request('https://codex.test/app.js'), 'cached');
  assert.equal(await request('https://codex.test/missing.js'), undefined);
  assert.equal(await request('https://external.test/app.js'), undefined);
  assert.equal(await request('https://codex.test/app.js', 'cors', 'POST'), undefined);
  let activation;
  listeners.activate({ waitUntil: p => { activation = p; } });
  await activation;
  assert.deepEqual(deleted, ['collective-codex-old']);
  assert.doesNotMatch(source, /self\.skipWaiting\(|clients\.claim\(/);
});

test('production policy allows installation and restricts service worker caching to this origin', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  const policy = config.headers.flatMap(x => x.headers).find(x => x.key === 'Content-Security-Policy').value;
  for (const directive of ["worker-src 'self'", "manifest-src 'self'", "connect-src 'self'"]) assert.ok(policy.includes(directive));
});

test('registration waits for load, tolerates storage denial, and skips native bundles', async () => {
  const source = await readFile('src/install.js', 'utf8');
  const calls = [];
  let onLoad;
  const browser = {
    navigator: { serviceWorker: { register: async (...args) => { calls.push(args); throw new Error('storage denied'); } } },
    isSecureContext: true,
    document: { readyState: 'loading' },
    addEventListener: (name, fn) => { assert.equal(name, 'load'); onLoad = fn; },
  };
  vm.runInNewContext(source, browser);
  assert.equal(calls.length, 0);
  await onLoad();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], './sw.js');
  calls.length = 0;
  vm.runInNewContext(source, { ...browser, document: { readyState: 'complete' }, Capacitor: { isNativePlatform: () => true } });
  assert.equal(calls.length, 0);
  vm.runInNewContext(source, { navigator: {}, isSecureContext: false });
});
