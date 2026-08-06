import test from 'node:test';
import assert from 'node:assert/strict';
const source = await import('../app.js');
test('locks 21 divisions',()=>assert.equal(source.divisions.length,21));
test('registers 54 sheets and 1134 cards',()=>{assert.equal(source.sheets.length,54);assert.equal(source.cards.length,1134)});
test('contains 28 families',()=>assert.equal(source.families.length,28));
test('unique card ids',()=>assert.equal(new Set(source.cards.map(c=>c.id)).size,1134));
