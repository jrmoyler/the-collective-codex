export const divisions = [
  [1,'Collective AI','✦','#D4A843','Command synthesis and adaptive doctrine',['Synthesize','Observe','Converge']],
  [2,'ZenFlow','❖','#7C3AED','Prediction, sequencing and neural links',['Forecast','Link','Reorder']],
  [3,'The Collective','✦','#067A56','Recruitment, economy and compound value',['Recruit','Prosper','Compound']],
  [4,'Hybrid Living','✎','#0EA5E9','Learning, adaptation and transformation',['Learn','Adapt','Graduate']],
  [5,'Nexus Labs','❝','#DC2626','Narrative control, replay and authored outcomes',['Record','Replay','Edit']],
  [6,'Kinetic Edge','⚔','#16A34A','Momentum, movement and repeated attacks',['Dash','Combo','Impact']],
  [7,'Quantum Ledger','◈','#8B5CF6','Deferred value, exchange and resource control',['Invest','Settle','Yield']],
  [8,'Juris Guard','⚖','#C9A84C','Judgment, restrictions and punishment',['Judge','Statute','Sentence']],
  [9,'Signal Velocity','▲','#F43F5E','Broadcast amplification and cascading effects',['Broadcast','Amplify','Cascade']],
  [10,'Cognara Mind','✶','#E0267E','Psychic control and intent manipulation',['Probe','Confuse','Dominate']],
  [11,'Terra Axis','⛏','#8C2B2B','Structures, armor and battlefield permanence',['Fortify','Anchor','Construct']],
  [12,'Binary Loom','▦','#A3E635','Modular synthesis and card construction',['Compile','Weave','Assemble']],
  [13,'Vector Shift','➤','#CBD5E1','Logistics, routing and repositioning',['Route','Transfer','Shift']],
  [14,'Aether Link','⚯','#B5451B','Portals, summoning and cross-lane support',['Portal','Relay','Bridge']],
  [15,'Obsidian Arc','◫','#E2E8F0','Security, lockdown and counterattacks',['Lock','Breach','Retaliate']],
  [16,'Civic Core','❀','#F7CFCF','Cooperation, healing and shared benefit',['Shelter','Unite','Restore']],
  [17,'Nomad Nexus','☉','#D4A574','Reserve play, travel and temporary camps',['Roam','Reserve','Caravan']],
  [18,'Vital Helix','⚕','#14B8A6','Regeneration, mutation and medicine',['Heal','Mutate','Regrow']],
  [19,'Gaia Synthesis','☘','#2F7D4B','Ecosystems, living terrain and swarms',['Seed','Bloom','Symbiosis']],
  [20,'Eon Core','⌛','#FFFBEB','Time manipulation, delay and recursion',['Delay','Rewind','Preserve']],
  [21,'Animus Prime','◇','#22D3EE','Androids, automation and autonomous actions',['Deploy','Automate','Drone']]
].map(([id,name,icon,color,doctrine,keywords])=>({id,name,icon,color,doctrine,keywords}));

export const families=['Specimen','Weapon','Monster','Knight','Warrior','Magician','Environment','Disaster','Defense','Base','Item','Operative','Action','Trap','Reaction','Response','Law','Spell','Hex','Plague','Virus','Dragon','Deity','Android','God','Ruler','Ritual','World'];

const sheetCounts={Specimen:1,Weapon:12,Monster:1,Knight:1,Warrior:1,Magician:1,Environment:2,Disaster:1,Defense:1,Base:1,Item:8,Operative:8,Action:1,Trap:1,Reaction:1,Response:1,Law:1,Spell:1,Hex:1,Plague:1,Virus:1,Dragon:1,Deity:1,Android:1,God:1,Ruler:1,Ritual:1,World:1};
export const sheets=families.flatMap(f=>Array.from({length:sheetCounts[f]},(_,i)=>({id:`${f.toLowerCase()}-${i+1}`,family:f,set:i+1})));

const prefixes=['Aureate','Zenflow','Collective','Hybrid','Nexus','Kinetic','Quantum','Juris','Signal','Cognara','Terra','Binary','Vector','Aether','Obsidian','Civic','Nomad','Vital','Gaia','Eon','Animus'];
const familyNouns={
Specimen:['Chimera','Warden','Crawler','Mote'],Weapon:['Halberd','Lance','Glaive','Cannon'],Monster:['Devourer','Colossus','Horror','Maw'],Knight:['Sentinel','Templar','Custodian','Paladin'],Warrior:['Vanguard','Striker','Marauder','Champion'],Magician:['Oracle','Arcanist','Weaver','Seer'],Environment:['Sanctum','Frontier','Nexus','Reach'],Disaster:['Fracture','Collapse','Storm','Rupture'],Defense:['Bulwark','Ward','Aegis','Bastion'],Base:['Citadel','Foundry','Haven','Spire'],Item:['Relic','Module','Cache','Talisman'],Operative:['Marshal','Agent','Captain','Specialist'],Action:['Advance','Strike','Surge','Protocol'],Trap:['Snare','Mine','Web','Lock'],Reaction:['Counter','Deflect','Riposte','Override'],Response:['Reply','Recovery','Acknowledgement','Fallback'],Law:['Mandate','Statute','Edict','Decree'],Spell:['Invocation','Convergence','Lance','Ward'],Hex:['Omen','Curse','Knot','Seal'],Plague:['Blight','Fever','Rot','Swarm'],Virus:['Strain','Vector','Worm','Splice'],Dragon:['Wyrm','Drake','Serpent','Leviathan'],Deity:['Ascendant','Avatar','Celestial','Eidolon'],Android:['Frame','Unit','Automaton','Construct'],God:['Sovereign','Titan','Creator','Overseer'],Ruler:['Regent','Archon','Imperator','Chancellor'],Ritual:['Rite','Communion','Consecration','Accord'],World:['Prime','Dominion','Expanse','Sphere']};
const suffixes=['of the Last Horizon','of Signal Bloom','of the Clockwork Sea','of Starbound Debt','of the Glass Citadel','of Verdant Ash','of the Ninth Relay','of Hollow Suns','of the Deep Archive','of Terminal Dawn','of the Living Grid','of Quiet Thunder','of the Golden Fault','of the Red Meridian','of the Dreaming Forge','of the Infinite Road','of the Helix Crown','of Root and Circuit','of the Long Now','of the Cyan Wake','of Convergence'];
const subtypes={Specimen:'Lifeform',Weapon:'Equipment',Monster:'Entity',Knight:'Entity',Warrior:'Entity',Magician:'Entity',Environment:'World Modifier',Disaster:'Cataclysm',Defense:'Infrastructure',Base:'Infrastructure',Item:'Relic',Operative:'Entity',Action:'Tactic',Trap:'Hidden',Reaction:'Interrupt',Response:'Interrupt',Law:'Global Rule',Spell:'Arcana',Hex:'Curse',Plague:'Contagion',Virus:'System Threat',Dragon:'Mythic Entity',Deity:'Celestial Entity',Android:'Synthetic Entity',God:'Mythic Entity',Ruler:'Leader',Ritual:'Channel',World:'World'};
const familyRules={
Specimen:'When deployed, adapt to the strongest opposing unit in this lane; gain +1 power until end of turn.',
Weapon:'Equip to a friendly entity. Its first attack each turn gains +2 power; if it moved this turn, draw then discard a card.',
Monster:'On deployment, pressure the opposing lane. If its power exceeds every enemy there, deal 1 Core damage.',
Knight:'Guard. The first allied entity that would take damage in this lane each turn takes 1 less.',
Warrior:'After this unit attacks, if it survived, it may shift one lane once per turn.',
Magician:'On play, inspect the top two cards of your deck; keep one and place the other on the bottom.',
Environment:'While active, the first card played into each lane each turn costs 1 fewer of its highest resource.',
Disaster:'Resolve across all lanes. Damage the highest-power unit in each lane, then exhaust surviving units there.',
Defense:'Install in a lane. Prevent the first 2 damage that would be dealt to your Core from that lane each turn.',
Base:'Construct in a lane. At refresh, generate 1 resource matching the dominant cost among friendly cards there.',
Item:'Attach or consume. Give a friendly card +1 power and one of this division’s keywords until end of turn.',
Operative:'On deployment, trigger this division’s primary keyword. If another allied division is present, trigger its secondary keyword too.',
Action:'Choose a lane. A friendly entity there gets +2 power and may immediately reposition before combat.',
Trap:'Set face down in a lane. Reveal when an enemy enters; exhaust it and prevent its next triggered ability.',
Reaction:'Play when an opponent declares an effect. Reduce that effect’s numeric impact by 1, then gain 1 Insight.',
Response:'Play after a friendly card resolves. Copy one non-damage keyword trigger from it at half numeric value, rounded down.',
Law:'Global. Each player may trigger only one repeated ability with the same name per turn.',
Spell:'Choose a target. Apply this division’s primary keyword twice; if both applications affect the same card, gain 1 Insight.',
Hex:'Attach to an enemy card. Its first activated ability each turn costs 1 additional resource of its highest cost type.',
Plague:'Persistent. At end step, infected units lose 1 power; remove infection from any unit that changed lanes this turn.',
Virus:'Persistent system threat. The first automated or repeated trigger each turn is delayed until the end step.',
Dragon:'Flying. On deployment, choose a lane; enemy infrastructure there is disabled until your next refresh.',
Deity:'Unique. Once per turn, convert 1 resource into another type; after the third conversion, empower this card by +2.',
Android:'Automate. At refresh, repeat this card’s last non-attack lane action if its target is still legal.',
God:'Unique. When played, create a visible decree that modifies one battlefield rule until this leaves play.',
Ruler:'Leader. Once per turn, spend 1 mixed resource to trigger this division’s primary keyword on a friendly card.',
Ritual:'Channel 3. Add one channel counter at each end step; at 3, resolve its division effect across all friendly lanes.',
World:'World. Define the battlefield modifier for both players and empower cards matching this world’s division identity.'};
const targets={Specimen:'Self',Weapon:'Friendly Entity',Monster:'Opposing Lane',Knight:'Friendly Lane',Warrior:'Self',Magician:'Deck',Environment:'All Lanes',Disaster:'All Lanes',Defense:'Friendly Lane',Base:'Friendly Lane',Item:'Friendly Card',Operative:'Friendly Lane',Action:'Friendly Lane',Trap:'Opposing Entity',Reaction:'Stack Effect',Response:'Resolved Friendly Card',Law:'Global',Spell:'Any Legal Target',Hex:'Enemy Card',Plague:'All Entities',Virus:'System Triggers',Dragon:'Opposing Lane',Deity:'Resources',Android:'Self',God:'Global',Ruler:'Friendly Card',Ritual:'Friendly Lanes',World:'Global'};
const timing={Action:'Main',Reaction:'Reaction',Response:'Response',Trap:'Set',Spell:'Main',Hex:'Main',Disaster:'Main',Law:'Main',Ritual:'Main',World:'Setup'};
const rarity=['Common','Uncommon','Rare','Epic','Legendary'];

function stable(seed,mod){let x=2166136261;for(const ch of seed){x^=ch.charCodeAt(0);x=Math.imul(x,16777619)}return (x>>>0)%mod}
function makeCard(sheet,row,d){const seed=`${sheet.id}:${d.id}`;const n=familyNouns[sheet.family];const name=`${prefixes[d.id-1]} ${n[stable(seed, n.length)]} ${suffixes[(row+d.id-1)%suffixes.length]}${sheet.set>1?` · ${String(sheet.set).padStart(2,'0')}`:''}`;const base=stable(seed+'cost',9);const cost={command:base%4,insight:(base+stable(seed+'i',4))%4,essence:(base+stable(seed+'e',5))%4};if(cost.command+cost.insight+cost.essence===0)cost.command=1;const power=2+stable(seed+'p',9);const primary=d.keywords[stable(seed+'k',d.keywords.length)];const secondary=d.keywords[(d.keywords.indexOf(primary)+1)%d.keywords.length];return {id:`D${String(d.id).padStart(2,'0')}-${sheet.family.toUpperCase()}-S${String(sheet.set).padStart(2,'0')}-${String(d.id).padStart(2,'0')}`,name,divisionId:d.id,divisionName:d.name,divisionIcon:d.icon,family:sheet.family,subtype:subtypes[sheet.family],rarity:rarity[stable(seed+'r',rarity.length)],set:sheet.set,setLabel:`${sheet.family} Set ${sheet.set}`,cost,power,rulesText:`${primary} — ${familyRules[sheet.family]}`,keywords:[primary,secondary,sheet.family],targeting:targets[sheet.family],timing:timing[sheet.family]||'Main',duration:['Environment','Law','Plague','Virus','World','Base','Defense','Weapon','Hex'].includes(sheet.family)?'Persistent':'Immediate',counterplay:['Dispel','Remove','Reposition','Deny'].slice(0,1+stable(seed+'c',3)),art:{atlas:'assets/card-art-atlas.avif',row,col:d.id-1},pvpLegal:true,sovereignOnly:false}}
export const cards=sheets.flatMap((s,row)=>divisions.map(d=>makeCard(s,row,d)));

/* The canon is frozen, deeply, before anything can reach it.
 *
 * match-engine.js shares these exact objects by reference — a deck, a hand and
 * the board all point at the same card — which is worth a 5-10x speedup and is
 * correct only for as long as nothing mutates a card. That invariant was
 * previously enforced by nothing at all: a single `card.power -= 1` anywhere in
 * the engine or the UI would have silently rewritten the canon for every other
 * copy of that card, in every future match, until reload.
 *
 * Freezing makes the invariant the runtime's problem instead of a comment's.
 * The nested cost/art/keywords/counterplay objects are frozen too, since a
 * frozen card still hands out a mutable `cost`. No card data changes. */
for(const c of cards){Object.freeze(c.cost);Object.freeze(c.art);Object.freeze(c.keywords);Object.freeze(c.counterplay);Object.freeze(c)}
Object.freeze(cards);

export const cardById=new Map(cards.map(c=>[c.id,c]));
