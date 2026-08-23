/* motion-timeline.test.mjs — the animation layer had no coverage at all.
 *
 * That mattered more than it looks. src/motion.js is the one module in the app
 * that reaches into DOM it does not own and writes classes onto other people's
 * nodes, and the only thing that took those classes back off again was a
 * setTimeout. `cancel()` cleared the timers and stopped there, so every class a
 * pulse had already applied stayed on the element permanently:
 *
 *   .fxCoreDrop, .fxPrevent, .fxTrigger, .fxLand, .fxClash, .fxDraw, .fxScene
 *     { outline: 2px solid currentColor; outline-offset: 2px; }
 *
 * is not an animation that finishes — it is a live outline held for exactly as
 * long as its removal timer survives. Two entirely ordinary actions cancelled a
 * running timeline: pressing the Skip button that exists for that purpose, and
 * playing a second card before the first card's decoration finished, because
 * consume() begins by cancelling. Lane nodes are reconciled by uid and reused
 * across turns, so the outline did not wash out on the next paint; it stayed
 * welded to the unit until the unit died. The HUD nodes are never re-created at
 * all, so a stuck .fxCoreDrop there lasted the whole match.
 *
 * These tests drive the module through a controlled clock and assert the
 * property that actually matters: when a timeline stops, for any reason, the
 * board is left exactly as clean as it was before the timeline started.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-stub.mjs';

const dom = installDom();
const { h } = await import('../src/core.js');
const { createMotion } = await import('../src/motion.js');

/* A controllable clock. motion.js looks `setTimeout` up on the global at call
 * time, so swapping it here is enough — no injection seam is needed and none is
 * invented for the test's benefit. */
function fakeClock() {
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  let now = 0, id = 0;
  const queue = new Map();
  globalThis.setTimeout = (fn, ms = 0) => { const t = ++id; queue.set(t, { fn, at: now + ms }); return t; };
  globalThis.clearTimeout = (t) => { queue.delete(t); };
  return {
    /* Steps `now` to each timer's own due time rather than jumping to the end
     * and draining. A decoration schedules its removal timer *when it fires*, at
     * `now + duration`, so a clock that had already jumped to the target would
     * put that removal past the horizon and report a class as stuck when it is
     * simply still in flight. */
    advance(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 10_000; guard++) {
        let next = null, nextId = 0;
        for (const [t, entry] of queue) {
          if (entry.at > target) continue;
          if (!next || entry.at < next.at || (entry.at === next.at && t < nextId)) { next = entry; nextId = t; }
        }
        if (!next) { now = target; return; }
        now = next.at;
        queue.delete(nextId);
        next.fn();
      }
      throw new Error('fake clock did not settle');
    },
    pending() { return queue.size; },
    restore() { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; },
  };
}

const FX = ['fxCoreHit', 'fxCoreDrop', 'fxPrevent', 'fxTrigger', 'fxLand', 'fxClash', 'fxDraw', 'fxScene', 'fxHost'];
const decorations = el => FX.filter(c => el.classList.contains(c));
const chipsIn = el => el.querySelectorAll('.fxChip').length;

/** A board of three nodes attached to the document, plus the motion instance
 *  wired to resolve an event to one of them by `uid`. */
function board() {
  const host = h('div', { class: 'testBoard' });
  const nodes = new Map();
  for (const uid of ['u1', 'u2', 'u3']) {
    const node = h('div', { class: 'unit' });
    nodes.set(uid, node);
    host.append(node);
  }
  dom.body.append(host);
  const skipHost = h('div', {});
  dom.body.append(skipHost);
  let done = 0;
  const motion = createMotion({
    skipHost,
    resolve: ev => nodes.get(ev.uid) || null,
    onDone: () => { done += 1; },
  });
  return { motion, nodes, all: () => [...nodes.values()], skipHost, done: () => done };
}

let seq = 0;
const ev = (type, uid, extra = {}) => ({ seq: ++seq, type, uid, side: 'player', lane: 0, amount: 2, ...extra });

/* A timeline long enough that decoration is genuinely still in flight when the
 * test interrupts it: eight steps, each of which paints something. */
const TIMELINE = () => [
  ev('play', 'u1'),
  ev('combat-clash', 'u2'),
  ev('power-change', 'u3', { amount: -1 }),
  ev('trap-sprung', 'u1'),
  ev('deploy-trigger', 'u2'),
  ev('unit-destroyed', 'u3'),
  ev('damage-prevented', 'u1', { source: 'Guard' }),
  ev('draw', 'u2'),
];

test('a skipped timeline takes every decoration back off the board', () => {
  const clock = fakeClock();
  try {
    const b = board();
    b.motion.consume(TIMELINE(), { side: 'player' });
    clock.advance(700);                                  // mid-flight
    const painted = b.all().some(n => decorations(n).length > 0);
    assert.equal(painted, true, 'the timeline must actually have decorated something first');

    b.motion.cancel();                                   // the Skip button

    for (const node of b.all()) {
      assert.deepEqual(decorations(node), [], `${node.className} still carries decoration after a skip`);
      assert.equal(chipsIn(node), 0, 'a skipped timeline left a chip on the board');
    }
  } finally { clock.restore(); }
});

test('starting a new timeline cleans up the one it replaces', () => {
  const clock = fakeClock();
  try {
    const b = board();
    b.motion.consume(TIMELINE(), { side: 'player' });
    clock.advance(700);
    // The ordinary case: the player plays a second card while the first card's
    // resolution is still animating. applyMatch calls consume() again.
    b.motion.consume([ev('play', 'u1')], { side: 'player' });
    // u2 and u3 belong only to the replaced timeline; nothing may be left on them.
    assert.deepEqual(decorations(b.nodes.get('u2')), []);
    assert.deepEqual(decorations(b.nodes.get('u3')), []);
    assert.equal(chipsIn(b.nodes.get('u2')), 0);
    assert.equal(chipsIn(b.nodes.get('u3')), 0);
  } finally { clock.restore(); }
});

test('a timeline that runs to the end leaves nothing behind either', () => {
  const clock = fakeClock();
  try {
    const b = board();
    b.motion.consume(TIMELINE(), { side: 'player' });
    clock.advance(10_000);
    for (const node of b.all()) {
      assert.deepEqual(decorations(node), [], 'a completed timeline left decoration on the board');
      assert.equal(chipsIn(node), 0);
    }
    assert.equal(clock.pending(), 0, 'a completed timeline left timers armed');
  } finally { clock.restore(); }
});

test('two events pulsing one node hold the class until the last of them expires', () => {
  const clock = fakeClock();
  try {
    const b = board();
    // Both of these decorate u1 with .fxTrigger, at different offsets.
    b.motion.consume([ev('deploy-trigger', 'u1'), ev('spell-resolve', 'u1')], { side: 'player' });
    clock.advance(200);
    const node = b.nodes.get('u1');
    assert.equal(node.classList.contains('fxTrigger'), true);
    // The first pulse's timer fires here. If it stripped the class outright the
    // second pulse would be invisible for the rest of its own life.
    clock.advance(200);
    assert.equal(node.classList.contains('fxTrigger'), true, 'the earlier pulse stripped a class the later one still holds');
    clock.advance(10_000);
    assert.equal(node.classList.contains('fxTrigger'), false, 'the last pulse never released the class');
  } finally { clock.restore(); }
});

test('completion is reported once, and never for a timeline that was replaced', () => {
  const clock = fakeClock();
  try {
    const b = board();
    b.motion.consume(TIMELINE(), { side: 'player' });
    clock.advance(700);
    b.motion.consume(TIMELINE(), { side: 'player' });
    assert.equal(b.done(), 0, 'a discarded timeline reported completion');
    clock.advance(10_000);
    assert.equal(b.done(), 1, 'the surviving timeline must report completion exactly once');
  } finally { clock.restore(); }
});

test('a skip reports completion exactly once, and a second skip reports nothing', () => {
  const clock = fakeClock();
  try {
    const b = board();
    b.motion.consume(TIMELINE(), { side: 'player' });
    clock.advance(700);
    b.motion.cancel();
    assert.equal(b.done(), 1);
    b.motion.cancel();
    assert.equal(b.done(), 1, 'cancelling an idle timeline reported a completion that never happened');
  } finally { clock.restore(); }
});

test('running() is false the moment a timeline is skipped', () => {
  const clock = fakeClock();
  try {
    const b = board();
    b.motion.consume(TIMELINE(), { side: 'player' });
    clock.advance(100);
    assert.equal(b.motion.running, true);
    b.motion.cancel();
    assert.equal(b.motion.running, false);
  } finally { clock.restore(); }
});

test('an unknown event type is ignored rather than thrown on', () => {
  const clock = fakeClock();
  try {
    const b = board();
    assert.doesNotThrow(() => b.motion.consume([ev('some-future-event', 'u1'), ev('play', 'u1')], { side: 'player' }));
    clock.advance(10_000);
    assert.deepEqual(decorations(b.nodes.get('u1')), []);
  } finally { clock.restore(); }
});

test('an event that resolves to no node decorates nothing and still completes', () => {
  const clock = fakeClock();
  try {
    const b = board();
    b.motion.consume([ev('core-damage', 'nope'), ev('play', 'nope')], { side: 'player' });
    clock.advance(10_000);
    assert.equal(b.done(), 1);
    for (const node of b.all()) assert.deepEqual(decorations(node), []);
  } finally { clock.restore(); }
});
