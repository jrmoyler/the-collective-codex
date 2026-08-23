/* ui.js — the notification model (IX-11) and shared overlays.
   Four channels, never mixed: inline errors, contextual reasons (owned by the
   screens), toasts, and dialogs. Plus the two live regions and the glossary popover. */

import { h, setText, trapFocus, motionReduced, clear } from './core.js';

let toastHost, dialogHost, politeRegion, assertiveRegion, popoverHost;

export function mountUI(root) {
  toastHost = h('div', { class: 'toastHost', id: 'toastHost' });
  dialogHost = h('div', { class: 'dialogHost', id: 'dialogHost', hidden: true });
  popoverHost = h('div', { class: 'popoverHost', id: 'popoverHost', hidden: true });
  politeRegion = h('div', { class: 'srOnly', id: 'livePolite', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  assertiveRegion = h('div', { class: 'srOnly', id: 'liveAssertive', role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' });
  root.append(toastHost, dialogHost, popoverHost, politeRegion, assertiveRegion);

  // ONE Escape handler, owned by the dialog layer, for the lifetime of the app.
  // It used to be attached to each dialog's own panel node, which meant Escape
  // stopped working the moment focus was anywhere else in the document — and a
  // dialog whose Escape does not work is a dialog you cannot get out of.
  // Capture, because a modal outranks every screen-level shortcut beneath it.
  document.addEventListener('keydown', (ev) => {
    if (!openDialogRelease || ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    closeDialog(false);
  }, true);
}

/* ---------- Live regions (AX-6) ---------- */

let lastPolite = '';
export function announce(text, { assertive = false } = {}) {
  const region = assertive ? assertiveRegion : politeRegion;
  if (!region || !text) return;
  if (!assertive && text === lastPolite) { region.textContent = ''; }
  lastPolite = assertive ? lastPolite : text;
  // Clearing first guarantees repeated identical strings are re-announced.
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = text; });
}

/* ---------- Channel 3: toasts ---------- */

const MAX_TOASTS = 3;
const toasts = new Set();

export function toast(message, { undo = null, undoLabel = 'Undo', kind = 'info', duration } = {}) {
  if (!toastHost) return () => {};
  const life = duration ?? (undo ? 7000 : 4000);
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' },
    h('span', { class: 'toastText', text: message }),
    undo ? h('button', { class: 'toastUndo', type: 'button', onclick: () => { undo(); dismiss(); } }, undoLabel) : null,
    h('button', { class: 'toastClose', type: 'button', 'aria-label': 'Dismiss notification', onclick: () => dismiss() }, '✕'),
  );
  let timer = null, remaining = life, started = 0;
  const start = () => { started = Date.now(); timer = setTimeout(dismiss, remaining); };
  const pause = () => { if (timer) { clearTimeout(timer); timer = null; remaining -= Date.now() - started; } };
  function dismiss() {
    if (!toasts.has(entry)) return;
    toasts.delete(entry); if (timer) clearTimeout(timer);
    if (motionReduced()) el.remove();
    else { el.classList.add('leaving'); setTimeout(() => el.remove(), 150); }
  }
  const entry = { el, dismiss };
  el.addEventListener('mouseenter', pause); el.addEventListener('focusin', pause);
  el.addEventListener('mouseleave', start); el.addEventListener('focusout', start);
  toasts.add(entry);
  toastHost.append(el);
  while (toasts.size > MAX_TOASTS) { const [oldest] = toasts; oldest.dismiss(); }
  start();
  announce(message);
  return dismiss;
}

/* ---------- Channel 4: dialogs (destructive confirmation only) ---------- */

let openDialogRelease = null;

/**
 * The single owner of dialog teardown. Every route change calls this (see the
 * router subscription in app.js), because a dialog's lifetime is bounded by the
 * screen that opened it.
 *
 * It was not, and the failure was total: opening the pre-match dialog and
 * pressing browser Back left the panel painted and the scrim swallowing every
 * click, on whatever screen you had navigated to. Nothing recovered it —
 * `dialogHost` was only ever emptied from here, and nothing else called here.
 * A modal that outlives its screen is not a modal, it is a dead page.
 */
export function closeDialog(result) {
  if (!openDialogRelease) return;
  const { release, resolve } = openDialogRelease;
  openDialogRelease = null;
  release();
  dialogHost.hidden = true;
  clear(dialogHost);
  document.body.classList.remove('hasDialog');
  resolve(result);
}

/**
 * role="alertdialog", focus trapped, Escape cancels, the destructive action is
 * NOT focused by default (IX-11.4). Returns a promise resolving true/false.
 */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true }) {
  return openDialog(({ close }) => {
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, cancelLabel);
    const confirm = h('button', { class: `btn ${danger ? 'btnDanger' : 'primary'}`, type: 'button', onclick: () => close(true) }, confirmLabel);
    return {
      node: h('div', { class: 'dialogPanel', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dlgTitle', 'aria-describedby': 'dlgBody' },
        h('h2', { class: 'dialogTitle', id: 'dlgTitle', text: title }),
        h('p', { class: 'dialogBody', id: 'dlgBody', text: body }),
        h('div', { class: 'dialogActions' }, cancel, confirm),
      ),
      initial: cancel,
    };
  });
}

/** Generic modal. `build({close})` returns { node, initial }.
 *
 *  Two failure modes are handled here rather than left to every caller, because
 *  both of them end the same way: an awaited promise that never settles, with
 *  no dialog on screen to explain why. `preMatchDialog` is awaited by the only
 *  path that starts a match, so either one meant the Start button silently
 *  stopped working for the rest of the session.
 *
 *  1. `build` closes synchronously — a builder that validates its own inputs and
 *     bails, for instance. `close()` ran before `openDialogRelease` existed, so
 *     `closeDialog` returned at its guard and the resolver was dropped.
 *  2. `build` throws. The executor's exception rejects the promise for free in a
 *     bare `new Promise`, but only if nothing has been mounted yet; the explicit
 *     unwind below also takes the scrim and `body.hasDialog` back off, so a
 *     builder that throws half-way through cannot leave an invisible scrim
 *     eating every click on the screen underneath.
 */
export function openDialog(build) {
  if (openDialogRelease) closeDialog(null);
  return new Promise((resolve, reject) => {
    let earlyClose = false, earlyResult;
    const close = (result) => {
      if (openDialogRelease) { closeDialog(result); return; }
      earlyClose = true; earlyResult = result;
    };
    let built;
    try {
      built = build({ close });
    } catch (error) {
      dialogHost.hidden = true;
      clear(dialogHost);
      document.body.classList.remove('hasDialog');
      reject(error);
      return;
    }
    if (earlyClose) { resolve(earlyResult); return; }
    const { node, initial } = built;
    dialogHost.hidden = false;
    clear(dialogHost);
    dialogHost.append(h('div', { class: 'dialogScrim', onclick: () => close(false) }), node);
    document.body.classList.add('hasDialog');
    // Escape is handled once, at the dialog layer, by mountUI — never per panel.
    const release = trapFocus(node, { initial });
    openDialogRelease = { release, resolve };
  });
}

export const dialogOpen = () => Boolean(openDialogRelease);

/* ---------- Channel 1: inline field errors ---------- */

export function setInlineError(control, holder, message) {
  setText(holder, message || '');
  holder.hidden = !message;
  if (message) {
    if (!holder.id) holder.id = `err-${Math.random().toString(36).slice(2, 8)}`;
    control.setAttribute('aria-describedby', holder.id);
    control.setAttribute('aria-invalid', 'true');
  } else {
    control.removeAttribute('aria-invalid');
    if (holder.id && control.getAttribute('aria-describedby') === holder.id) control.removeAttribute('aria-describedby');
  }
}

/* ---------- Glossary popovers (IA-7) ---------- */

let popoverAnchor = null;

export function showPopover(anchor, title, body, href) {
  if (popoverAnchor === anchor) { hidePopover(); return; }
  hidePopover();
  popoverAnchor = anchor;
  popoverHost.hidden = false;
  clear(popoverHost);
  const panel = h('div', { class: 'popover', role: 'dialog', 'aria-label': `${title} — definition` },
    h('h3', { class: 'popoverTitle', text: title }),
    h('p', { class: 'popoverBody', text: body }),
    href ? h('a', { class: 'popoverLink', href }, 'Open the full glossary') : null,
  );
  popoverHost.append(panel);
  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + 8;
  panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 340))}px`;
  panel.style.top = `${top + 220 > innerHeight ? Math.max(8, rect.top - 8 - panel.offsetHeight) : top}px`;
  anchor.setAttribute('aria-expanded', 'true');
}

export function hidePopover() {
  if (!popoverHost || popoverHost.hidden) return;
  popoverHost.hidden = true;
  clear(popoverHost);
  if (popoverAnchor) popoverAnchor.setAttribute('aria-expanded', 'false');
  popoverAnchor = null;
}

export const popoverOpen = () => Boolean(popoverAnchor);
