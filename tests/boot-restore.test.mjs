/* boot-restore.test.mjs — a match survives the tab closing.
 *
 * This is the whole point of match-codec.js, exercised end to end through the
 * real entry point rather than through the codec alone: a save written by one
 * session is read back by the next one, the board is the same board, and the
 * front door offers to resume it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, boot } from './boot-harness.mjs';

const { dom, storage } = prepare();

/* Written before the app is imported, exactly as a previous session would have
 * left it. Everything below then runs the real boot path. */
const { cards, cardById } = await import('../card-canon.js');
const { buildStarterDeck } = await import('../deck-store.js');
const engine = await import('../match-engine.js');
const { saveMatch, MATCH_STORAGE_KEY } = await import('../match-codec.js');

const deck = buildStarterDeck(cards).map(id => cardById.get(id));
let previous = engine.mulligan(engine.createMatch({ playerDeck: deck, rivalDeck: deck, seed: 4242 }), 'player', [0]);
for (let i = 0; i < 4 && previous.phase !== 'ended'; i++) {
  previous = engine.aiTakeMainPhase(previous, 'player', 'veteran');
  if (previous.phase !== 'ended') previous = engine.completePlayerTurn(previous);
}
saveMatch({ getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }, previous);
assert.ok(storage.has(MATCH_STORAGE_KEY), 'fixture failed to write a save');

await boot('restore');

test('the saved board comes back, down to the deck order', () => {
  dom.setHash('#/match');
  dom.fire('hashchange');
  assert.equal(dom.document.body.dataset.view, 'match', 'a restored match must be reachable at #/match');
  const restored = dom.body.querySelector('.barRound');
  assert.equal(restored.textContent, `Round ${String(previous.round).padStart(2, '0')}`);
  const cores = dom.body.querySelectorAll('.coreNum').map(el => Number(el.textContent));
  assert.deepEqual(cores.sort((a, b) => a - b), [previous.players.rival.core, previous.players.player.core].sort((a, b) => a - b));
});

test('the front door offers to resume it rather than to start a new one', () => {
  dom.setHash('#/');
  dom.fire('hashchange');
  const door = dom.body.querySelector('.doorPrimary');
  assert.match(door.textContent, /Resume your match/);
  assert.equal(door.getAttribute('href'), '#/match');
});

test('restoring does not rewrite the save it just read', () => {
  // The boot path sets its own bookkeeping before handing the state to the
  // screen; if it did not, every reload would re-serialise a late-game board
  // for no reason, on the slowest frame of the session.
  const after = JSON.parse(storage.get(MATCH_STORAGE_KEY));
  assert.equal(after.state.round, previous.round);
  assert.equal(after.rulesDigest, previous.rules.digest);
});

test('a save this build cannot honour is discarded instead of half-restored', async () => {
  const { decodeMatch } = await import('../match-codec.js');
  const payload = JSON.parse(storage.get(MATCH_STORAGE_KEY));
  payload.rulesDigest = 'DIFFERENT';
  assert.match(decodeMatch(payload, { cardById }).error, /different ruleset/);
});
