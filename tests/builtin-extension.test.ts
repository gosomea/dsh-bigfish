import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parsePet } from '../src/pet/contract.js';
import { parsePack } from '../src/contract/scenes.js';
import { isBuiltinAsset } from '../src/contract/builtin-assets.js';
import { extendBuiltinAnimations, builtinAnimationAllowed } from '../src/domain/builtin-animations.js';
import { PetDirector } from '../src/pet/director.js';
const pack = parsePack(JSON.parse(await readFile('packs/classic/manifest.json','utf8')),isBuiltinAsset);
const files: Record<string,Uint8Array> = {};
for(const name of await readdir('examples/bigfish-playful'))files[name]=new Uint8Array(await readFile('examples/bigfish-playful/'+name));
const extended = extendBuiltinAnimations(pack,parsePet(files));
const input = {state:'idle' as const,richness:2,reduced:false,activity:0,pressure:0,signPreference:'prefer' as const};
test('built-in scheduling retains every original motion and adds 72 independent new sequences',()=>{
 assert.equal(extended.animations.length,101);
 const original=[...new Set(pack.scenes.flatMap(s=>s.actions.map(a=>a.motion)))];
 assert.equal(original.length,29);
 for(const motion of original)assert.ok(extended.animations.some(a=>a.id==='classic:'+motion));
 assert.equal(extended.animations.filter(a=>a.id.startsWith('bigfish:')).length,72);
 assert.ok(!extended.animations.some(a=>a.id.startsWith('bigfish:base-')));
 for(const role of ['idle','working','attention','success','error'] as const){
  const fallback=extended.animations.find(a=>a.id===extended.manifest.fallbacks[role]);
  assert.ok(fallback,role);assert.ok(fallback.tags.includes(role),role);assert.equal(fallback.intensity,0,role);
 }
});
test('quiet and reduced built-in mode uses original poses and does not start new gestures',()=>{
 assert.equal(new PetDirector(extended).choose(input,0).animation.id,'classic:breathe');
 assert.equal(new PetDirector(extended).choose({...input,reduced:true,idle:{active:true,showText:true,text:'等你',motion:'wait-sign',serial:1}},0).animation.id,'classic:breathe');
 for(const state of ['generating','waiting-user','completed','failed'] as const){
  assert.ok(new PetDirector(extended).choose({...input,state,reduced:true},0).animation.id.startsWith('classic:'));
 }
});
test('an idle burst can choose new sign poses and all old poses remain explicitly previewable',()=>{
 const idle={active:true,showText:true,text:'等你',motion:'wait-sign',serial:1};
 const d=new PetDirector(extended,()=>.99,(a,i)=>builtinAnimationAllowed(pack,a,i,0));
 assert.ok(d.choose({...input,idle},0).animation.id.startsWith('bigfish:sign-'));
 for(const animation of extended.animations){
  assert.equal(new PetDirector(extended).choose({...input,preview:animation.id},0).animation.id,animation.id);
 }
});
test('ordinary tool and typing pools cannot select near-miss reactions',()=>{
 for(const [state,tag] of [['generating','writing'],['tool-running','test'],['reasoning','thinking']] as const){
  const d=new PetDirector(extended,()=>.99,(a,i)=>builtinAnimationAllowed(pack,a,i,0));
  for(let now=0;now<120000;now+=1000)assert.ok(!d.choose({...input,state,tag},now).animation.tags.includes('near-miss'));
 }
});
