/* Invariants that docs/engine-api.md claims are test-enforced, plus the family rules
 * that were previously implemented as no-ops.
 *
 * The two §3.2/§5 invariants below were documented as enforced but were not asserted
 * anywhere: across 1,200 simulated matches `match-end` was not the last event in 93.8%
 * of them, and `coreDamageTaken !== STARTING_CORE - core` on 26.8% of sides (max
 * observed 23 damage taken against a 20-point Core). Both were visible in the shipped
 * UI. They are asserted here over a wide seed sweep, not a single lucky seed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_SIZE, STARTING_CORE, DIFFICULTY_TIERS, MAX_LANE_BREACH, CORE_ARMOUR_DIVISOR,
  DRAW_PER_REFRESH, RESOURCE_KEYS, EVENT_TYPES,
  createMatch, mulligan, playCard, resolveCombat, completePlayerTurn, simulateMatch,
  armourBreach, planAiPlays
} from '../match-engine.js';

const zero = { command: 0, insight: 0, essence: 0 };
const makeCard = (id, o = {}) => ({
  id, name: id, divisionId: o.divisionId ?? 1, divisionName: 'Test Division', family: o.family ?? 'Warrior',
  cost: o.cost ?? { command: 1, insight: 0, essence: 0 }, power: o.power ?? 4,
  rulesText: o.rulesText ?? '', keywords: o.keywords ?? [], targeting: 'Friendly Lane',
  timing: 'Main', duration: 'Immediate', ...o
});
const filler = (p = 'F') => Array.from({ length: DECK_SIZE }, (_, i) => makeCard(`${p}-${i}`, {
  family: i % 3 === 0 ? 'Warrior' : i % 3 === 1 ? 'Knight' : 'Action',
  power: 3 + (i % 4), cost: { command: 1 + (i % 2), insight: 0, essence: 0 }, keywords: i % 3 === 1 ? ['Guard'] : []
}));
const inert = p => Array.from({ length: DECK_SIZE }, (_, i) => makeCard(`${p}-${i}`, { family: 'Item', power: 0, cost: { command: 9, insight: 9, essence: 9 } }));
const fresh = (a = filler('P'), b = filler('R'), o = {}) => createMatch({ playerDeck: a, rivalDeck: b, shuffle: false, seed: 7, ...o });
const mainState = (a = filler('P'), b = filler('R'), o = {}) => mulligan(fresh(a, b, o), 'player', []);
const unit = (card, extra = {}) => ({ uid: extra.uid || `t${card.id}`, card, power: card.power, basePower: card.power, tempPower: 0, tempHold: 0, exhausted: false, stunned: false, deployedTurn: 0, moved: false, triggerSuppressed: false, weaponBonus: 0, weaponUsed: false, infected: false, conversions: 0, convertedThisTurn: false, lastShift: 0, automatedThisTurn: false, ...extra });
const support = (card, extra = {}) => ({ uid: extra.uid || `s${card.id}`, card, disabled: false, disabledUntilRound: 0, counters: 0, faceDown: card.family === 'Trap', ...extra });
const eventsOf = (s, t) => s.events.filter(e => e.type === t);

/* A wide, cheap corpus: three tiers x many seeds, both deck shapes. */
function corpus() {
  const out = [];
  for (const difficulty of DIFFICULTY_TIERS) {
    for (let i = 0; i < 40; i++) {
      out.push(simulateMatch({ playerDeck: filler('P'), rivalDeck: filler('R'), seed: (i * 7919 + 13) >>> 0, difficulty, playerDifficulty: difficulty }));
    }
  }
  return out;
}
const CORPUS = corpus();

/* ---------- §3.2: match-end is always the last event ---------- */

test('match-end is the final event of every match, with nothing appended after it', () => {
  let checked = 0;
  for (const r of CORPUS) {
    const events = r.state.events;
    const ends = events.filter(e => e.type === 'match-end');
    if (r.timedOut) { assert.equal(ends.length, 0); continue; }
    assert.equal(ends.length, 1, 'match-end is emitted exactly once');
    const trailing = events.slice(events.findIndex(e => e.type === 'match-end') + 1);
    assert.deepEqual(trailing.map(e => e.type), [], `events after match-end (seed ${r.state.seed}): ${trailing.map(e => e.type).join(',')}`);
    checked++;
  }
  assert.ok(checked > 100, `sweep should cover a real corpus, covered ${checked}`);
});

test('no event of any type can be emitted once the phase has ended', () => {
  // Direct: force a lethal combat and confirm the end step contributes nothing.
  const brute = makeCard('BRUTE', { power: 40, cost: zero });
  let state = mainState([brute, ...filler('P').slice(1)]);
  state = playCard(state, 'player', 0, 0);
  for (const lane of state.players.player.lanes) for (const u of lane.units) u.exhausted = false;
  state.players.rival.core = 3;
  // A temp buff and a Ritual would both emit during the end step if it still ran.
  state.players.player.lanes[0].units[0].tempPower = 3;
  state.players.player.lanes[0].units[0].power += 3;
  state.players.player.lanes[1].supports.push(support(makeCard('RIT', { family: 'Ritual', cost: zero, power: 0 }), { uid: 'r1' }));
  const after = resolveCombat(state, 'player');
  assert.equal(after.phase, 'ended');
  assert.equal(after.events[after.events.length - 1].type, 'match-end');
  assert.equal(eventsOf(after, 'ritual-charge').length, 0, 'the end step does not run after a Core falls');
});

/* ---------- §5: coreDamageTaken === STARTING_CORE - core ---------- */

test('coreDamageTaken always equals the Core actually lost, on every side of every match', () => {
  for (const r of CORPUS) {
    for (const side of ['player', 'rival']) {
      const core = r.state.players[side].core;
      const stat = r.state.stats[side].coreDamageTaken;
      assert.equal(stat, STARTING_CORE - core, `${side} took ${stat} against a Core of ${core} (seed ${r.state.seed})`);
      assert.ok(core >= 0 && stat <= STARTING_CORE, 'a Core can never lose more than it had');
      const fromEvents = eventsOf(r.state, 'core-damage').filter(e => e.side === side).reduce((s, e) => s + e.amount, 0);
      assert.equal(fromEvents, stat, 'the event stream accounts for every point');
    }
    assert.equal(r.state.stats.player.unitsDestroyed, r.state.stats.rival.unitsLost);
    assert.equal(r.state.stats.player.coreDamageDealt, r.state.stats.rival.coreDamageTaken - r.state.stats.rival.fatigueDamage);
  }
});

test('every other documented statistic also reconciles with the event stream, on every match', () => {
  for (const r of CORPUS) {
    for (const side of ['player', 'rival']) {
      const stats = r.state.stats[side];
      assert.equal(stats.cardsPlayed, eventsOf(r.state, 'play').filter(e => e.side === side).length);
      assert.equal(stats.cardsDrawn, eventsOf(r.state, 'draw').filter(e => e.side === side).length);
      assert.equal(stats.unitsLost, eventsOf(r.state, 'unit-destroyed').filter(e => e.side === side).length);
      const spend = eventsOf(r.state, 'resource-spend').filter(e => e.side === side);
      for (const k of RESOURCE_KEYS) assert.equal(stats.resourcesSpent[k], spend.reduce((s, e) => s + e.cost[k], 0));
      assert.equal(stats.resourcesSpent.total, RESOURCE_KEYS.reduce((s, k) => s + stats.resourcesSpent[k], 0));
    }
    const history = r.state.stats.coreHistory;
    assert.deepEqual(history[0], { round: 1, turn: 1, player: STARTING_CORE, rival: STARTING_CORE });
    assert.equal(history[history.length - 1].player, r.state.players.player.core);
    assert.equal(history[history.length - 1].rival, r.state.players.rival.core);
  }
});

test('a lethal overkill reports only the damage the Core could absorb', () => {
  const brute = makeCard('BRUTE', { power: 40, cost: zero });
  let state = mainState([brute, ...filler('P').slice(1)]);
  state = playCard(state, 'player', 0, 0);
  for (const lane of state.players.player.lanes) for (const u of lane.units) u.exhausted = false;
  state.players.rival.core = 2;
  const takenBefore = state.stats.rival.coreDamageTaken;
  state = resolveCombat(state, 'player');
  assert.equal(state.players.rival.core, 0);
  const last = eventsOf(state, 'core-damage').pop();
  assert.equal(last.amount, 2, 'the killing blow reports 2, not the ~10 the strike was worth');
  assert.equal(state.stats.rival.coreDamageTaken - takenBefore, 2, 'the stat records what the Core lost');
  const strike = eventsOf(state, 'combat-strike').pop();
  assert.ok(strike.amount > 2, 'the raw strike is still reported in full for animation');
});

/* ---------- seat balance ---------- */

test('both seats draw a full refresh, and the seat on the draw is compensated once', () => {
  const state = mulligan(fresh(), 'player', []);
  assert.equal(state.players.player.hand.length, 5 + DRAW_PER_REFRESH, 'no opening-refresh penalty on the first seat');
  const next = completePlayerTurn(state);
  // The rival refreshed once (its first): DRAW_PER_REFRESH + 1 on the draw.
  const rivalDraws = eventsOf(next, 'draw').filter(e => e.side === 'rival' && e.reason === 'refresh');
  assert.equal(rivalDraws.length, DRAW_PER_REFRESH + 1);
  const playerDraws = eventsOf(next, 'draw').filter(e => e.side === 'player' && e.reason === 'refresh');
  assert.equal(playerDraws.length, DRAW_PER_REFRESH * 2, 'the first seat never draws the on-the-draw card');
});

/* ---------- lane breach ceiling is a function of the lane ---------- */

test('armourBreach caps a contested lane and leaves an undefended one uncapped', () => {
  assert.equal(armourBreach(40, { cap: MAX_LANE_BREACH }), MAX_LANE_BREACH);
  assert.equal(armourBreach(40, { cap: Infinity }), Math.ceil(40 / CORE_ARMOUR_DIVISOR));
  assert.equal(armourBreach(0, { cap: Infinity }), 0);
  assert.ok(armourBreach(40, { cap: Infinity }) > armourBreach(20, { cap: Infinity }), 'damage stays monotone in raw power');
});

test('defending a lane is worth more than abandoning it', () => {
  const big = makeCard('BIG', { power: 20, cost: zero });
  const blocker = makeCard('BLOCK', { power: 1, cost: zero });
  const run = defended => {
    let s = mainState([big, ...filler('P').slice(1)], [blocker, ...filler('R').slice(1)]);
    s = playCard(s, 'player', 0, 0);
    if (defended) { s.active = 'rival'; s = playCard(s, 'rival', 0, 0); s.active = 'player'; }
    for (const lane of s.players.player.lanes) for (const u of lane.units) u.exhausted = false;
    return STARTING_CORE - resolveCombat(s, 'player').players.rival.core;
  };
  assert.ok(run(false) > run(true), `an open lane must beat a defended one (${run(false)} vs ${run(true)})`);
});

test('clearing the defenders beats never meeting them at the same board size, per point of surviving power', () => {
  // The old rule gave a broken lane 1 raw per surviving body, so three 9-power attackers
  // that killed three defenders pushed 3 raw while the same three against an empty lane
  // pushed 27. Winning the fight is now scored on surviving power, not head count.
  const atk = makeCard('A', { power: 9, cost: zero });
  const def = makeCard('D', { power: 1, cost: zero });
  let s = mainState([atk, makeCard('A2', { power: 9, cost: zero }), ...filler('P').slice(2)], [def, ...filler('R').slice(1)]);
  s = playCard(s, 'player', 0, 0); s = playCard(s, 'player', 0, 0);
  s.active = 'rival'; s = playCard(s, 'rival', 0, 0); s.active = 'player';
  for (const lane of s.players.player.lanes) for (const u of lane.units) u.exhausted = false;
  const after = resolveCombat(s, 'player');
  const strike = eventsOf(after, 'combat-strike').find(e => e.kind === 'breakthrough');
  assert.ok(strike, 'a cleared lane produces a breakthrough strike');
  assert.ok(strike.amount > 2, `breakthrough is surviving power (${strike.amount}), not a head count of 2`);
});

/* ---------- P1: mechanics that could not previously fire ---------- */

test('a Trap holds the intruder exhausted through its next refresh instead of doing nothing', () => {
  const trap = makeCard('TRAP', { family: 'Trap', cost: zero, power: 0 });
  const knight = makeCard('KN', { family: 'Knight', cost: zero, power: 6 });
  let s = mainState([knight, ...filler('P').slice(1)], inert('R'));
  s.players.rival.lanes[0].supports.push(support(trap, { uid: 't1' }));
  s = playCard(s, 'player', 0, 0);
  assert.equal(eventsOf(s, 'trap-sprung').length, 1);
  const u = s.players.player.lanes[0].units[0];
  assert.equal(u.stunned, true);
  assert.equal(u.triggerSuppressed, true);
  s = completePlayerTurn(s);
  const after = s.players.player.lanes[0].units.find(x => x.card.id === 'KN');
  assert.ok(after, 'the unit survives');
  assert.equal(after.exhausted, true, 'still exhausted after its own refresh — the Trap cost it an attack');
  assert.ok(eventsOf(s, 'keyword-note').some(e => e.keyword === 'Exhausted'), 'the lost turn is visible in the stream');
});

test('a Trap suppresses the next triggered ability of a family with no deploy trigger', () => {
  const trap = makeCard('TRAP', { family: 'Trap', cost: zero, power: 0 });
  const deity = makeCard('DTY', { family: 'Deity', cost: zero, power: 6 });
  let s = mainState([deity, ...filler('P').slice(1)], inert('R'));
  s.players.rival.lanes[0].supports.push(support(trap, { uid: 't1' }));
  s = playCard(s, 'player', 0, 0);
  s.players.player.resources = { command: 6, insight: 0, essence: 0 };
  s = completePlayerTurn(s);
  const suppressed = eventsOf(s, 'keyword-note').filter(e => e.keyword === 'Suppressed');
  assert.ok(suppressed.length >= 1, 'the Trap consumed a real trigger');
  assert.equal(suppressed[0].trigger, 'Deity');
});

test('Disaster survivors stay exhausted through their own next refresh', () => {
  const disaster = makeCard('DIS', { family: 'Disaster', cost: zero, power: 0 });
  let s = mainState([disaster, ...filler('P').slice(1)], inert('R'));
  s.players.rival.lanes[0].units.push(unit(makeCard('BIG', { power: 10, cost: zero }), { uid: 'x1' }));
  s = playCard(s, 'player', 0, 0);
  const victim = () => s.players.rival.lanes[0].units.find(u => u.uid === 'x1');
  assert.equal(victim().power, 9);
  assert.equal(victim().stunned, true);
  s = completePlayerTurn(s);
  const v = victim();
  if (v) assert.equal(v.exhausted, true, 'the Disaster actually cost it an attack step');
});

test('a Specimen can still be holding its deploy buff when the opponent attacks it', () => {
  const spec = makeCard('SPEC', { family: 'Specimen', cost: zero, power: 5 });
  let s = mainState([spec, ...filler('P').slice(1)], inert('R'));
  s.players.rival.lanes[0].units.push(unit(makeCard('E', { power: 3, cost: zero }), { uid: 'e1' }));
  s = playCard(s, 'player', 0, 0);
  const u = s.players.player.lanes[0].units[0];
  assert.equal(u.power, 6, 'the +1 landed');
  const afterOwnEndStep = resolveCombat(s, 'player');
  const still = afterOwnEndStep.players.player.lanes[0].units[0];
  assert.equal(still.power, 6, 'the buff survives its own end step, so it can be defended with');
  assert.equal(still.tempPower, 1);
});

test('an Item buffs a unit that can act rather than the strongest exhausted one', () => {
  const item = makeCard('ITM', { family: 'Item', cost: zero, power: 0 });
  let s = mainState([item, ...filler('P').slice(1)]);
  s.players.player.lanes[0].units.push(
    unit(makeCard('READY', { power: 4, cost: zero }), { uid: 'ready', exhausted: false }),
    unit(makeCard('TIRED', { power: 9, cost: zero }), { uid: 'tired', exhausted: true })
  );
  s = playCard(s, 'player', 0, 0);
  const buffed = eventsOf(s, 'power-change').find(e => e.source === 'ITM');
  assert.equal(buffed.uid, 'ready', 'the bonus went to a unit that can use it');
});

test('a Virus delays a Base resource rather than confiscating it', () => {
  const base = makeCard('BASE', { family: 'Base', cost: zero, power: 0, duration: 'Persistent' });
  const virus = makeCard('VIR', { family: 'Virus', cost: zero, power: 0, duration: 'Persistent' });
  const build = withVirus => {
    let t = mainState(inert('P'), inert('R'));   // nothing in these decks is ever castable
    t.players.player.lanes[0].supports.push(support(base, { uid: 'b1' }));
    if (withVirus) t.players.rival.lanes[2].supports.push(support(virus, { uid: 'v1' }));
    // Two full rounds: the Base fires at the player's refresh, a Virus pushes it to the
    // player's end step, and the carry has to survive the following refill.
    t = completePlayerTurn(t);
    t = completePlayerTurn(t);
    return t;
  };
  const infected = build(true), clean = build(false);
  assert.ok(eventsOf(infected, 'virus-delay').some(e => e.side === 'player'), 'the Virus fired');
  const resource = eventsOf(infected, 'virus-delay').find(e => e.side === 'player').resource;
  assert.ok(eventsOf(infected, 'resource-gain').some(e => e.side === 'player' && e.source === 'Base'),
    'the delayed trigger resolves at the end step, as the card text says');
  assert.equal(infected.players.player.resources[resource], clean.players.player.resources[resource],
    'a delayed resource is still in the pool a turn later — delayed, not confiscated');
  assert.deepEqual(infected.players.player.carry, { command: 0, insight: 0, essence: 0 }, 'the carry is consumed by the refill');
});

/* ---------- P1: the AI can see non-combat cards ---------- */

test('the AI scores a support that changes no unit power, so non-combat cards leave hand', () => {
  const base = makeCard('BASE', { family: 'Base', cost: zero, power: 0, duration: 'Persistent' });
  let s = mainState(inert('P'), inert('R'));
  s.players.player.hand = [base];
  s.players.player.resources = { command: 4, insight: 4, essence: 4 };
  for (const tier of ['veteran', 'sovereign']) {
    const plan = planAiPlays(s, 'player', tier);
    assert.ok(plan.length >= 1, `${tier} should be willing to build a Base`);
    assert.ok(plan[0].score > 0, `${tier} scores it above zero, so it can clear minGain`);
  }
});

test('a full sovereign match reaches families and events that previously never fired', () => {
  // Deck deliberately full of the support families the AI used to hold forever.
  const deck = [];
  const kinds = [
    ['Base', 'Base'], ['Trap', 'Trap'], ['Ritual', 'Ritual'], ['Law', 'Law'],
    ['Virus', 'Virus'], ['Plague', 'Plague'], ['Response', 'Response'], ['Reaction', 'Reaction']
  ];
  for (let i = 0; i < DECK_SIZE; i++) {
    if (i % 3 === 0) deck.push(makeCard(`U-${i}`, { family: 'Warrior', power: 4, cost: { command: 1, insight: 0, essence: 0 } }));
    else { const [f] = kinds[i % kinds.length]; deck.push(makeCard(`S-${i}`, { family: f, power: 0, cost: { command: 1, insight: 0, essence: 0 }, duration: 'Persistent' })); }
  }
  const { state } = simulateMatch({ playerDeck: deck, rivalDeck: deck, seed: 4242, difficulty: 'sovereign', playerDifficulty: 'sovereign' });
  const families = new Set(eventsOf(state, 'play').map(e => e.family));
  for (const f of ['Base', 'Trap', 'Ritual']) assert.ok(families.has(f), `${f} never reached the table`);
  const types = new Set(state.events.map(e => e.type));
  for (const t of ['ritual-charge', 'trap-sprung']) assert.ok(types.has(t), `${t} never fired`);
  for (const e of state.events) assert.ok(EVENT_TYPES.includes(e.type), `undeclared event type ${e.type}`);
});

/* ---------- determinism survives every change above ---------- */

test('determinism survives: same seed, decks and tiers give a byte-identical stream', () => {
  const o = { playerDeck: filler('P'), rivalDeck: filler('R'), seed: 606061, difficulty: 'sovereign', playerDifficulty: 'veteran' };
  assert.deepEqual(simulateMatch(o).state.events, simulateMatch(o).state.events);
  assert.deepEqual(simulateMatch(o).state.stats, simulateMatch(o).state.stats);
});
