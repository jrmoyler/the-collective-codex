import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sheets } from '../card-canon.js';

const sourceRoot=path.resolve(process.argv[2]||'recovered-sheets');
const atlasDir='assets/card-art-atlas.base64';
const atlasPath='assets/card-art-atlas.avif';
const sourceManifestPath='assets/card-art-source-manifest.json';
const columns=21;
const rows=54;
const tileWidth=80;
const tileHeight=80;
const cropSize=184;
const xCenters=[158,384,610,836,1062,1288,1514];
const yCenters=[238,492,731];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

const sourceFiles=[
  'Collective AI: Specimen Select.png',
  'Futuristic Arsenal Select Interface.png',
  'Futuristic Arsenal Select Interface(1).png',
  'Futuristic Arsenal Select Interface(2).png',
  'Futuristic Arsenal Select Interface(3).png',
  'image-gen-1(20260806-013537).png',
  'image-gen-2(20260806-013538).png',
  'image-gen-3(20260806-013539).png',
  'image-gen-4(20260806-013540).png',
  'image-gen-5(20260806-013541).png',
  'image-gen-6(20260806-013542).png',
  'image-gen-7(20260806-013543).png',
  'image-gen-8(8).png',
  'image-gen-1(20260806-001149).png',
  'image-gen-2(20260806-001150).png',
  'image-gen-3(20260806-001151).png',
  'image-gen-4(20260806-001152).png',
  'image-gen-5(20260806-001153).png',
  'image-gen-5(20260806-002141).png',
  'image-gen-6(20260806-001155).png',
  'image-gen-7(20260806-001156).png',
  'image-gen-8(4).png',
  'image-gen-1(20260806-012232).png',
  'image-gen-2(20260806-012233).png',
  'image-gen-3(20260806-012234).png',
  'image-gen-4(20260806-012237).png',
  'image-gen-5(20260806-012238).png',
  'image-gen-6(20260806-012239).png',
  'image-gen-7(20260806-012240).png',
  'image-gen-8(7).png',
  'image-gen-1(20260806-014230).png',
  'image-gen-2(20260806-014231).png',
  'image-gen-3(20260806-014232).png',
  'image-gen-4(20260806-014233).png',
  'image-gen-5(20260806-014235).png',
  'image-gen-6(20260806-014236).png',
  'image-gen-7(20260806-014236).png',
  'image-gen-8(9).png',
  'image-gen-1(20260806-014737).png',
  'image-gen-2(20260806-014738).png',
  'image-gen-3(20260806-014739).png',
  'image-gen-4(20260806-014740).png',
  'image-gen-5(20260806-014741).png',
  'image-gen-6(20260806-014742).png',
  'image-gen-7(20260806-014744).png',
  'image-gen-8(10).png',
  'image-gen-9.png',
  'image-gen-1(20260806-015326).png',
  'image-gen-2(20260806-015327).png',
  'image-gen-3(20260806-015329).png',
  'image-gen-5(20260806-015331).png',
  'image-gen-6(20260806-015332).png',
  'image-gen-7(20260806-015333).png',
  'image-gen-8(20260806-015334).png'
];

if(sourceFiles.length!==rows)throw new Error(`Expected ${rows} source sheets; found ${sourceFiles.length}.`);

async function resolveSource(name){
  for(const folder of ['early','late','']){
    const candidate=path.join(sourceRoot,folder,name);
    try{await access(candidate);return candidate}catch{}
  }
  throw new Error(`Missing recovered source sheet: ${name}`);
}

function cropRaw(data,info,left,top,width,height){
  const crop=Buffer.alloc(width*height*info.channels);
  for(let y=0;y<height;y++){
    const start=((top+y)*info.width+left)*info.channels;
    data.copy(crop,y*width*info.channels,start,start+width*info.channels);
  }
  return crop;
}

const atlasRaw=Buffer.alloc(columns*tileWidth*rows*tileHeight*3);
const provenanceRows=[];

for(const [row,name] of sourceFiles.entries()){
  const file=await resolveSource(name);
  const sourceBytes=await readFile(file);
  const decoded=await sharp(sourceBytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  if(decoded.info.width!==1672||decoded.info.height!==941||decoded.info.channels!==3){
    throw new Error(`${name} must decode to 1672x941 RGB.`);
  }
  for(let column=0;column<columns;column++){
    const gridRow=Math.floor(column/7);
    const gridColumn=column%7;
    const left=Math.round(xCenters[gridColumn]-cropSize/2);
    const top=Math.round(yCenters[gridRow]-cropSize/2);
    const crop=cropRaw(decoded.data,decoded.info,left,top,cropSize,cropSize);
    const tile=await sharp(crop,{raw:{width:cropSize,height:cropSize,channels:3}})
      .resize(tileWidth,tileHeight,{fit:'fill',kernel:'lanczos3'})
      .sharpen({sigma:.65})
      .raw()
      .toBuffer();
    for(let y=0;y<tileHeight;y++){
      const sourceOffset=y*tileWidth*3;
      const targetOffset=((row*tileHeight+y)*(columns*tileWidth)+column*tileWidth)*3;
      tile.copy(atlasRaw,targetOffset,sourceOffset,sourceOffset+tileWidth*3);
    }
  }
  provenanceRows.push({
    row,
    family:sheets[row].family,
    set:sheets[row].set,
    sourceFile:name,
    sourceBytes:sourceBytes.length,
    sourceSha256:sha256(sourceBytes),
    sourceKind:'recovered-original-generated-sheet'
  });
  console.log(`Mapped row ${String(row).padStart(2,'0')} ${sheets[row].family} set ${sheets[row].set} <- ${name}`);
}

const atlas=await sharp(atlasRaw,{raw:{width:columns*tileWidth,height:rows*tileHeight,channels:3}})
  .avif({quality:45,effort:4,chromaSubsampling:'4:4:4'})
  .toBuffer();
const encoded=atlas.toString('base64');
const chunkSize=65536;
const chunks=[];
for(let offset=0,index=0;offset<encoded.length;offset+=chunkSize,index++){
  const name=`chunk-${String(index).padStart(3,'0')}.txt`;
  chunks.push(`assets/card-art-atlas.base64/${name}`);
}

await mkdir(atlasDir,{recursive:true});
for(const name of await readdir(atlasDir))if(/^chunk-\d{3}\.txt$/.test(name))await unlink(path.join(atlasDir,name));
for(const [index,file] of chunks.entries())await writeFile(file,encoded.slice(index*chunkSize,(index+1)*chunkSize));
await writeFile(atlasPath,atlas);

const manifest={
  version:4,
  encoding:'base64',
  output:atlasPath,
  sourceVariant:'recovered-original-sheet-crops-avif-q45',
  width:columns*tileWidth,
  height:rows*tileHeight,
  tileWidth,
  tileHeight,
  binaryBytes:atlas.length,
  sha256:sha256(atlas),
  chunks
};
await writeFile(`${atlasDir}/manifest.json`,`${JSON.stringify(manifest,null,2)}\n`);

const sourceManifest={
  version:1,
  atlas:atlasPath,
  grid:{columns,rows,columnMapping:'division IDs 1-21',rowMapping:'sheet order in card-canon.js'},
  historicalTarget:{
    binaryBytes:206136,
    sha256:'16b869ecc71eeaadfd518cdee08fd71486890fb2862a548ca728fcd983ca5a31',
    status:'not recoverable from repository history; replaced by checksum-verified source-derived atlas'
  },
  reconstruction:{
    sourceSheetCount:sourceFiles.length,
    sourcePolicy:'byte-exact approved generated sheet files; deterministic artwork-panel crops',
    sourceDimensions:{width:1672,height:941},
    crop:{size:cropSize,xCenters,yCenters},
    tile:{width:tileWidth,height:tileHeight,kernel:'lanczos3',sharpenSigma:.65},
    encoding:{format:'avif',quality:45,effort:4,chromaSubsampling:'4:4:4'}
  },
  rows:provenanceRows
};
await writeFile(sourceManifestPath,`${JSON.stringify(sourceManifest,null,2)}\n`);
console.log(`Wrote ${atlasPath}: ${atlas.length.toLocaleString()} bytes, sha256 ${manifest.sha256}, ${chunks.length} chunks.`);
