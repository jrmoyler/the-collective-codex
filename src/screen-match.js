/* screen-match.js — the play surface.
 *
 * One viewport, no page scroll (IA-18). Regions, top to bottom: rival HUD,
 * rival lanes, the seam, your lanes, your HUD, docked hand. The log is a rail.
 * Everything is mounted once and patched in place; the only nodes created after
 * mount are lane children (units/supports/hand cards), which are keyed by uid.
 */

import { h, setText, setAttr, setClass, clear, delegate, pad2, settings, motionReduced, clamp } from './core.js';
import { cardById, divisionById, FAMILY_MARK, makeTile, paintTile, cardLabel, hasNoEffect, NO_EFFECT_BADGE, NO_EFFECT_NOTE } from './cards.js';
import { toast, announce, confirmDialog, openDialog } from './ui.js';
import { termLink } from './terms.js';
import { createMotion } from './motion.js';
import { ARMOUR_TOOLTIP, OPENING_HAND_TOTAL } from './rules-copy.js';
import { STARTING_CORE, OPENING_HAND, DRAW_PER_REFRESH } from '../match-engine.js';
import * as engine from '../match-engine.js';

const LANES = engine.LANE_NAMES;
const RESOURCES = [
  ['command', 'C', 'Command'],
  ['insight', 'I', 'Insight'],
  ['essence', 'E', 'Essence'],
];
/* Was `engine.STARTING_CORE ?? 20`. The fallback was a second, silent copy of an
   engine constant: if the export were ever renamed the HUD would keep drawing a
   20-segment Core bar for a game that no longer starts at 20, and nothing would
   fail. The engine is a hard dependency of this screen — let it be one. */

export function createMatchScreen({ store, onExit, onRematch, onEditDoctrine, onReplaySeed }) {
  let match = null;
  let handIndex = null;
  let laneCursor = 0;
  let region = 'hand';            // hand | lanes | log
  let lastEventSeq = 0;
  let armed = false, armTimer = null;
  let mulliganSel = new Set();
  let inspected = null;
  let endShown = false;
  let handAge = new Map();
  let unitNodes = new Map();      // uid -> element
  let coreShownFor = null;

  /* ---------- static DOM ---------- */

  const roundEl = h('b', { class: 'barRound' });
  const phaseEl = h('span', { class: 'barPhase' });
  const seedEl = h('button', { type: 'button', class: 'barSeed', dataset: { action: 'copySeed' }, title: 'Copy this match seed' });
  // aria-expanded is read from the same persisted preference that mount() uses
  // to collapse the log, so the two can never disagree.
  const logToggle = h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'toggleLog' }, 'aria-expanded': settings.get('logOpen') !== false ? 'true' : 'false', 'aria-controls': 'matchLog' }, 'Log');
  const motionToggle = h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'toggleMotion' }, 'aria-pressed': 'false' }, 'Reduce motion');

  const skipHost = h('div', { class: 'skipHost' });
  const debriefBtn = h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'debrief' }, hidden: true }, 'Debrief');
  const bar = h('header', { class: 'mBar' },
    h('div', { class: 'barLeft' },
      h('h1', { class: 'srOnly', id: 'matchTitle', tabindex: '-1' }, 'Local match'),
      roundEl, phaseEl, seedEl,
    ),
    h('div', { class: 'barRight' },
      h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'readBoard' } }, 'Read board ', h('kbd', {}, 'b')),
      h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'help' } }, 'Keys ', h('kbd', {}, '?')),
      motionToggle,
      logToggle,
      skipHost,
      debriefBtn,
      h('button', { type: 'button', class: 'btn btnSmall', dataset: { action: 'reset' } }, 'Reset match'),
    ),
  );

  const hudRival = createHud('rival');
  const hudPlayer = createHud('player');
  const rivalLanes = LANES.map((_, i) => createLaneSide('rival', i));
  const playerLanes = LANES.map((_, i) => createLaneSide('player', i));
  const seamCells = LANES.map((name, i) => createSeamCell(name, i));

  const board = h('section', { class: 'mBoard', 'aria-label': 'Battlefield' },
    hudRival.el,
    h('div', { class: 'laneRow laneRowRival', role: 'group', 'aria-label': 'Rival board' }, ...rivalLanes.map(l => l.el)),
    h('div', { class: 'seam', role: 'group', 'aria-label': 'Lane resolution' }, ...seamCells.map(c => c.el)),
    h('div', { class: 'laneRow laneRowPlayer', role: 'group', 'aria-label': 'Your board' }, ...playerLanes.map(l => l.el)),
    hudPlayer.el,
  );

  const logBody = h('div', { class: 'logBody', id: 'matchLog', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Match log' });
  const logRail = h('aside', { class: 'mLog' },
    h('header', { class: 'logHead' }, h('span', { class: 'eyeline' }, 'Match log'), h('kbd', {}, 'l')),
    logBody,
  );

  const handStrip = h('div', { class: 'handStrip', role: 'group', 'aria-label': 'Your hand' });
  const handHint = h('p', { class: 'handHint', id: 'handHint' });
  const endBtn = h('button', { type: 'button', class: 'btn primary endTurnBtn', dataset: { action: 'endTurn' }, 'aria-describedby': 'endSummary' });
  const endSummary = h('span', { class: 'endSummary', id: 'endSummary' });
  const handDock = h('footer', { class: 'mHand' },
    h('div', { class: 'handLeft' }, handStrip, handHint),
    h('div', { class: 'handRight' }, endSummary, endBtn),
  );

  const mulliganPanel = createMulligan();
  const inspectorPanel = createInspector(() => { inspected = null; inspectorPanel.el.hidden = true; });

  const el = h('div', { class: 'screen matchScreen', hidden: true },
    bar,
    h('div', { class: 'mStage' }, board, mulliganPanel.el, logRail),
    handDock,
    inspectorPanel.el,
  );

  const motion = createMotion({
    skipHost,
    resolve: (ev) => resolveNode(ev),
    onDone: () => {},
  });

  /* ---------- node resolution for the animation seam ---------- */

  function resolveNode(ev) {
    if (!ev) return null;
    if (ev.uid && unitNodes.has(ev.uid)) return unitNodes.get(ev.uid);
    if (ev.targetUid && unitNodes.has(ev.targetUid)) return unitNodes.get(ev.targetUid);
    if (ev.type === 'core-damage' || ev.type === 'match-end' || ev.type === 'fatigue') return ev.side === 'rival' ? hudRival.coreEl : hudPlayer.coreEl;
    if (ev.type === 'resource-gain') return (ev.side === 'player' && hudPlayer.pips[ev.resource]?.row) || (ev.side === 'rival' ? hudRival.coreEl : hudPlayer.coreEl);
    if (ev.type === 'draw' || ev.type === 'discard') return ev.side === 'player' ? handStrip : hudRival.countsEl;
    if (ev.type === 'unit-moved' && Number.isInteger(ev.toLane)) return (ev.side === 'rival' ? rivalLanes : playerLanes)[ev.toLane]?.el || null;
    if (ev.type === 'damage-prevented' && !Number.isInteger(ev.lane)) return ev.side === 'rival' ? hudRival.coreEl : hudPlayer.coreEl;
    if (Number.isInteger(ev.lane)) {
      const side = ev.side === 'rival' ? rivalLanes : playerLanes;
      return side[ev.lane]?.el || null;
    }
    return null;
  }

  /* ---------- HUD ---------- */

  function createHud(side) {
    const coreNum = h('b', { class: 'coreNum' });
    const coreBar = h('div', { class: 'coreBar', 'aria-hidden': 'true' });
    for (let i = 0; i < STARTING_CORE; i++) coreBar.append(h('span', { class: 'coreSeg' }));
    const critical = h('span', { class: 'coreCritical', hidden: true }, 'CRITICAL');
    const coreEl = h('div', { class: 'coreBlock' },
      h('span', { class: 'coreLabel' }, side === 'player' ? 'Your Core' : 'Rival Core'),
      h('div', { class: 'coreRow' }, coreNum, h('small', {}, `/${STARTING_CORE}`), critical),
      coreBar,
    );
    const countsEl = h('div', { class: 'hudCounts' });
    const counts = {};
    for (const key of ['deck', 'hand', 'discard']) {
      const v = h('b', {});
      counts[key] = v;
      countsEl.append(h('button', {
        type: 'button', class: 'countBtn', dataset: { action: key === 'discard' ? 'openDiscard' : 'noop', side },
      }, h('small', {}, key), v));
    }
    const pips = {};
    const pipRow = h('div', { class: 'pipRows' });
    if (side === 'player') {
      for (const [key, letter, label] of RESOURCES) {
        const dots = h('span', { class: 'pips', 'aria-hidden': 'true' });
        const value = h('b', { class: 'pipValue' });
        const row = h('div', { class: `pipRow pip-${key}` },
          h('span', { class: 'pipLetter', 'aria-hidden': 'true' }, letter),
          h('span', { class: 'srOnly' }, label),
          dots, value,
        );
        pips[key] = { row, dots, value };
        pipRow.append(row);
      }
    }
    const rivalBias = side === 'rival' ? h('div', { class: 'hudBias' }) : null;
    const el = h('div', { class: `hud hud-${side}`, 'aria-label': side === 'player' ? 'Your status' : 'Rival status' },
      coreEl, side === 'player' ? pipRow : rivalBias, countsEl,
    );
    return { el, coreEl, coreNum, coreBar, critical, counts, countsEl, pips, bias: rivalBias };
  }

  function paintHud(hud, p, side) {
    setText(hud.coreNum, p.core);
    const segs = hud.coreBar.children;
    for (let i = 0; i < segs.length; i++) setClass(segs[i], 'lit', i < p.core);
    setClass(hud.coreBar, 'critical', p.core <= 5);
    hud.critical.hidden = p.core > 5;
    setAttr(hud.coreEl, 'aria-label', `${side === 'player' ? 'Your' : 'Rival'} Core ${p.core} of ${STARTING_CORE}${p.core <= 5 ? ', critical' : ''}`);
    setText(hud.counts.deck, p.deck.length);
    // 4.5: an empty deck is a clock, not fine print.
    setClass(hud.counts.deck.parentElement, 'pressure', p.deck.length <= 6);
    setAttr(hud.counts.deck.parentElement, 'title', p.deck.length <= 6
      ? `${p.deck.length} cards left — each failed draw deals escalating unpreventable Core damage.`
      : `${p.deck.length} cards left in deck`);
    setText(hud.counts.hand, p.hand.length);
    setText(hud.counts.discard, p.discard.length);
    if (side === 'player') {
      const cap = engine.resourceCurve(p.turnNumber || 1);
      const ghost = ghostCost();
      for (const [key] of RESOURCES) {
        const { dots, value } = hud.pips[key];
        const have = p.resources[key], max = Math.max(cap[key], have);
        if (dots.childElementCount !== max) { clear(dots); for (let i = 0; i < max; i++) dots.append(h('i', {})); }
        const spend = ghost ? ghost[key] : 0;
        [...dots.children].forEach((pip, i) => {
          pip.className = i < have ? (i >= have - spend ? 'pip ghost' : 'pip full') : 'pip empty';
        });
        setText(value, `${have}/${cap[key]}`);
        setClass(hud.pips[key].row, 'short', ghost ? have < ghost[key] : false);
      }
    }
  }

  function ghostCost() {
    if (handIndex === null || !match || match.phase !== 'main') return null;
    const card = match.players.player.hand[handIndex];
    if (!card) return null;
    try { return engine.effectiveCost(match, 'player', card, laneCursor); }
    catch { return card.cost; }
  }

  /* ---------- lanes ---------- */

  function createLaneSide(side, index) {
    const supports = h('div', { class: 'laneSupports' });
    const units = h('div', { class: 'laneUnits' });
    const el = h('div', {
      class: `laneSide laneSide-${side}`, dataset: { lane: index, side },
      role: 'group', 'aria-label': `${LANES[index]} — ${side === 'player' ? 'your side' : 'rival side'}`,
    }, side === 'rival' ? [supports, units] : [units, supports]);
    return { el, supports, units };
  }

  function createSeamCell(name, index) {
    const rivalPwr = h('span', { class: 'seamPwr seamPwrRival' });
    const playerPwr = h('span', { class: 'seamPwr seamPwrPlayer' });
    const arrow = h('b', { class: 'seamArrow' });
    const status = h('span', { class: 'seamStatus' });
    const el = h('button', {
      type: 'button', class: 'seamCell', dataset: { action: 'pickLane', lane: index }, tabindex: '-1',
    },
      h('span', { class: 'seamLane' }, name, h('kbd', {}, ['a', 's', 'd'][index])),
      rivalPwr, arrow, playerPwr, status,
    );
    return { el, rivalPwr, playerPwr, arrow, status };
  }

  function unitNode(unit, side, laneIndex) {
    const c = unit.card;
    const d = divisionById.get(c.divisionId);
    const el = h('button', {
      type: 'button', class: 'battleUnit', tabindex: '-1',
      dataset: { action: 'inspect', card: c.id, uid: unit.uid, side },
      style: { '--division': d.color, '--art-x': c.art.col, '--art-y': c.art.row },
    },
      h('span', { class: 'battleUnitArt cardArt', 'aria-hidden': 'true', dataset: { glyph: d.icon } }),
      h('b', { class: 'unitName', 'aria-hidden': 'true' }, c.name),
      h('span', { class: 'unitPower', 'aria-hidden': 'true' }),
      h('span', { class: 'unitChips', 'aria-hidden': 'true' }),
    );
    el._power = el.querySelector('.unitPower');
    el._chips = el.querySelector('.unitChips');
    return el;
  }

  function paintUnit(el, unit, side, laneIndex) {
    const attack = unit.power + (unit.weaponUsed ? 0 : unit.weaponBonus);
    // A-17: the decisive number is attack, not printed power.
    setText(el._power, attack !== unit.power ? `⟨${unit.power}→${attack}⟩` : `⟨${unit.power}⟩`);
    setClass(el._power, 'buffed', attack !== unit.power);
    const chips = [];
    if (unit.exhausted) {
      const fresh = unit.deployedTurn === match.turnCount;
      chips.push([fresh ? 'JUST DEPLOYED ⏾' : 'EXHAUSTED ⏾', 'exhausted']);
    }
    if (unit.infected) chips.push(['INFECTED ☣', 'infected']);
    if (unit.weaponBonus && !unit.weaponUsed) chips.push([`WEAPON +${unit.weaponBonus} ⚔`, 'weapon']);
    if (unit.card.family === 'Knight') chips.push(['GUARD ⛨', 'guard']);
    if (unit.card.family === 'Dragon') chips.push(['FLYING ⌃', 'flying']);
    const key = chips.map(c => c[0]).join('|');
    if (el._chipKey !== key) {
      el._chipKey = key;
      clear(el._chips);
      for (const [text, kind] of chips) el._chips.append(h('span', { class: `unitChip chip-${kind}` }, text));
    }
    setClass(el, 'exhausted', unit.exhausted);
    setAttr(el, 'aria-label', `${side === 'player' ? 'Your' : 'Rival'} ${unit.card.name}, ${unit.card.family}, ${LANES[laneIndex]}. Power ${unit.power}${attack !== unit.power ? `, attacks for ${attack}` : ''}.${chips.length ? ' ' + chips.map(c => c[0].replace(/[^A-Za-z+0-9 ]/g, '').trim()).join(', ') + '.' : ''} Activate to inspect.`);
  }

  function supportNode(s, side) {
    const hidden = side === 'rival' && s.card.family === 'Trap' && s.faceDown;
    const el = h('button', {
      type: 'button', class: 'supportChip', tabindex: '-1',
      dataset: hidden ? { action: 'noop' } : { action: 'inspect', card: s.card.id },
    },
      h('span', { class: 'supportFamily', 'aria-hidden': 'true' }, hidden ? '⌖ SET' : `${FAMILY_MARK[s.card.family] || '✦'} ${s.card.family}`),
      h('b', { class: 'supportName', 'aria-hidden': 'true' }, hidden ? 'Face down' : s.card.name),
      h('span', { class: 'supportMeta', 'aria-hidden': 'true' }),
    );
    el._meta = el.querySelector('.supportMeta');
    setClass(el, 'faceDown', hidden);
    // A-23: hidden information stays in the accessibility tree.
    setAttr(el, 'aria-label', hidden ? 'Face-down rival support, identity unknown.' : `${side === 'player' ? 'Your' : 'Rival'} ${s.card.name}, ${s.card.family} support. Activate to inspect.`);
    return el;
  }

  function paintSupport(el, s) {
    const bits = [];
    if (s.counters) bits.push(`CHANNEL ${s.counters}/3`);
    if (s.disabled) bits.push('DISABLED');
    setText(el._meta, bits.join(' · '));
    setClass(el, 'disabled', Boolean(s.disabled));
  }

  /** Keyed reconciliation over a lane's children. Nodes are reused by uid. */
  function syncChildren(host, list, keyOf, create, paint) {
    const existing = new Map();
    for (const child of [...host.children]) if (child.dataset.key) existing.set(child.dataset.key, child);
    let cursor = null;
    for (const item of list) {
      const key = keyOf(item);
      let node = existing.get(key);
      if (node) existing.delete(key);
      else { node = create(item); node.dataset.key = key; }
      paint(node, item);
      if (cursor ? cursor.nextSibling !== node : host.firstChild !== node) host.insertBefore(node, cursor ? cursor.nextSibling : host.firstChild);
      cursor = node;
    }
    for (const [, node] of existing) node.remove();
  }

  function paintLanes() {
    unitNodes = new Map();
    for (let i = 0; i < 3; i++) {
      for (const [side, lanes] of [['rival', rivalLanes], ['player', playerLanes]]) {
        const lane = match.players[side].lanes[i];
        const slot = lanes[i];
        syncChildren(slot.units, lane.units, u => u.uid, u => unitNode(u, side, i), (node, u) => { paintUnit(node, u, side, i); unitNodes.set(u.uid, node); });
        syncChildren(slot.supports, lane.supports, s => s.uid, s => supportNode(s, side), paintSupport);
        if (!lane.units.length && !slot.units.querySelector('.laneEmpty')) {
          slot.units.append(h('span', { class: 'laneEmpty' }, side === 'rival' ? 'Open — attacks here hit their Core' : `Empty · 0/${engine.MAX_UNITS_PER_LANE ?? 3}`));
        } else if (lane.units.length) {
          slot.units.querySelector('.laneEmpty')?.remove();
        }
        // playability of the selected card into this lane (channel 2: contextual reason)
        if (side === 'player') {
          const legal = handIndex !== null && match.phase === 'main' ? engine.getPlayability(match, 'player', handIndex, i) : null;
          setAttr(slot.el, 'data-legal', legal ? (legal.ok ? 'yes' : 'no') : null);
          let reason = slot.el.querySelector('.laneReason');
          if (legal && !legal.ok) {
            if (!reason) { reason = h('p', { class: 'laneReason' }); slot.el.append(reason); }
            setText(reason, legal.reason);
          } else if (reason) reason.remove();
        }
        setClass(slot.el, 'laneCursor', i === laneCursor);
      }
    }
  }

  function paintSeam() {
    const threat = typeof engine.laneThreat === 'function'
      ? engine.laneThreat(match, 'player')
      : LANES.map((name, lane) => ({ lane, name, outgoing: 0, incoming: 0 }));
    for (let i = 0; i < 3; i++) {
      const cell = seamCells[i];
      const mine = match.players.player.lanes[i].units;
      const theirs = match.players.rival.lanes[i].units;
      const myPower = mine.reduce((s, u) => s + u.power + (u.weaponUsed ? 0 : u.weaponBonus), 0);
      const theirPower = theirs.reduce((s, u) => s + u.power + (u.weaponUsed ? 0 : u.weaponBonus), 0);
      // A-18: power, not unit counts.
      setText(cell.rivalPwr, `rival pwr ${theirPower}`);
      setText(cell.playerPwr, `your pwr ${myPower}`);
      const out = threat[i]?.outgoing || 0, inc = threat[i]?.incoming || 0;
      const net = out - inc;
      setText(cell.arrow, out === 0 && inc === 0 ? '—' : net >= 0 ? `▸▸ ${out}` : `◂◂ ${inc}`);
      setAttr(cell.el, 'data-dir', out === 0 && inc === 0 ? 'none' : net >= 0 ? 'out' : 'in');
      const open = theirs.length === 0 && mine.length > 0;
      setText(cell.status, open ? 'OPEN — after armour' : theirs.length ? 'contested' : 'empty');
      setAttr(cell.el, 'title', ARMOUR_TOOLTIP);
      setClass(cell.el, 'laneCursor', i === laneCursor);
      setAttr(cell.el, 'aria-label', `${LANES[i]}. Your power ${myPower}, rival power ${theirPower}. If the turn ends now, ${out} Core damage lands on the rival and ${inc} on you, after armour.${open ? ' The rival lane is open.' : ''} Activate to target this lane.`);
      cell.el.tabIndex = i === laneCursor ? 0 : -1;
    }
    return threat;
  }

  /* ---------- hand ---------- */

  function paintHand() {
    const p = match.players.player;
    const hand = p.hand;
    while (handStrip.children.length > hand.length) handStrip.lastChild.remove();
    while (handStrip.children.length < hand.length) {
      const tile = makeTile({ cls: 'codexCard compact handCard' });
      tile.dataset.action = 'pickHand';
      handStrip.append(tile);
    }
    hand.forEach((c, i) => {
      const tile = handStrip.children[i];
      const perLane = [0, 1, 2].map(l => (match.phase === 'main' ? engine.getPlayability(match, 'player', i, l) : { ok: false, reason: 'Not your main phase.' }));
      const anyLegal = perLane.some(r => r.ok);
      const here = perLane[laneCursor];
      const eff = (() => { try { return engine.effectiveCost(match, 'player', c, laneCursor); } catch { return c.cost; } })();
      const discounted = eff.command + eff.insight + eff.essence < c.cost.command + c.cost.insight + c.cost.essence;
      // A-16/A-19: affordability + legality + effective cost, before commitment.
      // One short line: the full reason lives in the lane zone (channel 2) and in
      // the accessible name. The tile only has to be glanceable.
      const note = anyLegal
        ? (here.ok ? (discounted ? `−1 here · ${eff.command}/${eff.insight}/${eff.essence}` : 'Playable here') : 'Other lane only')
        : shortReason(here.reason);
      paintTile(tile, c, {
        index: i,
        selected: i === handIndex,
        disabled: !anyLegal,
        note,
        noteKind: anyLegal ? (here.ok ? 'ok' : 'info') : 'warn',
        label: `${cardLabel(c)} Hand slot ${i + 1}. ${anyLegal ? (here.ok ? `Playable in ${LANES[laneCursor]}.` : 'Not playable in the lane under the cursor: ' + here.reason) : 'Not playable: ' + here.reason}`,
      });
      tile.tabIndex = (region === 'hand' && (handIndex === null ? i === 0 : i === handIndex)) ? 0 : -1;
    });
    const selected = handIndex === null ? null : hand[handIndex];
    setText(handHint, hand.length
      ? (selected ? `${selected.name} selected — choose a lane (${['a', 's', 'd'].join(' / ')}) then Enter, or click a lane.` : 'Select a card (1–9), then a lane (a / s / d), then Enter.')
      : `No cards in hand — you draw ${DRAW_PER_REFRESH} at refresh. Deck ${p.deck.length}.`);
  }

  const SHORT_REASON = [
    [/not enough (\w+)/i, (m) => `Need ${m[1]}`],
    [/lane is full/i, () => 'Lane full'],
    [/no support slots/i, () => 'No slots'],
    [/needs a friendly unit/i, () => 'Needs your unit'],
    [/needs an opposing unit/i, () => 'Needs a target'],
    [/main phase/i, () => 'Not your phase'],
  ];
  function shortReason(reason) {
    for (const [re, fn] of SHORT_REASON) { const m = re.exec(reason || ''); if (m) return fn(m); }
    return (reason || 'Unplayable').replace(/\.$/, '');
  }

  /* ---------- log (P0-6) ---------- */

  let renderedLogSeq = 0;
  function paintLog({ bulk = false } = {}) {
    const events = (match.events || []).filter(e => e.text);
    if (!events.length) {
      if (!logBody.childElementCount) logBody.append(h('p', { class: 'logEmpty' }, 'The match log records every trigger, clash and point of damage.'));
      return;
    }
    logBody.querySelector('.logEmpty')?.remove();
    const fresh = events.filter(e => e.seq > renderedLogSeq);
    if (!fresh.length) return;
    if (bulk) logBody.setAttribute('aria-busy', 'true');
    for (const ev of fresh) {
      const roundKey = `r${ev.round}`;
      let group = logBody.querySelector(`[data-round="${roundKey}"]`);
      if (!group) {
        group = h('section', { class: 'logGroup', dataset: { round: roundKey } },
          h('h3', { class: 'logRound' }, `Round ${pad2(ev.round)}`),
        );
        logBody.prepend(group); // newest round on top…
      }
      group.append(h('p', { class: `logLine log-${ev.type}`, dataset: { type: ev.type } }, ev.text)); // …chronological within
      renderedLogSeq = ev.seq;
    }
    if (bulk) requestAnimationFrame(() => logBody.setAttribute('aria-busy', 'false'));
  }

  /* ---------- board reading (AX-7) ---------- */

  function boardSentence() {
    const parts = [];
    const p = match.players.player, r = match.players.rival;
    parts.push(`Your Core ${p.core}, rival Core ${r.core}. Round ${match.round}.`);
    for (let i = 0; i < 3; i++) {
      const mine = p.lanes[i].units, theirs = r.lanes[i].units;
      const myPower = mine.reduce((s, u) => s + u.power, 0);
      const theirPower = theirs.reduce((s, u) => s + u.power, 0);
      const strongest = theirs.slice().sort((a, b) => b.power - a.power)[0];
      let s = `${LANES[i]}: rival ${theirs.length} unit${theirs.length === 1 ? '' : 's'}`;
      if (strongest) s += `, strongest ${strongest.card.name} power ${strongest.power}`;
      s += `, total power ${theirPower}. You ${mine.length} unit${mine.length === 1 ? '' : 's'}, total power ${myPower}.`;
      if (!theirs.length && mine.length) s += ' No rival defenders — your attacks there hit their Core.';
      parts.push(s);
    }
    const cap = engine.resourceCurve(p.turnNumber || 1);
    parts.push(`Resources: ${p.resources.command} of ${cap.command} command, ${p.resources.insight} of ${cap.insight} insight, ${p.resources.essence} of ${cap.essence} essence. Hand ${p.hand.length}, deck ${p.deck.length}.`);
    return parts.join(' ');
  }

  /* ---------- turn projection + end turn (IX-11 armed two-step) ---------- */

  function projection() {
    const threat = typeof engine.laneThreat === 'function' ? engine.laneThreat(match, 'player') : [];
    const out = threat.reduce((s, t) => s + t.outgoing, 0);
    const inc = threat.reduce((s, t) => s + t.incoming, 0);
    return { out, inc };
  }

  function disarm() {
    armed = false;
    setText(endBtn, 'End turn');
    setClass(endBtn, 'armed', false);
  }

  /* The armed state has NO timeout.
   *
   * It used to disarm itself after 3,000 ms. Reading three lanes of projected
   * damage and deciding whether to commit takes longer than three seconds — and
   * when it did, the player's Enter silently re-armed instead of ending the
   * turn, so the deliberate two-step became a race. Nothing about a confirmation
   * gets safer for expiring; the state is cleared when the player disarms it
   * (Escape), acts on something else (picking a hand card, targeting a lane), or
   * confirms. Those call sites already call disarm(). */
  function armEndTurn() {
    const { out, inc } = projection();
    armed = true;
    setText(endBtn, 'Confirm end turn ⏎');
    setClass(endBtn, 'armed', true);
    setText(endSummary, `3 lanes resolve · you project ${out} outgoing, ${inc} incoming`);
    announce(`End turn armed. Three lanes resolve. You project ${out} damage out and ${inc} damage in. Press Enter to confirm — it stays armed until you do.`);
    // A short mis-click guard on the pointer target only: a double click on
    // "End turn" must not sail through the confirmation. The keyboard path does
    // not consult endBtn.disabled, so this never delays a deliberate ⏎.
    endBtn.disabled = true;
    clearTimeout(armTimer);
    armTimer = setTimeout(() => { endBtn.disabled = false; }, 400);
  }

  function doEndTurn() {
    const before = match.players.player.core;
    const beforeUnits = countUnits('player');
    try {
      const next = engine.completePlayerTurn(match);
      handIndex = null;
      applyMatch(next, { bulk: true });
      const lost = beforeUnits - countUnits('player');
      const taken = before - match.players.player.core;
      // AX-6: summary first, then the detail entries in the log.
      announce(`Rival turn resolved: you took ${taken} Core damage, lost ${lost} unit${lost === 1 ? '' : 's'}. Core ${match.players.player.core} of ${STARTING_CORE}.`, { assertive: taken > 0 });
    } catch (error) {
      console.error('[match] end turn rejected', error);
      toast(error.message, { kind: 'warn' });
    }
    disarm();
  }

  function countUnits(side) {
    return match.players[side].lanes.reduce((s, l) => s + l.units.length, 0);
  }

  /* ---------- play a card ---------- */

  function playSelected(lane = laneCursor) {
    if (handIndex === null) { toast('Select a card from your hand first.', { kind: 'warn' }); return; }
    const check = engine.getPlayability(match, 'player', handIndex, lane);
    if (!check.ok) {
      // channel 2: the reason belongs where the action would have happened.
      const slot = playerLanes[lane].el;
      slot.classList.remove('rejected'); void slot.offsetWidth; slot.classList.add('rejected');
      announce(check.reason, { assertive: true });
      return;
    }
    const card = match.players.player.hand[handIndex];
    try {
      const next = engine.playCard(match, 'player', handIndex, lane);
      handIndex = null;
      applyMatch(next);
      const isEntity = engine.ENTITY_FAMILIES.has(card.family);
      announce(`${card.name} played into ${LANES[lane]}.${isEntity ? ' It arrives exhausted and attacks from your next refresh.' : ''}`);
    } catch (error) {
      console.error('[match] play rejected', error);
      announce(error.message, { assertive: true });
      toast(error.message, { kind: 'warn' });
    }
  }

  /* ---------- state application ---------- */

  function applyMatch(next, { bulk = false, animate = true } = {}) {
    const previousSeq = lastEventSeq;
    match = next;
    store.set({ match });
    paint({ bulk });                                     // FINAL STATE FIRST
    const fresh = (match.events || []).filter(e => e.seq > previousSeq);
    lastEventSeq = match.eventSeq || 0;
    if (animate && fresh.length) motion.consume(fresh, { side: 'player' });  // decoration on top
    if (match.phase === 'ended' && !endShown) showEndDialog();
  }

  /* ---------- paint ---------- */

  function paint({ bulk = false } = {}) {
    if (!match) return;
    el.dataset.phase = match.phase;
    setText(roundEl, `Round ${pad2(match.round)}`);
    setText(phaseEl, match.phase === 'mulligan' ? 'Opening hand' : match.phase === 'ended' ? 'Match complete' : match.active === 'player' ? 'Your main phase' : 'Rival phase');
    setText(seedEl, match.seedCode ? `Seed ${match.seedCode}` : '');
    seedEl.hidden = !match.seedCode;
    setAttr(motionToggle, 'aria-pressed', motionReduced() ? 'true' : 'false');

    const isMulligan = match.phase === 'mulligan';
    mulliganPanel.el.hidden = !isMulligan;
    board.hidden = isMulligan;
    handDock.hidden = isMulligan;
    if (isMulligan) { mulliganPanel.paint(match, mulliganSel); paintLog({ bulk }); return; }

    // The rival drafts from the full canon to mirror your own deck profile; it has
    // no division bias and no hidden bonuses. Only the search tier differs.
    setText(hudRival.bias, `${(match.difficulty || 'veteran').toUpperCase()} · drafts from the full canon to mirror your profile`);
    paintHud(hudRival, match.players.rival, 'rival');
    paintHud(hudPlayer, match.players.player, 'player');
    paintLanes();
    paintSeam();
    paintHand();
    paintLog({ bulk });

    const ended = match.phase === 'ended';
    debriefBtn.hidden = !ended;
    endBtn.disabled = ended;
    if (!armed) { setText(endBtn, 'End turn'); setText(endSummary, ended ? 'Match complete' : `${projection().out} projected out · ${projection().inc} in`); }
    if (settings.get('usedKeyboard')) el.classList.add('showKeys');
  }

  /* ---------- mulligan (IA-17) ---------- */

  function createMulligan() {
    const handHost = h('div', { class: 'mullHand', role: 'group', 'aria-label': 'Opening hand' });
    const primary = h('button', { type: 'button', class: 'btn primary', dataset: { action: 'mulliganGo' } });
    const el = h('section', { class: 'mulliganPanel', hidden: true },
      h('div', { class: 'mullCopy' },
        h('span', { class: 'eyeline' }, 'Opening hand · round 01'),
        h('h2', {}, 'Commit your opening hand'),
        h('p', {}, 'Replaced cards go to the ', h('b', {}, 'bottom of your deck'), ' and are immediately redrawn. You may do this once.'),
        h('ul', { class: 'mullRules' },
          h('li', {}, `${STARTING_CORE} `, termLink('core'), ' each side · reduce theirs to 0, by combat, by effect, or by ', termLink('fatigue')),
          h('li', {}, 'Three ', termLink('lane', 'lanes'), ' resolve independently'),
          h('li', {}, termLink('power'), ' is attack ', h('b', {}, 'and'), ' durability'),
          h('li', {}, `You draw ${DRAW_PER_REFRESH} at every `, termLink('refresh'), `, the opening one included, so a kept hand of ${OPENING_HAND} becomes ${OPENING_HAND_TOTAL}`),
          h('li', {}, 'The rival takes its own one-time mulligan; how greedy it is depends on the difficulty tier'),
        ),
      ),
      handHost,
      h('div', { class: 'mullActions' }, primary, h('button', { type: 'button', class: 'btn', dataset: { action: 'reset' } }, 'Back to doctrine')),
    );
    return {
      el,
      paint(m, sel) {
        const hand = m.players.player.hand;
        while (handHost.children.length > hand.length) handHost.lastChild.remove();
        while (handHost.children.length < hand.length) {
          const tile = makeTile({ cls: 'codexCard compact' });
          tile.dataset.action = 'toggleMulligan';
          handHost.append(tile);
        }
        hand.forEach((c, i) => {
          const tile = handHost.children[i];
          paintTile(tile, c, {
            index: i, selected: sel.has(i),
            note: sel.has(i) ? 'Will be replaced' : '',
            noteKind: sel.has(i) ? 'warn' : null,
            label: `${cardLabel(c)} ${sel.has(i) ? 'Marked for replacement.' : 'Kept.'} Activate to toggle.`,
          });
          tile.tabIndex = i === 0 ? 0 : -1;
        });
        setText(primary, sel.size ? `Replace ${sel.size} card${sel.size === 1 ? '' : 's'}` : 'Keep this hand');
      },
    };
  }

  /* ---------- inspector (IA-21) ---------- */

  function createInspector(onClose) {
    const body = h('div', { class: 'inspectBody' });
    const el = h('div', { class: 'inspectPanel', hidden: true, role: 'dialog', 'aria-label': 'Card inspector' },
      h('button', { type: 'button', class: 'btn iconBtn inspectClose', dataset: { action: 'closeInspect' }, 'aria-label': 'Close inspector' }, '✕'),
      body,
    );
    return {
      el,
      show(card) {
        const d = divisionById.get(card.divisionId);
        clear(body);
        body.append(
          h('span', { class: 'inspectDiv' }, `${d.icon} ${pad2(d.id)} ${d.name} · ${FAMILY_MARK[card.family] || '✦'} ${card.family}`),
          h('h2', { class: 'inspectName', tabindex: '-1' }, card.name),
          // Before the rules text, which is what misleads on these families.
          hasNoEffect(card) ? h('p', { class: 'inspectBlank' }, h('strong', {}, NO_EFFECT_BADGE), ' — ', NO_EFFECT_NOTE) : null,
          h('p', { class: 'inspectRules' }, card.rulesText),
          h('dl', { class: 'inspectSpecs' },
            h('div', {}, h('dt', {}, 'Cost'), h('dd', {}, `${card.cost.command}C · ${card.cost.insight}I · ${card.cost.essence}E`)),
            h('div', {}, h('dt', {}, 'Power'), h('dd', {}, `${card.power} (attack and durability)`)),
            h('div', {}, h('dt', {}, 'Timing'), h('dd', {}, `${card.timing} · ${card.targeting} · ${card.duration}`)),
          ),
        );
        el.hidden = false;
        requestAnimationFrame(() => body.querySelector('.inspectName')?.focus({ preventScroll: true }));
      },
      hide() { el.hidden = true; onClose(); },
    };
  }

  /* ---------- end of match (IA-22) ---------- */

  async function showEndDialog() {
    endShown = true;
    if (!match || match.phase !== 'ended') return;
    const m = match, p = m.players.player, r = m.players.rival;
    const title = m.winner === 'player' ? 'Victory' : m.winner === 'rival' ? 'Defeat' : 'Draw';
    announce(`${title}. Your Core ${p.core}, rival Core ${r.core}, after ${m.turnCount} turns.`, { assertive: true });
    const result = await openDialog(({ close }) => {
      const rematch = h('button', { type: 'button', class: 'btn primary', onclick: () => close('rematch') }, 'Rematch (same doctrine)');
      const edit = h('button', { type: 'button', class: 'btn', onclick: () => close('edit') }, 'Edit doctrine');
      const codex = h('button', { type: 'button', class: 'btn', onclick: () => close('codex') }, 'Back to Codex');
      const history = m.stats?.coreHistory || [];
      const damage = (m.events || []).filter(e => e.type === 'core-damage').sort((a, b) => b.amount - a.amount).slice(0, 3);
      const stuck = [...handAge.entries()].filter(([, n]) => n >= 3).map(([id]) => cardById.get(id)).filter(Boolean).slice(0, 5);
      return {
        node: h('div', { class: 'dialogPanel endPanel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'endTitle' },
          h('span', { class: 'eyeline' }, 'Match complete'),
          h('h2', { class: 'dialogTitle endVerdict', id: 'endTitle', dataset: { outcome: m.winner || 'draw' } }, title),
          h('div', { class: 'endStats' },
            stat('Your Core', p.core), stat('Rival Core', r.core), stat('Rounds', m.round),
            stat('Core dealt', m.stats?.player?.coreDamageDealt ?? '—'), stat('Core taken', m.stats?.player?.coreDamageTaken ?? '—'),
            stat('Damage held', m.stats?.player?.damagePrevented ?? '—'),
            stat('Units lost', m.stats?.player?.unitsLost ?? '—'), stat('Units killed', m.stats?.player?.unitsDestroyed ?? '—'),
            stat('Biggest lane swing', m.stats?.player?.largestLaneSwing ?? '—'),
            stat('Resources spent', m.stats?.player?.resourcesSpent?.total ?? '—'),
            stat('Fatigue taken', m.stats?.player?.fatigueDamage ?? 0),
            stat('Difficulty', m.difficulty || '—'),
          ),
          h('p', { class: 'endReason' }, m.endReason === 'fatigue'
            ? 'Ended on deck-out fatigue: a Core ran out of cards to draw.'
            : 'Ended on Core damage.'),
          history.length > 1 ? h('div', { class: 'endChart' },
            h('h3', {}, 'Core swing per round'),
            h('div', { class: 'chartRows' }, ...history.map(entry => h('div', { class: 'chartRow' },
              h('small', {}, `R${pad2(entry.round)}`),
              h('span', { class: 'chartBar chartYou', style: { width: `${(entry.player / STARTING_CORE) * 100}%` } }, String(entry.player)),
              h('span', { class: 'chartBar chartThem', style: { width: `${(entry.rival / STARTING_CORE) * 100}%` } }, String(entry.rival)),
            ))),
          ) : null,
          damage.length ? h('div', { class: 'endList' },
            h('h3', {}, 'Biggest hits'),
            h('ul', {}, ...damage.map(d => h('li', {}, `${d.amount} Core to ${d.side === 'player' ? 'you' : 'the rival'} in ${Number.isInteger(d.lane) ? LANES[d.lane] : 'fatigue'} (round ${d.round})`))),
          ) : null,
          h('div', { class: 'endList' },
            h('h3', {}, 'Never drawn'),
            h('p', {}, `${p.deck.length} card${p.deck.length === 1 ? '' : 's'} stayed in your deck.`),
            stuck.length ? h('p', {}, `Sat in hand three turns or more: ${stuck.map(c => c.name).join(', ')}.`) : null,
          ),
          m.seedCode ? h('div', { class: 'endSeed' },
            h('h3', {}, 'Seed'),
            h('p', {}, 'Share this code to let anyone replay the exact match, difficulty included.'),
            h('div', { class: 'endSeedRow' },
              h('code', { class: 'seedCode' }, m.seedCode),
              h('button', { type: 'button', class: 'btn btnSmall', onclick: () => copySeed() }, 'Copy seed'),
              onReplaySeed ? h('button', { type: 'button', class: 'btn btnSmall', onclick: () => close('seed') }, 'Replay this seed') : null,
            ),
          ) : null,
          h('div', { class: 'dialogActions' }, codex, edit, rematch),
        ),
        initial: rematch,
      };
    });
    // Escape / scrim dismiss must NOT abandon the match: the board stays on screen
    // and the "Debrief" control in the match bar reopens this panel.
    if (result === 'seed' && onReplaySeed) onReplaySeed(m.seedCode);
    else if (result === 'rematch') onRematch();
    else if (result === 'edit') onEditDoctrine();
    else if (result === 'codex') onExit();
    else announce('Debrief closed. The final board is still on screen; reopen it from the Debrief button.');
  }

  function stat(label, value) { return h('div', { class: 'endStat' }, h('small', {}, label), h('b', {}, String(value))); }

  /* ---------- keyboard (§3.1) ---------- */

  function isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }

  el.addEventListener('keydown', ev => {
    if (isTyping() || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (!match) return;
    const key = ev.key;
    // Latch once. settings.set is already a no-op for an unchanged value, but
    // reading a boolean is cheaper than the write path deciding not to run, and
    // this makes the "write once, then never again" intent explicit at the site
    // that fires on literally every keypress of a match.
    if (key !== 'Tab' && !settings.get('usedKeyboard')) settings.set('usedKeyboard', true);

    if (key === 'Escape') {
      if (!inspectorPanel.el.hidden) { ev.preventDefault(); inspectorPanel.hide(); return; }
      if (armed) { ev.preventDefault(); disarm(); paint(); return; }
      if (handIndex !== null) { ev.preventDefault(); handIndex = null; paint(); return; }
      return;
    }
    if (match.phase === 'mulligan') {
      if (/^[1-5]$/.test(key)) { ev.preventDefault(); toggleMulligan(Number(key) - 1); }
      else if (key === 'Enter') { ev.preventDefault(); commitMulligan(); }
      return;
    }
    if (match.phase !== 'main') return;

    if (/^[0-9]$/.test(key)) {
      ev.preventDefault();
      const i = key === '0' ? 9 : Number(key) - 1;
      if (i < match.players.player.hand.length) { if (armed) disarm(); handIndex = handIndex === i ? null : i; region = 'hand'; paint(); }
      return;
    }
    switch (key) {
      case 'ArrowLeft': ev.preventDefault(); laneCursor = clamp(laneCursor - 1, 0, 2); paint(); focusLane(); break;
      case 'ArrowRight': ev.preventDefault(); laneCursor = clamp(laneCursor + 1, 0, 2); paint(); focusLane(); break;
      case 'a': case 'A': ev.preventDefault(); laneCursor = 0; paint(); focusLane(); break;
      case 's': case 'S': ev.preventDefault(); laneCursor = 1; paint(); focusLane(); break;
      case 'd': case 'D': ev.preventDefault(); laneCursor = 2; paint(); focusLane(); break;
      case 'Enter':
        ev.preventDefault();
        // A live hand selection always wins: Enter commits the card, never the turn.
        if (handIndex !== null) { if (armed) disarm(); playSelected(); }
        else if (armed) doEndTurn();
        else armEndTurn();
        break;
      case 'e': case 'E': ev.preventDefault(); armed ? doEndTurn() : armEndTurn(); break;
      case 'i': case 'I': {
        ev.preventDefault();
        const c = handIndex !== null ? match.players.player.hand[handIndex] : null;
        if (c) { inspected = c; inspectorPanel.show(c); }
        break;
      }
      case 'b': case 'B': ev.preventDefault(); announce(boardSentence(), { assertive: false }); break;
      case 'l': case 'L': ev.preventDefault(); logBody.focus({ preventScroll: true }); region = 'log'; break;
      default: break;
    }
  });

  function focusLane() { seamCells[laneCursor].el.focus({ preventScroll: true }); }

  function toggleMulligan(i) {
    if (mulliganSel.has(i)) mulliganSel.delete(i); else mulliganSel.add(i);
    paint();
  }

  function commitMulligan() {
    try {
      const next = engine.mulligan(match, 'player', [...mulliganSel]);
      mulliganSel = new Set();
      applyMatch(next, { bulk: true });
      announce('Match begun. Your main phase.');
      requestAnimationFrame(() => handStrip.querySelector('.handCard')?.focus({ preventScroll: true }));
    } catch (error) {
      console.error('[match] mulligan rejected', error);
      toast(error.message, { kind: 'warn' });
    }
  }

  /* ---------- delegated clicks ---------- */

  delegate(el, 'click', {
    pickHand: (b) => { const i = Number(b.dataset.index); if (armed) disarm(); handIndex = handIndex === i ? null : i; region = 'hand'; paint(); },
    pickLane: (b) => {
      const lane = Number(b.dataset.lane);
      if (handIndex !== null && laneCursor === lane) { playSelected(lane); return; }
      laneCursor = lane; paint();
      if (handIndex !== null) playSelected(lane);
    },
    inspect: (b) => { const c = cardById.get(b.dataset.card); if (c) { inspected = c; inspectorPanel.show(c); } },
    closeInspect: () => inspectorPanel.hide(),
    endTurn: () => { armed ? doEndTurn() : armEndTurn(); },
    toggleMulligan: (b) => toggleMulligan(Number(b.dataset.index)),
    mulliganGo: () => commitMulligan(),
    reset: async () => {
      if (await confirmDialog({ title: 'Abandon this match?', body: 'The board, both Cores and the log are discarded. Your doctrine is kept.', confirmLabel: 'Abandon match' })) onExit();
    },
    copySeed: () => copySeed(),
    debrief: () => showEndDialog(),
    readBoard: () => announce(boardSentence()),
    help: () => showKeyHelp(),
    toggleLog: () => {
      const open = el.classList.toggle('logClosed');
      setAttr(logToggle, 'aria-expanded', open ? 'false' : 'true');
      settings.set('logOpen', !open);
    },
    toggleMotion: () => {
      const reduce = !motionReduced();
      settings.set('motion', reduce ? 'reduce' : 'full');
      setAttr(motionToggle, 'aria-pressed', reduce ? 'true' : 'false');
      toast(reduce ? 'Animation reduced.' : 'Animation enabled.');
    },
    openDiscard: (b) => showDiscard(b.dataset.side),
    noop: () => {},
  });

  // Any input during a timeline fast-forwards it (MO-4).
  el.addEventListener('pointerdown', () => { if (motion.running) motion.cancel(); }, true);

  function copySeed() {
    const code = match?.seedCode;
    if (!code) return;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(() => toast(`Seed ${code} copied.`), () => toast(`Seed ${code}`));
    else toast(`Seed ${code}`);
  }

  function showDiscard(side) {
    const list = match.players[side].discard;
    openDialog(({ close }) => {
      const ok = h('button', { type: 'button', class: 'btn primary', onclick: () => close(true) }, 'Close');
      return {
        node: h('div', { class: 'dialogPanel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'discardTitle' },
          h('h2', { class: 'dialogTitle', id: 'discardTitle' }, `${side === 'player' ? 'Your' : 'Rival'} discard — ${list.length} card${list.length === 1 ? '' : 's'}`),
          h('ul', { class: 'discardList' }, ...(list.length ? list.map(c => h('li', {}, `${c.name} · ${c.family}`)) : [h('li', {}, 'Nothing discarded yet.')])),
          h('div', { class: 'dialogActions' }, ok),
        ),
        initial: ok,
      };
    });
  }

  function showKeyHelp() {
    openDialog(({ close }) => {
      const ok = h('button', { type: 'button', class: 'btn primary', onclick: () => close(true) }, 'Close');
      const rows = [
        ['1 – 9, 0', 'Select hand card n (press again to deselect)'],
        ['a / s / d', 'Jump the lane cursor to Vanguard / Conduit / Flank'],
        ['← →', 'Move the lane cursor'],
        ['Enter', 'Play the selected card into the lane · arm and confirm End turn'],
        ['e', 'End turn (arms a confirm)'],
        ['i', 'Inspect the selected card'],
        ['b', 'Read the board state aloud'],
        ['l', 'Focus the match log'],
        ['Esc', 'Close overlay · disarm · clear selection'],
        ['/', 'Focus search (Codex and deck)'],
        ['?', 'This sheet'],
      ];
      return {
        node: h('div', { class: 'dialogPanel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'keysTitle' },
          h('h2', { class: 'dialogTitle', id: 'keysTitle' }, 'Keyboard'),
          h('table', { class: 'keyTable' }, h('tbody', {}, ...rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))),
          h('div', { class: 'dialogActions' }, ok),
        ),
        initial: ok,
      };
    });
  }

  /* ---------- track hand age for the debrief ---------- */

  let lastRound = 0;
  function tickHandAge() {
    if (!match || match.round === lastRound) return;
    lastRound = match.round;
    const inHand = new Set(match.players.player.hand.map(c => c.id));
    for (const id of inHand) handAge.set(id, (handAge.get(id) || 0) + 1);
    for (const id of [...handAge.keys()]) if (!inHand.has(id)) handAge.delete(id);
  }

  return {
    el,
    mount() {
      // The toggle's markup and the persisted preference are applied in one
      // place. They used to disagree on load: the button was hard-coded to
      // aria-expanded="true" while a stored `logOpen: false` collapsed the log,
      // so a screen reader announced an expanded log that was not on screen.
      const open = settings.get('logOpen') !== false;
      setClass(el, 'logClosed', !open);
      setAttr(logToggle, 'aria-expanded', open ? 'true' : 'false');
    },
    setMatch(next) {
      match = next; handIndex = null; laneCursor = 0; mulliganSel = new Set();
      lastEventSeq = 0; renderedLogSeq = 0; endShown = false; handAge = new Map(); lastRound = 0;
      clear(logBody);
      applyMatch(next, { bulk: true, animate: false });
    },
    show() {
      el.hidden = false;
      document.body.dataset.chrome = 'play';
      tickHandAge();
      paint();
      requestAnimationFrame(() => {
        if (match?.phase === 'mulligan') mulliganPanel.el.querySelector('.codexCard')?.focus({ preventScroll: true });
        else document.getElementById('matchTitle')?.focus({ preventScroll: true });
      });
    },
    hide() { el.hidden = true; delete document.body.dataset.chrome; motion.cancel(); },
    escape() {
      if (!inspectorPanel.el.hidden) { inspectorPanel.hide(); return true; }
      if (armed) { disarm(); paint(); return true; }
      if (handIndex !== null) { handIndex = null; paint(); return true; }
      return false;
    },
    hasMatch: () => Boolean(match),
    clear() { match = null; store.set({ match: null }); motion.cancel(); clear(logBody); endShown = false; },
    onTurn: tickHandAge,
  };
}
