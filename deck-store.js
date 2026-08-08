import { DECK_SIZE, ENTITY_FAMILIES } from './match-engine.js';

export const DECK_STORAGE_KEY='collectiveCodex.activeDeck.v1';
const totalCost=card=>(card.cost?.command||0)+(card.cost?.insight||0)+(card.cost?.essence||0);
const legal=card=>card&&card.pvpLegal!==false;

function balancedPick(pool,count,used){
  const grouped=new Map();
  for(const card of pool.filter(legal).sort((a,b)=>totalCost(a)-totalCost(b)||a.divisionId-b.divisionId||a.id.localeCompare(b.id))){
    if(!grouped.has(card.divisionId))grouped.set(card.divisionId,[]);
    grouped.get(card.divisionId).push(card);
  }
  const ids=[...grouped.keys()].sort((a,b)=>a-b),out=[];let cursor=0,guard=0;
  while(out.length<count&&guard<pool.length*4&&ids.length){
    const division=ids[cursor%ids.length],bucket=grouped.get(division),card=bucket?.find(c=>!used.has(c.id));
    if(card){used.add(card.id);out.push(card.id)}
    cursor++;guard++;
  }
  if(out.length<count)for(const card of pool){if(out.length>=count)break;if(legal(card)&&!used.has(card.id)){used.add(card.id);out.push(card.id)}}
  return out;
}

export function buildStarterDeck(cards){
  const usable=cards.filter(legal),used=new Set();
  const entities=usable.filter(c=>ENTITY_FAMILIES.has(c.family));
  const nonEntities=usable.filter(c=>!ENTITY_FAMILIES.has(c.family));
  const ids=[...balancedPick(entities,18,used),...balancedPick(nonEntities,12,used)];
  if(ids.length<DECK_SIZE)ids.push(...balancedPick(usable,DECK_SIZE-ids.length,used));
  return ids.slice(0,DECK_SIZE);
}

export function normalizeDeckIds(ids,cards){
  const byId=new Map(cards.filter(legal).map(c=>[c.id,c]));
  if(Array.isArray(ids)&&ids.length===DECK_SIZE&&new Set(ids).size===DECK_SIZE&&ids.every(id=>byId.has(id)))return [...ids];
  return buildStarterDeck(cards);
}

export function filterDeckPool(cards,{division='all',family='all',costBand='all',query=''}={}){
  const q=String(query).trim().toLowerCase();let [min,max]=[0,Infinity];
  if(costBand!=='all'){
    const parts=String(costBand).split('-').map(Number);
    if(parts.length===2&&parts.every(Number.isFinite))[min,max]=parts;
    else if(String(costBand)==='7+')[min,max]=[7,Infinity];
  }
  return cards.filter(c=>legal(c)&&(division==='all'||c.divisionId===Number(division))&&(family==='all'||c.family===family)&&totalCost(c)>=min&&totalCost(c)<=max&&(!q||`${c.name} ${c.id} ${c.divisionName||''} ${c.family} ${c.rulesText||''}`.toLowerCase().includes(q)));
}

export function loadDeckIds(storage,cards){
  try{const raw=storage?.getItem?.(DECK_STORAGE_KEY);return normalizeDeckIds(raw?JSON.parse(raw):null,cards)}catch{return buildStarterDeck(cards)}
}

export function saveDeckIds(storage,ids){
  try{storage?.setItem?.(DECK_STORAGE_KEY,JSON.stringify(ids));return true}catch{return false}
}
