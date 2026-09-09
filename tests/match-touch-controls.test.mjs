import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-stub.mjs';
installDom();
const { createMatchScreen } = await import('../src/screen-match.js');
const { createStore } = await import('../src/core.js');
const { cards } = await import('../card-canon.js');
const engine = await import('../match-engine.js');

function setup() {
  const store = createStore({ match: null });
  const screen = createMatchScreen({ store, onExit() {}, onRematch() {}, onEditDoctrine() {} });
  document.body.append(screen.el);
  const deck = cards.slice(0, 30);
  const match = engine.mulligan(engine.createMatch({ playerDeck: deck, rivalDeck: deck, shuffle: false }), 'player', []);
  screen.setMatch(match);
  const button = action => screen.el.querySelector(`[data-action="${action}"]`);
  return { screen, store, button, match };
}

test('touch players can read and deselect a hand card without spending it', () => {
  const { screen, store, button, match } = setup();
  button('pickHand').dispatch('click');
  assert.equal(button('inspectSelected').hidden, false);
  button('inspectSelected').focus();
  button('inspectSelected').dispatch('click');
  assert.equal(screen.el.querySelector('.inspectPanel').hidden, false);
  screen.el.dispatch('keydown', { key: 'Enter' });
  screen.el.dispatch('keydown', { key: 'e' });
  assert.equal(store.state.match, match, 'inspector reading cannot play cards or commit turns');
  button('closeInspect').dispatch('click');
  assert.equal(document.activeElement, button('inspectSelected'));
  button('clearSelected').dispatch('click');
  assert.equal(button('inspectSelected').hidden, true);
  screen.clear(); screen.el.remove();
});

test('turn confirmation has a touch cancel and cannot leak into a new match', () => {
  const { screen, store, button, match } = setup();
  button('endTurn').dispatch('click');
  assert.equal(button('cancelTurn').hidden, false);
  button('cancelTurn').dispatch('click');
  assert.equal(button('cancelTurn').hidden, true);
  assert.equal(store.state.match, match);
  button('endTurn').dispatch('click');
  screen.setMatch(match);
  assert.equal(button('cancelTurn').hidden, true);
  assert.equal(button('endTurn').classList.contains('armed'), false);
  screen.clear(); screen.el.remove();
});
