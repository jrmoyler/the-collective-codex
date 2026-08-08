import './materialize-atlas.mjs';
import { cp, mkdir, rm } from 'node:fs/promises';
const out='dist';
await rm(out,{recursive:true,force:true});
await mkdir(`${out}/assets`,{recursive:true});
for(const f of ['index.html','styles.css','app.js','card-canon.js']) await cp(f,`${out}/${f}`);
await cp('assets/card-art-atlas.webp',`${out}/assets/card-art-atlas.webp`);
await cp('assets/card-art-provenance.json',`${out}/assets/card-art-provenance.json`);
console.log('Built static Collective Codex to dist/');
