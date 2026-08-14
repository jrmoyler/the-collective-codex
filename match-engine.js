export const DECK_SIZE=30;
export const STARTING_CORE=20;
export const OPENING_HAND=5;
export const MAX_UNITS_PER_LANE=3;
export const MAX_SUPPORTS_PER_LANE=4;
export const LANE_NAMES=['Vanguard','Conduit','Flank'];
export const RESOURCE_KEYS=['command','insight','essence'];
export const RESOURCE_CAPS={command:6,insight:5,essence:4};
export const RESOURCE_CEILING=10;
export const REGROUP_RECOVERY=2;
export const DRAW_PER_REFRESH=2;
/* The armour divisor is now the *only* dampener on an undefended lane (the breach ceiling
 * below applies to contested lanes only), so it carries the pacing on its own. At 4 the
 * median match fell to 7 rounds and 26% of matches ended inside 5; at 5 the median sits at
 * 7-9 with 20% short, matching the pre-change pacing while keeping damage proportional to
 * board power instead of truncating it. */
export const CORE_ARMOUR_DIVISOR=5;
export const FLYING_ARMOUR_PIERCE=1;
export const MAX_LANE_BREACH=3;
export const DIFFICULTY_TIERS=['recruit','veteran','sovereign'];
export const DEFAULT_DIFFICULTY='veteran';
export const EVENT_TYPES=['phase','mulligan','draw','discard','fatigue','play','resource-spend','resource-gain','deploy-trigger','trap-sprung','power-change','unit-moved','combat-clash','combat-strike','core-damage','damage-prevented','unit-destroyed','support-disabled','support-removed','ritual-charge','ritual-resolve','spell-resolve','law-restricted','virus-delay','deity-convert','android-automate','response-copy','keyword-note','match-end'];

export const ENTITY_FAMILIES=new Set(['Specimen','Monster','Knight','Warrior','Magician','Operative','Dragon','Deity','Android','God','Ruler']);
const SUPPORT_FAMILIES=new Set(['Weapon','Environment','Defense','Base','Trap','Reaction','Response','Law','Hex','Plague','Virus','Ritual','World']);
const INFRA_FAMILIES=new Set(['Defense','Base']);
const INERT_FAMILIES={Operative:'division keyword trigger',God:'battlefield decree',Ruler:'leader activation',World:'world modifier'};
const other=side=>side==='player'?'rival':'player';
const totalCost=card=>card.cost.command+card.cost.insight+card.cost.essence;
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const hasKeyword=(thing,keyword)=>thing?.card?.keywords?.includes(keyword)||thing?.keywords?.includes(keyword)||thing?.card?.family===keyword||thing?.family===keyword||String(thing?.card?.rulesText||thing?.rulesText||'').includes(keyword);
const alive=unit=>unit.power>0;
const isCard=v=>Boolean(v)&&typeof v==='object'&&typeof v.id==='string'&&typeof v.family==='string'&&Boolean(v.cost)&&typeof v.cost==='object';
function clone(value){
  if(value===null||typeof value!=='object')return value;
  if(isCard(value))return value;
  if(Array.isArray(value)){const out=new Array(value.length);for(let i=0;i<value.length;i++)out[i]=clone(value[i]);return out;}
  const out={};for(const k of Object.keys(value))out[k]=clone(value[k]);return out;
}

export function resourceCurve(turn){
  const t=Math.max(1,Number(turn)||1);
  return {command:Math.min(RESOURCE_CAPS.command,1+t),insight:Math.min(RESOURCE_CAPS.insight,1+Math.ceil(t*2/3)),essence:Math.min(RESOURCE_CAPS.essence,1+Math.ceil(t/2))};
}

const SEED_ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIER_CODES={recruit:'REC',veteran:'VET',sovereign:'SOV'};
export function normalizeDifficulty(value,fallback=DEFAULT_DIFFICULTY){
  if(value===undefined||value===null||value==='')return fallback;
  const key=String(value).trim().toLowerCase();
  if(!DIFFICULTY_TIERS.includes(key))throw new Error(`Unknown difficulty "${value}". Use one of: ${DIFFICULTY_TIERS.join(', ')}.`);
  return key;
}
const seedChecksum=text=>{let sum=0;for(const ch of text)sum=(sum*31+ch.charCodeAt(0))>>>0;return SEED_ALPHABET[sum%32];};
export function encodeSeed(seed,difficulty=DEFAULT_DIFFICULTY){
  const tier=normalizeDifficulty(difficulty),code=TIER_CODES[tier];
  let n=Number(seed)>>>0;const body=[];
  for(let i=0;i<7;i++){body.unshift(SEED_ALPHABET[n%32]);n=Math.floor(n/32);}
  const chars=body.join('');
  return `${code}-${chars.slice(0,4)}-${chars.slice(4)}${seedChecksum(code+chars)}`;
}
export function decodeSeed(text){
  const cleaned=String(text??'').toUpperCase().replace(/[^0-9A-Z]/g,'');
  if(cleaned.length!==11)throw new Error('A seed code is a three-letter tier followed by eight characters, e.g. VET-0000-001R.');
  const code=cleaned.slice(0,3),tier=DIFFICULTY_TIERS.find(t=>TIER_CODES[t]===code);
  if(!tier)throw new Error(`Unknown difficulty tier "${code}" in seed code.`);
  const fix=s=>s.replace(/[IL]/g,'1').replace(/O/g,'0').replace(/U/g,'V');
  const chars=fix(cleaned.slice(3,10)),check=fix(cleaned.slice(10));
  if(seedChecksum(code+chars)!==check)throw new Error('That seed code failed its checksum.');
  let n=0;for(const ch of chars){const index=SEED_ALPHABET.indexOf(ch);if(index<0)throw new Error('That seed code contains an unsupported character.');n=n*32+index;}
  return {seed:n>>>0,difficulty:tier};
}

function rng(seed){let x=(seed>>>0)||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%1000000)/1000000};}
function shuffled(cards,seed){const out=[...cards],random=rng(seed);for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out;}
function laneState(){return {units:[],supports:[]};}
function participant(deck){return {core:STARTING_CORE,deck,hand:[],discard:[],resources:{command:0,insight:0,essence:0},lanes:[laneState(),laneState(),laneState()],mulliganUsed:false,turnNumber:0,lanePlays:[0,0,0],corePreventionUsed:[0,0,0],fatigue:0,repeatedUsed:{},delayed:[],carry:{command:0,insight:0,essence:0}};}
function sideStats(){return {coreDamageDealt:0,coreDamageTaken:0,damagePrevented:0,unitsDestroyed:0,unitsLost:0,cardsPlayed:0,cardsDrawn:0,cardsDiscarded:0,fatigueDamage:0,largestLaneSwing:0,resourcesSpent:{command:0,insight:0,essence:0,total:0}};}
function addLog(state,message){state.log.unshift(message);state.log=state.log.slice(0,60);}
function emit(state,type,fields={},text=''){
  if(state.quiet)return null;
  /* `match-end` closes the stream. Nothing may be appended after it: the renderer
   * animates `unit-destroyed` and friends, and a trailing death animation after the
   * victory banner is a visible defect. See docs/engine-api.md §3.2. */
  if(state.phase==='ended'&&type!=='match-end')return null;
  const event={seq:state.eventSeq+1,round:state.round,turn:state.turnCount,type,side:null,lane:null,cardId:null,uid:null,amount:null,...fields,text:String(text||'')};
  state.eventSeq=event.seq;state.events.push(event);
  if(event.text)addLog(state,event.text);
  return event;
}
const who=side=>side==='player'?'Your':'Rival';
const actor=side=>side==='player'?'You':'Rival';

function draw(state,side,count=1,reason='turn'){
  const p=state.players[side];
  for(let i=0;i<count;i++){
    if(state.phase==='ended')return;
    const card=p.deck.shift();
    if(card){p.hand.push(card);state.stats[side].cardsDrawn+=1;emit(state,'draw',{side,cardId:card.id,amount:1,reason});continue;}
    p.fatigue+=1;
    emit(state,'fatigue',{side,amount:p.fatigue,reason},`${who(side)} doctrine is exhausted; fatigue deals ${p.fatigue} Core damage.`);
    dealCoreDamageMutable(state,side,p.fatigue,null,{source:'fatigue'});
  }
}
function discardCard(state,side,card,reason='effect'){const p=state.players[side];p.discard.push(card);if(state.phase==='ended')return;state.stats[side].cardsDiscarded+=1;emit(state,'discard',{side,cardId:card.id,reason});}
function gainResource(state,side,resource,amount,source){
  if(amount<=0)return 0;
  const p=state.players[side],before=p.resources[resource];
  p.resources[resource]=Math.min(RESOURCE_CEILING,before+amount);
  const gained=p.resources[resource]-before;
  if(gained>0)emit(state,'resource-gain',{side,resource,amount:gained,source},`${who(side)} ${source} generated ${gained} ${resource}.`);
  return gained;
}
function unitFor(state,card){state.uidCounter+=1;return {uid:`u${state.uidCounter}`,card,power:card.power,basePower:card.power,tempPower:0,tempHold:0,exhausted:true,stunned:false,stunSource:null,deployedTurn:state.turnCount,moved:false,triggerSuppressed:false,weaponBonus:0,weaponUsed:false,infected:false,conversions:0,convertedThisTurn:false,lastShift:0,automatedThisTurn:false};}
function supportFor(state,card){state.uidCounter+=1;return {uid:`s${state.uidCounter}`,card,disabled:false,disabledUntilRound:0,counters:0,faceDown:card.family==='Trap'};}
function strongest(units){return [...units].filter(alive).sort((a,b)=>b.power-a.power||cmp(a.uid,b.uid))[0]||null;}
function pruneDead(state,side,laneIndex){
  if(state.phase==='ended')return;
  const lane=state.players[side].lanes[laneIndex],dead=lane.units.filter(u=>!alive(u));
  if(!dead.length)return;
  for(const u of dead){
    state.players[side].discard.push(u.card);
    state.stats[side].unitsLost+=1;state.stats[other(side)].unitsDestroyed+=1;
    emit(state,'unit-destroyed',{side,lane:laneIndex,uid:u.uid,cardId:u.card.id},`${who(side)} ${u.card.name} was destroyed in ${LANE_NAMES[laneIndex]}.`);
  }
  lane.units=lane.units.filter(alive);
}
function recordCore(state){
  const entry={round:state.round,turn:state.turnCount,player:state.players.player.core,rival:state.players.rival.core};
  const history=state.stats.coreHistory,last=history[history.length-1];
  if(last&&last.round===entry.round&&last.turn===entry.turn){history[history.length-1]=entry;return;}
  history.push(entry);
}
function checkWinner(state){
  if(state.winner)return state;
  const p=state.players.player.core,r=state.players.rival.core;
  if(p>0&&r>0)return state;
  state.players.player.core=Math.max(0,p);state.players.rival.core=Math.max(0,r);
  state.phase='ended';state.winner=p<=0&&r<=0?'draw':r<=0?'player':'rival';state.active=null;
  state.endReason=state.endReason||'core';
  state.stats.rounds=state.round;recordCore(state);
  emit(state,'match-end',{winner:state.winner,reason:state.endReason,amount:state.round},state.winner==='draw'?'Both Cores collapsed. Draw.':`${state.winner==='player'?'Your':'Rival'} doctrine wins the match.`);
  return state;
}
function isDisabled(_state,support){return Boolean(support.disabled);}
const activeSupports=(state,side,family)=>{const out=[];for(let l=0;l<3;l++)for(const s of state.players[side].lanes[l].supports)if(s.card.family===family&&!isDisabled(state,s))out.push({support:s,lane:l});return out;};
const lawActive=state=>activeSupports(state,'player','Law').length>0||activeSupports(state,'rival','Law').length>0;
const virusAgainst=(state,side)=>activeSupports(state,other(side),'Virus').length>0;
function lawBlocks(state,side,trigger,context={}){
  if(!lawActive(state))return false;
  const p=state.players[side];
  if(p.repeatedUsed[trigger]){emit(state,'law-restricted',{side,...context,trigger},`Law limited ${who(side)} repeated ${trigger} ability to one trigger this turn.`);return true;}
  p.repeatedUsed[trigger]=1;return false;
}
/* Core armour, in one place. `cap` is the lane breach ceiling and is a property of the
 * lane being attacked, not a constant: an undefended lane has none (see armourBreach
 * callers in resolveCombat / projectLaneDamage). */
export function armourBreach(raw,{pierce=0,cap=MAX_LANE_BREACH}={}){
  if(raw<=0)return 0;
  const divisor=Math.max(1,CORE_ARMOUR_DIVISOR-pierce);
  return Math.min(Math.ceil(raw/divisor),Math.max(0,cap));
}
function dealCoreDamageMutable(state,defenderSide,amount,laneIndex,{effect=false,source='combat',pierce=0,cap=null}={}){
  if(amount<=0||state.phase==='ended')return 0;
  const defender=state.players[defenderSide],lane=Number.isInteger(laneIndex)?defender.lanes[laneIndex]:null;
  let incoming=amount;
  if(source==='combat'){
    incoming=armourBreach(amount,{pierce,cap:cap===null?MAX_LANE_BREACH+pierce:cap});
    const absorbed=amount-incoming;
    if(absorbed>0){state.stats[defenderSide].damagePrevented+=absorbed;emit(state,'damage-prevented',{side:defenderSide,lane:laneIndex??null,amount:absorbed,source:'Armour'});}
  }
  let dealt=incoming,prevented=0;
  if(lane){
    const defenses=lane.supports.filter(s=>s.card.family==='Defense'&&!isDisabled(state,s));
    const remaining=Math.max(0,defenses.length*2-defender.corePreventionUsed[laneIndex]);
    prevented=Math.min(incoming,remaining);
    defender.corePreventionUsed[laneIndex]+=prevented;
    dealt=incoming-prevented;
    if(prevented){
      state.stats[defenderSide].damagePrevented+=prevented;
      emit(state,'damage-prevented',{side:defenderSide,lane:laneIndex,amount:prevented,source:'Defense'},`${who(defenderSide)} Defense prevented ${prevented} Core damage in ${LANE_NAMES[laneIndex]}.`);
    }
    if(effect&&dealt>0){
      const reactionIndex=lane.supports.findIndex(s=>s.card.family==='Reaction'&&!isDisabled(state,s));
      if(reactionIndex>=0){
        const [reaction]=lane.supports.splice(reactionIndex,1);
        discardCard(state,defenderSide,reaction.card,'reaction');
        emit(state,'support-removed',{side:defenderSide,lane:laneIndex,cardId:reaction.card.id,reason:'reaction'});
        dealt=Math.max(0,dealt-1);
        state.stats[defenderSide].damagePrevented+=1;
        emit(state,'damage-prevented',{side:defenderSide,lane:laneIndex,cardId:reaction.card.id,amount:1,source:'Reaction'},`${who(defenderSide)} Reaction reduced an effect by 1 and restored 1 Insight.`);
        gainResource(state,defenderSide,'insight',1,'Reaction');
      }
    }
  }
  /* Clamp before the stats write, not after. Otherwise a 5-point hit on a 2-point Core
   * reports 5 taken against a Core that only had 2 to lose, and the defeat screen shows
   * `CORE 0 / CORE TAKEN 23`. `coreDamageTaken === STARTING_CORE - core` is a documented,
   * test-enforced invariant. */
  dealt=Math.min(dealt,defender.core);
  if(dealt>0){
    defender.core=Math.max(0,defender.core-dealt);
    state.stats[defenderSide].coreDamageTaken+=dealt;
    if(source==='fatigue')state.stats[defenderSide].fatigueDamage+=dealt;
    else state.stats[other(defenderSide)].coreDamageDealt+=dealt;
    emit(state,'core-damage',{side:defenderSide,lane:laneIndex??null,amount:dealt,source},source==='fatigue'?`${who(defenderSide)} Core took ${dealt} fatigue damage.`:`${who(defenderSide)} Core took ${dealt} damage in ${LANE_NAMES[laneIndex]}.`);
    if(defender.core<=0&&!state.endReason)state.endReason=source==='fatigue'?'fatigue':'core';
  }
  checkWinner(state);
  return dealt;
}

export function createMatch({playerDeck,rivalDeck,seed=1,shuffle=true,difficulty,playerDifficulty}={}){
  if(!Array.isArray(playerDeck)||!Array.isArray(rivalDeck)||playerDeck.length!==DECK_SIZE||rivalDeck.length!==DECK_SIZE)throw new Error(`Both decks must contain exactly ${DECK_SIZE} cards.`);
  let numericSeed=seed,codedDifficulty=null;
  if(typeof seed==='string'){const decoded=decodeSeed(seed);numericSeed=decoded.seed;codedDifficulty=decoded.difficulty;}
  numericSeed=Number(numericSeed)>>>0;
  const rivalTier=normalizeDifficulty(difficulty??codedDifficulty??DEFAULT_DIFFICULTY);
  const playerTier=normalizeDifficulty(playerDifficulty??rivalTier);
  const state={
    phase:'mulligan',active:'player',round:1,turnCount:1,winner:null,endReason:null,seed:numericSeed,
    difficulty:rivalTier,playerDifficulty:playerTier,seedCode:encodeSeed(numericSeed,rivalTier),
    uidCounter:0,eventSeq:0,log:[],events:[],
    stats:{player:sideStats(),rival:sideStats(),coreHistory:[],rounds:0},
    players:{player:participant(shuffle?shuffled(playerDeck,numericSeed):[...playerDeck]),rival:participant(shuffle?shuffled(rivalDeck,numericSeed+991):[...rivalDeck])}
  };
  recordCore(state);
  emit(state,'phase',{phase:'mulligan',side:'player'},'Opening hands drawn. Select any cards to mulligan, then begin the match.');
  draw(state,'player',OPENING_HAND,'opening');draw(state,'rival',OPENING_HAND,'opening');
  return state;
}

function performMulliganMutable(state,side,indices){
  const p=state.players[side];
  const chosen=[...new Set(indices)].filter(i=>Number.isInteger(i)&&i>=0&&i<p.hand.length).sort((a,b)=>b-a);
  const rejected=[];for(const index of chosen)rejected.unshift(p.hand.splice(index,1)[0]);
  p.deck.push(...rejected);
  emit(state,'mulligan',{side,amount:rejected.length});
  draw(state,side,rejected.length,'mulligan');
  p.mulliganUsed=true;
}
export function aiMulliganIndices(state,side='rival',tier){
  const config=TIERS[normalizeDifficulty(tier??state?.[side==='player'?'playerDifficulty':'difficulty'])];
  const hand=state.players[side].hand;
  if(config.mulliganMax===0)return [];
  const ranked=hand.map((c,i)=>({c,i})).filter(({c})=>totalCost(c)>=config.mulliganCost).sort((a,b)=>totalCost(b.c)-totalCost(a.c)||cmp(a.c.id,b.c.id)).slice(0,config.mulliganMax);
  const indices=ranked.map(({i})=>i);
  if(config.mulliganMax>2&&!hand.some(c=>ENTITY_FAMILIES.has(c.family))){
    for(const {i} of hand.map((c,i)=>({c,i})).sort((a,b)=>totalCost(b.c)-totalCost(a.c)||cmp(a.c.id,b.c.id)))if(indices.length<config.mulliganMax&&!indices.includes(i))indices.push(i);
  }
  return indices.sort((a,b)=>a-b);
}
function refreshMutable(state,side,{drawCard=true,drawCount=DRAW_PER_REFRESH}={}){
  const p=state.players[side];
  p.turnNumber+=1;
  p.resources=resourceCurve(p.turnNumber);
  /* A resource a Virus delayed to the end step is carried across the refill instead of
   * being overwritten by it. Without this the "delay" was a permanent confiscation —
   * strictly harsher than the card text. See docs/match-rules.md, Virus. */
  for(const k of RESOURCE_KEYS)if(p.carry[k]){p.resources[k]=Math.min(RESOURCE_CEILING,p.resources[k]+p.carry[k]);p.carry[k]=0;}
  p.lanePlays=[0,0,0];p.corePreventionUsed=[0,0,0];p.repeatedUsed={};
  for(let laneIndex=0;laneIndex<3;laneIndex++)for(const unit of p.lanes[laneIndex].units){
    unit.moved=false;unit.weaponUsed=false;unit.convertedThisTurn=false;unit.automatedThisTurn=false;
    /* A stunned unit stays exhausted through exactly one of its own refreshes, so an
     * opposing Trap or Disaster actually costs it an attack step. `triggerSuppressed`
     * is deliberately NOT cleared here: it is consumed by the next trigger it blocks. */
    if(unit.stunned){const source=unit.stunSource||'Trap';unit.stunned=false;unit.stunSource=null;emit(state,'keyword-note',{side,lane:laneIndex,uid:unit.uid,cardId:unit.card.id,keyword:'Exhausted',family:source},`${unit.card.name} was still exhausted and could not act this turn.`);}
    else unit.exhausted=false;
  }
  for(let laneIndex=0;laneIndex<3;laneIndex++)for(const unit of p.lanes[laneIndex].units){
    const restored=Math.min(REGROUP_RECOVERY,unit.basePower+unit.tempPower-unit.power);
    if(restored>0){unit.power+=restored;emit(state,'power-change',{side,lane:laneIndex,uid:unit.uid,cardId:unit.card.id,amount:restored,source:'regroup'});}
  }
  for(const lane of p.lanes)for(const support of lane.supports){if(support.disabledUntilRound&&support.disabledUntilRound<=state.round){support.disabled=false;support.disabledUntilRound=0;}}
  emit(state,'phase',{phase:'refresh',side});
  if(drawCard&&drawCount>0)draw(state,side,drawCount,'refresh');
  if(state.phase==='ended')return;
  const virus=virusAgainst(state,side);let delayedUsed=false;
  for(let laneIndex=0;laneIndex<3;laneIndex++){
    const lane=p.lanes[laneIndex],bases=lane.supports.filter(s=>s.card.family==='Base'&&!isDisabled(state,s));
    for(const base of bases){
      if(lawBlocks(state,side,'Base',{lane:laneIndex,cardId:base.card.id}))continue;
      const cards=[...lane.units.map(u=>u.card),...lane.supports.filter(s=>s!==base).map(s=>s.card)];
      const sums={command:0,insight:0,essence:0};for(const c of cards)for(const k of RESOURCE_KEYS)sums[k]+=c.cost?.[k]||0;
      const dominant=RESOURCE_KEYS.slice().sort((a,b)=>sums[b]-sums[a]||RESOURCE_KEYS.indexOf(a)-RESOURCE_KEYS.indexOf(b))[0];
      if(virus&&!delayedUsed){
        delayedUsed=true;p.delayed.push({trigger:'Base',lane:laneIndex,cardId:base.card.id,resource:dominant,amount:1});
        emit(state,'virus-delay',{side,lane:laneIndex,cardId:base.card.id,trigger:'Base',resource:dominant},`A hostile Virus delayed ${who(side)} Base generation in ${LANE_NAMES[laneIndex]} to the end step.`);
        continue;
      }
      gainResource(state,side,dominant,1,'Base');
    }
    for(const unit of lane.units.filter(alive)){
      if(unit.card.family==='Deity')deityConvertMutable(state,side,laneIndex,unit);
      if(unit.card.family==='Android'&&unit.lastShift&&!unit.automatedThisTurn){
        unit.automatedThisTurn=true;
        if(virus&&!delayedUsed){delayedUsed=true;p.delayed.push({trigger:'Android',lane:laneIndex,uid:unit.uid,cardId:unit.card.id});emit(state,'virus-delay',{side,lane:laneIndex,uid:unit.uid,cardId:unit.card.id,trigger:'Android'},`A hostile Virus delayed ${unit.card.name}'s automation to the end step.`);continue;}
        androidAutomateMutable(state,side,laneIndex,unit);
      }
    }
  }
}
/* "…prevent its next triggered ability." A unit's triggered abilities in this engine are
 * its on-deploy family rule (suppressed inline in triggerDeployMutable), the Deity
 * conversion, the Android automation, the Warrior shift and the Weapon attack trigger.
 * The flag is consumed by whichever fires first, so a Trap is never a no-op. */
function suppressedTrigger(state,side,laneIndex,unit,trigger){
  if(!unit.triggerSuppressed)return false;
  unit.triggerSuppressed=false;
  emit(state,'keyword-note',{side,lane:laneIndex,uid:unit.uid,cardId:unit.card.id,keyword:'Suppressed',family:'Trap',trigger},`A Trap suppressed ${unit.card.name}'s ${trigger} trigger.`);
  return true;
}
function deityConvertMutable(state,side,laneIndex,unit){
  const p=state.players[side];
  if(unit.convertedThisTurn)return;
  if(suppressedTrigger(state,side,laneIndex,unit,'Deity'))return;
  const order=RESOURCE_KEYS.slice().sort((a,b)=>p.resources[b]-p.resources[a]||RESOURCE_KEYS.indexOf(a)-RESOURCE_KEYS.indexOf(b));
  const from=order[0],to=order[order.length-1];
  if(p.resources[from]<1||p.resources[from]-p.resources[to]<2)return;
  p.resources[from]-=1;p.resources[to]+=1;unit.convertedThisTurn=true;unit.conversions+=1;
  emit(state,'deity-convert',{side,lane:laneIndex,uid:unit.uid,cardId:unit.card.id,from,to,amount:1,count:unit.conversions},`${unit.card.name} converted 1 ${from} into 1 ${to}.`);
  if(unit.conversions===3){unit.power+=2;unit.basePower+=2;emit(state,'power-change',{side,lane:laneIndex,uid:unit.uid,cardId:unit.card.id,amount:2,source:'Deity'},`${unit.card.name} was empowered by +2 after its third conversion.`);}
}
function androidAutomateMutable(state,side,laneIndex,unit){
  const p=state.players[side],target=laneIndex+unit.lastShift;
  if(target<0||target>2||p.lanes[target].units.length>=MAX_UNITS_PER_LANE)return;
  if(suppressedTrigger(state,side,laneIndex,unit,'Android'))return;
  p.lanes[laneIndex].units=p.lanes[laneIndex].units.filter(u=>u.uid!==unit.uid);
  unit.moved=true;unit.infected=false;p.lanes[target].units.push(unit);
  emit(state,'android-automate',{side,lane:laneIndex,toLane:target,uid:unit.uid,cardId:unit.card.id},`${unit.card.name} repeated its lane transfer into ${LANE_NAMES[target]}.`);
}
function moveUnitMutable(state,side,fromLane,toLane,unit,source){
  const p=state.players[side];
  p.lanes[fromLane].units=p.lanes[fromLane].units.filter(u=>u.uid!==unit.uid);
  unit.moved=true;unit.infected=false;unit.lastShift=toLane-fromLane;p.lanes[toLane].units.push(unit);
  emit(state,'unit-moved',{side,lane:fromLane,toLane,uid:unit.uid,cardId:unit.card.id,source},`${unit.card.name} ${source==='Warrior'?'shifted':'repositioned'} from ${LANE_NAMES[fromLane]} to ${LANE_NAMES[toLane]}.`);
}
function flushDelayedMutable(state,side){
  const p=state.players[side];if(!p.delayed.length)return;
  const queue=p.delayed;p.delayed=[];
  for(const entry of queue){
    if(entry.trigger==='Base'){
      const gained=gainResource(state,side,entry.resource,entry.amount,'Base');
      /* Granted at the end step as the card text says, and carried across the next
       * refill so the delay costs a turn of tempo rather than the resource itself. */
      if(gained>0)p.carry[entry.resource]+=gained;
    }
    else if(entry.trigger==='Android'){
      for(let l=0;l<3;l++){const unit=p.lanes[l].units.find(u=>u.uid===entry.uid);if(unit&&alive(unit))androidAutomateMutable(state,side,l,unit);}
    }
  }
}

export function mulligan(state,side='player',indices=[]){
  if(state.phase!=='mulligan'||side!=='player'||state.players[side].mulliganUsed)throw new Error('Mulligan is no longer available.');
  const next=clone(state);performMulliganMutable(next,'player',indices);
  performMulliganMutable(next,'rival',aiMulliganIndices(next,'rival'));
  /* Both seats draw DRAW_PER_REFRESH on every refresh, the opening one included.
   * The old `DRAW_PER_REFRESH - 1` was "on-the-play compensation" for a tempo advantage
   * that deployment fatigue (§4.2) had already removed — a turn-1 unit cannot attack
   * until turn 2 from either seat — so the player paid the tax and got no tempo. */
  next.phase='main';next.active='player';refreshMutable(next,'player',{drawCount:DRAW_PER_REFRESH});
  emit(next,'phase',{phase:'main',side:'player'},indices.length?`${actor('player')} replaced ${indices.length} opening card${indices.length===1?'':'s'}.`:'You kept your opening hand.');
  return next;
}

export function effectiveCost(state,side,card,laneIndex){
  const cost={command:card.cost.command,insight:card.cost.insight,essence:card.cost.essence};
  const envActive=['player','rival'].some(owner=>state.players[owner].lanes[laneIndex]?.supports.some(s=>s.card.family==='Environment'&&!isDisabled(state,s)));
  if(envActive&&state.players[side].lanePlays[laneIndex]===0){
    const keys=RESOURCE_KEYS.filter(k=>cost[k]>0).sort((a,b)=>cost[b]-cost[a]||RESOURCE_KEYS.indexOf(a)-RESOURCE_KEYS.indexOf(b));
    if(keys[0])cost[keys[0]]-=1;
  }
  return cost;
}

export function getPlayability(state,side,handIndex,laneIndex){
  if(state.phase!=='main')return {ok:false,reason:'Match is not in the main phase.'};
  if(state.active!==side)return {ok:false,reason:'It is not this side’s turn.'};
  const p=state.players[side],card=p.hand[handIndex];if(!card)return {ok:false,reason:'Select a card from hand.'};
  if(!Number.isInteger(laneIndex)||laneIndex<0||laneIndex>2)return {ok:false,reason:'Choose a legal lane.'};
  const lane=p.lanes[laneIndex];
  if(ENTITY_FAMILIES.has(card.family)&&lane.units.length>=MAX_UNITS_PER_LANE)return {ok:false,reason:'That lane is full.'};
  if(SUPPORT_FAMILIES.has(card.family)&&lane.supports.length>=MAX_SUPPORTS_PER_LANE)return {ok:false,reason:'That lane has no support slots.'};
  if(['Item','Action','Weapon'].includes(card.family)&&lane.units.length===0)return {ok:false,reason:'That card needs a friendly unit in the lane.'};
  if(card.family==='Hex'&&state.players[other(side)].lanes[laneIndex].units.length===0)return {ok:false,reason:'Hex needs an opposing unit in the lane.'};
  const cost=effectiveCost(state,side,card,laneIndex);
  for(const k of RESOURCE_KEYS)if(p.resources[k]<cost[k])return {ok:false,reason:`Not enough ${k}.`,cost};
  return {ok:true,cost};
}

function triggerDeployMutable(state,side,laneIndex,unit){
  const enemySide=other(side),enemy=state.players[enemySide],enemyLane=enemy.lanes[laneIndex],card=unit.card;
  const trapIndex=enemyLane.supports.findIndex(s=>s.card.family==='Trap'&&!isDisabled(state,s));
  if(trapIndex>=0){
    const [trap]=enemyLane.supports.splice(trapIndex,1);
    discardCard(state,enemySide,trap.card,'trap');
    /* Under deployment fatigue every arriving unit is already exhausted, so setting the
     * flag was a no-op its own next refresh would clear. The Trap now stuns it — it stays
     * exhausted through one refresh, costing it an attack step — and arms
     * `triggerSuppressed`, which is consumed by its next triggered ability. Against a
     * family with no deploy trigger the Trap is therefore still a real tempo card. */
    unit.exhausted=true;unit.stunned=true;unit.stunSource='Trap';unit.triggerSuppressed=true;
    emit(state,'trap-sprung',{side:enemySide,lane:laneIndex,cardId:trap.card.id,uid:unit.uid,targetCardId:card.id},`${who(enemySide)} Trap held ${card.name} exhausted through its next refresh and suppressed its next trigger.`);
    return;
  }
  if(card.family==='Specimen'&&enemyLane.units.length){
    unit.power+=1;unit.tempPower+=1;unit.tempHold=1;
    emit(state,'deploy-trigger',{side,lane:laneIndex,uid:unit.uid,cardId:card.id,trigger:'Specimen',amount:1},`${card.name} adapted for +1 power this turn.`);
    emit(state,'power-change',{side,lane:laneIndex,uid:unit.uid,cardId:card.id,amount:1,source:'Specimen'});
  }
  if(card.family==='Monster'&&enemyLane.units.length&&unit.power>Math.max(...enemyLane.units.map(u=>u.power))){
    emit(state,'deploy-trigger',{side,lane:laneIndex,uid:unit.uid,cardId:card.id,trigger:'Monster',amount:1},`${card.name} pressured the Core on deployment.`);
    dealCoreDamageMutable(state,enemySide,1,laneIndex,{effect:true,source:'Monster'});
  }
  if(card.family==='Magician'){
    const p=state.players[side];
    emit(state,'deploy-trigger',{side,lane:laneIndex,uid:unit.uid,cardId:card.id,trigger:'Magician',amount:2},`${card.name} inspected the next two doctrine cards.`);
    draw(state,side,1,'Magician');
    const bottom=p.deck.shift();if(bottom)p.deck.push(bottom);
  }
  if(card.family==='Dragon'){
    for(const support of enemyLane.supports.filter(s=>INFRA_FAMILIES.has(s.card.family))){support.disabled=true;support.disabledUntilRound=state.round+1;emit(state,'support-disabled',{side:enemySide,lane:laneIndex,cardId:support.card.id,untilRound:state.round+1});}
    emit(state,'deploy-trigger',{side,lane:laneIndex,uid:unit.uid,cardId:card.id,trigger:'Dragon'},`${card.name} disabled opposing infrastructure in ${LANE_NAMES[laneIndex]} until the next refresh.`);
  }
  if(INERT_FAMILIES[card.family])emit(state,'keyword-note',{side,lane:laneIndex,uid:unit.uid,cardId:card.id,keyword:card.keywords?.[0]||null,family:card.family},`${card.name} recorded its ${INERT_FAMILIES[card.family]}; undefined keyword numerics remain informational.`);
}
function maybeRepositionMutable(state,side,laneIndex,unit){
  const p=state.players[side],options=[laneIndex-1,laneIndex+1].filter(i=>i>=0&&i<3&&p.lanes[i].units.length<MAX_UNITS_PER_LANE);
  if(!options.length)return laneIndex;
  const targetLane=options.sort((a,b)=>p.lanes[a].units.length-p.lanes[b].units.length||a-b)[0];
  if(p.lanes[targetLane].units.length+1>=p.lanes[laneIndex].units.length)return laneIndex;
  moveUnitMutable(state,side,laneIndex,targetLane,unit,'Action');
  return targetLane;
}
/* Prefer a unit that can still act. `strongest` alone routinely put an Item's or an
 * Action's bonus on a unit deployed this turn, which cannot attack with it. Falls back
 * to the strongest unit overall when the whole lane is exhausted, and then holds the
 * buff for a turn so it is not simply thrown away. */
function strongestReady(units){
  const live=units.filter(alive),ready=live.filter(u=>!u.exhausted);
  return strongest(ready.length?ready:live);
}
function buffStrongestMutable(state,side,laneIndex,amount,source,cardId){
  const target=strongestReady(state.players[side].lanes[laneIndex].units);
  if(!target||amount<=0)return null;
  target.power+=amount;target.tempPower+=amount;
  if(target.exhausted)target.tempHold=Math.max(target.tempHold||0,1);
  emit(state,'power-change',{side,lane:laneIndex,uid:target.uid,cardId:target.card.id,amount,source,sourceCardId:cardId||null},`${source} granted ${target.card.name} +${amount} power this turn.`);
  return target;
}
function resolveImmediateMutable(state,side,laneIndex,card){
  const p=state.players[side],enemy=state.players[other(side)],lane=p.lanes[laneIndex];
  if(card.family==='Action'){const target=buffStrongestMutable(state,side,laneIndex,2,card.name,card.id);if(target)maybeRepositionMutable(state,side,laneIndex,target);}
  else if(card.family==='Item')buffStrongestMutable(state,side,laneIndex,1,card.name,card.id);
  else if(card.family==='Disaster'){
    for(let i=0;i<3;i++){
      const target=strongest(enemy.lanes[i].units);
      if(!target)continue;
      target.power-=1;
      emit(state,'power-change',{side:other(side),lane:i,uid:target.uid,cardId:target.card.id,amount:-1,source:'Disaster',sourceCardId:card.id});
      /* Exhaustion clears at the victim's refresh, which always precedes the victim's
       * combat, so a bare `exhausted = true` here could never cost anyone an attack.
       * Stunning does: the survivor stays exhausted through one of its own refreshes. */
      if(target.power>0){target.exhausted=true;target.stunned=true;target.stunSource='Disaster';}
      pruneDead(state,other(side),i);
    }
    emit(state,'keyword-note',{side,lane:laneIndex,cardId:card.id,family:'Disaster'},`${card.name} dealt the minimum deterministic 1 damage to each lane’s highest-power enemy and held survivors exhausted through their next refresh.`);
  }
  else if(card.family==='Spell'){
    const target=strongest(enemy.lanes[laneIndex].units)||strongest(lane.units);
    emit(state,'spell-resolve',{side,lane:laneIndex,cardId:card.id,targetCardId:target?.card.id||null,uid:target?.uid||null,keyword:card.keywords?.[0]||null},`${card.name} applied ${card.keywords?.[0]||'its primary keyword'} twice to ${target?target.card.name:'no legal target'}.`);
    if(target)gainResource(state,side,'insight',1,'Spell');
  }
  discardCard(state,side,card,'resolved');
}
function installSupportMutable(state,side,laneIndex,card){
  const p=state.players[side],enemy=state.players[other(side)],lane=p.lanes[laneIndex],support=supportFor(state,card);
  if(card.family==='Weapon'){const target=strongest(lane.units);if(target){target.weaponBonus+=2;support.attachedUid=target.uid;emit(state,'power-change',{side,lane:laneIndex,uid:target.uid,cardId:target.card.id,amount:2,source:'Weapon',sourceCardId:card.id});}}
  if(card.family==='Hex'){const target=strongest(enemy.lanes[laneIndex].units);if(target)support.attachedEnemyUid=target.uid;}
  if(card.family==='Plague')for(const unit of enemy.lanes[laneIndex].units){unit.infected=true;emit(state,'keyword-note',{side:other(side),lane:laneIndex,uid:unit.uid,cardId:unit.card.id,keyword:'Infected',family:'Plague'});}
  if(card.family==='Response')support.pending=true;
  if(INERT_FAMILIES[card.family])emit(state,'keyword-note',{side,lane:laneIndex,uid:support.uid,cardId:card.id,keyword:card.keywords?.[0]||null,family:card.family},`${card.name} recorded its ${INERT_FAMILIES[card.family]}; undefined keyword numerics remain informational.`);
  lane.supports.push(support);
}
const RESPONSE_COPY={Action:2,Weapon:2};
function responseCopyMutable(state,side,laneIndex,card){
  const lane=state.players[side].lanes[laneIndex];
  const index=lane.supports.findIndex(s=>s.card.family==='Response'&&s.pending&&!isDisabled(state,s));
  if(index<0)return;
  const value=RESPONSE_COPY[card.family];
  if(!value)return;
  const half=Math.floor(value/2);
  const [response]=lane.supports.splice(index,1);
  discardCard(state,side,response.card,'response');
  emit(state,'support-removed',{side,lane:laneIndex,cardId:response.card.id,reason:'response'});
  emit(state,'response-copy',{side,lane:laneIndex,cardId:response.card.id,sourceCardId:card.id,amount:half},`${response.card.name} copied ${card.name} at half value (+${half}).`);
  if(half<=0)return;
  if(card.family==='Weapon'){const target=strongest(lane.units);if(target){target.weaponBonus+=half;emit(state,'power-change',{side,lane:laneIndex,uid:target.uid,cardId:target.card.id,amount:half,source:'Response',sourceCardId:response.card.id});}}
  else buffStrongestMutable(state,side,laneIndex,half,response.card.name,response.card.id);
}

export function playCard(state,side,handIndex,laneIndex){
  const check=getPlayability(state,side,handIndex,laneIndex);if(!check.ok)throw new Error(check.reason);
  const next=clone(state),p=next.players[side],card=p.hand[handIndex],cost=effectiveCost(next,side,card,laneIndex);
  for(const k of RESOURCE_KEYS)p.resources[k]-=cost[k];
  const spent=cost.command+cost.insight+cost.essence;
  const stats=next.stats[side];
  for(const k of RESOURCE_KEYS)stats.resourcesSpent[k]+=cost[k];
  stats.resourcesSpent.total+=spent;stats.cardsPlayed+=1;
  p.hand.splice(handIndex,1);p.lanePlays[laneIndex]+=1;
  emit(next,'play',{side,lane:laneIndex,cardId:card.id,family:card.family,cost,amount:spent},`${actor(side)} played ${card.name} into ${LANE_NAMES[laneIndex]}.`);
  emit(next,'resource-spend',{side,lane:laneIndex,cardId:card.id,cost,amount:spent});
  if(ENTITY_FAMILIES.has(card.family)){const unit=unitFor(next,card);p.lanes[laneIndex].units.push(unit);triggerDeployMutable(next,side,laneIndex,unit);}
  else if(SUPPORT_FAMILIES.has(card.family))installSupportMutable(next,side,laneIndex,card);
  else resolveImmediateMutable(next,side,laneIndex,card);
  if(card.family!=='Response')responseCopyMutable(next,side,laneIndex,card);
  checkWinner(next);return next;
}

function combatValue(unit,attacking){return Math.max(0,unit.power+(attacking&&!unit.weaponUsed?unit.weaponBonus:0));}
/* The lane breach ceiling is a property of the lane, not a constant. A lane nobody is
 * defending has no ceiling — only the armour divisor stands between raw power and the
 * Core — while a lane with a living defender keeps one. When `MAX_LANE_BREACH` was a flat
 * constant, a lane defended by 0 power and a lane defended by 20 both yielded at most 3,
 * so abandoning two lanes and stacking one cost 0.3pp and lane choice was not a decision. */
function laneBreachCap(defenderLane,pierce=0){
  return defenderLane.units.some(alive)?MAX_LANE_BREACH+pierce:Infinity;
}
function finishAttackMutable(state,side,unit,laneIndex=null){
  const weaponTriggered=unit.weaponBonus>0&&!unit.weaponUsed&&unit.moved;
  unit.weaponUsed=true;
  if(!weaponTriggered)return;
  if(suppressedTrigger(state,side,laneIndex,unit,'Weapon'))return;
  if(lawBlocks(state,side,'Weapon',{uid:unit.uid,cardId:unit.card.id}))return;
  const p=state.players[side];draw(state,side,1,'Weapon');
  if(state.phase==='ended')return;
  if(p.hand.length){
    let discardIndex=0;
    for(let i=1;i<p.hand.length;i++)if(totalCost(p.hand[i])>totalCost(p.hand[discardIndex])||(totalCost(p.hand[i])===totalCost(p.hand[discardIndex])&&cmp(p.hand[i].id,p.hand[discardIndex].id)>0))discardIndex=i;
    const [discarded]=p.hand.splice(discardIndex,1);
    discardCard(state,side,discarded,'Weapon');
    emit(state,'keyword-note',{side,uid:unit.uid,cardId:unit.card.id,keyword:'Weapon',family:'Weapon'},`${unit.card.name}'s Weapon trigger drew 1 card, then discarded ${discarded.name}.`);
  }
}
/* A temporary buff granted to a unit that could not attack this turn (a unit deployed
 * this turn, or one held exhausted) is held through one end step instead of expiring
 * unused. Without this, Specimen's on-deploy +1 was structurally impossible to use:
 * it deploys exhausted, so it cannot attack with the buff, and the buff expired at its
 * own controller's end step, so it could not defend with it either. */
function expireTempsMutable(state,side){for(let i=0;i<3;i++){for(const unit of state.players[side].lanes[i].units){if(!unit.tempPower)continue;if(unit.tempHold>0){unit.tempHold-=1;continue;}unit.power-=unit.tempPower;emit(state,'power-change',{side,lane:i,uid:unit.uid,cardId:unit.card.id,amount:-unit.tempPower,source:'expire'});unit.tempPower=0;}pruneDead(state,side,i);}}
function plagueStepMutable(state){for(const side of ['player','rival'])for(let i=0;i<3;i++){for(const unit of state.players[side].lanes[i].units){if(unit.infected){if(unit.moved)unit.infected=false;else {unit.power-=1;unit.basePower-=1;emit(state,'power-change',{side,lane:i,uid:unit.uid,cardId:unit.card.id,amount:-1,source:'Plague'});}}}pruneDead(state,side,i);}}
function ritualStepMutable(state){
  for(const side of ['player','rival'])for(let laneIndex=0;laneIndex<3;laneIndex++){
    const lane=state.players[side].lanes[laneIndex];
    for(const support of [...lane.supports]){
      if(support.card.family!=='Ritual'||support.ready)continue;
      if(lawBlocks(state,side,'Ritual',{lane:laneIndex,cardId:support.card.id}))continue;
      support.counters=Math.min(3,(support.counters||0)+1);
      emit(state,'ritual-charge',{side,lane:laneIndex,cardId:support.card.id,amount:support.counters});
      if(support.counters===3){
        support.ready=true;
        lane.supports=lane.supports.filter(s=>s.uid!==support.uid);
        discardCard(state,side,support.card,'ritual');
        emit(state,'ritual-resolve',{side,lane:laneIndex,cardId:support.card.id},`${support.card.name} reached Channel 3 and resolved across friendly lanes; its undefined division effect adds no invented value.`);
      }
    }
  }
}
function autoShiftWarriorsMutable(state,side){
  const p=state.players[side];
  for(let source=0;source<3;source++){
    const warriors=[...p.lanes[source].units].filter(u=>u.card.family==='Warrior'&&alive(u)&&!u.moved);
    for(const unit of warriors){
      const options=[source-1,source+1].filter(i=>i>=0&&i<3&&p.lanes[i].units.length<MAX_UNITS_PER_LANE);
      if(!options.length)continue;
      const target=options.sort((a,b)=>p.lanes[a].units.length-p.lanes[b].units.length||a-b)[0];
      if(p.lanes[target].units.length+1>=p.lanes[source].units.length)continue;
      if(suppressedTrigger(state,side,source,unit,'Warrior'))continue;
      moveUnitMutable(state,side,source,target,unit,'Warrior');
    }
  }
}

export function resolveCombat(state,attackerSide){
  const next=clone(state);if(next.phase==='ended')return next;
  const defenderSide=other(attackerSide),attacker=next.players[attackerSide],defender=next.players[defenderSide];
  emit(next,'phase',{phase:'combat',side:attackerSide});
  for(let laneIndex=0;laneIndex<3&&next.phase!=='ended';laneIndex++){
    const coreBefore=defender.core;
    const aLane=attacker.lanes[laneIndex],dLane=defender.lanes[laneIndex];
    const eligible=aLane.units.filter(u=>alive(u)&&!u.exhausted);
    if(eligible.length){
      const flyers=eligible.filter(u=>hasKeyword(u,'Flying'));
      const hasAirBlocker=dLane.units.some(u=>hasKeyword(u,'Flying')||hasKeyword(u,'Guard'));
      let fighters=eligible;
      if(flyers.length&&!hasAirBlocker){
        const airDamage=flyers.reduce((sum,u)=>sum+combatValue(u,true),0);
        for(const u of flyers)finishAttackMutable(next,attackerSide,u,laneIndex);
        emit(next,'combat-strike',{side:attackerSide,lane:laneIndex,amount:airDamage,kind:'air'});
        dealCoreDamageMutable(next,defenderSide,airDamage,laneIndex,{source:'combat',pierce:FLYING_ARMOUR_PIERCE,cap:laneBreachCap(dLane,FLYING_ARMOUR_PIERCE)});
        fighters=eligible.filter(u=>!flyers.some(f=>f.uid===u.uid));
        if(next.phase==='ended')break;
      }
      if(fighters.length){
        const defenders=dLane.units.filter(alive);
        if(defenders.length===0){
          const damage=fighters.reduce((sum,u)=>sum+combatValue(u,true),0);
          for(const u of fighters)finishAttackMutable(next,attackerSide,u,laneIndex);
          emit(next,'combat-strike',{side:attackerSide,lane:laneIndex,amount:damage,kind:'open'});
          dealCoreDamageMutable(next,defenderSide,damage,laneIndex,{source:'combat',cap:Infinity});
        }else{
          const orderedA=[...fighters].sort((a,b)=>combatValue(b,true)-combatValue(a,true)||cmp(a.uid,b.uid));
          const orderedD=[...defenders].sort((a,b)=>(hasKeyword(b,'Guard')?1:0)-(hasKeyword(a,'Guard')?1:0)||b.power-a.power||cmp(a.uid,b.uid));
          const dGuard=orderedD.some(u=>hasKeyword(u,'Guard')),aGuard=orderedA.some(u=>hasKeyword(u,'Guard'));let dGuardUsed=false,aGuardUsed=false;
          const paired=Math.min(orderedA.length,orderedD.length);
          for(let i=0;i<paired;i++){
            const a=orderedA[i],d=orderedD[i],aDamage=combatValue(a,true),dDamage=combatValue(d,false);
            let dealtToD=aDamage,dealtToA=dDamage;
            if(dGuard&&!dGuardUsed&&dealtToD>0){dealtToD=Math.max(0,dealtToD-1);dGuardUsed=true;next.stats[defenderSide].damagePrevented+=1;emit(next,'damage-prevented',{side:defenderSide,lane:laneIndex,uid:d.uid,cardId:d.card.id,amount:1,source:'Guard'});}
            if(aGuard&&!aGuardUsed&&dealtToA>0){dealtToA=Math.max(0,dealtToA-1);aGuardUsed=true;next.stats[attackerSide].damagePrevented+=1;emit(next,'damage-prevented',{side:attackerSide,lane:laneIndex,uid:a.uid,cardId:a.card.id,amount:1,source:'Guard'});}
            d.power-=dealtToD;a.power-=dealtToA;
            emit(next,'combat-clash',{side:attackerSide,lane:laneIndex,uid:a.uid,cardId:a.card.id,targetUid:d.uid,targetCardId:d.card.id,amount:dealtToD,taken:dealtToA});
            finishAttackMutable(next,attackerSide,a,laneIndex);
            if(next.phase==='ended')break;
          }
          pruneDead(next,attackerSide,laneIndex);pruneDead(next,defenderSide,laneIndex);
          if(defender.lanes[laneIndex].units.length===0){
            /* A broken lane pushes the surviving attackers' *remaining* power through,
             * not one point per body. The old `survivors.length` made winning a fight
             * strictly worse than the enemy not showing up (Σpower vs ≤3), so clearing a
             * lane was punished. Remaining power is naturally lower than the open-lane
             * raw — the defenders took their toll — and the contested cap still applies,
             * because the attackers had to fight through. */
            const survivors=attacker.lanes[laneIndex].units.filter(u=>fighters.some(f=>f.uid===u.uid)&&alive(u));
            const raw=survivors.reduce((sum,u)=>sum+Math.max(0,u.power),0);
            if(raw>0){emit(next,'combat-strike',{side:attackerSide,lane:laneIndex,amount:raw,kind:'breakthrough'});dealCoreDamageMutable(next,defenderSide,raw,laneIndex,{source:'combat',cap:MAX_LANE_BREACH});}
          }
        }
      }
    }
    const swing=coreBefore-defender.core;
    if(swing>next.stats[attackerSide].largestLaneSwing)next.stats[attackerSide].largestLaneSwing=swing;
  }
  /* The end step does not run once a Core has fallen. Running it unconditionally was the
   * other half of the trailing-event defect: it emitted power-change / unit-moved /
   * unit-destroyed after `match-end`. */
  if(next.phase!=='ended'){
    expireTempsMutable(next,attackerSide);plagueStepMutable(next);ritualStepMutable(next);flushDelayedMutable(next,attackerSide);autoShiftWarriorsMutable(next,attackerSide);
    emit(next,'phase',{phase:'end-step',side:attackerSide});
  }
  checkWinner(next);return next;
}

const TIERS={
  recruit:{maxPlays:2,minGain:0,coreWeight:1,unitWeight:1,threat:0,defensiveBias:1,lethalBonus:0,defenseLow:0.5,defenseHigh:0.5,handWeight:0,deckWeight:0,supportWeight:0,style:null,combatLook:0,replyLook:0,mulliganMax:0,mulliganCost:99},
  veteran:{maxPlays:4,minGain:0.25,coreWeight:1.6,unitWeight:1,threat:0.95,defensiveBias:1,lethalBonus:45,defenseLow:1.6,defenseHigh:0.8,handWeight:0.3,deckWeight:0.15,supportWeight:0.7,style:null,combatLook:0,replyLook:0,mulliganMax:2,mulliganCost:7},
  /* sovereign's unitWeight was 0.8 and threat 1.6. Under the lane-dependent breach
   * ceiling, board power converts to Core damage far more directly, so undervaluing
   * units relative to veteran cost the top tier its edge; measured seat-averaged
   * sovereign-over-veteran rose from 52.5% to 55.3% at unitWeight 1 / threat 2.2. */
  sovereign:{maxPlays:6,minGain:0.4,coreWeight:1.6,unitWeight:1,threat:2.2,defensiveBias:1.4,lethalBonus:140,defenseLow:3,defenseHigh:1,handWeight:1,deckWeight:0,supportWeight:1.2,style:{trap:1,disaster:1,plague:1,reaction:1,defense:1},combatLook:2,replyLook:1.5,mulliganMax:3,mulliganCost:6}
};
for(const profile of Object.values(TIERS))Object.freeze(profile);Object.freeze(TIERS);
export const AI_TIER_PROFILES=TIERS;
export function projectLaneDamage(state,attackerSide,laneIndex){
  const defenderSide=other(attackerSide);
  const attackers=state.players[attackerSide].lanes[laneIndex].units.filter(u=>alive(u)&&!u.exhausted);
  if(!attackers.length)return 0;
  const dLane=state.players[defenderSide].lanes[laneIndex],defenders=dLane.units.filter(alive);
  const flyers=attackers.filter(u=>hasKeyword(u,'Flying'));
  const blocked=defenders.some(u=>hasKeyword(u,'Flying')||hasKeyword(u,'Guard'));
  /* Mirrors resolveCombat exactly, including the lane-dependent breach ceiling. If this
   * drifts from the combat resolver the AI plans against a game it is not playing and the
   * UI's lane-danger badges lie. */
  let breach=0,ground=attackers;
  if(flyers.length&&!blocked){
    breach+=armourBreach(flyers.reduce((s,u)=>s+combatValue(u,true),0),{pierce:FLYING_ARMOUR_PIERCE,cap:laneBreachCap(dLane,FLYING_ARMOUR_PIERCE)});
    ground=attackers.filter(u=>!flyers.some(f=>f.uid===u.uid));
  }
  if(ground.length){
    if(!defenders.length)breach+=armourBreach(ground.reduce((s,u)=>s+combatValue(u,true),0),{cap:Infinity});
    else{
      const ap=ground.map(u=>combatValue(u,true)).sort((a,b)=>b-a),dp=defenders.map(u=>u.power).sort((a,b)=>b-a);
      const paired=Math.min(ap.length,dp.length);let kills=0,raw=0;
      for(let i=0;i<paired;i++){if(ap[i]>=dp[i])kills+=1;if(ap[i]>dp[i])raw+=ap[i]-dp[i];}
      for(let i=paired;i<ap.length;i++)raw+=ap[i];
      if(kills===dp.length)breach+=armourBreach(raw,{cap:MAX_LANE_BREACH});
    }
  }
  const prevention=Math.max(0,dLane.supports.filter(s=>s.card.family==='Defense'&&!isDisabled(state,s)).length*2-state.players[defenderSide].corePreventionUsed[laneIndex]);
  return Math.max(0,breach-prevention);
}
export function laneThreat(state,side){
  return LANE_NAMES.map((name,lane)=>({lane,name,outgoing:projectLaneDamage(state,side,lane),incoming:projectLaneDamage(state,other(side),lane)}));
}
/* Base value of a persistent support to whoever controls it.
 *
 * `boardEval` used to score only Core delta, unit power, lane threat and Defense count,
 * so every non-combat card evaluated to exactly 0, never cleared `minGain`, and was held
 * forever: across 300 sovereign matches the AI played zero Traps, Bases, Environments,
 * Laws, Rituals, Responses, Plagues or Viruses, including the ones sitting in its own
 * starter deck, and ten event types fired zero times.
 *
 * Families whose canon text this engine cannot implement (Hex, World) are deliberately
 * absent: they are inert, and an AI that paid a card for an inert effect would be worse,
 * not better. See docs/match-rules.md, "Families that are still deliberately inert". */
const SUPPORT_VALUE={Base:2.2,Trap:2,Ritual:1.6,Virus:1.6,Plague:1.4,Response:1.4,Reaction:1.2,Environment:1.2,Law:1.1};
function supportScore(state,side,cfg){
  if(!cfg.supportWeight)return 0;
  const me=state.players[side],foe=state.players[other(side)];
  let score=0;
  for(let lane=0;lane<3;lane++){
    for(const s of me.lanes[lane].supports){
      if(isDisabled(state,s))continue;
      const base=SUPPORT_VALUE[s.card.family];
      if(!base)continue;
      let value=base;
      /* Contextual, so the AI does not spend cards on supports that cannot pay off. */
      if(s.card.family==='Trap')value*=foe.hand.length>=1?1:0.25;
      else if(s.card.family==='Ritual')value*=1+(s.counters||0)*0.5;
      else if(s.card.family==='Plague')value*=Math.max(0.25,foe.lanes[lane].units.filter(u=>alive(u)&&u.infected).length);
      else if(s.card.family==='Environment')value*=me.lanePlays[lane]===0?1:0.5;
      /* A Response only has something to copy if an Action or Weapon is still to come. */
      else if(s.card.family==='Response')value*=me.lanes[lane].units.some(alive)?(me.hand.some(c=>c.family==='Action'||c.family==='Weapon')?1.4:0.6):0.2;
      else if(s.card.family==='Law')value*=me.lanes.some(l=>l.supports.some(x=>x.card.family==='Base'||x.card.family==='Ritual'))||foe.lanes.some(l=>l.supports.some(x=>x.card.family==='Base'||x.card.family==='Ritual'))?1.5:0.6;
      score+=value*cfg.supportWeight;
    }
    /* An opposing persistent support is a standing liability, which is what makes
     * Disaster-style answers and racing it worth scoring at all. */
    for(const s of foe.lanes[lane].supports){
      if(isDisabled(state,s))continue;
      score-=(SUPPORT_VALUE[s.card.family]||0)*cfg.supportWeight*0.6;
    }
  }
  return score;
}
function boardEval(state,side,cfg){
  const me=state.players[side],foe=state.players[other(side)];
  if(state.winner)return state.winner===side?100000:state.winner==='draw'?-5000:-100000;
  let score=(me.core-foe.core)*cfg.coreWeight;
  let out=0,inc=0;
  for(let lane=0;lane<3;lane++){
    const mine=me.lanes[lane].units.filter(alive),theirs=foe.lanes[lane].units.filter(alive);
    score+=mine.reduce((s,u)=>s+u.power+u.weaponBonus*0.5,0)*cfg.unitWeight;
    score-=theirs.reduce((s,u)=>s+u.power,0)*cfg.unitWeight;
    if(cfg.threat>0){
      const o=projectLaneDamage(state,side,lane),i=projectLaneDamage(state,other(side),lane);
      out+=o;inc+=i;
      score+=Math.min(o,foe.core)*cfg.threat;
      score-=Math.min(i,me.core)*cfg.threat*cfg.defensiveBias;
    }
    const defense=me.lanes[lane].supports.filter(s=>s.card.family==='Defense'&&!isDisabled(state,s)).length;
    score+=Math.min(defense,2)*(me.core<=10?cfg.defenseLow:cfg.defenseHigh);
  }
  if(cfg.lethalBonus>0){
    if(out>=foe.core)score+=cfg.lethalBonus;
    if(inc>=me.core)score-=cfg.lethalBonus*cfg.defensiveBias;
  }
  score+=supportScore(state,side,cfg);
  score+=me.hand.length*cfg.handWeight-foe.hand.length*cfg.handWeight*0.5;
  score+=Math.min(me.deck.length,8)*cfg.deckWeight;
  return score;
}
function styleBias(state,side,candidate,style){
  const me=state.players[side],foe=state.players[other(side)],card=me.hand[candidate.h];
  let bias=0;
  if(style.trap&&card.family==='Trap')bias+=(foe.hand.length>=2?1.5:-3)*style.trap;
  if(style.disaster&&card.family==='Disaster')bias+=(foe.lanes.filter(l=>l.units.some(alive)).length>=2?1.5:-3)*style.disaster;
  if(style.plague&&card.family==='Plague')bias+=(foe.lanes[candidate.lane].units.filter(alive).length>=2?1:-1.5)*style.plague;
  if(style.reaction&&card.family==='Reaction')bias+=(foe.lanes[candidate.lane].units.some(u=>u.card.family==='Monster')?1:-1)*style.reaction;
  if(style.overcommit&&ENTITY_FAMILIES.has(card.family)&&foe.hand.length>0&&me.lanes[candidate.lane].units.filter(alive).length>=2)bias-=1.5*style.overcommit;
  if(style.defense&&card.family==='Defense'&&me.core<=8)bias+=2.5*style.defense;
  if(style.curve){const cost=totalCost(card),pool=RESOURCE_KEYS.reduce((s,k)=>s+me.resources[k],0);if(cost>0&&pool-cost>=cost)bias+=0.3*style.curve;}
  return bias;
}
function searchClone(state){const copy=clone(state);copy.events=[];copy.log=[];copy.quiet=true;return copy;}
/* The opponent's reply comes after their refresh, so the units they just deployed are
 * ready by then. Resolving their combat straight off the current position modelled every
 * fresh enemy unit as harmless and made the deepest tier blind to exactly the boards it
 * is supposed to see. Stunned units stay exhausted, matching refreshMutable. */
function readyForReply(state,side){
  const copy=searchClone(state);
  for(const lane of copy.players[side].lanes)for(const unit of lane.units)if(!unit.stunned)unit.exhausted=false;
  return copy;
}
function legalCandidates(state,side){
  const out=[],hand=state.players[side].hand;
  for(let h=0;h<hand.length;h++)for(let lane=0;lane<3;lane++)if(getPlayability(state,side,h,lane).ok)out.push({h,lane});
  return out;
}
export function planAiPlays(state,side,tier){
  const config=TIERS[normalizeDifficulty(tier??(side==='player'?state.playerDifficulty:state.difficulty))];
  let working=searchClone(state);
  const chosen=[];
  for(let step=0;step<config.maxPlays;step++){
    if(working.phase!=='main'||working.active!==side)break;
    const candidates=legalCandidates(working,side);if(!candidates.length)break;
    const score1=position=>{
      let value=boardEval(position,side,config);
      if(config.combatLook&&!position.winner){
        const mine=resolveCombat(position,side);
        value+=config.combatLook*boardEval(mine,side,config);
        if(config.replyLook&&!mine.winner)value+=config.replyLook*boardEval(resolveCombat(readyForReply(mine,other(side)),other(side)),side,config);
      }
      return value;
    };
    const base=score1(working);
    let best=null;
    for(const candidate of candidates){
      const after=playCard(working,side,candidate.h,candidate.lane);
      let score=score1(after)-base;
      if(config.style)score+=styleBias(working,side,candidate,config.style);
      if(!best||score>best.score||(score===best.score&&(candidate.h<best.h||(candidate.h===best.h&&candidate.lane<best.lane))))best={...candidate,score,after};
    }
    if(!best||best.score<config.minGain)break;
    chosen.push({handIndex:best.h,laneIndex:best.lane,score:best.score});
    working=best.after;
  }
  return chosen;
}
export function aiTakeMainPhase(state,side='rival',tier){
  let next=state;
  for(const play of planAiPlays(next,side,tier)){
    if(next.phase!=='main'||next.active!==side)break;
    if(!getPlayability(next,side,play.handIndex,play.laneIndex).ok)break;
    next=playCard(next,side,play.handIndex,play.laneIndex);
  }
  return next;
}
function runAiMainMutable(state){const next=aiTakeMainPhase(state,'rival');if(next!==state)Object.assign(state,next);}

export function completePlayerTurn(state){
  if(state.phase!=='main'||state.active!=='player')throw new Error('Player turn is not ready to complete.');
  let next=resolveCombat(state,'player');if(next.phase==='ended')return next;
  /* On the draw. Acting second is a measurable disadvantage — the side that acts first
   * always swings first in the round that reaches lethal — so the second seat draws one
   * extra card at its first refresh. This is the same one-card compensation the engine
   * always intended, moved to the seat that is actually behind: it used to be levied as
   * a *penalty* on the first seat's opening refresh, which left the human on 6 cards
   * against the rival's 7 and was justified in the docs by an on-the-play tempo edge
   * that deployment fatigue had already removed. Measured on mirror decks, symmetric
   * draws put the first seat at 62-72%; with this rule both seats land near 50%. */
  next.active='rival';next.turnCount+=1;
  refreshMutable(next,'rival',{drawCard:true,drawCount:DRAW_PER_REFRESH+(next.players.rival.turnNumber===0?1:0)});
  if(next.phase==='ended')return checkWinner(next);
  emit(next,'phase',{phase:'main',side:'rival'},'Rival main phase began.');
  runAiMainMutable(next);
  next=resolveCombat(next,'rival');if(next.phase==='ended')return next;
  next.round+=1;next.turnCount+=1;next.active='player';next.stats.rounds=next.round;recordCore(next);
  refreshMutable(next,'player',{drawCard:true});
  if(next.phase==='ended')return checkWinner(next);
  next.phase='main';
  emit(next,'phase',{phase:'main',side:'player'},`Round ${next.round}: your main phase began.`);
  return next;
}

export function simulateMatch({playerDeck,rivalDeck,seed=1,shuffle=true,difficulty,playerDifficulty,maxRounds=120}={}){
  let state=createMatch({playerDeck,rivalDeck,seed,shuffle,difficulty,playerDifficulty});
  state=mulligan(state,'player',aiMulliganIndices(state,'player'));
  let rounds=0;
  while(state.phase!=='ended'&&rounds<maxRounds){
    state=aiTakeMainPhase(state,'player');
    if(state.phase==='ended')break;
    state=completePlayerTurn(state);
    rounds+=1;
  }
  const timedOut=state.phase!=='ended';
  return {state,winner:state.winner,rounds:state.round,turns:state.turnCount,reason:timedOut?'timeout':state.endReason||'core',stats:state.stats,timedOut};
}
