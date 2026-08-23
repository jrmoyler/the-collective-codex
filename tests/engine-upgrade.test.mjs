import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_SIZE, EVENT_TYPES, DIFFICULTY_TIERS, DEFAULT_DIFFICULTY, RESOURCE_KEYS,
  CORE_ARMOUR_DIVISOR, MAX_LANE_BREACH, DRAW_PER_REFRESH, REGROUP_RECOVERY,
  createMatch, mulligan, playCard, resolveCombat, completePlayerTurn,
  encodeSeed, decodeSeed, doctrineFingerprint, normalizeDifficulty, simulateMatch, aiTakeMainPhase,
  planAiPlays, aiMulliganIndices, laneThreat, projectLaneDamage
} from '../match-engine.js';

const zero={command:0,insight:0,essence:0};
const makeCard=(id,overrides={})=>({
  id,name:id,divisionId:overrides.divisionId??1,divisionName:'Test Division',family:overrides.family??'Warrior',
  cost:overrides.cost??{command:1,insight:0,essence:0},power:overrides.power??4,
  rulesText:overrides.rulesText??'',keywords:overrides.keywords??['Dash','Combo'],targeting:'Friendly Lane',
  timing:'Main',duration:'Immediate',...overrides
});
const filler=(prefix='F',overrides={})=>Array.from({length:DECK_SIZE},(_,i)=>makeCard(`${prefix}-${i}`,{family:i%3===0?'Warrior':i%3===1?'Knight':'Action',power:3+(i%4),cost:{command:1+(i%2),insight:0,essence:0},keywords:i%3===1?['Guard']:['Dash'],...overrides}));
const inert=prefix=>Array.from({length:DECK_SIZE},(_,i)=>makeCard(`${prefix}-${i}`,{family:'Item',power:0,cost:{command:9,insight:9,essence:9}}));
const fresh=(p=filler('P'),r=filler('R'),options={})=>createMatch({playerDeck:p,rivalDeck:r,shuffle:false,seed:7,...options});
const mainState=(p=filler('P'),r=filler('R'),options={})=>mulligan(fresh(p,r,options),'player',[]);
const unit=(card,extra={})=>({uid:extra.uid||`t${card.id}`,card,power:card.power,basePower:card.power,tempPower:0,exhausted:false,deployedTurn:0,moved:false,triggerSuppressed:false,weaponBonus:0,weaponUsed:false,infected:false,conversions:0,convertedThisTurn:false,lastShift:0,...extra});
const support=(card,extra={})=>({uid:extra.uid||`s${card.id}`,card,disabled:false,disabledUntilRound:0,counters:0,faceDown:card.family==='Trap',...extra});
const ready=(state,side)=>{for(const lane of state.players[side].lanes)for(const u of lane.units)u.exhausted=false;return state;};
const eventsOf=(state,type)=>state.events.filter(e=>e.type===type);

/* ---------- structured event stream ---------- */

test('every event carries the documented envelope and a strictly increasing sequence',()=>{
  const {state}=simulateMatch({playerDeck:filler('P'),rivalDeck:filler('R'),shuffle:false,seed:3});
  assert.ok(state.events.length>50,'a full match produces a dense event stream');
  let previous=0;
  for(const event of state.events){
    assert.equal(event.seq,previous+1,'sequence numbers are gapless');
    previous=event.seq;
    assert.ok(EVENT_TYPES.includes(event.type),`unknown event type ${event.type}`);
    assert.equal(typeof event.round,'number');
    assert.equal(typeof event.turn,'number');
    assert.equal(typeof event.text,'string');
    assert.ok(Object.hasOwn(event,'side')&&Object.hasOwn(event,'lane')&&Object.hasOwn(event,'cardId')&&Object.hasOwn(event,'amount'));
    if(event.side!==null)assert.ok(['player','rival'].includes(event.side));
    if(event.lane!==null)assert.ok(event.lane>=0&&event.lane<3);
  }
});

test('state.log is still an array of strings derived from the newest events first',()=>{
  const state=mainState();
  assert.ok(Array.isArray(state.log));
  assert.ok(state.log.every(line=>typeof line==='string'));
  const texted=state.events.filter(e=>e.text).map(e=>e.text).reverse().slice(0,state.log.length);
  assert.deepEqual(state.log,texted);
  assert.ok(state.log.length<=60,'the string log stays capped for the UI');
});

test('every Core point that changes is attributable to a core-damage event',()=>{
  const {state}=simulateMatch({playerDeck:filler('P'),rivalDeck:filler('R'),shuffle:false,seed:21});
  for(const side of ['player','rival']){
    const taken=eventsOf(state,'core-damage').filter(e=>e.side===side).reduce((sum,e)=>sum+e.amount,0);
    assert.equal(taken,20-state.players[side].core);
    assert.equal(taken,state.stats[side].coreDamageTaken);
  }
});

test('a play emits play, resource-spend and the deploy trigger in resolution order',()=>{
  const monster=makeCard('MON',{family:'Monster',power:8,cost:{command:1,insight:0,essence:0}});
  let state=mainState([monster,...filler('P').slice(1)]);
  state.players.rival.lanes[0].units.push(unit(makeCard('E',{power:2,cost:zero})));
  const before=state.events.length;
  state=playCard(state,'player',0,0);
  const emitted=state.events.slice(before).map(e=>e.type);
  assert.deepEqual(emitted.slice(0,2),['play','resource-spend']);
  assert.ok(emitted.includes('deploy-trigger'));
  assert.ok(emitted.includes('core-damage'));
  const play=state.events.slice(before)[0];
  assert.equal(play.cardId,'MON');
  assert.equal(play.lane,0);
  assert.deepEqual(play.cost,{command:1,insight:0,essence:0});
});

/* ---------- determinism and shareable seeds ---------- */

test('the same seed, decks and difficulty produce an identical event stream',()=>{
  const options={playerDeck:filler('P'),rivalDeck:filler('R'),seed:9182,difficulty:'sovereign'};
  const a=simulateMatch(options),b=simulateMatch(options);
  assert.deepEqual(a.state.events,b.state.events);
  assert.deepEqual(a.state.stats,b.state.stats);
  assert.equal(a.winner,b.winner);
  const c=simulateMatch({...options,seed:9183});
  assert.notDeepEqual(a.state.events,c.state.events);
});

test('difficulty is part of the match identity, so the same seed diverges across tiers',()=>{
  const options={playerDeck:filler('P'),rivalDeck:filler('R'),seed:5150};
  const recruit=simulateMatch({...options,difficulty:'recruit'});
  const sovereign=simulateMatch({...options,difficulty:'sovereign'});
  assert.notDeepEqual(recruit.state.events,sovereign.state.events);
});

test('seed codes round-trip, carry their tier and reject corruption',()=>{
  for(const tier of DIFFICULTY_TIERS)for(const seed of [0,1,7,99991,4294967295]){
    const code=encodeSeed(seed,tier,0);
    assert.match(code,/^[A-Z]{3}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.deepEqual(decodeSeed(code),{seed,difficulty:tier,doctrine:0});
    assert.deepEqual(decodeSeed(code.toLowerCase().replace(/-/g,' ')),{seed,difficulty:tier,doctrine:0});
  }
  assert.throws(()=>decodeSeed('VET-0000-0000-0000'),/checksum/i);
  assert.throws(()=>decodeSeed('XXX-0000-0000-0000'),/tier/i);
  assert.throws(()=>decodeSeed('VET-0000'),/seed code/i);
});

/* A code minted before the format carried a doctrine still has to replay its
 * shuffle: the codes people have already shared do not stop working because the
 * format grew a field. */
test('a legacy eleven-character seed code still decodes, with no doctrine claim',()=>{
  assert.deepEqual(decodeSeed('VET-0000-44J5'),{seed:4242,difficulty:'veteran',doctrine:null});
  assert.throws(()=>decodeSeed('VET-0000-44J6'),/checksum/i);
});

/* The one-character checksum accepted 2.8% of single-character typos, and a typo
 * that decodes is the worst outcome this feature has: the player is told they
 * are replaying a shared match and is quietly given a different one. */
test('the checksum rejects better than one character ever could',()=>{
  const ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const raw=encodeSeed(4242,'veteran',12345).replace(/-/g,'');
  let accepted=0,tried=0;
  for(let i=3;i<raw.length;i++)for(const ch of ALPHABET){
    const mutant=raw.slice(0,i)+ch+raw.slice(i+1);
    if(mutant===raw)continue;
    tried+=1;
    try{decodeSeed(mutant);accepted+=1}catch{/* rejected, which is the point */}
  }
  assert.ok(accepted/tried<0.005,`single-character typo acceptance ${(accepted/tried*100).toFixed(2)}% should be well under 0.5%`);
});

/* The defect this whole format exists for: a seed alone does not reproduce a
 * match, because the engine shuffles whatever deck it is handed. */
test('a seed code fingerprints the doctrine it was recorded with',()=>{
  const mine=filler('P'),other=filler('Q');
  const played=createMatch({playerDeck:mine,rivalDeck:filler('R'),seed:31337,difficulty:'veteran'});
  assert.equal(played.doctrineMatch,null,'a fresh match makes no replay claim');

  const same=createMatch({playerDeck:mine,rivalDeck:filler('R'),seed:played.seedCode});
  assert.equal(same.doctrineMatch,true);
  assert.deepEqual(same.players.player.hand.map(c=>c.id),played.players.player.hand.map(c=>c.id));

  const different=createMatch({playerDeck:other,rivalDeck:filler('R'),seed:played.seedCode});
  assert.equal(different.doctrineMatch,false,'a different doctrine under the same code is reported, not hidden');

  /* Legacy codes carry no fingerprint, so they must not claim a mismatch. */
  assert.equal(createMatch({playerDeck:mine,rivalDeck:filler('R'),seed:'VET-0000-44J5'}).doctrineMatch,null);
});

test('a doctrine is fingerprinted as a set, so the order cards were added in cannot change the match',()=>{
  const deck=filler('P'),reordered=[...deck].reverse();
  assert.equal(doctrineFingerprint(deck),doctrineFingerprint(reordered));
  assert.equal(doctrineFingerprint(deck),doctrineFingerprint(deck.map(c=>c.id)));
  assert.notEqual(doctrineFingerprint(deck),doctrineFingerprint(filler('Q')));
  const a=createMatch({playerDeck:deck,rivalDeck:filler('R'),seed:99});
  const b=createMatch({playerDeck:reordered,rivalDeck:filler('R'),seed:99});
  assert.deepEqual(b.players.player.hand.map(c=>c.id),a.players.player.hand.map(c=>c.id));
});

test('createMatch accepts a seed code and reports the code it is playing',()=>{
  const deck=filler('P');
  const code=encodeSeed(31337,'sovereign',doctrineFingerprint(deck));
  const state=createMatch({playerDeck:deck,rivalDeck:filler('R'),seed:code});
  assert.equal(state.seed,31337);
  assert.equal(state.difficulty,'sovereign');
  assert.equal(state.seedCode,code);
  assert.equal(state.doctrineMatch,true);
  const overridden=createMatch({playerDeck:deck,rivalDeck:filler('R'),seed:code,difficulty:'recruit'});
  assert.equal(overridden.difficulty,'recruit');
  assert.equal(overridden.seed,31337);
});

test('AI planning is a pure function of the state it is given',()=>{
  const state=mainState();
  assert.deepEqual(planAiPlays(state,'player','sovereign'),planAiPlays(state,'player','sovereign'));
  const before=JSON.stringify(state.players.player.hand.map(c=>c.id));
  planAiPlays(state,'player','sovereign');
  assert.equal(JSON.stringify(state.players.player.hand.map(c=>c.id)),before,'planning never mutates the live state');
});

/* ---------- difficulty ---------- */

test('difficulty names are validated and default to the documented tier',()=>{
  assert.equal(normalizeDifficulty(undefined),DEFAULT_DIFFICULTY);
  assert.equal(normalizeDifficulty('SOVEREIGN'),'sovereign');
  assert.throws(()=>normalizeDifficulty('nightmare'),/Unknown difficulty/);
  assert.equal(createMatch({playerDeck:filler('P'),rivalDeck:filler('R')}).difficulty,DEFAULT_DIFFICULTY);
  assert.throws(()=>createMatch({playerDeck:filler('P'),rivalDeck:filler('R'),difficulty:'godlike'}),/Unknown difficulty/);
});

test('higher tiers beat lower tiers from the same seeds and decks',()=>{
  const deck=()=>filler('M',{});
  const record=(playerDifficulty,difficulty)=>{
    let wins=0;
    for(let seed=1;seed<=24;seed++){
      const result=simulateMatch({playerDeck:deck(),rivalDeck:deck(),seed:seed*7919,playerDifficulty,difficulty});
      if(result.winner==='player')wins+=1;
    }
    return wins;
  };
  const sovereignVsRecruit=record('sovereign','recruit');
  const recruitVsSovereign=record('recruit','sovereign');
  const veteranVsRecruit=record('veteran','recruit');
  assert.ok(sovereignVsRecruit>veteranVsRecruit||sovereignVsRecruit>=18,`sovereign ${sovereignVsRecruit} should not trail veteran ${veteranVsRecruit} against recruit`);
  assert.ok(sovereignVsRecruit>recruitVsSovereign,`sovereign wins ${sovereignVsRecruit}/24 on the play but recruit wins ${recruitVsSovereign}/24`);
  assert.ok(veteranVsRecruit>=12,`veteran should hold the seat against recruit, won ${veteranVsRecruit}/24`);
});

test('a lower tier commits fewer cards per turn than a higher tier from the same board',()=>{
  const state=mainState();
  state.players.player.resources={command:10,insight:10,essence:10};
  assert.ok(planAiPlays(state,'player','recruit').length<=2);
  assert.ok(planAiPlays(state,'player','sovereign').length>=planAiPlays(state,'player','recruit').length);
});

test('the rival mulligan hardens with difficulty and never fires on recruit',()=>{
  const expensive=Array.from({length:DECK_SIZE},(_,i)=>makeCard(`X-${i}`,{cost:{command:3,insight:3,essence:3}}));
  const state=fresh(filler('P'),expensive);
  assert.deepEqual(aiMulliganIndices(state,'rival','recruit'),[]);
  assert.equal(aiMulliganIndices(state,'rival','veteran').length,2);
  assert.equal(aiMulliganIndices(state,'rival','sovereign').length,3);
});

/* ---------- statistics ---------- */

test('statistics account for every card played, resource spent and Core point moved',()=>{
  const {state}=simulateMatch({playerDeck:filler('P'),rivalDeck:filler('R'),shuffle:false,seed:44});
  for(const side of ['player','rival']){
    const stats=state.stats[side];
    assert.equal(stats.cardsPlayed,eventsOf(state,'play').filter(e=>e.side===side).length);
    const spent=eventsOf(state,'resource-spend').filter(e=>e.side===side);
    for(const key of RESOURCE_KEYS)assert.equal(stats.resourcesSpent[key],spent.reduce((sum,e)=>sum+e.cost[key],0));
    assert.equal(stats.resourcesSpent.total,RESOURCE_KEYS.reduce((sum,k)=>sum+stats.resourcesSpent[k],0));
    assert.equal(stats.cardsDrawn,eventsOf(state,'draw').filter(e=>e.side===side).length);
    assert.equal(stats.unitsLost,eventsOf(state,'unit-destroyed').filter(e=>e.side===side).length);
    // Rules change: the breach ceiling now applies to contested lanes only, so a single
    // undefended lane can push more than MAX_LANE_BREACH in one combat. What still holds
    // is that no lane can push more Core than the Core had.
    assert.ok(stats.largestLaneSwing<=20,'a lane cannot take more Core than a side started with');
  }
  assert.equal(state.stats.player.unitsDestroyed,state.stats.rival.unitsLost);
  assert.equal(state.stats.player.coreDamageDealt,state.stats.rival.coreDamageTaken-state.stats.rival.fatigueDamage);
});

test('the Core history is chart-ready and ends on the final round',()=>{
  const {state}=simulateMatch({playerDeck:filler('P'),rivalDeck:filler('R'),shuffle:false,seed:12});
  const history=state.stats.coreHistory;
  assert.ok(history.length>=2);
  assert.deepEqual(history[0],{round:1,turn:1,player:20,rival:20});
  for(let i=1;i<history.length;i++)assert.ok(history[i].round>=history[i-1].round,'rounds never move backwards');
  const last=history[history.length-1];
  assert.equal(last.player,state.players.player.core);
  assert.equal(last.rival,state.players.rival.core);
  assert.equal(state.stats.rounds,state.round);
});

/* ---------- fatigue ---------- */

test('drawing from an empty doctrine deals escalating fatigue damage and ends the match',()=>{
  let state=mainState();
  state.players.player.deck=[];
  const before=state.players.player.core;
  state.players.player.core=6;
  for(let i=0;i<4&&state.phase!=='ended';i++)state=completePlayerTurn(state);
  const fatigue=eventsOf(state,'fatigue').filter(e=>e.side==='player');
  assert.ok(fatigue.length>=3);
  assert.deepEqual(fatigue.slice(0,3).map(e=>e.amount),[1,2,3]);
  // The fatigue *counter* escalates 1, 2, 3…; the damage that lands is clamped to the
  // Core that is actually left, so fatigueDamage tracks the core-damage events rather
  // than the raw counter. (It used to assert >= 6, which only held while the stat was
  // allowed to exceed the Core it consumed.)
  const fatigueDealt=eventsOf(state,'core-damage').filter(e=>e.side==='player'&&e.source==='fatigue').reduce((s,e)=>s+e.amount,0);
  assert.equal(state.stats.player.fatigueDamage,fatigueDealt);
  assert.ok(fatigueDealt>=3,`fatigue should be doing the killing, dealt ${fatigueDealt}`);
  assert.equal(state.phase,'ended');
  assert.equal(state.winner,'rival');
  assert.equal(state.endReason,'fatigue');
  assert.ok(before>0);
});

test('fatigue ignores lane Defense because it never comes from a lane',()=>{
  const defense=makeCard('DEF',{family:'Defense',cost:zero,duration:'Persistent'});
  let state=mainState();
  for(let lane=0;lane<3;lane++)state.players.player.lanes[lane].supports.push(support(defense,{uid:`d${lane}`}));
  state.players.player.deck=[];
  const before=state.players.player.core;
  state=completePlayerTurn(state);
  const damage=eventsOf(state,'core-damage').find(e=>e.source==='fatigue');
  assert.ok(damage);
  assert.equal(damage.lane,null);
  assert.ok(state.players.player.core<before);
});

test('every simulated match terminates well inside the safety bound',()=>{
  for(const difficulty of DIFFICULTY_TIERS){
    const result=simulateMatch({playerDeck:filler('P'),rivalDeck:filler('R'),seed:77,difficulty,maxRounds:120});
    assert.equal(result.timedOut,false);
    assert.equal(result.state.phase,'ended');
    assert.ok(['core','fatigue'].includes(result.reason));
    assert.ok(result.rounds<60);
  }
});

/* ---------- combat model changes ---------- */

test('a deployed unit is exhausted until its controller refreshes',()=>{
  let state=mainState();
  state.players.player.resources={command:10,insight:10,essence:10};
  state=playCard(state,'player',0,0);
  const deployed=state.players.player.lanes[0].units[0];
  assert.equal(deployed.exhausted,true);
  assert.equal(projectLaneDamage(state,'player',0),0,'threat projection respects deployment fatigue');
  state=completePlayerTurn(state);
  if(state.phase!=='ended')assert.equal(state.players.player.lanes[0].units[0]?.exhausted??false,false);
});

test('an undefended lane has no breach ceiling, only the armour divisor',()=>{
  // Rules change: MAX_LANE_BREACH is no longer a flat constant. A lane nobody defends
  // is uncapped, so power above the old ceiling is no longer discarded and abandoning a
  // lane is punished. A defended lane still keeps the ceiling (asserted below).
  const brute=makeCard('BRUTE',{power:20,cost:zero});
  let state=mainState([brute,...filler('P').slice(1)]);
  state=playCard(state,'player',0,1);
  state=resolveCombat(ready(state,'player'),'player');
  const expected=Math.ceil(20/CORE_ARMOUR_DIVISOR);
  assert.ok(expected>MAX_LANE_BREACH,'the test is only meaningful above the old ceiling');
  const dealt=eventsOf(state,'core-damage').find(e=>e.side==='rival');
  assert.equal(dealt.amount,expected);
  const absorbed=eventsOf(state,'damage-prevented').find(e=>e.source==='Armour');
  assert.equal(absorbed.amount,20-expected);
  assert.equal(20-state.players.rival.core,expected);
});

test('a defended lane keeps its breach ceiling, so damage scales with what the lane faces',()=>{
  const brute=makeCard('BRUTE',{power:30,cost:zero});
  const chaff=makeCard('CHAFF',{power:1,cost:zero});
  const open=(()=>{
    let s=mainState([brute,...filler('P').slice(1)]);
    s=playCard(s,'player',0,1);
    return 20-resolveCombat(ready(s,'player'),'player').players.rival.core;
  })();
  const defended=(()=>{
    let s=mainState([brute,...filler('P').slice(1)],[chaff,...filler('R').slice(1)]);
    s=playCard(s,'player',0,1);
    s.active='rival';s=playCard(s,'rival',0,1);s.active='player';
    return 20-resolveCombat(ready(s,'player'),'player').players.rival.core;
  })();
  assert.ok(open>defended,`an undefended lane must hurt more than a defended one (${open} vs ${defended})`);
  assert.ok(defended<=MAX_LANE_BREACH,'a contested lane is still capped');
});

test('Flying pierces one step of Core armour',()=>{
  const dragon=makeCard('DRAKE',{family:'Dragon',power:8,cost:zero,rulesText:'Flying. On deployment, choose a lane.'});
  const ground=makeCard('G',{power:9,cost:zero});
  let state=mainState([dragon,...filler('P').slice(1)],[ground,...filler('R').slice(1)]);
  state=playCard(state,'player',0,1);
  state.active='rival';state=playCard(state,'rival',0,1);state.active='player';
  state=resolveCombat(ready(state,'player'),'player');
  assert.equal(20-state.players.rival.core,Math.min(Math.ceil(8/(CORE_ARMOUR_DIVISOR-1)),MAX_LANE_BREACH+1));
});

test('surviving units regroup toward their base power at refresh',()=>{
  let state=mainState();
  const wounded=unit(makeCard('W',{power:9,cost:zero}),{uid:'w1'});
  wounded.power=2;
  state.players.player.lanes[2].units.push(wounded);
  state=completePlayerTurn(state);
  if(state.phase!=='ended'){
    const after=state.players.player.lanes.flatMap(l=>l.units).find(u=>u.uid==='w1');
    if(after)assert.ok(after.power<=2+REGROUP_RECOVERY&&after.power>2,'a wounded survivor recovers, but not fully');
  }
});

/* ---------- new family interpretations ---------- */

test('Spell applies its keyword twice to one target and banks the canonical 1 Insight',()=>{
  const spell=makeCard('SPL',{family:'Spell',cost:zero,power:0,keywords:['Forecast','Link'],rulesText:'Choose a target. Apply this division’s primary keyword twice; if both applications affect the same card, gain 1 Insight.'});
  let state=mainState([spell,...filler('P').slice(1)]);
  state.players.rival.lanes[0].units.push(unit(makeCard('TGT',{power:5,cost:zero})));
  const insight=state.players.player.resources.insight;
  state=playCard(state,'player',0,0);
  const resolved=eventsOf(state,'spell-resolve')[0];
  assert.equal(resolved.targetCardId,'TGT');
  assert.equal(resolved.keyword,'Forecast');
  assert.equal(state.players.player.resources.insight,insight+1);
});

test('Spell with no legal target banks nothing rather than inventing a value',()=>{
  const spell=makeCard('SPL',{family:'Spell',cost:zero,power:0});
  let state=mainState([spell,...filler('P').slice(1)]);
  const insight=state.players.player.resources.insight;
  state=playCard(state,'player',0,2);
  assert.equal(eventsOf(state,'spell-resolve')[0].targetCardId,null);
  assert.equal(state.players.player.resources.insight,insight);
});

test('Law limits each side to one trigger of a repeated ability name per turn',()=>{
  const base=makeCard('BASE',{family:'Base',cost:zero,power:0,duration:'Persistent'});
  const law=makeCard('LAW',{family:'Law',cost:zero,power:0,duration:'Persistent'});
  const build=withLaw=>{
    let state=mainState(inert('P'),inert('R'));
    state.players.player.lanes[0].supports.push(support(base,{uid:'b1'}),support(makeCard('BASE2',{family:'Base',cost:zero,power:0}),{uid:'b2'}));
    if(withLaw)state.players.player.lanes[1].supports.push(support(law,{uid:'l1'}));
    return completePlayerTurn(state);
  };
  const free=build(false),restricted=build(true);
  const count=state=>eventsOf(state,'resource-gain').filter(e=>e.side==='player'&&e.source==='Base').length;
  assert.equal(count(free),2);
  assert.equal(count(restricted),1);
  assert.equal(eventsOf(restricted,'law-restricted').filter(e=>e.trigger==='Base').length,1);
});

test('an opposing Virus delays the first automated refresh trigger to the end step',()=>{
  const base=makeCard('BASE',{family:'Base',cost:zero,power:0,duration:'Persistent'});
  const virus=makeCard('VIR',{family:'Virus',cost:zero,power:0,duration:'Persistent'});
  let state=mainState(inert('P'),inert('R'));
  state.players.player.lanes[0].supports.push(support(base,{uid:'b1'}));
  state.players.rival.lanes[2].supports.push(support(virus,{uid:'v1'}));
  state=completePlayerTurn(state);
  const delayed=eventsOf(state,'virus-delay').filter(e=>e.side==='player');
  assert.ok(delayed.length>=1);
  assert.equal(delayed[0].trigger,'Base');
  assert.ok(state.players.player.delayed.length>0,'the trigger is queued, not discarded');
  const flushed=resolveCombat(state,'player');
  assert.equal(flushed.players.player.delayed.length,0);
  assert.ok(eventsOf(flushed,'resource-gain').some(e=>e.side==='player'&&e.source==='Base'));
});

test('Deity converts one resource per turn and empowers itself after the third conversion',()=>{
  let state=mainState(inert('P'),inert('R'));
  const deity=unit(makeCard('GOD',{family:'Deity',power:6,cost:zero,rulesText:'Unique. Once per turn, convert 1 resource into another type; after the third conversion, empower this card by +2.'}),{uid:'g1'});
  state.players.player.lanes[0].units.push(deity);
  for(let i=0;i<8&&state.phase!=='ended';i++)state=completePlayerTurn(state);
  const conversions=eventsOf(state,'deity-convert').filter(e=>e.side==='player');
  assert.ok(conversions.length>=3,`expected at least three conversions, saw ${conversions.length}`);
  assert.deepEqual(conversions.slice(0,3).map(e=>e.count),[1,2,3]);
  for(const event of conversions)assert.notEqual(event.from,event.to);
  const empower=eventsOf(state,'power-change').find(e=>e.source==='Deity');
  assert.equal(empower.amount,2);
  const survivor=state.players.player.lanes.flatMap(l=>l.units).find(u=>u.uid==='g1');
  if(survivor)assert.equal(survivor.basePower,8);
});

test('Android repeats its last lane transfer at refresh while the destination stays legal',()=>{
  let state=mainState(inert('P'),inert('R'));
  const android=unit(makeCard('AND',{family:'Android',power:5,cost:zero,rulesText:'Automate. At refresh, repeat this card’s last non-attack lane action if its target is still legal.'}),{uid:'a1',lastShift:1});
  state.players.player.lanes[0].units.push(android);
  state=completePlayerTurn(state);
  const automated=eventsOf(state,'android-automate')[0];
  assert.ok(automated);
  assert.equal(automated.lane,0);
  assert.equal(automated.toLane,1);
  assert.equal(state.players.player.lanes[0].units.length,0);
  assert.equal(state.players.player.lanes[1].units[0].uid,'a1');
});

test('a set Response copies a friendly Action at half numeric value, rounded down',()=>{
  const response=makeCard('RSP',{family:'Response',cost:zero,power:0,rulesText:'Play after a friendly card resolves. Copy one non-damage keyword trigger from it at half numeric value, rounded down.'});
  const action=makeCard('ACT',{family:'Action',cost:zero,power:0});
  let state=mainState([action,...filler('P').slice(1)]);
  state.players.player.lanes[0].units.push(unit(makeCard('U',{power:4,cost:zero}),{uid:'u1'}));
  state.players.player.lanes[0].supports.push(support(response,{uid:'r1',pending:true}));
  state=playCard(state,'player',0,0);
  const copy=eventsOf(state,'response-copy')[0];
  assert.equal(copy.amount,1);
  assert.equal(copy.sourceCardId,'ACT');
  assert.equal(state.players.player.lanes[0].units[0].power,4+2+1);
  assert.equal(state.players.player.lanes[0].supports.length,0,'the Response is consumed');
});

test('a set Response holds when the resolved card has no numeric non-damage trigger',()=>{
  const response=makeCard('RSP',{family:'Response',cost:zero,power:0});
  const item=makeCard('ITM',{family:'Item',cost:zero,power:0});
  let state=mainState([item,...filler('P').slice(1)]);
  state.players.player.lanes[0].units.push(unit(makeCard('U',{power:4,cost:zero}),{uid:'u1'}));
  state.players.player.lanes[0].supports.push(support(response,{uid:'r1',pending:true}));
  state=playCard(state,'player',0,0);
  assert.equal(eventsOf(state,'response-copy').length,0);
  assert.equal(state.players.player.lanes[0].supports.length,1,'half of +1 is 0, so the Response stays set');
  assert.equal(state.players.player.lanes[0].units[0].power,5);
});

test('Ritual charges once per end step and resolves out of play at Channel 3',()=>{
  const ritual=makeCard('RIT',{family:'Ritual',cost:zero,power:0,rulesText:'Channel 3. Add one channel counter at each end step; at 3, resolve its division effect across all friendly lanes.'});
  let state=mainState(inert('P'),inert('R'));
  state.players.player.lanes[1].supports.push(support(ritual,{uid:'r1'}));
  const charges=[];
  for(let i=0;i<3;i++){state=resolveCombat(state,'player');charges.push(state.players.player.lanes[1].supports[0]?.counters??3);}
  assert.deepEqual(charges,[1,2,3]);
  assert.deepEqual(eventsOf(state,'ritual-charge').map(e=>e.amount),[1,2,3]);
  assert.equal(eventsOf(state,'ritual-resolve').length,1);
  assert.equal(state.players.player.lanes[1].supports.length,0);
  assert.ok(state.players.player.discard.some(c=>c.id==='RIT'));
});

test('families with no canonical numeric value stay inert but announce themselves',()=>{
  for(const family of ['Operative','God','Ruler','World']){
    const card=makeCard(`${family}-1`,{family,power:5,cost:zero});
    let state=mainState([card,...filler('P').slice(1)]);
    const coreBefore=state.players.rival.core,resourcesBefore={...state.players.player.resources};
    state=playCard(state,'player',0,0);
    const note=eventsOf(state,'keyword-note').find(e=>e.family===family);
    assert.ok(note,`${family} should record a keyword note`);
    assert.equal(state.players.rival.core,coreBefore);
    assert.deepEqual(state.players.player.resources,{...resourcesBefore,command:resourcesBefore.command});
  }
});

/* ---------- threat model exposed to the UI ---------- */

test('laneThreat reports symmetric incoming and outgoing pressure per lane',()=>{
  let state=mainState();
  state.players.rival.lanes[0].units.push(unit(makeCard('BIG',{power:12,cost:zero}),{uid:'b1'}));
  const mine=laneThreat(state,'player'),theirs=laneThreat(state,'rival');
  assert.equal(mine.length,3);
  assert.deepEqual(mine.map(l=>l.incoming),theirs.map(l=>l.outgoing));
  assert.equal(mine[0].incoming,Math.min(Math.ceil(12/CORE_ARMOUR_DIVISOR),MAX_LANE_BREACH));
  assert.equal(mine[0].name,'Vanguard');
});

test('aiTakeMainPhase only ever makes legal plays and leaves the turn open',()=>{
  let state=mainState();
  const after=aiTakeMainPhase(state,'player','sovereign');
  assert.equal(after.phase,'main');
  assert.equal(after.active,'player');
  assert.ok(after.players.player.hand.length<=state.players.player.hand.length);
  for(const key of RESOURCE_KEYS)assert.ok(after.players.player.resources[key]>=0,'the AI never overspends');
  assert.equal(DRAW_PER_REFRESH>=1,true);
});
