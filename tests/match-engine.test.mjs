import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_SIZE, STARTING_CORE, MAX_UNITS_PER_LANE,
  resourceCurve, createMatch, mulligan, playCard, resolveCombat,
  completePlayerTurn, effectiveCost
} from '../match-engine.js';

const zero={command:0,insight:0,essence:0};
const makeCard=(id,overrides={})=>({
  id,name:id,divisionId:overrides.divisionId??1,divisionName:'Test Division',family:overrides.family??'Warrior',
  cost:overrides.cost??{command:1,insight:0,essence:0},power:overrides.power??4,
  rulesText:overrides.rulesText??'',keywords:overrides.keywords??[],targeting:overrides.targeting??'Friendly Lane',
  timing:overrides.timing??'Main',duration:overrides.duration??'Immediate',...overrides
});
const filler=(prefix='F')=>Array.from({length:DECK_SIZE},(_,i)=>makeCard(`${prefix}-${i}`,{family:i%3===0?'Warrior':i%3===1?'Knight':'Action',power:3+(i%4),cost:{command:1+(i%2),insight:0,essence:0},keywords:i%3===1?['Guard']:[]}));
const fresh=(playerDeck=filler('P'),rivalDeck=filler('R'))=>createMatch({playerDeck,rivalDeck,shuffle:false,seed:7});
const mainState=(playerDeck=filler('P'),rivalDeck=filler('R'))=>mulligan(fresh(playerDeck,rivalDeck),'player',[]);

test('resource curve starts deliberately, ramps every turn and caps at eight before card effects',()=>{
  assert.deepEqual(resourceCurve(1),{command:2,insight:2,essence:2});
  assert.deepEqual(resourceCurve(4),{command:5,insight:5,essence:5});
  assert.deepEqual(resourceCurve(99),{command:8,insight:8,essence:8});
});

test('match opens with 20-point cores, five-card hands and a mulligan phase',()=>{
  const state=fresh();
  assert.equal(state.phase,'mulligan');
  assert.equal(state.players.player.core,STARTING_CORE);
  assert.equal(state.players.rival.core,STARTING_CORE);
  assert.equal(state.players.player.hand.length,5);
  assert.equal(state.players.rival.hand.length,5);
  assert.equal(state.players.player.deck.length,DECK_SIZE-5);
});

test('mulligan replaces selected cards once and begins the player main phase',()=>{
  const state=fresh();
  const rejected=state.players.player.hand[0].id;
  const next=mulligan(state,'player',[0]);
  assert.equal(next.phase,'main');
  assert.equal(next.active,'player');
  assert.equal(next.players.player.hand.length,5);
  assert.notEqual(next.players.player.hand[0].id,rejected);
  assert.equal(next.players.player.mulliganUsed,true);
  assert.deepEqual(next.players.player.resources,resourceCurve(1));
  assert.throws(()=>mulligan(next,'player',[0]),/mulligan/i);
});

test('playing a unit spends exact resources, removes it from hand and respects the three-unit lane cap',()=>{
  const cheap=makeCard('CHEAP',{cost:{command:2,insight:1,essence:1},power:5});
  const deck=[cheap,...filler('P').slice(1)];
  let state=mainState(deck);
  state.players.player.resources={command:10,insight:10,essence:10};
  const before=state.players.player.hand.length;
  state=playCard(state,'player',0,0);
  assert.deepEqual(state.players.player.resources,{command:8,insight:9,essence:9});
  assert.equal(state.players.player.hand.length,before-1);
  assert.equal(state.players.player.lanes[0].units.length,1);
  state.players.player.hand.unshift(makeCard('U2'),makeCard('U3'),makeCard('U4'));
  state.players.player.resources={command:10,insight:10,essence:10};
  state=playCard(state,'player',0,0);
  state=playCard(state,'player',0,0);
  assert.equal(state.players.player.lanes[0].units.length,3);
  assert.throws(()=>playCard(state,'player',0,0),/lane.*full/i);
  assert.equal(MAX_UNITS_PER_LANE,3);
});

test('monster on-deploy deals one Core damage when it exceeds every enemy in the lane',()=>{
  const monster=makeCard('MON',{family:'Monster',power:8,cost:zero,rulesText:'On deployment, pressure the opposing lane. If its power exceeds every enemy there, deal 1 Core damage.'});
  const enemy=makeCard('ENEMY',{power:4,cost:zero});
  let state=mainState([monster,...filler('P').slice(1)],[enemy,...filler('R').slice(1)]);
  state.players.rival.lanes[0].units.push({uid:'r1',card:enemy,power:4,basePower:4,tempPower:0,exhausted:false,moved:false,triggerSuppressed:false});
  const before=state.players.rival.core;
  state=playCard(state,'player',0,0);
  assert.equal(state.players.rival.core,before-1);
});

test('Guard reduces the first combat damage dealt to an allied unit in its lane',()=>{
  const attacker=makeCard('ATK',{power:4,cost:zero});
  const guard=makeCard('GUARD',{family:'Knight',power:4,cost:zero,keywords:['Guard']});
  let state=mainState([attacker,...filler('P').slice(1)],[guard,...filler('R').slice(1)]);
  state=playCard(state,'player',0,0);
  state.active='rival';
  state=playCard(state,'rival',0,0);
  state.active='player';
  state=resolveCombat(state,'player');
  assert.equal(state.players.rival.lanes[0].units[0].power,1);
});

test('an uncontested lane deals surviving unit power to the opposing Core',()=>{
  const attacker=makeCard('ATK',{power:6,cost:zero});
  let state=mainState([attacker,...filler('P').slice(1)]);
  state=playCard(state,'player',0,2);
  const before=state.players.rival.core;
  state=resolveCombat(state,'player');
  assert.equal(state.players.rival.core,before-6);
});

test('Flying bypasses a contested lane that has neither Flying nor Guard',()=>{
  const dragon=makeCard('DRAGON',{family:'Dragon',power:5,cost:zero,keywords:['Flying']});
  const ground=makeCard('GROUND',{power:9,cost:zero,keywords:[]});
  let state=mainState([dragon,...filler('P').slice(1)],[ground,...filler('R').slice(1)]);
  state=playCard(state,'player',0,1);
  state.active='rival';
  state=playCard(state,'rival',0,1);
  state.active='player';
  const before=state.players.rival.core;
  state=resolveCombat(state,'player');
  assert.equal(state.players.rival.core,before-5);
  assert.equal(state.players.rival.lanes[1].units.length,1);
});

test('a persistent Environment discounts the first card played into its lane by one highest-cost resource',()=>{
  const env=makeCard('ENV',{family:'Environment',cost:zero,duration:'Persistent'});
  const costly=makeCard('COSTLY',{cost:{command:3,insight:2,essence:0}});
  let state=mainState();
  state.players.player.lanes[0].supports.push({uid:'env',card:env,disabled:false,counters:0});
  state.players.player.lanePlays=[0,0,0];
  assert.deepEqual(effectiveCost(state,'player',costly,0),{command:2,insight:2,essence:0});
});

test('Defense prevents the first two Core damage from its lane each turn',()=>{
  const defense=makeCard('DEF',{family:'Defense',cost:zero,duration:'Persistent'});
  const attacker=makeCard('ATK',{power:6,cost:zero});
  let state=mainState([defense,...filler('P').slice(1)],[attacker,...filler('R').slice(1)]);
  state=playCard(state,'player',0,0);
  state.active='rival';
  state=playCard(state,'rival',0,0);
  const before=state.players.player.core;
  state=resolveCombat(state,'rival');
  assert.equal(state.players.player.core,before-4);
});

test('completePlayerTurn resolves combat, runs a spending rival AI turn, then yields round two to the player',()=>{
  const player=[makeCard('PLAYER',{power:2,cost:zero}),...filler('P').slice(1)];
  const rival=Array.from({length:DECK_SIZE},(_,i)=>makeCard(`AI-${i}`,{family:'Warrior',power:3+i%3,cost:{command:1,insight:0,essence:0}}));
  let state=mainState(player,rival);
  state=playCard(state,'player',0,0);
  const rivalDeckBefore=state.players.rival.deck.length;
  const next=completePlayerTurn(state);
  assert.equal(next.active,'player');
  assert.equal(next.phase==='main'||next.phase==='ended',true);
  assert.equal(next.round,2);
  assert.equal(next.turnCount>=3,true);
  assert.equal(next.players.rival.deck.length<rivalDeckBefore,true);
  const aiUsedBoard=next.players.rival.lanes.some(l=>l.units.length||l.supports.length)||next.players.rival.discard.length>0;
  assert.equal(aiUsedBoard,true);
});

test('combat ends the match immediately when a Core reaches zero',()=>{
  const finisher=makeCard('FINISH',{power:25,cost:zero});
  let state=mainState([finisher,...filler('P').slice(1)]);
  state=playCard(state,'player',0,0);
  state=resolveCombat(state,'player');
  assert.equal(state.players.rival.core,0);
  assert.equal(state.phase,'ended');
  assert.equal(state.winner,'player');
});
