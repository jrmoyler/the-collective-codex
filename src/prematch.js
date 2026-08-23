/* prematch.js — the pre-match screen (IA-16), as a focus-trapped dialog.
   Shows what the player is about to face, lets them pick a difficulty tier and
   replay a shared seed code, and states the rules that decide the first turn. */

import { h, settings } from './core.js';
import { openDialog, toast } from './ui.js';
import { termLink } from './terms.js';
import { deckProfile } from '../deck-store.js';
import { ARMOUR_CONTESTED, ARMOUR_OPEN, OPENING_DRAW_SENTENCE, curveAt } from './rules-copy.js';
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
    /* A code carries the fingerprint of the doctrine it was recorded with, so a
     * mismatch can be reported here — before the match is committed — rather
     * than producing a different game under a shared code. The player is still
     * allowed to run it; they are simply told what they are getting. */
    const doctrine = engine.doctrineFingerprint(deckCards);
    // <small>, not <p>: the note lives inside the field's <label>, whose content
    // model is phrasing content only. `data-kind` separates "this code will not
    // work" from "this code works, but not the way you may expect".
    const seedNote = h('small', { class: 'fieldError seedNote', id: 'seedNote', role: 'status', hidden: true });
    const note = (kind, text) => { seedNote.dataset.kind = kind; seedNote.textContent = text; seedNote.hidden = false; };
    const seedInput = h('input', {
      id: 'seedInput', type: 'text', autocomplete: 'off', spellcheck: 'false',
      placeholder: `e.g. ${engine.EXAMPLE_SEED_CODE}`, 'aria-describedby': 'seedHelp seedNote',
      oninput: () => checkSeed(),
    });

    /** Returns the decoded code, or null when the field is empty or unusable. */
    function checkSeed({ loud = false } = {}) {
      const raw = seedInput.value.trim();
      if (!raw) { seedNote.hidden = true; return null; }
      let decoded;
      try { decoded = engine.decodeSeed(raw); }
      catch (error) {
        // Half-typed codes must not shout on every keystroke; a submit must.
        if (loud) note('error', error.message);
        else seedNote.hidden = true;
        return null;
      }
      if (decoded.doctrine === null) note('warn', 'This is an older code with no doctrine recorded, so it can only replay the shuffle.');
      else if (decoded.doctrine !== doctrine) note('warn', 'This code was recorded with a different doctrine. The shuffle will match; the match will not. Restore those 30 cards to replay it exactly.');
      else note('ok', 'This code matches your doctrine — it will replay exactly.');
      return decoded;
    }
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
        if (raw && !checkSeed({ loud: true })) {
          toast('That seed code is not valid — leave it empty for a fresh match.', { kind: 'warn' });
          seedInput.focus();
          return;
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
              h('li', {}, `${engine.STARTING_CORE} `, termLink('core'), ' each. Three ', termLink('lane', 'lanes'), ' resolve independently. No turn limit.'),
              h('li', {}, 'Resources ramp ', h('code', {}, `${curveAt(1)} → ${curveAt(3)} → ${curveAt(5)}`), ' (C/I/E).'),
              h('li', {}, 'Units arrive ', termLink('exhausted'), ' — they defend at once but cannot attack until your next ', termLink('refresh'), '.'),
              h('li', {}, termLink('armour'), ' divides Core damage down — ', h('code', {}, ARMOUR_CONTESTED), ' against a defended lane, ', h('code', {}, ARMOUR_OPEN), ' and uncapped against an empty one.'),
              h('li', {}, OPENING_DRAW_SENTENCE, ' Running out of deck deals escalating unpreventable ', termLink('fatigue'), ' damage — a second way to lose.'),
            ),
          ),
        ),
        h('h3', { class: 'preSubhead' }, 'Rival difficulty'),
        tierList,
        h('label', { class: 'field preSeed' },
          h('span', {}, 'Replay a seed code (optional)'),
          seedInput,
          h('small', { class: 'analysisCaption', id: 'seedHelp' }, 'A code replays the shuffle and the difficulty. It also records the doctrine it was played with, so an exact replay needs those same 30 cards — you will be told here if they differ.'),
          seedNote,
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

