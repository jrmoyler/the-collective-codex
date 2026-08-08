import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDeckIds, saveDeckIds } from '../deck-store.js';

const cards=Array.from({length:40},(_,i)=>({id:`EDIT-${i}`,name:`Edit ${i}`,divisionId:(i%21)+1,divisionName:'Test',family:i%2?'Warrior':'Action',cost:{command:1,insight:0,essence:0},power:3,rulesText:'Test'}));

test('an in-progress valid deck edit survives localStorage refresh before reaching 30 cards',()=>{
  const memory=new Map();
  const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  const partial=cards.slice(0,23).map(c=>c.id);
  saveDeckIds(storage,partial);
  assert.deepEqual(loadDeckIds(storage,cards),partial);
});
