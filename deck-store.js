import { DECK_SIZE, ENTITY_FAMILIES, RESOURCE_KEYS, resourceCurve } from './match-engine.js';

export const DECK_STORAGE_KEY='collectiveCodex.activeDeck.v1';
const totalCost=card=>(card.cost?.command||0)+(card.cost?.insight||0)+(card.cost?.essence||0);
const legal=card=>card&&card.pvpLegal!==false;
const cmp=(a,b)=>a<b?-1:a>b?1:0;

export function castableTurn(card){
  for(let turn=1;turn<=16;turn++){const pool=resourceCurve(turn);if(RESOURCE_KEYS.every(k=>(card?.cost?.[k]||0)<=pool[k]))return turn;}
  return 99;
}
export function deckProfile(deckCards){
  const cards=(deckCards||[]).filter(Boolean);
  const profile={size:cards.length,entities:0,supports:0,totalCost:0,byResource:{command:0,insight:0,essence:0},curve:{},families:{},averageCastableTurn:0,averagePower:0};
  for(const card of cards){
    if(ENTITY_FAMILIES.has(card.family))profile.entities+=1;else profile.supports+=1;
    profile.totalCost+=totalCost(card);profile.averagePower+=card.power||0;
    for(const k of RESOURCE_KEYS)profile.byResource[k]+=card.cost?.[k]||0;
    const turn=castableTurn(card);profile.curve[turn]=(profile.curve[turn]||0)+1;profile.averageCastableTurn+=turn;
    profile.families[card.family]=(profile.families[card.family]||0)+1;
  }
  if(cards.length){profile.averageCastableTurn=Number((profile.averageCastableTurn/cards.length).toFixed(2));profile.averagePower=Number((profile.averagePower/cards.length).toFixed(2));}
  const keys=RESOURCE_KEYS.slice().sort((a,b)=>profile.byResource[b]-profile.byResource[a]||RESOURCE_KEYS.indexOf(a)-RESOURCE_KEYS.indexOf(b));
  profile.primaryResource=cards.length?keys[0]:null;
  return profile;
}
/* Within a curve band every card is affordable by definition, so the only thing
 * left to want is the biggest body for the slot. Cost is deliberately NOT scored
 * here: it is already spent choosing the band. Scoring it again is what made the
 * old starter deck the weakest deck in the game -- it weighted cost at 100x and
 * power at 6, so it drafted the cheapest 30 cards in the canon and lost to every
 * other archetype 0-1% of the time. */
const draftScore=card=>-(card.power||0);
/* Entity cards per earliest-castable turn. A deck that is all one-drops gets
 * run over from turn four; a deck of nine-drops never gets to play. The shape
 * matters more than any single pick.
 *
 * This sums to 27, deliberately NOT to DECK_SIZE. When it summed to exactly 30
 * the entity bands filled the deck outright, the support draft was handed
 * count=0, and buildStarterDeck returned 30 entities and zero supports.
 * buildRivalDeck mirrors that profile, so no deck in normal play contained a
 * Trap, Base, Law, Ritual, Virus or Defense -- 17 of 28 families and 12 event
 * types were unreachable however well the AI played them.
 *
 * The 3-card support tail is a measured compromise. Supports are weak in this
 * engine, so they cost real strength: over a 4-archetype round robin the
 * starter deck's average win rate falls from 83% at zero supports to 58% at
 * three and 32% at six. Three keeps it clearly ahead of the swarm and
 * top-heavy decks while making half the card families something a player
 * actually sees. */
const CURVE_QUOTA=[[1,3],[2,5],[3,6],[4,5],[5,5],[9,3]];

function balancedPick(pool,count,used){
  const grouped=new Map();
  for(const card of pool.filter(legal).sort((a,b)=>draftScore(a)-draftScore(b)||a.divisionId-b.divisionId||cmp(a.id,b.id))){
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
  const usable=cards.filter(legal),used=new Set(),ids=[];
  /* Entities win lanes, so they carry the curve; supports fill the tail. */
  const entities=usable.filter(c=>ENTITY_FAMILIES.has(c.family));
  const nonEntities=usable.filter(c=>!ENTITY_FAMILIES.has(c.family));
  let previous=0;
  for(const [turn,count] of CURVE_QUOTA){
    const band=entities.filter(c=>{const t=castableTurn(c);return t>previous&&t<=turn});
    ids.push(...balancedPick(band,count,used));
    previous=turn;
  }
  /* Supports are drafted BEFORE the entity fallback. The other order looks
   * harmless and is not: the fallback fills to DECK_SIZE first and the support
   * draft then asks for zero. */
  ids.push(...balancedPick(nonEntities,Math.max(0,Math.min(3,DECK_SIZE-ids.length)),used));
  if(ids.length<DECK_SIZE)ids.push(...balancedPick(entities,DECK_SIZE-ids.length,used));
  if(ids.length<DECK_SIZE)ids.push(...balancedPick(usable,DECK_SIZE-ids.length,used));
  return ids.slice(0,DECK_SIZE);
}

export function buildRivalDeck(pool,opponentCards){
  const target=deckProfile(opponentCards);
  if(!target.size)return buildStarterDeck(pool);
  const costPerCard=target.totalCost/target.size;
  const score=card=>castableTurn(card)*100+Math.abs((card.power||0)-target.averagePower)*8+Math.abs(totalCost(card)-costPerCard)*3;
  const rank=(a,b)=>score(a)-score(b)||a.divisionId-b.divisionId||cmp(a.id,b.id);
  const usable=pool.filter(legal),used=new Set(),out=[];
  const take=(subset,count)=>{
    const grouped=new Map();
    for(const card of subset.slice().sort(rank)){if(!grouped.has(card.divisionId))grouped.set(card.divisionId,[]);grouped.get(card.divisionId).push(card);}
    const ids=[...grouped.keys()].sort((a,b)=>a-b);let cursor=0,guard=0,taken=0;
    while(taken<count&&ids.length&&guard<subset.length*4){
      const bucket=grouped.get(ids[cursor%ids.length]),card=bucket?.find(c=>!used.has(c.id));
      if(card){used.add(card.id);out.push(card.id);taken+=1;}
      cursor++;guard++;
    }
  };
  const entityTarget=Math.min(target.entities||18,DECK_SIZE);
  take(usable.filter(c=>ENTITY_FAMILIES.has(c.family)),entityTarget);
  take(usable.filter(c=>!ENTITY_FAMILIES.has(c.family)),DECK_SIZE-out.length);
  if(out.length<DECK_SIZE)take(usable,DECK_SIZE-out.length);
  return out.slice(0,DECK_SIZE);
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
  try{
    const raw=storage?.getItem?.(DECK_STORAGE_KEY);
    if(!raw)return buildStarterDeck(cards);
    const parsed=JSON.parse(raw),legalIds=new Set(cards.filter(legal).map(c=>c.id));
    if(Array.isArray(parsed)&&parsed.length<=DECK_SIZE&&new Set(parsed).size===parsed.length&&parsed.every(id=>legalIds.has(id)))return [...parsed];
    return buildStarterDeck(cards);
  }catch{return buildStarterDeck(cards)}
}

export function saveDeckIds(storage,ids){
  try{storage?.setItem?.(DECK_STORAGE_KEY,JSON.stringify(ids));return true}catch{return false}
}
