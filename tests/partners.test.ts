import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {parsePet,type PetBundle} from '../src/pet/contract.js';
import {resolvePartnerSelection,jointPairedClips,pairedRoleIssue,partnerMotion,loadPartnerAsset,type PartnerAssetSource} from '../src/pet/partner.js';
import {validatePartnerRole,effectiveLifeOptions} from '../src/companion/life-options.js';
import {decodeLifestyle,decodeSchemes,exportScheme,presetConfig} from '../src/companion/config.js';
import {LifeProgramDirector,lifeProgramClips,type LifeProgramEnvironment} from '../src/companion/life-programs.js';
import {lifeDefaults} from '../src/companion/life.js';
import type {LoadedPet} from '../src/pet/library.js';

const encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
let original:Promise<PetBundle>|undefined;
async function fixture(){
 original??=(async()=>{const files:Record<string,Uint8Array>={};for(const name of await readdir('examples/bigfish-adult'))files[name]=new Uint8Array(await readFile(`examples/bigfish-adult/${name}`));return parsePet(files);})();
 const p=await original,manifest={...p.manifest,capabilities:[...p.manifest.capabilities,'paired'],body:{bounds:{x:0,y:0,width:372,height:512},foot:{x:186,y:500}},behaviors:{paired:{greet:'adult:idle',exchange:'adult:typing',part:'adult:success'}}};
 return parsePet({...p.files,'pet.json':encode(manifest)});
}
const entry={key:'bigfish-adult@1.0.0',id:'bigfish-adult',name:'大肥鱼 · 成年版',author:'fixture',version:'1.0.0',actions:9,capabilities:['paired']};
const options={interactions:0,growthUnlocks:false,richness:2};
test('old schemes default to following the primary role, while explicit buddy references remain portable and unprivileged',()=>{
 const old={...presetConfig('balanced')} as Record<string,unknown>;delete old.partnerRole;
 assert.equal(decodeLifestyle(old).partnerRole,'follow-main');
 for(const role of ['follow-main','builtin',entry.key])assert.equal(validatePartnerRole(role),role);
 for(const bad of ['https://example.com/pet','../pack@1.0.0','role@latest','role@1.0.0?token=x',{},null])assert.throws(()=>validatePartnerRole(bad));
 assert.throws(()=>decodeLifestyle({...old,partnerRole:'file:///secret'}));
 const c=decodeLifestyle({...old,partnerRole:entry.key,pairEnabled:true});
 assert.equal(effectiveLifeOptions(c).partnerRole,entry.key);assert.equal(effectiveLifeOptions(c).pairEnabled,false);
 assert.equal(decodeSchemes([{name:'下班搭子',config:exportScheme(c)}])[0]!.config.partnerRole,entry.key);
});
test('the partner selector keeps installed roles separate from primary selection and makes a removed role unavailable',async()=>{
 const pet=await fixture(),active={key:entry.key,pet};
 assert.deepEqual(resolvePartnerSelection('follow-main',{entries:[entry]},active),{kind:'pack',key:entry.key,name:pet.manifest.name});
 assert.equal(resolvePartnerSelection('builtin',{entries:[entry]},active).kind,'builtin');
 assert.equal(resolvePartnerSelection(entry.key,{entries:[entry]},null).kind,'pack');
 assert.equal(resolvePartnerSelection(entry.key,{entries:[]},active).kind,'missing');
 assert.equal(resolvePartnerSelection('follow-main',{entries:[]},null).kind,'builtin');
});
test('both sides use their own authored pairing phases; absent, locked, still-only or too-intense artwork cannot be promoted',async()=>{
 const pet=await fixture();
 for(const [a,b] of [[pet,null],[null,pet],[pet,pet]] as const){assert.equal(pairedRoleIssue(a,b,options),'');for(const clip of ['wave','ball-catch','fish-toy','tea','biscuit'])assert.ok(jointPairedClips(a,b,options).includes(clip));}
 assert.equal(partnerMotion(pet,'wave',false),'adult:idle');assert.equal(partnerMotion(pet,'ball-catch',false),'adult:typing');assert.equal(partnerMotion(pet,'wave',true),'adult:success');
 const noPair={...pet,manifest:{...pet.manifest,capabilities:pet.manifest.capabilities.filter(cap=>cap!=='paired')}};
 assert.deepEqual(jointPairedClips(null,noPair,options),[]);assert.notEqual(pairedRoleIssue(noPair,pet,options),'');
 for(const id of Object.values(pet.manifest.behaviors!.paired!)){
  const locked={...pet,animations:pet.animations.map(a=>a.id===id?{...a,unlockAt:10}:a)};
  assert.deepEqual(jointPairedClips(pet,locked,{...options,growthUnlocks:true}),[]);
  assert.ok(jointPairedClips(pet,locked,{...options,growthUnlocks:true,interactions:10}).includes('wave'));
  const still={...pet,animations:pet.animations.map(a=>a.id===id?{...a,frames:[a.frames[0]!,a.frames[0]!]}:a)};
  assert.deepEqual(jointPairedClips(null,still,options),[]);
  const energetic={...pet,animations:pet.animations.map(a=>a.id===id?{...a,intensity:2}:a)};
  assert.deepEqual(jointPairedClips(null,energetic,{...options,richness:1}),[]);
 }
});
test('an old Host download cannot decode, publish, or mutate its replacement role library',async()=>{
 const pet=await fixture();let resolve!:(bytes:Uint8Array)=>void,decoded=0,loaded=0;
 const source:PartnerAssetSource={scope:1,catalog:{entries:[entry]},bytes:()=>new Promise(done=>{resolve=done;})};
 const loading=loadPartnerAsset(source,entry.key,1,()=>true,{decode:async()=>{decoded++;return pet;},load:async()=>{loaded++;throw Error('must not decode old images');}});
 Object.assign(source,{scope:2,catalog:{entries:[entry]}});resolve(new Uint8Array());
 await assert.rejects(loading,/Host 已变化/);assert.equal(decoded,0);assert.equal(loaded,0);
});
test('a mismatched role download is rejected before allocating image URLs',async()=>{
 const pet=await fixture();let images=0;
 const wrong={...pet,manifest:{...pet.manifest,id:'other-host-role'}};
 const source:PartnerAssetSource={scope:1,catalog:{entries:[entry]},bytes:async()=>new Uint8Array()};
 await assert.rejects(loadPartnerAsset(source,entry.key,1,()=>true,{decode:async()=>wrong,load:async()=>{images++;throw Error('must not allocate');}}),/角色标识不匹配/);
 assert.equal(images,0);
});
test('an image lease is released on cancellation, Host replacement or role removal, never by another owner',async()=>{
 const pet=await fixture();
 for(const invalidation of ['cancel','host','remove']){
  let resolve!:(loaded:LoadedPet)=>void,entered!:()=>void,releases=0,current=true;
  const decoding=new Promise<void>(done=>{entered=done;});
  const source:PartnerAssetSource={scope:1,catalog:{entries:[entry]},bytes:async()=>new Uint8Array()};
  const loading=loadPartnerAsset(source,entry.key,1,()=>current,{decode:async()=>pet,load:async()=>{entered();return new Promise(done=>{resolve=done;});}});
  await decoding;
  if(invalidation==='cancel')current=false;else if(invalidation==='host')Object.assign(source,{scope:2});else source.catalog.entries=[];
  resolve({key:entry.key,pet,images:{},thumbnail:'fixture',release:()=>{releases++;}});
  await assert.rejects(loading,/伙伴角色或 Host 已变化/);assert.equal(releases,1);
 }
 let releases=0;const source:PartnerAssetSource={scope:3,catalog:{entries:[entry]},bytes:async()=>new Uint8Array()};
 const asset=await loadPartnerAsset(source,entry.key,3,()=>true,{decode:async()=>pet,load:async()=>({key:entry.key,pet,images:{},thumbnail:'fixture',release:()=>{releases++;}})});
 assert.equal(releases,0);asset.release();assert.equal(releases,1);
});
test('changing either role or Host cancels an existing paired chain even when its semantic clips are identical',()=>{
 const config=presetConfig('all'),env:LifeProgramEnvironment={enabled:true,growth:true,life:lifeDefaults(),options:config,availableClips:lifeProgramClips,pairedClips:lifeProgramClips,pairedIdentity:'host-a:primary-a:buddy-a',blocked:false,quiet:false,working:false};
 for(const identity of ['host-b:primary-a:buddy-a','host-a:primary-b:buddy-a','host-a:primary-a:buddy-b']){
  const director=new LifeProgramDirector();assert.equal(director.start({kind:'paired'},env,1000),true);assert.ok(director.tick(env,1000));
  assert.equal(director.tick({...env,pairedIdentity:identity,playbackReady:'life-program-1-0'},1200),null);
  assert.equal(director.tick(env,1300),null);
 }
 const old={...env};delete old.pairedIdentity;const director=new LifeProgramDirector();assert.equal(director.start({kind:'paired'},old,1000),true);assert.ok(director.tick(old,2000));
});
