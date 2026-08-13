/* terms.js — glossary term popovers (IA-7). A term is a real button so it is
   reachable by keyboard and announced; the popover is one shared node. */

import { h } from './core.js';
import { lookupTerm } from './glossary.js';
import { showPopover, hidePopover } from './ui.js';

export function termLink(key, label) {
  const entry = lookupTerm(key);
  const text = label || entry?.title || key;
  return h('button', {
    type: 'button', class: 'term', dataset: { action: 'term', term: key },
    'aria-expanded': 'false', 'aria-haspopup': 'dialog',
    title: entry ? `${entry.title}: definition` : undefined,
  }, text);
}

export function installTermHandler(root) {
  root.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-action="term"]');
    if (!btn) { if (!ev.target.closest('.popover')) hidePopover(); return; }
    ev.preventDefault();
    const entry = lookupTerm(btn.dataset.term);
    if (!entry) return;
    showPopover(btn, entry.title, entry.body, '#/rules');
  });
  addEventListener('resize', hidePopover, { passive: true });
}
