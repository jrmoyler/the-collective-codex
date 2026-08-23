/* motion.js — the animation layer.
 *
 * THE GOVERNING RULE: the board is patched to its final state BEFORE this module
 * is called. Everything here is decoration applied on top of an already-correct
 * DOM. Consequences, all load-bearing:
 *   · skipping can never produce a different board — skip just cancels decoration;
 *   · input is never queued behind a timeline;
 *   · a mid-timeline click is interpreted against the true state.
 *
 * THE SEAM: `consume(events, ctx)` takes the engine's structured event objects
 * (`state.events`, catalogue in docs/engine-api.md §3.1) and a `resolve` function
 * that maps one event to one DOM node. It knows nothing else about the board and
 * nothing at all about the engine's internals. Unknown event types are ignored,
 * never errors — the engine may add more at any time.
 */

import { h, motionReduced, clamp } from './core.js';

const TOTAL_CAP = 2400;          // MO-3
const TOTAL_CAP_REDUCED = 800;   // MO-6
const SKIP_THRESHOLD = 600;      // MO-4

/* Priority order from docs/engine-api.md §9. Anything not listed is dropped from
   the timeline so 60 bookkeeping events cannot crowd out the six that matter. */
const PRIORITY = {
  'core-damage': 1, 'damage-prevented': 2, 'play': 3, 'combat-clash': 4,
  'unit-destroyed': 5, 'trap-sprung': 6, 'deploy-trigger': 6, 'spell-resolve': 6,
  'response-copy': 6, 'deity-convert': 6, 'android-automate': 6, 'ritual-resolve': 6,
  'law-restricted': 6, 'virus-delay': 6, 'combat-strike': 6,
  'power-change': 7, 'unit-moved': 8, 'fatigue': 9, 'draw': 10, 'resource-gain': 10,
  'match-end': 1,
};

export function createMotion({ resolve, skipHost, onDone }) {
  let timers = [];
  /* Every decoration this module applies to a node it does not own is tracked
   * until it is taken back off again. That bookkeeping is the whole point.
   *
   * `cancel()` used to clear the pending timers and stop there, so any class a
   * pulse had already added stayed on the element for the rest of the match:
   * .fxClash / .fxCoreDrop / .fxTrigger and friends are not animations that end,
   * they are a live `outline: 2px solid currentColor` held for the length of a
   * timer that cancel() had just thrown away. Skipping a timeline — the button
   * exists precisely so players can — left red and gold outlines welded to the
   * board, and so did the ordinary case of playing a second card before the
   * first card's timeline finished, because consume() begins by cancelling.
   * `fxHost` was worse: nothing removed it at all, on any path.
   *
   * Nodes are reconciled by uid and reused across turns, so a stuck class does
   * not wash out on the next paint. It stays until the unit dies. */
  let chips = [];    // { node, host }
  let pulses = [];   // { el, cls }
  const hostCounts = new Map();
  let running = false;
  let skipBtn = null;

  function dropChip(entry) {
    const i = chips.indexOf(entry);
    if (i < 0) return;
    chips.splice(i, 1);
    entry.node.remove();
    const left = (hostCounts.get(entry.host) || 1) - 1;
    if (left > 0) hostCounts.set(entry.host, left);
    else { hostCounts.delete(entry.host); entry.host.classList.remove('fxHost'); }
  }

  function dropPulse(entry) {
    const i = pulses.indexOf(entry);
    if (i < 0) return;
    pulses.splice(i, 1);
    /* Only when this was the last claim on that class: two events in one
     * timeline can pulse the same node, and the first one's timer must not
     * strip the outline the second one is still holding. */
    if (!pulses.some(p => p.el === entry.el && p.cls === entry.cls)) entry.el.classList.remove(entry.cls);
  }

  /** Undo everything this module has applied and stop the clock. Deliberately
   *  silent: a timeline that was replaced or skipped did not complete, so it
   *  does not get to report completion. */
  function teardown() {
    for (const t of timers) clearTimeout(t);
    timers = [];
    while (chips.length) dropChip(chips[0]);
    while (pulses.length) dropPulse(pulses[0]);
    /* dropChip already empties this as it goes; the sweep is here so that the
     * post-condition of teardown() is a property of the function rather than of
     * the order its two loops happen to run in. */
    for (const [el] of hostCounts) el.classList.remove('fxHost');
    hostCounts.clear();
    running = false;
    hideSkip();
  }

  /** Public skip. The timeline is over from the player's point of view, so this
   *  one does notify. */
  function cancel() {
    const wasRunning = running;
    teardown();
    if (wasRunning && onDone) onDone();
  }

  function showSkip(duration) {
    if (duration < SKIP_THRESHOLD || !skipHost) return;
    if (!skipBtn) {
      skipBtn = h('button', { type: 'button', class: 'skipTimeline', onclick: () => cancel() }, 'Skip ⏎');
      skipHost.append(skipBtn);
    }
    skipBtn.hidden = false;
  }
  function hideSkip() { if (skipBtn) skipBtn.hidden = true; }

  /** Float a short chip over `target`. Information, not movement — it survives
   *  reduced motion (MO-6). */
  function chip(target, text, kind, reduced) {
    if (!target || !target.isConnected) return;
    const node = h('span', { class: `fxChip fxChip-${kind}`, 'aria-hidden': 'true' }, text);
    target.classList.add('fxHost');
    hostCounts.set(target, (hostCounts.get(target) || 0) + 1);
    target.append(node);
    const entry = { node, host: target };
    chips.push(entry);
    timers.push(setTimeout(() => dropChip(entry), reduced ? 640 : 540));
  }

  function pulse(target, cls, ms) {
    if (!target || !target.isConnected) return;
    target.classList.add(cls);
    const entry = { el: target, cls };
    pulses.push(entry);
    timers.push(setTimeout(() => dropPulse(entry), ms));
  }

  /**
   * @param {Array} events  new engine events, in `seq` order
   * @param {object} ctx    { side: 'player' } — which side is the local player
   */
  function consume(events, ctx = {}) {
    /* teardown(), not cancel(): a timeline replaced by a newer one never
     * completed, and firing the completion callback for it would tell the screen
     * a resolution had finished playing when it had in fact been discarded. */
    teardown();
    const reduced = motionReduced();

    // Pair each core-damage with the combat-strike that produced it so the player
    // sees "18 raw → 3 through" rather than an arbitrary number (engine-api §9.1).
    let pendingRaw = null;
    const steps = [];
    for (const ev of events) {
      if (ev.type === 'combat-strike') { pendingRaw = ev; continue; }
      if (ev.type === 'core-damage' && pendingRaw && pendingRaw.lane === ev.lane) {
        steps.push({ ...ev, raw: pendingRaw.amount, kind: pendingRaw.kind });
        pendingRaw = null;
        continue;
      }
      if (PRIORITY[ev.type]) steps.push(ev);
    }
    if (!steps.length) return;

    // MO-3: a fixed budget. If the list is long, per-event duration compresses
    // before events are dropped, and only the low-priority tail is dropped.
    const cap = reduced ? TOTAL_CAP_REDUCED : TOTAL_CAP;
    const floor = reduced ? 40 : 48;
    let list = steps;
    if (list.length * floor > cap) {
      const keep = Math.max(1, Math.floor(cap / floor));
      list = steps
        .map((ev, i) => ({ ev, i }))
        .sort((a, b) => (PRIORITY[a.ev.type] || 99) - (PRIORITY[b.ev.type] || 99) || a.i - b.i)
        .slice(0, keep)
        .sort((a, b) => a.i - b.i)
        .map(x => x.ev);
    }
    const perEvent = clamp(Math.floor(cap / list.length), floor, reduced ? 80 : 180);
    const total = Math.min(cap, perEvent * list.length + 360);
    running = true;
    showSkip(total);

    list.forEach((ev, i) => {
      timers.push(setTimeout(() => decorate(ev, ctx, reduced), Math.min(cap - 40, i * perEvent)));
    });
    /* Natural completion does NOT sweep: the chips and pulses still on screen own
     * their own removal timers and are mid-animation. Only an interrupted
     * timeline needs the sweep, which is what teardown() is for. */
    timers.push(setTimeout(() => { running = false; hideSkip(); if (onDone) onDone(); }, total));
  }

  function decorate(ev, ctx, reduced) {
    const target = resolve(ev);
    if (!target) return;
    switch (ev.type) {
      case 'core-damage':
        chip(target, ev.raw && ev.raw !== ev.amount ? `${ev.raw} raw → −${ev.amount}` : `−${ev.amount}`, 'danger', reduced);
        pulse(target, ev.side === ctx.side ? 'fxCoreHit' : 'fxCoreDrop', reduced ? 300 : 420);
        break;
      case 'damage-prevented':
        chip(target, ev.source === 'Armour' ? `armour held ${ev.amount}` : `${ev.source || 'held'} +${ev.amount}`, 'ok', reduced);
        pulse(target, 'fxPrevent', reduced ? 260 : 300);
        break;
      case 'unit-destroyed':
        chip(target, 'destroyed', 'danger', reduced);
        break;
      case 'combat-clash':
        chip(target, `−${ev.amount}`, 'danger', reduced);
        if (!reduced) pulse(target, 'fxClash', 300);
        break;
      case 'combat-strike':
        chip(target, `${ev.kind === 'breakthrough' ? 'breakthrough' : ev.kind === 'air' ? 'flying' : 'open'} ${ev.amount} raw`, 'strike', reduced);
        break;
      case 'play':
        pulse(target, 'fxLand', reduced ? 120 : 280);
        break;
      case 'trap-sprung':
        chip(target, 'trap sprung', 'strike', reduced);
        pulse(target, 'fxTrigger', reduced ? 200 : 260);
        break;
      case 'deploy-trigger':
      case 'spell-resolve':
      case 'response-copy':
      case 'deity-convert':
      case 'android-automate':
      case 'ritual-resolve':
        pulse(target, 'fxTrigger', reduced ? 200 : 260);
        break;
      case 'law-restricted':
      case 'virus-delay':
        chip(target, ev.type === 'law-restricted' ? 'law blocked' : 'virus delayed', 'strike', reduced);
        break;
      case 'power-change':
        if (ev.amount) chip(target, `${ev.amount > 0 ? '+' : ''}${ev.amount} pwr`, ev.amount > 0 ? 'ok' : 'danger', reduced);
        break;
      case 'unit-moved':
        chip(target, 'moved', 'strike', reduced);
        break;
      case 'fatigue':
        chip(target, `fatigue ${ev.amount}`, 'danger', reduced);
        pulse(target, 'fxCoreHit', reduced ? 300 : 420);
        break;
      case 'resource-gain':
        chip(target, `+${ev.amount} ${ev.resource || ''}`.trim(), 'ok', reduced);
        break;
      case 'draw':
        pulse(target, 'fxDraw', reduced ? 120 : 220);
        break;
      case 'match-end':
        pulse(target, 'fxScene', reduced ? 160 : 520);
        break;
      default: break;
    }
  }

  return { consume, cancel, get running() { return running; } };
}
