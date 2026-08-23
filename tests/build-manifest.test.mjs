/* build-manifest.test.mjs — what actually reaches the deployed site.
 *
 * `npm test` imports from the source tree. `vercel` serves dist/. Nothing
 * connected the two, and the bridge between them used to be two literal arrays
 * of filenames inside scripts/build.mjs. Adding a module and forgetting to add
 * it to the array is a green test run, a green build, and a production site that
 * 404s a module and renders a blank page — the single worst
 * failure-to-signal ratio in the repository.
 *
 * The manifest is now derived from the real import graph, and these tests hold
 * the derivation honest: that it follows the dynamic import app.js code-splits
 * behind, that every module in the source tree is genuinely reachable from the
 * entry point, and that index.html's entry point is the one the build walks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { moduleGraph, resolveSpec } from '../scripts/module-graph.mjs';

const ENTRY = 'app.js';
const graph = await moduleGraph(ENTRY);

test('the build walks the same entry point index.html actually loads', async () => {
  const html = await readFile('index.html', 'utf8');
  const match = html.match(/<script[^>]*type="module"[^>]*src="\.?\/?([^"]+)"/);
  assert.ok(match, 'index.html must load exactly one module entry point');
  assert.equal(match[1], ENTRY, 'the build walks a different entry point than the page loads');
});

test('every module under src/ is reachable from the entry point', async () => {
  const onDisk = (await readdir('src')).filter(f => f.endsWith('.js')).map(f => `src/${f}`).sort();
  const reached = graph.filter(f => f.startsWith('src/')).sort();
  // Both directions matter. Missing => the deployed site 404s it at boot.
  // Extra => there is no such thing; the graph is built by reading imports.
  assert.deepEqual(reached, onDisk, 'a module in src/ is not reachable from app.js — it would either 404 in production or be dead code');
});

test('the root runtime modules are all reachable too', () => {
  for (const f of ['card-canon.js', 'match-engine.js', 'deck-store.js']) {
    assert.ok(graph.includes(f), `${f} would not be copied into dist/`);
  }
});

test('a dynamic import is followed, not just the static ones', async () => {
  const app = await readFile(ENTRY, 'utf8');
  assert.match(app, /import\(['"]\.\/src\/ui\.js['"]\)/, 'this test is pinned to app.js code-splitting the keyboard dialog');
  // src/ui.js is ALSO statically imported by app.js, so prove the follow works
  // on a graph where the dynamic import is the only reference there is.
  const virtual = {
    'entry.js': "import './a.js';",
    'a.js': "const later = () => import('./b.js');",
    'b.js': "export const x = 1;",
  };
  const walked = await moduleGraph('entry.js', { read: f => virtual[f] ?? Promise.reject(new Error('missing')) });
  assert.deepEqual(walked, ['a.js', 'b.js', 'entry.js']);
});

test('a specifier that does not resolve fails the build instead of shipping a 404', async () => {
  const virtual = { 'entry.js': "import './gone.js';" };
  await assert.rejects(
    () => moduleGraph('entry.js', { read: f => (f in virtual ? virtual[f] : Promise.reject(new Error('ENOENT'))) }),
    /gone\.js is imported but could not be read/,
  );
});

test('the manifest is deterministic — the same tree gives the same list, in the same order', async () => {
  const again = await moduleGraph(ENTRY);
  assert.deepEqual(again, graph);
  assert.deepEqual([...graph].sort(), graph, 'the manifest must be sorted so builds are reproducible');
});

test('resolveSpec normalises relative specifiers the way the runtime does', () => {
  assert.equal(resolveSpec('app.js', './src/core.js'), 'src/core.js');
  assert.equal(resolveSpec('src/core.js', '../match-engine.js'), 'match-engine.js');
  assert.equal(resolveSpec('src/screens/a.js', '../b.js'), 'src/b.js');
  assert.equal(resolveSpec('src/a.js', './b.js'), 'src/b.js');
});

test('a cycle in the import graph terminates', async () => {
  const virtual = { 'a.js': "import './b.js';", 'b.js': "import './a.js';" };
  assert.deepEqual(await moduleGraph('a.js', { read: f => virtual[f] }), ['a.js', 'b.js']);
});
