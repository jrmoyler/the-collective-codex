import test from 'node:test';import assert from 'node:assert/strict';import {cards,divisions,families,sheets} from '../card-canon.js';
test('locks 21 divisions',()=>assert.equal(divisions.length,21));
test('indexes 54 source sheets',()=>assert.equal(sheets.length,54));
test('contains exactly 1,134 canonical cards',()=>assert.equal(cards.length,1134));
test('all card ids are unique',()=>assert.equal(new Set(cards.map(c=>c.id)).size,1134));
test('all card names are unique',()=>assert.equal(new Set(cards.map(c=>c.name)).size,1134));
test('contains all 28 families',()=>assert.equal(families.length,28));
test('every card has valid embedded art coordinates',()=>assert.ok(cards.every(c=>c.art?.atlas==='assets/card-art-atlas.webp'&&c.art.row>=0&&c.art.row<54&&c.art.col>=0&&c.art.col<21)));
test('every card is canonical and PvP legal',()=>assert.ok(cards.every(c=>!('provisional' in c)&&c.pvpLegal===true&&c.sovereignOnly===false)));
