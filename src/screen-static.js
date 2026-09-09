/* screen-static.js — the front door, the rules page, and the first-run primer.
   The front door is a game front door (VD-32): resume, doctrine, canon, learn.
   No hero → metrics → three-feature-columns rhythm. */

import { h, setText, clear, delegate, settings, pad2 } from './core.js';
import { cards, divisionById, makeTile, paintTile } from './cards.js';
import { GLOSSARY, PRIMER_PANELS } from './glossary.js';
import { termLink } from './terms.js';
import { openDialog, announce } from './ui.js';
import * as engine from '../match-engine.js';

/* ---------- front door ---------- */

export function createHome({ deck, hasMatch, onStart }) {
  /* The primary door used to be an <a href="#/match"> in every state. With a
   * legal doctrine and no match in progress that link resolved to nothing: the
   * router redirects `#/match` to the deck builder and announces "No match in
   * progress", so the front door's headline call to action — reading "Start a
   * local match · Your doctrine is ready" — did not start a match. It now runs
   * the same pre-match flow the deck builder's own button runs. */
  const resumeCard = h('a', { class: 'doorCard doorPrimary', href: '#/match' });
  const deckCard = h('a', { class: 'doorCard', href: '#/deck' });
  const codexCard = h('a', { class: 'doorCard', href: '#/codex' });
  const learnCard = h('a', { class: 'doorCard', href: '#/rules' });
  const hero = h('div', { class: 'doorHero' });

  const el = h('div', { class: 'screen homeScreen' },
    h('main', { class: 'doorMain' },
      h('header', { class: 'doorHead' },
        h('span', { class: 'eyeline' }, 'The Collective Codex'),
        h('h1', { class: 'screenTitle', id: 'homeTitle', tabindex: '-1' }, 'Command the board.'),
        h('p', { class: 'doorLead' }, 'Three lanes. One Core. Every card a decision.'),
      ),
      h('div', { class: 'doorLobby' },
        h('nav', { class: 'doorGrid', 'aria-label': 'Game menu' }, resumeCard, deckCard, codexCard, learnCard),
        hero,
      ),
      h('p', { class: 'doorFooter' }, 'Solo tactical card battles', h('span', { 'aria-hidden': 'true' }, ' / '), '21 divisions · 1,134 cards · Your doctrine'),
    ),
  );

  function doorCard(node, { kicker, title, body, meta }) {
    clear(node);
    node.append(
      h('span', { class: 'doorKicker' }, kicker),
      h('strong', { class: 'doorTitle' }, title),
      h('p', { class: 'doorBody' }, body),
      h('span', { class: 'doorMeta' }, meta || '', h('span', { class: 'doorArrow', 'aria-hidden': 'true' }, '↗')),
    );
  }

  function paintHero() {
    // Present real canonical art at its supported crest size, with the same
    // frame, costs and rarity construction the player encounters in the Codex.
    const c = cards.find(card => card.family === 'Dragon' && card.rarity === 'Legendary') || cards[Math.floor(cards.length / 2)];
    const d = divisionById.get(c.divisionId);
    clear(hero);
    hero.dataset.division = String(d.id);
    const featured = makeTile({ tag: 'a', cls: 'codexCard homeFeaturedCard' });
    paintTile(featured, c);
    featured.setAttribute('href', `#/codex/${encodeURIComponent(c.id)}`);
    featured.setAttribute('tabindex', '0');
    hero.append(
      h('div', { class: 'heroExhibit' },
        h('span', { class: 'eyeline' }, 'Inside the Codex'),
        featured,
        h('span', { class: 'heroEdition' }, `${c.rarity} / ${c.family}`),
      ),
      h('div', { class: 'heroCopy' },
        h('span', { class: 'eyeline' }, `${d.icon} ${pad2(d.id)} ${d.name}`),
        h('h2', {}, c.name),
        h('p', {}, c.rulesText),
        h('p', { class: 'heroNote' }, termLink('power'), ' is attack ', h('b', {}, 'and'), ' durability. Plan every exchange.'),
        h('a', { class: 'btn', href: `#/codex/${encodeURIComponent(c.id)}` }, 'Inspect card'),
      ),
    );
  }

  delegate(el, 'click', {
    startMatch: (_node, ev) => { ev.preventDefault(); onStart(); },
  });

  return {
    el,
    mount() { paintHero(); },
    show() {
      el.hidden = false;
      const n = deck.size();
      const live = hasMatch();
      const ready = n === engine.DECK_SIZE;
      doorCard(resumeCard, live
        ? { kicker: 'In progress', title: 'Resume your match', body: 'Return to the board exactly where you left it.', meta: 'Enter the battlefield' }
        : { kicker: 'Play', title: 'Start a local match', body: 'Choose a rival difficulty. Deploy your doctrine. Break through to the enemy Core.', meta: ready ? 'Your doctrine is ready' : `${n}/${engine.DECK_SIZE} cards — finish your doctrine first` });
      // Three distinct destinations, one control. `data-action` is only set for
      // the case the router cannot express, and is removed again for the other
      // two so a stale handler cannot fire on a plain link.
      const startsHere = !live && ready && typeof onStart === 'function';
      resumeCard.setAttribute('href', live ? '#/match' : '#/deck');
      if (startsHere) resumeCard.dataset.action = 'startMatch'; else delete resumeCard.dataset.action;
      doorCard(deckCard, { kicker: 'Your doctrine', title: 'Build your doctrine', body: `${n} / ${engine.DECK_SIZE} cards selected. Shape your strategy before entering the field.`, meta: 'Open the builder' });
      doorCard(codexCard, { kicker: 'The canon', title: 'Browse 1,134 cards', body: 'Find your next decisive play across 21 divisions and 28 card families.', meta: 'Open the Codex' });
      doorCard(learnCard, { kicker: 'New here?', title: 'Learn the basics — 90 seconds', body: 'A quick guide to deployment, resources, and simultaneous combat.', meta: 'Open the primer' });
      document.getElementById('homeTitle')?.focus({ preventScroll: true });
    },
    hide() { el.hidden = true; },
  };
}

/* ---------- #/rules ---------- */

export function createRules() {
  const el = h('div', { class: 'screen rulesScreen' },
    h('main', { class: 'rulesMain' },
      h('header', { class: 'rulesHead' },
        h('span', { class: 'eyeline' }, 'Rules primer and glossary'),
        h('h1', { class: 'screenTitle', id: 'rulesTitle', tabindex: '-1' }, 'How a match works'),
        h('p', { class: 'rulesLead' }, 'Four things decide every match. The fourth is the one most players get wrong.'),
        h('button', { type: 'button', class: 'btn primary', dataset: { action: 'runPrimer' } }, 'Run the 90-second primer'),
      ),
      h('ol', { class: 'primerList' }, ...PRIMER_PANELS.map((p, i) => h('li', { class: 'primerItem' },
        h('span', { class: 'primerNum' }, pad2(i + 1)),
        h('div', {},
          h('h2', {}, p.title),
          h('p', { class: 'primerLead' }, p.lead),
          h('p', {}, p.body),
        ),
      ))),
      h('section', { class: 'glossary' },
        h('h2', { id: 'glossaryTitle' }, 'Glossary'),
        h('dl', { class: 'glossaryList' }, ...GLOSSARY.flatMap(([key, title, body]) => [
          h('dt', { id: `term-${key}` }, title),
          h('dd', {}, body),
        ])),
      ),
      h('p', { class: 'rulesFootnote' }, 'Source of truth: docs/match-rules.md. Turn resources follow ',
        h('code', {}, `${resourceLine(1)} → ${resourceLine(3)} → ${resourceLine(5)}`), ' (C/I/E by turn 1, 3, 5).'),
    ),
  );

  delegate(el, 'click', { runPrimer: () => runPrimer({ force: true }) });

  return {
    el,
    mount() {},
    show() { el.hidden = false; document.getElementById('rulesTitle')?.focus({ preventScroll: true }); },
    hide() { el.hidden = true; },
  };
}

function resourceLine(t) { const r = engine.resourceCurve(t); return `${r.command}/${r.insight}/${r.essence}`; }

/* ---------- first-run primer (IA-4/IA-5) ---------- */

export function runPrimer({ force = false } = {}) {
  if (!force && settings.get('onboarded')) return Promise.resolve(false);
  let index = 0;
  return openDialog(({ close }) => {
    const body = h('div', { class: 'primerBody' });
    const dots = h('div', { class: 'primerDots', 'aria-hidden': 'true' });
    const back = h('button', { type: 'button', class: 'btn' }, 'Back');
    const next = h('button', { type: 'button', class: 'btn primary' }, 'Next');
    const skip = h('button', { type: 'button', class: 'btn btnSmall' }, 'Skip');

    function paint() {
      const panel = PRIMER_PANELS[index];
      clear(body);
      body.append(
        h('span', { class: 'eyeline' }, `${pad2(index + 1)} / ${pad2(PRIMER_PANELS.length)}`),
        h('h2', { class: 'dialogTitle', id: 'primerTitle', tabindex: '-1' }, panel.title),
        h('p', { class: 'primerLead' }, panel.lead),
        h('p', {}, panel.body),
        demo(panel.demo),
      );
      clear(dots);
      PRIMER_PANELS.forEach((_, i) => dots.append(h('span', { class: i === index ? 'dot on' : 'dot' })));
      back.disabled = index === 0;
      setText(next, index === PRIMER_PANELS.length - 1 ? 'Start playing' : 'Next');
      announce(`${panel.title}. ${panel.lead}`);
      requestAnimationFrame(() => body.querySelector('#primerTitle')?.focus({ preventScroll: true }));
    }

    back.addEventListener('click', () => { index = Math.max(0, index - 1); paint(); });
    next.addEventListener('click', () => {
      if (index === PRIMER_PANELS.length - 1) { settings.set('onboarded', true); close('done'); }
      else { index += 1; paint(); }
    });
    skip.addEventListener('click', () => { settings.set('onboarded', true); close('skipped'); });

    const node = h('div', { class: 'dialogPanel primerPanel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'primerTitle' },
      body, dots,
      h('div', { class: 'dialogActions' }, skip, back, next),
    );
    requestAnimationFrame(paint);
    return { node, initial: next };
  });
}

/** Live miniatures of the real UI, built from the same primitives (IA-5). */
function demo(kind) {
  if (kind === 'core') {
    const bar = h('div', { class: 'coreBar demoBar', 'aria-hidden': 'true' });
    for (let i = 0; i < 20; i++) bar.append(h('span', { class: i < 13 ? 'coreSeg lit' : 'coreSeg' }));
    return h('div', { class: 'primerDemo' }, h('span', { class: 'coreLabel' }, 'Rival Core'), h('div', { class: 'coreRow' }, h('b', { class: 'coreNum' }, '13'), h('small', {}, '/20')), bar);
  }
  if (kind === 'lanes') {
    return h('div', { class: 'primerDemo demoLanes' }, ...engine.LANE_NAMES.map((n, i) => h('div', { class: 'demoLane' },
      h('b', {}, n), h('span', {}, i === 2 ? 'open — hits the Core' : 'contested'))));
  }
  if (kind === 'resources') {
    const rows = [['C', 'Command', 4, 5, 2], ['I', 'Insight', 3, 4, 1], ['E', 'Essence', 2, 3, 0]];
    return h('div', { class: 'primerDemo' }, ...rows.map(([letter, label, have, cap, spend]) => {
      const dots = h('span', { class: 'pips' });
      for (let i = 0; i < cap; i++) dots.append(h('i', { class: i < have ? (i >= have - spend ? 'pip ghost' : 'pip full') : 'pip empty' }));
      return h('div', { class: `pipRow pip-${label.toLowerCase()}` }, h('span', { class: 'pipLetter' }, letter), dots, h('b', { class: 'pipValue' }, `${have}/${cap}`));
    }), h('p', { class: 'demoNote' }, 'Outlined pips are what the selected card would spend.'));
  }
  return h('div', { class: 'primerDemo demoClash' },
    h('div', { class: 'demoUnit' }, h('b', {}, 'Your Warrior'), h('span', { class: 'unitPower' }, '⟨6⟩')),
    h('span', { class: 'demoVs' }, 'simultaneous'),
    h('div', { class: 'demoUnit' }, h('b', {}, 'Rival Knight'), h('span', { class: 'unitPower' }, '⟨6⟩')),
    h('p', { class: 'demoNote' }, 'Both are destroyed. Power 6 hits for 6 and dies to 6.'),
  );
}
