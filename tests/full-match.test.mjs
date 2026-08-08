import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK_SIZE, createMatch, mulligan, getPlayability, playCard, completePlayerTurn } from '../match-engine.js';

const card=(side,i)=>({
  id:`${side}-${i}`,name:`${side} ${i}`,divisionId:(i%21)+1,divisionName:'Test Division',
  family:i%4===0?'Knight':'Warrior',cost:{command:1,insight:0,essence:0},power:3+(i%4),
  rulesText:i%4===0?'Guard. The first allied entity that would take damage in this lane each turn takes 1 less.':'After this unit attacks, if it survived, it may shift one lane once per turn.',
  keywords:i%4===0?['Guard']:[],targeting:'Friendly Lane',timing:'Main',duration:'Immediate'
});
const deck=side=>Array.from({length:DECK_SIZE},(_,i)=>card(side,i));

function playGreedyMain(state){
  let next=state,plays=0;
  while(plays<5&&next.phase==='main'){
    let choice=null;
    outer: for(let hand=0;hand<next.players.player.hand.length;hand++){
      for(let lane=0;lane<3;lane++){
        if(getPlayability(next,'player',hand,lane).ok){choice={hand,lane};break outer;}
      }
    }
    if(!choice)break;
    next=playCard(next,'player',choice.hand,choice.lane);
    plays++;
  }
  return next;
}

test('a deterministic local match reaches a real end state only after both sides have had turns',()=>{
  let state=createMatch({playerDeck:deck('P'),rivalDeck:deck('R'),shuffle:false,seed:11});
  state=mulligan(state,'player',[]);
  let cycles=0;
  while(state.phase!=='ended'&&cycles<20){
    state=playGreedyMain(state);
    state=completePlayerTurn(state);
    cycles++;
  }
  assert.equal(state.phase,'ended');
  assert.ok(['player','rival','draw'].includes(state.winner));
  assert.ok(state.turnCount>=3,'the rival should receive at least one full turn before match end');
  assert.ok(state.round>=2,'the match should progress beyond the opening round');
  assert.ok(state.players.player.core===0||state.players.rival.core===0);
  assert.ok(cycles<20,'deterministic match should conclude without looping');
});
