import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-stub.mjs';

const dom = installDom();
const { mountUI, closeDialog } = await import('../src/ui.js');
const { preMatchDialog } = await import('../src/prematch.js');
const { settings } = await import('../src/core.js');
const { cards } = await import('../src/cards.js');
mountUI(dom.body);

test('difficulty radios support arrow navigation, wrapping and one tab stop', async () => {
  settings.set('difficulty', 'recruit');
  const pending = preMatchDialog({ deckCards: cards.slice(0, 30) });
  const radios = dom.body.querySelectorAll('[role="radio"]');
  assert.deepEqual(radios.map(r => r.tabIndex), [0, -1, -1]);
  const event = radios[0].dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(settings.get('difficulty'), 'sovereign');
  assert.deepEqual(radios.map(r => r.tabIndex), [-1, -1, 0]);
  assert.equal(radios[2].getAttribute('aria-checked'), 'true');
  radios[2].dispatch('keydown', { key: 'Home' });
  assert.equal(settings.get('difficulty'), 'recruit');
  radios[0].dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(settings.get('difficulty'), 'veteran');
  closeDialog(null);
  assert.equal(await pending, null);
});
