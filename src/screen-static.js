/* screen-static.js — the front door, the rules page, and the first-run primer.
   The front door is a game front door (VD-32): resume, doctrine, canon, learn.
   No hero → metrics → three-feature-columns rhythm. */

import { h, setText, clear, delegate, settings, pad2 } from './core.js';
import { cards, divisions, divisionById, FAMILY_MARK } from './cards.js';
import { GLOSSARY, PRIMER_PANELS } from './glossary.js';
import { termLink } from './terms.js';
import { openDialog, announce } from './ui.js';
import * as engine from '../match-engine.js';

/* ---------- front door ---------- */

export function createHome({ deck, hasMatch }) {
  const resumeCard = h('a', { class: 'doorCard doorPrimary', href: '#/match' });
  const deckCard = h('a', { class: 'doorCard', href: '#/deck' });
  const codexCard = h('a', { class: 'doorCard', href: '#/codex' });
  const learnCard = h('a', { class: 'doorCard', href: '#/rules' });
  const hero = h('div', { class: 'doorHero' });

  const el = h('div', { class: 'screen homeScreen' },
    h('main', { class: 'doorMain' },
      h('header', { class: 'doorHead' },
        h('span', { class: 'eyeline' }, 'The Collective Codex'),
        h('h1', { class: 'screenTitle', id: 'homeTitle', tabindex: '-1' }, 'Three lanes. One Core. 1,134 cards.'),
      ),
      h('div', { class: 'doorGrid' }, resumeCard, deckCard, codexCard, learnCard),
      hero,
    ),
  );

  function doorCard(node, { kicker, title, body, meta }) {
    clear(node);
    node.append(
      h('span', { class: 'doorKicker' }, kicker),
      h('strong', { class: 'doorTitle' }, title),
      h('p', { class: 'doorBody' }, body),
      meta ? h('span', { class: 'doorMeta' }, meta) : null,
    );
  }

  function paintHero() {
    // One canonical card, not an "AI abstract" background.
    const c = cards[Math.floor(cards.length / 2)];
    const d = divisionById.get(c.divisionId);
    clear(hero);
    hero.style.setProperty('--division', d.color);
    hero.style.setProperty('--art-x', c.art.col);
    hero.style.setProperty('--art-y', c.art.row);
    hero.append(
      h('div', { class: 'heroArt cardArt', 'aria-hidden': 'true', dataset: { glyph: d.icon } }),
      h('div', { class: 'heroCopy' },
        h('span', { class: 'eyeline' }, `${d.icon} ${pad2(d.id)} ${d.name} · ${FAMILY_MARK[c.family] || '✦'} ${c.family}`),
        h('h2', {}, c.name),
        h('p', {}, c.rulesText),
        h('p', { class: 'heroNote' }, 'Remember: ', termLink('power'), ' is attack ', h('b', {}, 'and'), ' durability.'),
        h('a', { class: 'btn', href: `#/codex/${encodeURIComponent(c.id)}` }, 'Open this card'),
      ),
    );
  }

  return {
    el,
    mount() { paintHero(); },
    show() {
      el.hidden = false;
      const n = deck.size();
      const live = hasMatch();
      doorCard(resumeCard, live
        ? { kicker: 'In progress', title: 'Resume your match', body: 'Return to the board exactly where you left it.', meta: 'Enter the battlefield' }
        : { kicker: 'Play', title: 'Start a local match', body: 'Deterministic three-lane rules against a rival that drafts from the full canon to mirror your own doctrine profile. Choose its difficulty before you begin.', meta: n === 30 ? 'Your doctrine is ready' : `${n}/30 cards — finish your doctrine first` });
      resumeCard.setAttribute('href', live ? '#/match' : n === 30 ? '#/match' : '#/deck');
      doorCard(deckCard, { kicker: 'Your doctrine', title: `${n} / 30 cards`, body: 'Cost curve, entity balance and division spread, checked as you build.', meta: 'Open the builder' });
      doorCard(codexCard, { kicker: 'The canon', title: 'Browse 1,134 cards', body: '21 divisions, 28 families, 54 art sheets. Filter, sort, and link to any card.', meta: 'Open the Codex' });
      doorCard(learnCard, { kicker: 'New here?', title: 'Learn the basics — 90 seconds', body: 'Core, lanes, the staggered resource curve, deployment fatigue, and the one rule every other card game does differently.', meta: 'Open the primer' });
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
