/* prematch.js — the pre-match screen (IA-16), as a focus-trapped dialog.
   Shows what the player is about to face, lets them pick a difficulty tier and
   replay a shared seed code, and states the rules that decide the first turn. */

import { h, setText, clear, settings, pad2 } from './core.js';
import { openDialog, toast } from './ui.js';
import { termLink } from './terms.js';
import { divisionById, totalCost } from './cards.js';
import { deckProfile, castableTurn } from '../deck-store.js';
import * as engine from '../match-engine.js';

const TIERS = [
  ['recruit', 'Recruit', 'Plays up to 2 cards a turn and never mulligans. It reads the board one move deep.'],
  ['veteran', 'Veteran', 'Plays up to 4 cards, mulligans expensive openers, and weighs lane threat. Beats Recruit about 62% of the time.'],
  ['sovereign', 'Sovereign', 'Plays up to 6 cards, searches deeper and plays to your hand. Beats Veteran about 55% of the time.'],
];

/** Resolves to { difficulty, seed } or null if cancelled. */
export function preMatchDialog({ deckCards }) {
  const profile = deckProfile(deckCards);
  let difficulty = settings.get('difficulty') || engine.DEFAULT_DIFFICULTY;

  return openDialog(({ close }) => {
    const seedInput = h('input', {
      id: 'seedInput', type: 'text', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'e.g. VET-3YNQ-BKHH', 'aria-describedby': 'seedHelp',
    });
    const tierList = h('div', { class: 'tierList', role: 'radiogroup', 'aria-label': 'Rival difficulty' });
    const tierButtons = new Map();
    for (const [key, name, blurb] of TIERS) {
      const b = h('button', {
        type: 'button', class: 'tierBtn', role: 'radio', 'aria-checked': String(key === difficulty),
        onclick: () => { difficulty = key; settings.set('difficulty', key); sync(); },
      }, h('strong', {}, name), h('span', {}, blurb));
      tierButtons.set(key, b);
      tierList.append(b);
    }
    function sync() {
      for (const [key, b] of tierButtons) {
        b.setAttribute('aria-checked', String(key === difficulty));
        b.classList.toggle('active', key === difficulty);
      }
    }
    sync();

    const begin = h('button', {
      type: 'button', class: 'btn primary',
      onclick: () => {
        const raw = seedInput.value.trim();
        if (raw) {
          try { engine.decodeSeed(raw); }
          catch { toast('That seed code is not valid — leave it empty for a fresh match.', { kind: 'warn' }); seedInput.focus(); return; }
        }
        close({ difficulty, seed: raw || undefined });
      },
    }, 'Begin match');

    const curve = Object.entries(profile.curve).sort((a, b) => Number(a[0]) - Number(b[0]));
    const earliest = curve.length ? curve[0][0] : '—';

    return {
      node: h('div', { class: 'dialogPanel preMatchPanel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'preTitle' },
        h('span', { class: 'eyeline' }, 'Pre-match'),
        h('h2', { class: 'dialogTitle', id: 'preTitle' }, 'Before you commit'),
        h('div', { class: 'preGrid' },
          h('div', { class: 'preBlock' },
            h('h3', {}, 'Your doctrine'),
            h('ul', {},
              h('li', {}, `${profile.size} cards · ${profile.entities} entities, ${profile.supports} supports`),
              h('li', {}, `Leans ${profile.primaryResource || '—'} · average power ${profile.averagePower}`),
              h('li', {}, `Average card is castable on turn ${profile.averageCastableTurn}; earliest is turn ${earliest}`),
            ),
          ),
          h('div', { class: 'preBlock' },
            h('h3', {}, 'The match'),
            h('ul', {},
              h('li', {}, '20 ', termLink('core'), ' each. Three ', termLink('lane', 'lanes'), ' resolve independently.'),
              h('li', {}, 'Resources ramp ', h('code', {}, `${line(1)} → ${line(3)} → ${line(5)}`), ' (C/I/E).'),
              h('li', {}, 'Units arrive ', termLink('exhausted'), ' — they defend at once but cannot attack until your next ', termLink('refresh'), '.'),
              h('li', {}, termLink('armour'), ' cuts Core damage to ', h('code', {}, 'min(⌈raw/4⌉, 3)'), ' — raw power is not face damage.'),
              h('li', {}, 'You draw 2 each refresh. Running out of deck deals escalating ', termLink('fatigue'), ' damage.'),
            ),
          ),
        ),
        h('h3', { class: 'preSubhead' }, 'Rival difficulty'),
        tierList,
        h('label', { class: 'field preSeed' },
          h('span', {}, 'Replay a seed code (optional)'),
          seedInput,
          h('small', { class: 'analysisCaption', id: 'seedHelp' }, 'A seed code reproduces an exact match, including the difficulty it was played at.'),
        ),
        h('div', { class: 'dialogActions' },
          h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, 'Back to doctrine'),
          begin,
        ),
      ),
      initial: begin,
    };
  });
}

function line(t) { const r = engine.resourceCurve(t); return `${r.command}/${r.insight}/${r.essence}`; }
