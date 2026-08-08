import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const manifestPath='assets/card-art-atlas.base64/manifest.json';
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const parts=await Promise.all(manifest.chunks.map(file=>readFile(file,'utf8')));
const bytes=Buffer.from(parts.join(''),'base64');
const sha256=createHash('sha256').update(bytes).digest('hex');
if(sha256!==manifest.sha256)throw new Error(`Atlas checksum mismatch: expected ${manifest.sha256}, got ${sha256}`);
await mkdir('assets',{recursive:true});
await writeFile(manifest.output,bytes);
console.log(`Materialized ${manifest.output} (${bytes.length.toLocaleString()} bytes)`);
