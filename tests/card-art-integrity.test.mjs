import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { cards, sheets } from '../card-canon.js';

/* `sharp` is the only dependency this repository has, and a static import of it
 * took the WHOLE suite down with an ERR_MODULE_NOT_FOUND stack whenever a
 * checkout had not run `npm install` yet — 135 passing tests reported as one
 * opaque failure that never names the cause.
 *
 * Locally that is a setup problem and should say so. In CI it is a broken gate
 * and must stay fatal: this file is what proves the shipped atlas decodes to
 * 1,134 distinct tiles, so a run that silently skipped it would be a green tick
 * over an unverified payload. `CI` is set by GitHub Actions (and by every other
 * runner worth naming), so the two cases are told apart without a flag anyone
 * has to remember to pass. */
let sharp = null, sharpMissing = null;
try { ({ default: sharp } = await import('sharp')); }
catch (error) {
  sharpMissing = `needs the "sharp" devDependency: run \`npm install\` (${error.code || error.message})`;
  if (process.env.CI) throw new Error(`card art integrity ${sharpMissing}`);
}
/** Spread into every test that decodes the atlas. Empty once sharp is present. */
const decodes = sharpMissing ? { skip: sharpMissing } : {};

const atlasDir='assets/card-art-atlas.base64';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const luminance=(tile,index)=>Math.round(.2126*tile[index]+.7152*tile[index+1]+.0722*tile[index+2]);

function differenceHash(tile){
  let hash=0n;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const sampleY=Math.min(79,Math.round((y+.5)*10-1));
    const leftX=Math.min(79,Math.round((x+.5)*80/9-1));
    const rightX=Math.min(79,Math.round((x+1.5)*80/9-1));
    const left=luminance(tile,(sampleY*80+leftX)*3);
    const right=luminance(tile,(sampleY*80+rightX)*3);
    hash=(hash<<1n)|BigInt(left>right);
  }
  return hash;
}

function hammingDistance(a,b){
  let value=a^b;
  let distance=0;
  while(value){value&=value-1n;distance++}
  return distance;
}

async function embeddedAtlas(){
  const manifest=JSON.parse(await readFile(`${atlasDir}/manifest.json`,'utf8'));
  const chunkNames=(await readdir(atlasDir)).filter(name=>/^chunk-\d{3}\.txt$/.test(name)).sort();
  const referencedNames=manifest.chunks.map(file=>path.basename(file));
  assert.deepEqual(chunkNames,referencedNames,'every committed payload chunk must be referenced exactly once and in numeric order');
  const encoded=(await Promise.all(manifest.chunks.map(file=>readFile(file,'utf8')))).join('');
  assert.equal(encoded.length%4,0,'canonical base64 length must be divisible by four');
  assert.match(encoded,/^[A-Za-z0-9+/]*={0,2}$/,'canonical base64 may contain padding only at the end');
  const bytes=Buffer.from(encoded,'base64');
  assert.equal(bytes.toString('base64'),encoded,'canonical base64 must round-trip byte-for-byte');
  assert.equal(bytes.length,manifest.binaryBytes,'decoded atlas byte length must match the manifest');
  assert.equal(sha256(bytes),manifest.sha256,'decoded atlas checksum must match the manifest');
  return {manifest,bytes};
}

test('the canonical atlas materializes exactly without recovery fallback',decodes,async()=>{
  const {manifest,bytes}=await embeddedAtlas();
  const metadata=await sharp(bytes).metadata();
  assert.equal(metadata.width,manifest.width);
  assert.equal(metadata.height,manifest.height);
  await sharp(bytes).raw().toBuffer();
});

test('all 1,134 canonical coordinates map to exact and perceptually distinct artwork',decodes,async()=>{
  const {manifest,bytes}=await embeddedAtlas();
  const decoded=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const tileHashes=[];
  const perceptualHashes=[];
  for(const card of cards){
    const tile=Buffer.alloc(manifest.tileWidth*manifest.tileHeight*decoded.info.channels);
    let writeOffset=0;
    for(let y=0;y<manifest.tileHeight;y++){
      const readOffset=((card.art.row*manifest.tileHeight+y)*decoded.info.width+card.art.col*manifest.tileWidth)*decoded.info.channels;
      decoded.data.copy(tile,writeOffset,readOffset,readOffset+manifest.tileWidth*decoded.info.channels);
      writeOffset+=manifest.tileWidth*decoded.info.channels;
    }
    tileHashes.push(sha256(tile));
    perceptualHashes.push(differenceHash(tile));
  }
  assert.equal(new Set(tileHashes).size,1134,'no two canonical coordinates may decode to the same pixels');
  assert.equal(new Set(perceptualHashes).size,1134,'no two canonical coordinates may have the same perceptual hash');
  let minimumDistance=64;
  for(let i=0;i<perceptualHashes.length;i++)for(let j=i+1;j<perceptualHashes.length;j++)minimumDistance=Math.min(minimumDistance,hammingDistance(perceptualHashes[i],perceptualHashes[j]));
  assert.ok(minimumDistance>=5,`perceptual hash distance must be at least 5; found ${minimumDistance}`);
});

test('card coordinates and source rows preserve the canon mapping',decodes,async()=>{
  const sourceText=await readFile('assets/card-art-source-manifest.json','utf8').catch(()=>null);
  assert.ok(sourceText,'the repaired atlas must include a row-level source manifest');
  const sourceManifest=JSON.parse(sourceText);
  assert.equal(sourceManifest.rows.length,54);
  assert.equal(new Set(sourceManifest.rows.map(row=>row.sourceKind)).size,1);
  assert.equal(sourceManifest.rows[0].sourceKind,'recovered-original-generated-sheet');
  const rowSources=new Set(sourceManifest.rows.map(row=>row.row));
  assert.equal(rowSources.size,54,'every atlas row must have one provenance record');
  const sheetRows=new Map(sheets.map((sheet,row)=>[`${sheet.family}:${sheet.set}`,row]));
  const mismatches=cards.filter(card=>card.art.col!==card.divisionId-1||card.art.row!==sheetRows.get(`${card.family}:${card.set}`));
  assert.deepEqual(mismatches.map(card=>card.id),[]);
  for(const [row,sheet] of sheets.entries()){
    const source=sourceManifest.rows.find(entry=>entry.row===row);
    assert.equal(source.family,sheet.family);
    assert.equal(source.set,sheet.set);
    assert.match(source.sourceSha256,/^[a-f0-9]{64}$/);
  }
});

test('runtime styles and provenance resolve the canonical AVIF asset',async()=>{
  const manifest=JSON.parse(await readFile(`${atlasDir}/manifest.json`,'utf8'));
  const styles=await Promise.all(['styles.css','match.css'].map(file=>readFile(file,'utf8')));
  const atlasUrls=styles.flatMap(css=>[...css.matchAll(/url\(['"]?([^'")]*card-art-atlas[^'")]*)/g)].map(match=>match[1]));
  assert.deepEqual([...new Set(atlasUrls)],[manifest.output]);
  const provenance=JSON.parse(await readFile('assets/card-art-provenance.json','utf8'));
  assert.equal(provenance.atlas,path.basename(manifest.output));
});
