import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const manifestPath='assets/card-art-atlas.base64/manifest.json';
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
let bytes;
let source='canonical embedded payload';

try{
  const parts=await Promise.all(manifest.chunks.map(file=>readFile(file,'utf8')));
  const candidate=Buffer.from(parts.join(''),'base64');
  const sha256=digest(candidate);
  if(sha256!==manifest.sha256)throw new Error(`checksum mismatch: expected ${manifest.sha256}, got ${sha256}`);
  bytes=candidate;
}catch(error){
  const { buildRecoveryAtlas, recoveryAtlasSpec }=await import('./recover-atlas.mjs');
  console.warn(`Canonical atlas payload is incomplete (${error.message}). Generating the deterministic offline recovery atlas without modifying source chunks or provenance.`);
  bytes=await buildRecoveryAtlas();
  source=`${recoveryAtlasSpec.strategy} ${recoveryAtlasSpec.columns}x${recoveryAtlasSpec.rows}`;
}

await mkdir('assets',{recursive:true});
await writeFile(manifest.output,bytes);
console.log(`Materialized ${manifest.output} from ${source} (${bytes.length.toLocaleString()} bytes, sha256 ${digest(bytes)})`);
