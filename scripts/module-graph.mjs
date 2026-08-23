/* module-graph.mjs — resolve the set of modules a static entry point actually needs.
 *
 * Pure and side-effect free on purpose: scripts/build.mjs uses it to decide what
 * to copy into dist/, and tests/build-manifest.test.mjs uses it to assert the
 * deployed set is complete. Importing this must never build anything.
 *
 * It exists because the deploy manifest used to be two hand-written arrays in
 * build.mjs, and the failure mode of a hand-written copy list is silent and
 * total: add a module, forget the array, and every check in this repository
 * still passes — the test suite imports from the source tree, not from dist/ —
 * while the deployed site 404s the module and the app dies at boot with a blank
 * page. Deriving the list from the real import graph makes the manifest a
 * consequence of the code rather than a promise about it.
 */
import { readFile } from 'node:fs/promises';

/* Static `import x from './y.js'`, bare `import './y.js'`, `export … from` and
 * dynamic `import('./y.js')` all match. app.js code-splits the keyboard dialog
 * behind a dynamic import, so a scan of static imports alone would drop a module
 * the deployed app needs. Only relative specifiers are followed: the runtime has
 * no dependencies, so there are no bare specifiers to resolve. */
export const SPEC = /(?:\bfrom\s*|\bimport\s*)\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** Normalise `a/b/../c.js` against the importer's directory. Repo-relative,
 *  POSIX separators — these paths are used as both read and copy targets. */
export function resolveSpec(fromFile, spec) {
  const parts = fromFile.split('/').slice(0, -1).concat(spec.split('/'));
  const stack = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

/**
 * Every file reachable from `entry`, including `entry` itself.
 * Sorted, so a build from the same tree copies and logs in the same order.
 * A specifier that does not resolve to a readable file throws here rather than
 * producing a dist/ that 404s in the browser.
 */
export async function moduleGraph(entry, { read = f => readFile(f, 'utf8') } = {}) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    let source;
    try { source = await read(file); }
    catch { throw new Error(`Cannot resolve module graph: ${file} is imported but could not be read.`); }
    for (const [, spec] of String(source).matchAll(SPEC)) {
      const target = resolveSpec(file, spec);
      if (!seen.has(target)) queue.push(target);
    }
  }
  return [...seen].sort();
}
