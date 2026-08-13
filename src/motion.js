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
  let chips = [];
  let running = false;
  let skipBtn = null;

  function clearChips() { for (const c of chips) c.remove(); chips = []; }

  function cancel() {
    for (const t of timers) clearTimeout(t);
    timers = [];
    clearChips();
    running = false;
    hideSkip();
    if (onDone) onDone();
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
    target.append(node);
    chips.push(node);
    timers.push(setTimeout(() => { node.remove(); chips = chips.filter(c => c !== node); }, reduced ? 640 : 540));
  }

  function pulse(target, cls, ms) {
    if (!target || !target.isConnected) return;
    target.classList.add(cls);
    timers.push(setTimeout(() => target.classList.remove(cls), ms));
  }

  /**
   * @param {Array} events  new engine events, in `seq` order
   * @param {object} ctx    { side: 'player' } — which side is the local player
   */
  function consume(events, ctx = {}) {
    cancel();
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
