import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { cards, divisions, families } from '../card-canon.js';

const WIDTH=1680;
const HEIGHT=4320;
const COLS=21;
const ROWS=54;
const TILE_W=WIDTH/COLS;
const TILE_H=HEIGHT/ROWS;
const GOLD='#D4A843';
const GROUND='#050A18';
const divMap=new Map(divisions.map(d=>[d.id,d]));
const familyIndex=new Map(families.map((family,index)=>[family,index]));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function bytesFor(card){return createHash('sha256').update(`${card.id}|${card.name}|${card.family}|${card.divisionId}`).digest();}
function point(hash,index,min,max){return min+(hash[index%hash.length]/255)*(max-min);}
function polygonPoints(cx,cy,radius,sides,rotation){
  return Array.from({length:sides},(_,i)=>{const a=rotation+(Math.PI*2*i/sides);return `${(cx+Math.cos(a)*radius).toFixed(2)},${(cy+Math.sin(a)*radius).toFixed(2)}`}).join(' ');
}
function tileSvg(card){
  const hash=bytesFor(card),d=divMap.get(card.divisionId),family=familyIndex.get(card.family)??0;
  const x=card.art.col*TILE_W,y=card.art.row*TILE_H,color=d?.color||GOLD;
  const cx=x+point(hash,0,24,56),cy=y+point(hash,1,24,56);
  const sides=3+(hash[2]%5),radius=point(hash,3,10,24),rotation=point(hash,4,0,Math.PI);
  const orbit=point(hash,5,18,33),nodeR=point(hash,6,2.2,5.5),beam=point(hash,7,1,2.4);
  const line1y=y+point(hash,8,12,68),line2y=y+point(hash,9,12,68);
  const line1x=x+point(hash,10,5,28),line2x=x+point(hash,11,52,75);
  const ringOpacity=(0.18+(hash[12]/255)*0.35).toFixed(2),fillOpacity=(0.08+(hash[13]/255)*0.2).toFixed(2);
  const accentOpacity=(0.35+(hash[14]/255)*0.42).toFixed(2);
  const familyBand=clamp(8+(family%8)*3,8,29);
  return `<g><rect x="${x}" y="${y}" width="${TILE_W}" height="${TILE_H}" fill="${GROUND}"/><rect x="${x+2}" y="${y+2}" width="${TILE_W-4}" height="${TILE_H-4}" rx="9" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-opacity=".28"/><circle cx="${cx}" cy="${cy}" r="${orbit}" fill="none" stroke="${color}" stroke-opacity="${ringOpacity}" stroke-width="${beam}"/><circle cx="${cx}" cy="${cy}" r="${Math.max(5,radius*.42)}" fill="${color}" fill-opacity=".18" stroke="${GOLD}" stroke-opacity="${accentOpacity}" stroke-width="1.2"/><polygon points="${polygonPoints(cx,cy,radius,sides,rotation)}" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-opacity=".78" stroke-width="1.35"/><path d="M${line1x} ${line1y} H${line2x} M${x+8} ${line2y} H${x+72}" stroke="${GOLD}" stroke-opacity=".24" stroke-width="1"/><path d="M${x+8} ${y+familyBand} L${x+20+(hash[15]%24)} ${y+familyBand} L${x+31+(hash[16]%34)} ${y+familyBand+(hash[17]%17)-8}" fill="none" stroke="${color}" stroke-opacity=".48" stroke-width="1.2"/><circle cx="${x+10+(hash[18]%60)}" cy="${y+10+(hash[19]%60)}" r="${nodeR}" fill="${GOLD}" fill-opacity=".48"/><circle cx="${x+10+(hash[20]%60)}" cy="${y+10+(hash[21]%60)}" r="${Math.max(1.7,nodeR*.65)}" fill="${color}" fill-opacity=".72"/><rect x="${x+8}" y="${y+70}" width="${12+(hash[22]%42)}" height="2" fill="${color}" fill-opacity=".5"/><rect x="${x+8}" y="${y+75}" width="${8+(hash[23]%31)}" height="1.5" fill="${GOLD}" fill-opacity=".34"/></g>`;
}

export async function buildRecoveryAtlas(){
  const mapped=cards.filter(card=>Number.isInteger(card.art?.row)&&Number.isInteger(card.art?.col)&&card.art.row>=0&&card.art.row<ROWS&&card.art.col>=0&&card.art.col<COLS);
  if(mapped.length!==COLS*ROWS)throw new Error(`Recovery atlas requires ${COLS*ROWS} mapped cards; found ${mapped.length}.`);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="100%" height="100%" fill="${GROUND}"/>${mapped.map(tileSvg).join('')}</svg>`;
  return sharp(Buffer.from(svg)).avif({quality:58,effort:6,chromaSubsampling:'4:4:4'}).toBuffer();
}

export const recoveryAtlasSpec={width:WIDTH,height:HEIGHT,columns:COLS,rows:ROWS,strategy:'deterministic-canon-fallback'};
