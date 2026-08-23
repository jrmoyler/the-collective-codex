/* dialog-lifecycle.test.mjs — the overlay layer's promise contract.
 *
 * `openDialog` returns a promise, and one call site — `preMatchDialog`, awaited by
 * the only path that starts a match — depends on it settling. Two ways it could
 * fail to settle were reachable and neither produced any visible signal:
 *
 *   · a builder that closes synchronously ran `close()` before the resolver had
 *     been registered, so `closeDialog` returned at its own guard and the promise
 *     was dropped on the floor;
 *   · a builder that throws left the promise pending forever, and if it threw
 *     after the scrim was appended it also left an invisible full-screen scrim
 *     eating every click on the screen underneath.
 *
 * Either one ends the same way for the player: the Start button stops working,
 * for the rest of the session, with nothing on screen to say why. A modal layer
 * whose promise can silently never resolve is a deadlock generator, so the two
 * paths are pinned here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-stub.mjs';

const dom = installDom();
const { mountUI, openDialog, closeDialog, confirmDialog, dialogOpen } = await import('../src/ui.js');

mountUI(dom.body);

const host = () => dom.body.querySelector('#dialogHost');
const panel = () => host().querySelector('.dialogPanel');
const scrim = () => host().querySelector('.dialogScrim');
const { h } = await import('../src/core.js');
const simplePanel = () => ({ node: h('div', { class: 'dialogPanel' }, h('button', { type: 'button' }, 'ok')), initial: null });

test('a dialog that is closed normally resolves with its result', async () => {
  const promise = openDialog(({ close }) => {
    const built = simplePanel();
    setTimeout(() => close('picked'), 0);
    return built;
  });
  assert.equal(await promise, 'picked');
  assert.equal(dialogOpen(), false);
});

test('a builder that closes synchronously still settles, and mounts nothing', async () => {
  const promise = openDialog(({ close }) => {
    close('bailed');
    return simplePanel();
  });
  assert.equal(await promise, 'bailed');
  assert.equal(dialogOpen(), false, 'a dialog that bailed during build must not be left registered');
  assert.equal(panel(), null, 'nothing should have been mounted');
  assert.equal(dom.body.classList.contains('hasDialog'), false);
});

test('a builder that throws rejects rather than hanging, and leaves no scrim behind', async () => {
  const boom = new Error('builder exploded');
  await assert.rejects(() => openDialog(() => { throw boom; }), /builder exploded/);
  assert.equal(dialogOpen(), false);
  assert.equal(scrim(), null, 'a throwing builder left a scrim over the screen');
  assert.equal(host().hidden, true);
  assert.equal(dom.body.classList.contains('hasDialog'), false);
});

test('the app recovers completely: a dialog opens normally straight after a failed one', async () => {
  await assert.rejects(() => openDialog(() => { throw new Error('nope'); }));
  const promise = confirmDialog({ title: 'Discard', body: 'Sure?' });
  assert.equal(dialogOpen(), true);
  assert.ok(panel(), 'the next dialog must still mount');
  closeDialog(true);
  assert.equal(await promise, true);
});

test('opening a second dialog settles the first with null rather than orphaning it', async () => {
  const first = openDialog(() => simplePanel());
  const second = openDialog(() => simplePanel());
  assert.equal(await first, null);
  closeDialog('done');
  assert.equal(await second, 'done');
});

test('a route change closes whatever dialog is open and settles its promise', async () => {
  const promise = openDialog(() => simplePanel());
  assert.equal(dialogOpen(), true);
  closeDialog(null);                       // what app.js's router subscription calls
  assert.equal(await promise, null);
  assert.equal(host().hidden, true);
  assert.equal(dom.body.classList.contains('hasDialog'), false);
});

test('Escape is handled once at the document, so it works wherever focus is', async () => {
  assert.equal(dom.documentListenerCount('keydown'), 1, 'the dialog layer must own exactly one document-level Escape handler');
  const promise = openDialog(() => simplePanel());
  const ev = dom.fireOnDocument('keydown', { key: 'Escape' });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(await promise, false);
  assert.equal(dialogOpen(), false);
});

test('Escape with no dialog open is inert — the screens keep their own shortcut', () => {
  const ev = dom.fireOnDocument('keydown', { key: 'Escape' });
  assert.equal(ev.defaultPrevented, false, 'the dialog layer swallowed an Escape that was not its own');
});
