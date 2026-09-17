#!/usr/bin/env node
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodePet,parsePet,convertCodex,encodePet} from './pet-core.mjs';
async function folder(path){const files=Object.create(null);async function scan(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const relative=prefix+entry.name;if(entry.isSymbolicLink())throw Error('Source contains symlink');if(entry.isDirectory())await scan(join(dir,entry.name),relative+'/');else files[relative]=new Uint8Array(await readFile(join(dir,entry.name)));}}await scan(path);return parsePet(convertCodex(files));}
const [command,input,output]=process.argv.slice(2);
try{
 if(!input||!['validate','build','preview'].includes(command))throw Error('Usage: pet-tool.mjs validate|build|preview <source-folder-or-archive> [output]');
 let pet;try{pet=await folder(resolve(input));}catch(e){if(e.code!=='ENOTDIR')throw e;pet=await decodePet(new Uint8Array(await readFile(input)));}
 if(command==='build'){if(!output)throw Error('Missing .dshpet output');await writeFile(output,encodePet(pet));}
 if(command==='preview'){
  if(!output)throw Error('Missing preview output');const template=await readFile(new URL('./preview-template.html',import.meta.url),'utf8');
  const assets=Object.fromEntries(Object.entries(pet.manifest.assets).map(([id,a])=>[id,`data:image/${a.path.endsWith('.png')?'png':'webp'};base64,${Buffer.from(pet.files[a.path]).toString('base64')}`]));
  const payload=JSON.stringify({manifest:pet.manifest,animations:pet.animations,assets}).replaceAll('<','\\u003c');await writeFile(output,template.replace('/*PET_PAYLOAD*/null',payload));
 }
 console.log(JSON.stringify({ok:true,id:pet.manifest.id,version:pet.manifest.version,actions:pet.animations.length,frames:pet.animations.reduce((n,a)=>n+a.frames.length,0),warnings:pet.warnings,...(output?{output:resolve(output)}:{})},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
