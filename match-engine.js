export const DECK_SIZE=30;
export const STARTING_CORE=20;
export const OPENING_HAND=5;
export const MAX_UNITS_PER_LANE=3;
export const MAX_SUPPORTS_PER_LANE=4;
export const LANE_NAMES=['Vanguard','Conduit','Flank'];

export const ENTITY_FAMILIES=new Set(['Specimen','Monster','Knight','Warrior','Magician','Operative','Dragon','Deity','Android','God','Ruler']);
const SUPPORT_FAMILIES=new Set(['Weapon','Environment','Defense','Base','Trap','Reaction','Response','Law','Hex','Plague','Virus','Ritual','World']);
const INFRA_FAMILIES=new Set(['Defense','Base']);
const clone=value=>structuredClone(value);
const other=side=>side==='player'?'rival':'player';
const totalCost=card=>card.cost.command+card.cost.insight+card.cost.essence;
const hasKeyword=(thing,keyword)=>thing?.card?.keywords?.includes(keyword)||thing?.keywords?.includes(keyword)||thing?.card?.family===keyword||thing?.family===keyword||String(thing?.card?.rulesText||thing?.rulesText||'').includes(keyword);
const alive=unit=>unit.power>0;

export function resourceCurve(turn){
  const t=Math.max(1,Number(turn)||1);
  const base=Math.min(8,t+1);
  return {command:base,insight:base,essence:base};
}

function rng(seed){let x=(seed>>>0)||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%1000000)/1000000};}
function shuffled(cards,seed){const out=[...cards],random=rng(seed);for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out;}
function laneState(){return {units:[],supports:[]};}
function participant(deck){return {core:STARTING_CORE,deck,hand:[],discard:[],resources:{command:0,insight:0,essence:0},lanes:[laneState(),laneState(),laneState()],mulliganUsed:false,turnNumber:0,lanePlays:[0,0,0],corePreventionUsed:[0,0,0]};}
function addLog(state,message){state.log.unshift(message);state.log=state.log.slice(0,60);}
function draw(state,side,count=1){const p=state.players[side];for(let i=0;i<count;i++){const card=p.deck.shift();if(card)p.hand.push(card);} }
function unitFor(state,card){state.uidCounter+=1;return {uid:`u${state.uidCounter}`,card,power:card.power,basePower:card.power,tempPower:0,exhausted:false,moved:false,triggerSuppressed:false,weaponBonus:0,weaponUsed:false,infected:false};}
function supportFor(state,card){state.uidCounter+=1;return {uid:`s${state.uidCounter}`,card,disabled:false,disabledUntilRound:0,counters:0,faceDown:card.family==='Trap'};}
function strongest(units){return [...units].filter(alive).sort((a,b)=>b.power-a.power||a.uid.localeCompare(b.uid))[0]||null;}
function pruneDead(state,side,laneIndex){const lane=state.players[side].lanes[laneIndex],dead=lane.units.filter(u=>!alive(u));for(const u of dead)state.players[side].discard.push(u.card);lane.units=lane.units.filter(alive);}
function checkWinner(state){const p=state.players.player.core,r=state.players.rival.core;if(p<=0||r<=0){state.players.player.core=Math.max(0,p);state.players.rival.core=Math.max(0,r);state.phase='ended';state.winner=p<=0&&r<=0?'draw':r<=0?'player':'rival';state.active=null;addLog(state,state.winner==='draw'?'Both Cores collapsed. Draw.':`${state.winner==='player'?'Your':'Rival'} doctrine wins the match.`)}return state;}
function isDisabled(_state,support){return Boolean(support.disabled);}
function dealCoreDamageMutable(state,defenderSide,amount,laneIndex,{effect=false}={}){
  if(amount<=0||state.phase==='ended')return 0;
  const defender=state.players[defenderSide];
  const defenses=defender.lanes[laneIndex].supports.filter(s=>s.card.family==='Defense'&&!isDisabled(state,s));
  const capacity=defenses.length*2;
  const remaining=Math.max(0,capacity-defender.corePreventionUsed[laneIndex]);
  const prevented=Math.min(amount,remaining);
  defender.corePreventionUsed[laneIndex]+=prevented;
  let dealt=amount-prevented;
  if(effect&&dealt>0){
    const reactionLane=defender.lanes[laneIndex];
    const reactionIndex=reactionLane.supports.findIndex(s=>s.card.family==='Reaction'&&!isDisabled(state,s));
    if(reactionIndex>=0){const [reaction]=reactionLane.supports.splice(reactionIndex,1);defender.discard.push(reaction.card);dealt=Math.max(0,dealt-1);defender.resources.insight=Math.min(10,defender.resources.insight+1);addLog(state,`${defenderSide==='player'?'Your':'Rival'} Reaction reduced an effect by 1 and restored 1 Insight.`)}
  }
  defender.core=Math.max(0,defender.core-dealt);
  if(prevented)addLog(state,`${defenderSide==='player'?'Your':'Rival'} Defense prevented ${prevented} Core damage in ${LANE_NAMES[laneIndex]}.`);
  if(dealt)addLog(state,`${defenderSide==='player'?'Your':'Rival'} Core took ${dealt} damage in ${LANE_NAMES[laneIndex]}.`);
  checkWinner(state);
  return dealt;
}

export function createMatch({playerDeck,rivalDeck,seed=1,shuffle=true}={}){
  if(!Array.isArray(playerDeck)||!Array.isArray(rivalDeck)||playerDeck.length!==DECK_SIZE||rivalDeck.length!==DECK_SIZE)throw new Error(`Both decks must contain exactly ${DECK_SIZE} cards.`);
  const state={phase:'mulligan',active:'player',round:1,turnCount:1,winner:null,seed,uidCounter:0,log:[],players:{player:participant(shuffle?shuffled(playerDeck,seed):[...playerDeck]),rival:participant(shuffle?shuffled(rivalDeck,seed+991):[...rivalDeck])}};
  draw(state,'player',OPENING_HAND);draw(state,'rival',OPENING_HAND);
  addLog(state,'Opening hands drawn. Select any cards to mulligan, then begin the match.');
  return state;
}

function performMulliganMutable(state,side,indices){
  const p=state.players[side];
  const chosen=[...new Set(indices)].filter(i=>Number.isInteger(i)&&i>=0&&i<p.hand.length).sort((a,b)=>b-a);
  const rejected=[];for(const index of chosen)rejected.unshift(p.hand.splice(index,1)[0]);
  p.deck.push(...rejected);
  draw(state,side,rejected.length);
  p.mulliganUsed=true;
}
function refreshMutable(state,side,{drawCard=true}={}){
  const p=state.players[side];
  p.turnNumber+=1;
  p.resources=resourceCurve(p.turnNumber);
  p.lanePlays=[0,0,0];p.corePreventionUsed=[0,0,0];
  for(const lane of p.lanes)for(const unit of lane.units){unit.exhausted=false;unit.moved=false;unit.weaponUsed=false;unit.triggerSuppressed=false;}
  for(const lane of p.lanes)for(const support of lane.supports){if(support.disabledUntilRound&&support.disabledUntilRound<=state.round){support.disabled=false;support.disabledUntilRound=0;}}
  if(drawCard)draw(state,side,1);
  for(let laneIndex=0;laneIndex<3;laneIndex++){
    const lane=p.lanes[laneIndex],bases=lane.supports.filter(s=>s.card.family==='Base'&&!isDisabled(state,s));
    for(const base of bases){
      const cards=[...lane.units.map(u=>u.card),...lane.supports.filter(s=>s!==base).map(s=>s.card)];
      const sums={command:0,insight:0,essence:0};for(const c of cards)for(const k of Object.keys(sums))sums[k]+=c.cost?.[k]||0;
      const dominant=Object.keys(sums).sort((a,b)=>sums[b]-sums[a]||['command','insight','essence'].indexOf(a)-['command','insight','essence'].indexOf(b))[0];
      p.resources[dominant]=Math.min(10,p.resources[dominant]+1);
      addLog(state,`${side==='player'?'Your':'Rival'} Base generated 1 ${dominant}.`);
    }
  }
}

export function mulligan(state,side='player',indices=[]){
  if(state.phase!=='mulligan'||side!=='player'||state.players[side].mulliganUsed)throw new Error('Mulligan is no longer available.');
  const next=clone(state);performMulliganMutable(next,'player',indices);
  const rivalReject=next.players.rival.hand.map((c,i)=>({c,i})).filter(({c})=>totalCost(c)>=7).slice(0,2).map(({i})=>i);
  performMulliganMutable(next,'rival',rivalReject);
  next.phase='main';next.active='player';refreshMutable(next,'player',{drawCard:false});
  addLog(next,indices.length?`You replaced ${indices.length} opening card${indices.length===1?'':'s'}.`:'You kept your opening hand.');
  return next;
}

export function effectiveCost(state,side,card,laneIndex){
  const cost={command:card.cost.command,insight:card.cost.insight,essence:card.cost.essence};
  const envActive=['player','rival'].some(owner=>state.players[owner].lanes[laneIndex]?.supports.some(s=>s.card.family==='Environment'&&!isDisabled(state,s)));
  if(envActive&&state.players[side].lanePlays[laneIndex]===0){
    const keys=['command','insight','essence'].filter(k=>cost[k]>0).sort((a,b)=>cost[b]-cost[a]||['command','insight','essence'].indexOf(a)-['command','insight','essence'].indexOf(b));
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
  for(const k of ['command','insight','essence'])if(p.resources[k]<cost[k])return {ok:false,reason:`Not enough ${k}.`,cost};
  return {ok:true,cost};
}

function triggerDeployMutable(state,side,laneIndex,unit){
  const enemySide=other(side),enemy=state.players[enemySide],enemyLane=enemy.lanes[laneIndex],card=unit.card;
  const trapIndex=enemyLane.supports.findIndex(s=>s.card.family==='Trap'&&!isDisabled(state,s));
  if(trapIndex>=0){const [trap]=enemyLane.supports.splice(trapIndex,1);enemy.discard.push(trap.card);unit.exhausted=true;unit.triggerSuppressed=true;addLog(state,`${enemySide==='player'?'Your':'Rival'} Trap exhausted ${card.name} and suppressed its deploy trigger.`);return;}
  if(card.family==='Specimen'&&enemyLane.units.length){unit.power+=1;unit.tempPower+=1;addLog(state,`${card.name} adapted for +1 power this turn.`);}
  if(card.family==='Monster'&&enemyLane.units.length&&unit.power>Math.max(...enemyLane.units.map(u=>u.power))){dealCoreDamageMutable(state,enemySide,1,laneIndex,{effect:true});addLog(state,`${card.name} pressured the Core on deployment.`);}
  if(card.family==='Magician'){
    const p=state.players[side],kept=p.deck.shift(),bottom=p.deck.shift();if(kept)p.hand.push(kept);if(bottom)p.deck.push(bottom);addLog(state,`${card.name} inspected the next two doctrine cards.`);
  }
  if(card.family==='Dragon'){
    for(const support of enemyLane.supports.filter(s=>INFRA_FAMILIES.has(s.card.family))){support.disabled=true;support.disabledUntilRound=state.round+1;}addLog(state,`${card.name} disabled opposing infrastructure in ${LANE_NAMES[laneIndex]} until the next refresh.`);
  }
  if(card.family==='Operative')addLog(state,`${card.name} triggered ${card.keywords?.[0]||'its primary division keyword'}; undefined keyword numerics remain informational.`);
}
function maybeRepositionMutable(state,side,laneIndex,unit){
  const p=state.players[side],options=[laneIndex-1,laneIndex+1].filter(i=>i>=0&&i<3&&p.lanes[i].units.length<MAX_UNITS_PER_LANE);
  if(!options.length)return laneIndex;
  const targetLane=options.sort((a,b)=>p.lanes[a].units.length-p.lanes[b].units.length||a-b)[0];
  if(p.lanes[targetLane].units.length+1>=p.lanes[laneIndex].units.length)return laneIndex;
  p.lanes[laneIndex].units=p.lanes[laneIndex].units.filter(u=>u.uid!==unit.uid);
  unit.moved=true;unit.infected=false;p.lanes[targetLane].units.push(unit);
  addLog(state,`${unit.card.name} repositioned from ${LANE_NAMES[laneIndex]} to ${LANE_NAMES[targetLane]}.`);
  return targetLane;
}
function resolveImmediateMutable(state,side,laneIndex,card){
  const p=state.players[side],enemy=state.players[other(side)],lane=p.lanes[laneIndex];
  if(card.family==='Action'){const target=strongest(lane.units);if(target){target.power+=2;target.tempPower+=2;addLog(state,`${card.name} granted ${target.card.name} +2 power this turn.`);maybeRepositionMutable(state,side,laneIndex,target);}}
  else if(card.family==='Item'){const target=strongest(lane.units);if(target){target.power+=1;target.tempPower+=1;addLog(state,`${card.name} granted ${target.card.name} +1 power this turn.`);}}
  else if(card.family==='Disaster'){
    for(let i=0;i<3;i++){const target=strongest(enemy.lanes[i].units);if(target){target.power-=1;if(target.power>0)target.exhausted=true;pruneDead(state,other(side),i);}}addLog(state,`${card.name} dealt the minimum deterministic 1 damage to each lane’s highest-power enemy and exhausted survivors.`);
  }
  else if(card.family==='Spell')addLog(state,`${card.name} resolved its two keyword applications; keywords without canonical numeric definitions are recorded without invented values.`);
  p.discard.push(card);
}
function installSupportMutable(state,side,laneIndex,card){
  const p=state.players[side],enemy=state.players[other(side)],lane=p.lanes[laneIndex],support=supportFor(state,card);
  if(card.family==='Weapon'){const target=strongest(lane.units);if(target){target.weaponBonus+=2;support.attachedUid=target.uid;}}
  if(card.family==='Hex'){const target=strongest(enemy.lanes[laneIndex].units);if(target)support.attachedEnemyUid=target.uid;}
  if(card.family==='Plague')for(const unit of enemy.lanes[laneIndex].units)unit.infected=true;
  if(card.family==='Response')support.pending=true;
  lane.supports.push(support);
}

export function playCard(state,side,handIndex,laneIndex){
  const check=getPlayability(state,side,handIndex,laneIndex);if(!check.ok)throw new Error(check.reason);
  const next=clone(state),p=next.players[side],card=p.hand[handIndex],cost=effectiveCost(next,side,card,laneIndex);
  for(const k of ['command','insight','essence'])p.resources[k]-=cost[k];p.hand.splice(handIndex,1);p.lanePlays[laneIndex]+=1;
  if(ENTITY_FAMILIES.has(card.family)){const unit=unitFor(next,card);p.lanes[laneIndex].units.push(unit);triggerDeployMutable(next,side,laneIndex,unit);}
  else if(SUPPORT_FAMILIES.has(card.family))installSupportMutable(next,side,laneIndex,card);
  else resolveImmediateMutable(next,side,laneIndex,card);
  addLog(next,`${side==='player'?'You':'Rival'} played ${card.name} into ${LANE_NAMES[laneIndex]}.`);
  checkWinner(next);return next;
}

function combatValue(unit,attacking){return Math.max(0,unit.power+(attacking&&!unit.weaponUsed?unit.weaponBonus:0));}
function finishAttackMutable(state,side,unit){
  const weaponTriggered=unit.weaponBonus>0&&!unit.weaponUsed&&unit.moved;
  unit.weaponUsed=true;
  if(!weaponTriggered)return;
  const p=state.players[side];draw(state,side,1);
  if(p.hand.length){
    let discardIndex=0;
    for(let i=1;i<p.hand.length;i++)if(totalCost(p.hand[i])>totalCost(p.hand[discardIndex])||(totalCost(p.hand[i])===totalCost(p.hand[discardIndex])&&p.hand[i].id.localeCompare(p.hand[discardIndex].id)>0))discardIndex=i;
    const [discarded]=p.hand.splice(discardIndex,1);p.discard.push(discarded);
    addLog(state,`${unit.card.name}'s Weapon trigger drew 1 card, then discarded ${discarded.name}.`);
  }
}
function expireTempsMutable(state,side){for(let i=0;i<3;i++){for(const unit of state.players[side].lanes[i].units){if(unit.tempPower){unit.power-=unit.tempPower;unit.tempPower=0;}}pruneDead(state,side,i);}}
function plagueStepMutable(state){for(const side of ['player','rival'])for(let i=0;i<3;i++){for(const unit of state.players[side].lanes[i].units){if(unit.infected){if(unit.moved)unit.infected=false;else unit.power-=1;}}pruneDead(state,side,i);}}
function ritualStepMutable(state){for(const side of ['player','rival'])for(const lane of state.players[side].lanes)for(const support of lane.supports.filter(s=>s.card.family==='Ritual'&&!s.ready)){support.counters=Math.min(3,(support.counters||0)+1);if(support.counters===3){support.ready=true;addLog(state,`${support.card.name} reached Channel 3; its undefined division-wide resolution is held without inventing new card text.`);}}}
function autoShiftWarriorsMutable(state,side){const p=state.players[side];for(let source=0;source<3;source++){const warriors=[...p.lanes[source].units].filter(u=>u.card.family==='Warrior'&&alive(u)&&!u.moved);for(const unit of warriors){const options=[source-1,source+1].filter(i=>i>=0&&i<3&&p.lanes[i].units.length<MAX_UNITS_PER_LANE);if(!options.length)continue;const target=options.sort((a,b)=>p.lanes[a].units.length-p.lanes[b].units.length||a-b)[0];if(p.lanes[target].units.length+1<p.lanes[source].units.length){p.lanes[source].units=p.lanes[source].units.filter(u=>u.uid!==unit.uid);unit.moved=true;unit.infected=false;p.lanes[target].units.push(unit);addLog(state,`${unit.card.name} shifted to ${LANE_NAMES[target]} after surviving combat.`);}}}}

export function resolveCombat(state,attackerSide){
  const next=clone(state);if(next.phase==='ended')return next;const defenderSide=other(attackerSide),attacker=next.players[attackerSide],defender=next.players[defenderSide];
  for(let laneIndex=0;laneIndex<3&&next.phase!=='ended';laneIndex++){
    const aLane=attacker.lanes[laneIndex],dLane=defender.lanes[laneIndex];
    const eligible=aLane.units.filter(u=>alive(u)&&!u.exhausted);if(!eligible.length)continue;
    const flyers=eligible.filter(u=>hasKeyword(u,'Flying'));
    const hasAirBlocker=dLane.units.some(u=>hasKeyword(u,'Flying')||hasKeyword(u,'Guard'));
    let fighters=eligible;
    if(flyers.length&&!hasAirBlocker){const airDamage=flyers.reduce((sum,u)=>sum+combatValue(u,true),0);for(const u of flyers)finishAttackMutable(next,attackerSide,u);dealCoreDamageMutable(next,defenderSide,airDamage,laneIndex);fighters=eligible.filter(u=>!flyers.some(f=>f.uid===u.uid));if(next.phase==='ended')break;}
    if(!fighters.length)continue;
    const defenders=dLane.units.filter(alive);
    if(defenders.length===0){const damage=fighters.reduce((sum,u)=>sum+combatValue(u,true),0);for(const u of fighters)finishAttackMutable(next,attackerSide,u);dealCoreDamageMutable(next,defenderSide,damage,laneIndex);continue;}
    const orderedA=[...fighters].sort((a,b)=>combatValue(b,true)-combatValue(a,true));
    const orderedD=[...defenders].sort((a,b)=>(hasKeyword(b,'Guard')?1:0)-(hasKeyword(a,'Guard')?1:0)||b.power-a.power);
    const dGuard=orderedD.some(u=>hasKeyword(u,'Guard')),aGuard=orderedA.some(u=>hasKeyword(u,'Guard'));let dGuardUsed=false,aGuardUsed=false;
    const paired=Math.min(orderedA.length,orderedD.length);
    for(let i=0;i<paired;i++){
      const a=orderedA[i],d=orderedD[i],aDamage=combatValue(a,true),dDamage=combatValue(d,false);
      let dealtToD=aDamage,dealtToA=dDamage;if(dGuard&&!dGuardUsed&&dealtToD>0){dealtToD=Math.max(0,dealtToD-1);dGuardUsed=true;}if(aGuard&&!aGuardUsed&&dealtToA>0){dealtToA=Math.max(0,dealtToA-1);aGuardUsed=true;}
      d.power-=dealtToD;a.power-=dealtToA;finishAttackMutable(next,attackerSide,a);
    }
    pruneDead(next,attackerSide,laneIndex);pruneDead(next,defenderSide,laneIndex);
    if(defender.lanes[laneIndex].units.length===0){const survivors=attacker.lanes[laneIndex].units.filter(u=>fighters.some(f=>f.uid===u.uid)&&alive(u));if(survivors.length)dealCoreDamageMutable(next,defenderSide,survivors.length,laneIndex);}
  }
  expireTempsMutable(next,attackerSide);plagueStepMutable(next);ritualStepMutable(next);autoShiftWarriorsMutable(next,attackerSide);checkWinner(next);return next;
}

function aiLaneScore(state,card,laneIndex){const own=state.players.rival.lanes[laneIndex],enemy=state.players.player.lanes[laneIndex],ownPower=own.units.reduce((s,u)=>s+u.power,0),enemyPower=enemy.units.reduce((s,u)=>s+u.power,0);let score=0;if(ENTITY_FAMILIES.has(card.family)){score+=card.power*1.5-totalCost(card)*0.25;if(enemy.units.length===0)score+=5;else if(card.power+ownPower>enemyPower)score+=3;score-=own.units.length*1.5;}else if(card.family==='Defense')score+=own.supports.some(s=>s.card.family==='Defense')?0:3;else if(['Action','Item','Weapon'].includes(card.family))score+=own.units.length?4:-8;else if(card.family==='Trap')score+=enemy.units.length?3:1;else score+=1;return score;}
function runAiMainMutable(state){let plays=0;while(plays<5&&state.phase==='main'&&state.active==='rival'){
  let best=null;for(let h=0;h<state.players.rival.hand.length;h++)for(let lane=0;lane<3;lane++){const check=getPlayability(state,'rival',h,lane);if(!check.ok)continue;const card=state.players.rival.hand[h],score=aiLaneScore(state,card,lane);if(!best||score>best.score)best={h,lane,score};}
  if(!best)break;const next=playCard(state,'rival',best.h,best.lane);Object.assign(state,next);plays++;
}}

export function completePlayerTurn(state){
  if(state.phase!=='main'||state.active!=='player')throw new Error('Player turn is not ready to complete.');
  let next=resolveCombat(state,'player');if(next.phase==='ended')return next;
  next.active='rival';next.turnCount+=1;refreshMutable(next,'rival',{drawCard:true});addLog(next,'Rival main phase began.');
  runAiMainMutable(next);next=resolveCombat(next,'rival');if(next.phase==='ended')return next;
  next.round+=1;next.turnCount+=1;next.active='player';refreshMutable(next,'player',{drawCard:true});next.phase='main';addLog(next,`Round ${next.round}: your main phase began.`);return next;
}
