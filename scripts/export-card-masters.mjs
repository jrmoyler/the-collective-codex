import './materialize-atlas.mjs';
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {cards,divisions} from '../card-canon.js';
import path from 'node:path';

const divMap=new Map(divisions.map(d=>[d.id,d]));
const limitArg=process.argv.find(a=>a.startsWith('--limit='));
const limit=limitArg?Number(limitArg.split('=')[1]):cards.length;
const output=process.argv.find(a=>a.startsWith('--out='))?.split('=')[1]||'exports/cards';
await mkdir(output,{recursive:true});
const esc=s=>String(s).replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]));
const wrap=(text,max=56)=>{const words=String(text).split(/\s+/),lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>max&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines.slice(0,7)};
const textBlock=(text,x,y,{max=56,size=38,line=55,fill='#F5F5F5'}={})=>wrap(text,max).map((value,i)=>`<text x="${x}" y="${y+i*line}" fill="${fill}" font-family="sans-serif" font-size="${size}">${esc(value)}</text>`).join('');
const atlasPath='assets/card-art-atlas.avif';
const atlasMeta=await sharp(atlasPath).metadata();
const tileW=Math.floor(atlasMeta.width/21),tileH=Math.floor(atlasMeta.height/54);
for(const c of cards.slice(0,limit)){
  const d=divMap.get(c.divisionId);
  const art=await sharp(atlasPath).extract({left:c.art.col*tileW,top:c.art.row*tileH,width:tileW,height:tileH}).resize(1320,900,{fit:'cover',kernel:'lanczos3'}).sharpen(1.2).png().toBuffer();
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="2100"><rect width="1500" height="2100" fill="#050A18"/><rect x="44" y="44" width="1412" height="2012" rx="52" fill="#081020" stroke="${d.color}" stroke-width="5"/><rect x="65" y="65" width="1370" height="1970" rx="42" fill="none" stroke="#D4A843" stroke-width="3"/><text x="110" y="135" fill="#8B9BAE" font-family="monospace" font-size="28">${esc(d.name.toUpperCase())} · ${esc(c.family.toUpperCase())}</text><text x="110" y="205" fill="#F5F5F5" font-family="sans-serif" font-size="54" font-weight="700">${esc(c.name)}</text><rect x="1308" y="92" width="88" height="88" rx="20" fill="#090F1D" stroke="${d.color}" stroke-width="4"/><text x="1352" y="151" text-anchor="middle" fill="#F5F5F5" font-family="monospace" font-size="44" font-weight="700">${c.power}</text><rect x="105" y="1180" width="1290" height="660" rx="28" fill="#091226" stroke="#1A2540" stroke-width="3"/><text x="140" y="1245" fill="${d.color}" font-family="monospace" font-size="30" font-weight="700">${esc(c.family.toUpperCase())}</text><text x="1180" y="1245" fill="#D4A843" font-family="monospace" font-size="26">C${c.cost.command}</text><text x="1250" y="1245" fill="#00D9B5" font-family="monospace" font-size="26">I${c.cost.insight}</text><text x="1320" y="1245" fill="#A78BFA" font-family="monospace" font-size="26">E${c.cost.essence}</text>${textBlock(c.rulesText,140,1325,{max:60,size:36,line:52})}<text x="140" y="1710" fill="#8B9BAE" font-family="monospace" font-size="22">${esc(c.keywords.join(' · '))}</text><text x="140" y="1755" fill="#64748B" font-family="monospace" font-size="20">${esc(c.timing)} · ${esc(c.targeting)}</text><text x="110" y="1930" fill="#8B9BAE" font-family="monospace" font-size="24">${esc(c.id)}</text><text x="1390" y="1930" text-anchor="end" fill="#8B9BAE" font-family="monospace" font-size="24">${esc(c.rarity)} · ${esc(c.setLabel)}</text><text x="110" y="1994" fill="#D4A843" font-family="sans-serif" font-size="30" font-weight="700">THE COLLECTIVE CODEX</text></svg>`;
  const out=path.join(output,`${c.id}-${c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}.png`);
  await sharp({create:{width:1500,height:2100,channels:4,background:'#050A18'}}).composite([{input:Buffer.from(svg),top:0,left:0},{input:art,left:90,top:250}]).png({compressionLevel:9}).toFile(out);
}
console.log(`Exported ${Math.min(limit,cards.length)} card masters to ${output}`);
