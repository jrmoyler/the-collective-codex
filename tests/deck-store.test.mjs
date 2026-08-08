import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK_SIZE } from '../match-engine.js';
import { DECK_STORAGE_KEY, buildStarterDeck, normalizeDeckIds, filterDeckPool, loadDeckIds, saveDeckIds } from '../deck-store.js';

const entityFamilies=['Specimen','Monster','Knight','Warrior','Magician','Operative','Dragon','Deity','Android','God','Ruler'];
const cards=Array.from({length:60},(_,i)=>({
  id:`C-${i}`,name:`Card ${i}`,divisionId:(i%21)+1,divisionName:`Division ${(i%21)+1}`,
  family:i<36?entityFamilies[i%entityFamilies.length]:['Action','Defense','Base','Environment'][i%4],
  cost:{command:i%4,insight:(i+1)%3,essence:(i+2)%2},power:2+(i%9),rulesText:`Rule ${i}`
}));

test('starter doctrine is exactly 30 unique legal card IDs with a playable entity majority',()=>{
  const ids=buildStarterDeck(cards);
  assert.equal(ids.length,DECK_SIZE);
  assert.equal(new Set(ids).size,DECK_SIZE);
  const selected=ids.map(id=>cards.find(c=>c.id===id));
  assert.equal(selected.filter(c=>entityFamilies.includes(c.family)).length>=16,true);
});

test('invalid persisted decks fall back to the starter doctrine while a valid 30-card deck is preserved',()=>{
  const valid=cards.slice(0,DECK_SIZE).map(c=>c.id);
  assert.deepEqual(normalizeDeckIds(valid,cards),valid);
  const invalid=[...valid.slice(0,29),'missing-id'];
  assert.deepEqual(normalizeDeckIds(invalid,cards),buildStarterDeck(cards));
});

test('deck pool filters by division, family, combined cost and search text',()=>{
  const target={...cards[10],name:'Aureate Test Sentinel',divisionId:4,family:'Warrior',cost:{command:1,insight:1,essence:0},rulesText:'Guard the signal'};
  const pool=[...cards,target];
  const result=filterDeckPool(pool,{division:'4',family:'Warrior',costBand:'0-3',query:'signal'});
  assert.deepEqual(result.map(c=>c.name),['Aureate Test Sentinel']);
});

test('deck persistence uses the versioned localStorage key without requiring browser globals',()=>{
  const memory=new Map();
  const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  const ids=cards.slice(0,DECK_SIZE).map(c=>c.id);
  saveDeckIds(storage,ids);
  assert.equal(DECK_STORAGE_KEY,'collectiveCodex.activeDeck.v1');
  assert.deepEqual(loadDeckIds(storage,cards),ids);
});
