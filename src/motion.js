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
 * (`state.events`, shape documented in docs/ui-contract.md) and a `resolve`
 * function that maps an event to a DOM node. It knows nothing else about the
 * board and nothing at all about the engine's internals.
 */

import { h, motionReduced, clamp } from './core.js';

const TOTAL_CAP = 2400;          // MO-3
const TOTAL_CAP_REDUCED = 800;   // MO-6
const SKIP_THRESHOLD = 600;      // MO-4

/** Event types this layer knows how to decorate. Unknown types are ignored, not
 *  errors — the engine may add more at any time. */
const DECORATED = new Set([
  'play', 'deploy-trigger', 'trap-sprung', 'combat-clash', 'combat-strike',
  'core-damage', 'damage-prevented', 'unit-destroyed', 'power-change',
  'resource-gain', 'draw', 'match-end',
]);

export function createMotion({ resolve, skipHost, onDone }) {
  let timers = [];
  let chips = [];
  let running = false;
  let skipBtn = null;

  function clearChips() {
    for (const c of chips) c.remove();
    chips = [];
  }

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
    const life = reduced ? 620 : 520;
    timers.push(setTimeout(() => { node.remove(); chips = chips.filter(c => c !== node); }, life));
  }

  function pulse(target, cls, ms) {
    if (!target || !target.isConnected) return;
    target.classList.add(cls);
    timers.push(setTimeout(() => target.classList.remove(cls), ms));
  }

  /**
   * @param {Array} events  new engine events, in order
   * @param {object} ctx    { side: 'player' } — which side is the local player
   */
  function consume(events, ctx = {}) {
    cancel();
    const reduced = motionReduced();
    const steps = events.filter(e => DECORATED.has(e.type));
    if (!steps.length) return;

    const cap = reduced ? TOTAL_CAP_REDUCED : TOTAL_CAP;
    const perEvent = reduced ? 80 : clamp(Math.floor(cap / Math.max(1, steps.length)), 40, 180);
    const total = Math.min(cap, perEvent * steps.length + 400);
    running = true;
    showSkip(total);

    steps.forEach((ev, i) => {
      const at = Math.min(cap - 40, i * perEvent);
      timers.push(setTimeout(() => decorate(ev, ctx, reduced), at));
    });
    timers.push(setTimeout(() => { running = false; hideSkip(); if (onDone) onDone(); }, total));
  }

  function decorate(ev, ctx, reduced) {
    const target = resolve(ev);
    if (!target) return;
    switch (ev.type) {
      case 'core-damage':
        chip(target, `−${ev.amount}`, 'danger', reduced);
        pulse(target, ev.side === ctx.side ? 'fxCoreHit' : 'fxCoreDrop', reduced ? 300 : 420);
        break;
      case 'damage-prevented':
        chip(target, `+${ev.amount} held`, 'ok', reduced);
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
        chip(target, `${ev.kind === 'breakthrough' ? 'breakthrough' : ev.kind === 'air' ? 'flying' : 'open'} ${ev.amount}`, 'strike', reduced);
        break;
      case 'play':
        pulse(target, 'fxLand', reduced ? 120 : 280);
        break;
      case 'deploy-trigger':
      case 'trap-sprung':
        pulse(target, 'fxTrigger', reduced ? 200 : 260);
        break;
      case 'power-change':
        if (ev.amount) chip(target, `${ev.amount > 0 ? '+' : ''}${ev.amount} pwr`, ev.amount > 0 ? 'ok' : 'danger', reduced);
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
