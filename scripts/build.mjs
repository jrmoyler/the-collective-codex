import './materialize-atlas.mjs';
import { cp, mkdir, rm } from 'node:fs/promises';
const out='dist';
await rm(out,{recursive:true,force:true});
await mkdir(`${out}/assets`,{recursive:true});
for(const f of ['index.html','styles.css','match.css','app.js','card-canon.js','match-engine.js','deck-store.js']) await cp(f,`${out}/${f}`);
await cp('assets/card-art-atlas.avif',`${out}/assets/card-art-atlas.avif`);
await cp('assets/card-art-provenance.json',`${out}/assets/card-art-provenance.json`);
console.log('Built static Collective Codex to dist/');
