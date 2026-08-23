#!/usr/bin/env node
/* balance-report.mjs — measure the game, before shipping a change to it.
 *
 * Every balance claim in this repository's docs is a number somebody measured
 * once and then wrote down. That is fine right up until the number moves, and
 * nothing tells you. This is the instrument those numbers come from, so a claim
 * can be re-checked in thirty seconds instead of re-derived.
 *
 * It is also the gate for a live-ops ruleset. A remote balance payload is a
 * change to the game that never passes through code review, so it needs a way
 * to be played ten thousand times before a player sees it once:
 *
 *   node scripts/balance-report.mjs                       # the shipped ruleset
 *   node scripts/balance-report.mjs --rules=candidate.json --seeds=200
 *   node scripts/balance-report.mjs --json                # machine-readable
 *
 * Exit code is 1 when a guard fails, so it can stand in a pipeline.
 */
import { readFile } from 'node:fs/promises';
import { cards, cardById } from '../card-canon.js';
import { buildStarterDeck } from '../deck-store.js';
import { simulateMatch, planAiPlays, createMatch, mulligan, aiTakeMainPhase, completePlayerTurn, createRuleset, CANONICAL_RULES, DIFFICULTY_TIERS } from '../match-engine.js';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const SEEDS = Math.max(1, Number(flag('seeds', 60)) || 60);
const JSON_OUT = Boolean(flag('json', false));
const TIERS = String(flag('tiers', 'veteran,sovereign')).split(',').filter(t => DIFFICULTY_TIERS.includes(t));

/* Guards. Deliberately wide: this is a "the game is broken" alarm, not a target.
 * A balance pass that lands at 58% is a judgement call; one that lands at 77%
 * is the seat deciding the match, which is not a judgement call. */
const GUARDS = { seatMin: 35, seatMax: 65, maxRoundsMedian: 30, timeouts: 0 };

const rulesFile = flag('rules', null);
const overrides = typeof rulesFile === 'string' ? JSON.parse(await readFile(rulesFile, 'utf8')) : {};
const rules = createRuleset(overrides);

const legal = cards.filter(c => c.pvpLegal !== false);
const totalCost = c => c.cost.command + c.cost.insight + c.cost.essence;
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/* Three archetypes that fail in three different directions, so a change that
 * fixes one by breaking another cannot look like a win. */
const ARCHETYPES = {
  curve: buildStarterDeck(cards).map(id => cardById.get(id)),
  /* "topheavy", not "power": these are the 30 highest-power cards, which are
   * also the 30 most expensive, so the deck's real property is that half of it
   * is uncastable. That is the failure direction worth stress-testing. */
  topheavy: legal.slice().sort((a, b) => b.power - a.power || byId(a, b)).slice(0, rules.deckSize),
  swarm: legal.slice().sort((a, b) => totalCost(a) - totalCost(b) || byId(a, b)).slice(0, rules.deckSize),
};

const pct = n => `${n.toFixed(1)}%`;
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function series(playerDeck, rivalDeck, { playerDifficulty, difficulty, seeds = SEEDS }) {
  const rounds = [];
  /* Split by how the match ended, because an aggregate can hide the defect it
   * claims to have fixed: a seat bias of 84% in matches decided by combat and
   * 58% in matches decided by deck-out averages out to something that looks
   * balanced and is not. Parity has to hold inside each population. */
  const byReason = { core: { wins: 0, losses: 0 }, fatigue: { wins: 0, losses: 0 } };
  let wins = 0, losses = 0, draws = 0, timeouts = 0, fatigue = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = simulateMatch({ playerDeck, rivalDeck, seed, playerDifficulty, difficulty, rules });
    rounds.push(r.rounds);
    if (r.timedOut) timeouts += 1;
    else if (r.winner === 'player') wins += 1;
    else if (r.winner === 'rival') losses += 1;
    else draws += 1;
    if (r.reason === 'fatigue') fatigue += 1;
    const bucket = byReason[r.reason];
    if (bucket && !r.timedOut) { if (r.winner === 'player') bucket.wins += 1; else if (r.winner === 'rival') bucket.losses += 1; }
  }
  const decided = wins + losses || 1;
  return { wins, losses, draws, timeouts, fatigue, rounds, byReason, winRate: (wins / decided) * 100, medianRounds: median(rounds) };
}

const report = { ruleset: { label: rules.label, digest: rules.digest, version: rules.version, warnings: rules.warnings, overrides: Object.keys(overrides) }, seeds: SEEDS, seatParity: [], tierOrdering: [], matchups: [], pacing: [], search: [], failures: [] };

/* 1. Seat parity — mirror doctrines, so the ONLY asymmetry left is the seat. */
for (const tier of TIERS) {
  for (const [name, deck] of Object.entries(ARCHETYPES)) {
    const s = series(deck, deck, { playerDifficulty: tier, difficulty: tier });
    const share = b => (b.wins + b.losses ? { n: b.wins + b.losses, firstSeat: (b.wins / (b.wins + b.losses)) * 100 } : { n: 0, firstSeat: null });
    report.seatParity.push({ tier, archetype: name, firstSeat: s.winRate, draws: s.draws, medianRounds: s.medianRounds, timeouts: s.timeouts, byCore: share(s.byReason.core), byFatigue: share(s.byReason.fatigue) });
    if (s.winRate < GUARDS.seatMin || s.winRate > GUARDS.seatMax) report.failures.push(`seat parity ${tier}/${name}: first seat won ${pct(s.winRate)}`);
    if (s.timeouts > GUARDS.timeouts) report.failures.push(`${tier}/${name}: ${s.timeouts} matches never resolved`);
    if (s.medianRounds > GUARDS.maxRoundsMedian) report.failures.push(`${tier}/${name}: median ${s.medianRounds} rounds`);
    report.pacing.push({ tier, archetype: name, medianRounds: s.medianRounds, shortest: Math.min(...s.rounds), longest: Math.max(...s.rounds), fatigueEndings: s.fatigue });
  }
}

/* 2. Tier ordering, seat-averaged — a difficulty that is not harder is a lie on
 *    the pre-match screen. Each pair is played from both seats so the seat
 *    advantage, whatever is left of it, cancels instead of being measured. */
for (const [a, b] of [['veteran', 'recruit'], ['sovereign', 'veteran'], ['sovereign', 'recruit']]) {
  const deck = ARCHETYPES.curve;
  const asPlayer = series(deck, deck, { playerDifficulty: a, difficulty: b });
  const asRival = series(deck, deck, { playerDifficulty: b, difficulty: a });
  const winRate = ((asPlayer.wins + asRival.losses) / (asPlayer.wins + asPlayer.losses + asRival.wins + asRival.losses || 1)) * 100;
  report.tierOrdering.push({ stronger: a, weaker: b, winRate });
  if (winRate <= 50) report.failures.push(`tier ordering: ${a} beats ${b} only ${pct(winRate)} of the time`);
}

/* 3. Archetype round-robin, seat-averaged for the same reason. */
const names = Object.keys(ARCHETYPES);
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const [a, b] = [names[i], names[j]];
  const first = series(ARCHETYPES[a], ARCHETYPES[b], { playerDifficulty: 'veteran', difficulty: 'veteran' });
  const second = series(ARCHETYPES[b], ARCHETYPES[a], { playerDifficulty: 'veteran', difficulty: 'veteran' });
  const winRate = ((first.wins + second.losses) / (first.wins + first.losses + second.wins + second.losses || 1)) * 100;
  report.matchups.push({ a, b, winRate });
}

/* 4. Search cost — the rival's turn is synchronous and lands inside a frame the
 *    player is watching, so its worst case is a product decision, not an
 *    implementation detail. Nodes are deterministic; milliseconds are not, and
 *    are reported only as an order of magnitude. */
for (const tier of DIFFICULTY_TIERS) {
  let peakNodes = 0, peakMs = 0;
  for (let seed = 1; seed <= Math.min(SEEDS, 20); seed++) {
    let state = mulligan(createMatch({ playerDeck: ARCHETYPES.curve, rivalDeck: ARCHETYPES.curve, seed, difficulty: tier, rules }), 'player', []);
    for (let turn = 0; turn < 12 && state.phase !== 'ended'; turn++) {
      const started = performance.now();
      const plan = planAiPlays(state, 'player', tier);
      peakMs = Math.max(peakMs, performance.now() - started);
      peakNodes = Math.max(peakNodes, plan.nodes || 0);
      state = aiTakeMainPhase(state, 'player', tier);
      if (state.phase === 'ended') break;
      state = completePlayerTurn(state);
    }
  }
  report.search.push({ tier, peakNodes, peakMs, budget: rules.aiNodeBudget });
  if (peakNodes > rules.aiNodeBudget) report.failures.push(`${tier}: search hit its node budget (${peakNodes}/${rules.aiNodeBudget}) and is being truncated`);
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = (...cells) => console.log(cells.join(''));
  const col = (v, w) => String(v).padEnd(w);
  console.log(`\nTHE COLLECTIVE CODEX — balance report`);
  console.log(`ruleset "${rules.label}" · digest ${rules.digest} · v${rules.version}${rulesFile ? ` · overrides from ${rulesFile}` : ''} · ${SEEDS} seeds per cell`);
  if (rules.warnings.length) for (const w of rules.warnings) console.log(`  ! ${w}`);
  if (rules.digest !== CANONICAL_RULES.digest) console.log(`  ! this is NOT the shipped ruleset (shipped: ${CANONICAL_RULES.digest})`);

  const share = s => (s.firstSeat === null ? '—' : `${pct(s.firstSeat)} (n=${s.n})`);
  line('\nSEAT PARITY  ', col('tier', 12), col('archetype', 12), col('first seat', 12), col('…on Core', 18), col('…on fatigue', 18), 'median rounds');
  for (const r of report.seatParity) line('             ', col(r.tier, 12), col(r.archetype, 12), col(pct(r.firstSeat), 12), col(share(r.byCore), 18), col(share(r.byFatigue), 18), r.medianRounds);

  line('\nTIER ORDER   ', col('stronger', 12), col('weaker', 12), 'seat-averaged win rate');
  for (const r of report.tierOrdering) line('             ', col(r.stronger, 12), col(r.weaker, 12), pct(r.winRate));

  line('\nMATCHUPS     ', col('deck', 12), col('vs', 12), 'seat-averaged win rate');
  for (const r of report.matchups) line('             ', col(r.a, 12), col(r.b, 12), pct(r.winRate));

  line('\nPACING       ', col('tier', 12), col('archetype', 12), col('median', 9), col('range', 12), 'fatigue endings');
  for (const r of report.pacing) line('             ', col(r.tier, 12), col(r.archetype, 12), col(r.medianRounds, 9), col(`${r.shortest}–${r.longest}`, 12), r.fatigueEndings);

  line('\nSEARCH COST  ', col('tier', 12), col('peak nodes', 14), col('budget', 10), 'peak ms (this machine only)');
  for (const r of report.search) line('             ', col(r.tier, 12), col(r.peakNodes, 14), col(r.budget, 10), r.peakMs.toFixed(1));

  console.log('');
  if (report.failures.length) { for (const f of report.failures) console.error(`FAIL  ${f}`); }
  else console.log(`PASS  no guard tripped (seat parity ${GUARDS.seatMin}–${GUARDS.seatMax}%, tier ordering monotonic, every match resolved).`);
}

process.exit(report.failures.length ? 1 : 0);
