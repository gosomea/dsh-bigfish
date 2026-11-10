import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {parsePet,type PetBundle} from '../src/pet/contract.js';
import {resolvePetBehavior,availablePetLifeClips,petAnimationUnlocked,petMovementAvailable,resolveCompanionBehavior,availableCompanionClips} from '../src/pet/behaviors.js';
import {petLayout} from '../src/pet/layout.js';
import {PetDirector} from '../src/pet/director.js';
const encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
async function fixture(){const files:Record<string,Uint8Array>={};for(const name of await readdir('examples/bigfish-adult'))files[name]=new Uint8Array(await readFile(`examples/bigfish-adult/${name}`));return parsePet(files);}
function extended(p:PetBundle){return {...p.manifest,capabilities:[...p.manifest.capabilities,'life','home','voice-display','paired'],body:{bounds:{x:0,y:0,width:372,height:512},foot:{x:186,y:500},accessories:{head:{x:100,y:50},neck:{x:186,y:210},chest:{x:130,y:260}}},home:{background:'daily'},behaviors:{interactions:{wave:'adult:idle',head:'adult:waiting',ball:'adult:typing',toy:'adult:typing',tea:'adult:idle',biscuit:'adult:success',tail:'adult:idle'},life:{'sit-down':'adult:idle','book-close':'adult:typing'},home:{nest:'adult:idle'},voice:{listen:'adult:waiting',speak:'adult:typing'},paired:{greet:'adult:idle',exchange:'adult:typing',part:'adult:success'}}};}
test('optional living declarations validate against actual files and resolve to this role animations',async()=>{
 const p=await fixture();p.files['pet.json']=encode(extended(p));const pet=parsePet(p.files);
 assert.equal(resolvePetBehavior(pet,'life','sit-down')?.id,'adult:idle');assert.equal(resolvePetBehavior(pet,'voice','speak')?.id,'adult:typing');assert.equal(resolvePetBehavior(pet,'paired','exchange')?.id,'adult:typing');assert.equal(resolvePetBehavior(pet,'life','sleep'),null);assert.ok(availablePetLifeClips(pet).includes('nest'));
});
test('living declarations reject absent actions, missing voice/paired states and off-canvas accessory anchors',async()=>{
 const p=await fixture(),m=extended(p);for(const bad of [
  {...m,behaviors:{...m.behaviors,life:{sleep:'missing'}}},
  {...m,behaviors:{...m.behaviors,voice:{listen:'adult:idle'}}},
  {...m,behaviors:{...m.behaviors,paired:{greet:'adult:idle'}}},
  {...m,home:{background:'https://not-an-asset'}},
  {...m,body:{...m.body,accessories:{head:{x:-10,y:0}}}},
  {...m,body:undefined},
 ]){p.files['pet.json']=encode(bad);assert.throws(()=>parsePet(p.files));}
 p.files['pet.json']=encode(m);p.animations[0]!.frames[0]!.accessories={head:{x:10000,y:10}};p.files['animations.json']=encode(p.animations);assert.throws(()=>parsePet(p.files),/锚点/);
});
test('pack unlock metadata gates the actual director pool and cannot lock any mandatory fallback',async()=>{
 const p=await fixture(),a={...p.animations[0]!,id:'locked:read',tags:['read','working'],unlockAt:20};p.animations.push(a);p.files['animations.json']=encode(p.animations);const pet=parsePet(p.files),d=new PetDirector(pet,()=>0),input={state:'tool-running' as const,tag:'read',richness:2,reduced:false,activity:0,pressure:0,growthUnlocks:true,interactions:0};
 assert.notEqual(d.choose(input,0).animation.id,a.id);assert.equal(d.choose({...input,interactions:20},1).animation.id,a.id);assert.equal(petAnimationUnlocked(a,0,false),true);
 const lockedPreview=new PetDirector(pet,()=>0);assert.notEqual(lockedPreview.choose({...input,preview:a.id},0).animation.id,a.id);
 p.animations[0]!.unlockAt=1;p.files['animations.json']=encode(p.animations);assert.throws(()=>parsePet(p.files),/基础动作.*不能被成长锁定/);
});

test('common role behavior resolution includes touch aliases, critical fallbacks and explicit paired farewell',async()=>{
 const p=await fixture();p.files['pet.json']=encode(extended(p));const pet=parsePet(p.files);
 assert.equal(resolveCompanionBehavior(pet,'companion:head-pat'),'adult:waiting');assert.equal(resolveCompanionBehavior(pet,'fish-toy'),'adult:typing');assert.equal(resolveCompanionBehavior(pet,'tea'),'adult:idle');
 assert.equal(resolveCompanionBehavior(pet,'confirm-card'),'adult:waiting');assert.equal(resolveCompanionBehavior(pet,'success-bow'),'adult:success');assert.equal(resolveCompanionBehavior(pet,'failure-check'),'adult:error');
 assert.equal(resolveCompanionBehavior(pet,'wave',{paired:true}),'adult:idle');assert.equal(resolveCompanionBehavior(pet,'ball-catch',{paired:true}),'adult:typing');assert.equal(resolveCompanionBehavior(pet,'wave',{paired:'part'}),'adult:success');
 assert.equal(resolveCompanionBehavior(pet,'not-provided'),null);assert.ok(availableCompanionClips(pet).includes('head-pat'));assert.ok(availableCompanionClips(pet).includes('success-bow'));
});
test('life availability filters real pack locks and paired capabilities before waiting for a rendered frame',async()=>{
 const p=await fixture(),locked={...p.animations[0]!,id:'locked:play',tags:['play'],unlockAt:20};p.animations.push(locked);p.files['animations.json']=encode(p.animations);
 const manifest=extended(p);manifest.behaviors.interactions.ball=locked.id;manifest.behaviors.paired.exchange=locked.id;p.files['pet.json']=encode(manifest);const pet=parsePet(p.files);
 const options={growthUnlocks:true,interactions:0};
 assert.equal(availableCompanionClips(pet,options).includes('ball-catch'),false);
 assert.equal(availableCompanionClips(pet,{...options,paired:true}).includes('ball-catch'),false);
 assert.equal(availableCompanionClips(pet,{...options,interactions:20,paired:true}).includes('ball-catch'),true);
 assert.equal(availableCompanionClips(pet,{...options,growthUnlocks:false}).includes('ball-catch'),true);
 assert.ok(availableCompanionClips(pet,options).includes('success-bow'));
 assert.deepEqual(availableCompanionClips(p, {paired:true}),[]);
 const pairOnly={...pet,manifest:{...pet.manifest,behaviors:{paired:pet.manifest.behaviors!.paired!}}};
 assert.ok(availableCompanionClips(pairOnly,{paired:true}).includes('wave'));
 assert.ok(availableCompanionClips(pairOnly,{paired:true}).includes('ball-catch'));
});
test('external movement requires unlocked left, right and planted stop poses before position can change',async()=>{
 const p=await fixture(),movement={left:'move:left',right:'move:right',stop:'move:stop'},options={growthUnlocks:true,interactions:0};
 const pet={...p,manifest:{...p.manifest,behaviors:{movement}},animations:[...p.animations,...Object.values(movement).map(id=>({...p.animations[0]!,id,unlockAt:0}))]};
 assert.equal(petMovementAvailable(p,options),false);assert.equal(petMovementAvailable(pet,options),true);
 for(const id of Object.values(movement)){
  const locked={...pet,animations:pet.animations.map(animation=>animation.id===id?{...animation,unlockAt:5}:animation)};
  assert.equal(petMovementAvailable(locked,options),false,`${id} must be available before travel`);
  assert.equal(petMovementAvailable(locked,{...options,interactions:5}),true);
  assert.equal(petMovementAvailable(locked,{...options,growthUnlocks:false}),true);
  assert.equal(petMovementAvailable({...pet,animations:pet.animations.filter(animation=>animation.id!==id)},options),false);
 }
});
test('external explicit serials restart the same true sequence; ordinary repeated snapshots do not',async()=>{
 const p=await fixture(),d=new PetDirector(p),input={state:'idle' as const,richness:2,reduced:false,activity:0,pressure:0,preview:'adult:success',previewSerial:'first'};
 assert.equal(d.choose(input,0).time,0);assert.equal(d.choose(input,500).time,500);assert.equal(d.choose(input,800).time,800);
 assert.equal(d.choose({...input,previewSerial:'second'},900).time,0);assert.equal(d.choose({...input,previewSerial:'second'},1000).time,100);
});
test('role placement fixes the real foot and ignores interaction capability or setting geometry',async()=>{
 const p=await fixture(),a=petLayout(p.manifest),changed={...p.manifest,capabilities:[]};assert.deepEqual(petLayout(changed),a);
 const manifest=extended(p),b=petLayout(manifest);assert.ok(Math.abs(b.x+b.foot.x*b.scale-236)<1e-8);assert.ok(Math.abs(b.y+b.foot.y*b.scale-213)<1e-8);
 assert.ok(Number.isFinite(b.scale)&&b.scale>0);assert.ok(b.x+manifest.body.bounds.x*b.scale>=b.left-1e-8);
});
