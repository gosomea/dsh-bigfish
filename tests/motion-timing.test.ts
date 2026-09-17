import test from 'node:test';
import assert from 'node:assert/strict';
import {PetDirector,frameAt} from '../src/pet/director.js';
import type {PetAnimation,PetBundle} from '../src/pet/contract.js';
import {parsePack} from '../src/contract/scenes.js';
import {Director} from '../src/domain/director.js';
import manifest from '../packs/classic/manifest.json' with {type:'json'};
function fixture(){
 const make=(id:string,tags:string[],loop=true):PetAnimation=>({id,label:id,tags,intensity:0,loop,weight:1,cooldownMs:0,speed:[1,1],frames:[0,1,2,3].map(x=>({asset:'main',rect:[x,0,1,1],durationMs:250}))});
 return {manifest:{fallbacks:{idle:'idle',working:'work',attention:'attention',error:'error',success:'success'}},animations:[make('idle',['idle']),make('work',['working','read']),make('write',['writing']),make('attention',['attention'],false),make('error',['error'],false),make('success',['success'],false)]} as unknown as PetBundle;
}
const input={state:'tool-running' as const,tag:'read',richness:1,reduced:false,activity:0,pressure:0};
test('ordinary tool semantics switch at cycle end; confirmation interrupts immediately',()=>{
 const d=new PetDirector(fixture(),()=>0);assert.equal(d.choose(input,0).animation.id,'work');
 assert.equal(d.choose({...input,tag:'writing'},300).animation.id,'work');
 assert.equal(d.choose({...input,tag:'writing'},990).animation.id,'work');
 assert.equal(d.choose({...input,tag:'writing'},1000).animation.id,'work');
 assert.equal(d.choose({...input,tag:'writing'},4000).animation.id,'write');
 assert.equal(d.choose({...input,state:'waiting-user'},4010).animation.id,'attention');
});
test('one-shots finish before an ordinary semantic switch and never periodically restart',()=>{
 const p=fixture();p.animations.find(a=>a.id==='work')!.loop=false;const d=new PetDirector(p,()=>0);
 d.choose(input,0);assert.equal(d.choose({...input,tag:'writing'},500).animation.id,'work');
 assert.equal(d.choose({...input,tag:'writing'},1000).animation.id,'work');
 assert.equal(d.choose({...input,tag:'writing'},4000).animation.id,'write');
 const attention={...input,state:'waiting-user' as const,tag:'attention'};d.choose(attention,4100);
 const a=d.choose(attention,25000);assert.equal(a.animation.id,'attention');assert.equal(frameAt(a.animation,a.time),a.animation.frames.at(-1));
 assert.ok(d.choose(attention,37000).time>a.time);
});
test('changing playback speed integrates elapsed segments without rewind or jump',()=>{
 const p=fixture();p.animations.find(a=>a.id==='work')!.speed=[.5,2];const d=new PetDirector(p,()=>0);
 d.choose(input,0);assert.equal(d.choose(input,100).time,50);
 assert.equal(d.choose({...input,activity:1},200).time,250);
 assert.equal(d.choose(input,300).time,300);
});
test('ordinary semantic change cannot be hidden behind an author-defined long loop',()=>{
 const p=fixture();p.animations[1]!.frames.forEach(f=>f.durationMs=10000);const d=new PetDirector(p,()=>0);d.choose(input,0);
 const next={...input,tag:'writing'};assert.equal(d.choose(next,100).animation.id,'work');assert.equal(d.choose(next,6100).animation.id,'write');
});
test('recent motion history avoids the last three when more alternatives exist',()=>{
 const p=fixture();p.animations.push(...['a','b','c','d'].map(id=>({...p.animations[1]!,id})));const d=new PetDirector(p,()=>0);const ids=[];
 for(let t=0;t<=80000;t+=20000)ids.push(d.choose(input,t).animation.id);
 assert.equal(new Set(ids.slice(0,4)).size,4);assert.notEqual(ids[4],ids[3]);assert.notEqual(ids[4],ids[2]);assert.notEqual(ids[4],ids[1]);
});
test('built-in confirmation has one dedicated sequence across every richness tier',()=>{
 const p=parsePack(manifest,()=>true);
 for(const richness of [0,1,2]){const d=new Director(p);for(let t=0;t<30000;t+=500){const direction=d.tick({sessionId:'s',turn:1,state:'waiting-user',pressure:0,fatigue:0},t,{richness,reduced:false,idleMotion:''});assert.equal(direction.actionId,'confirm');assert.equal(direction.whipAllowed,false);}}
});
test('built-in random scheduling waits for render cycle completion but urgent state interrupts',()=>{
 const p=parsePack(manifest,()=>true),d=new Director(p);const i={sessionId:'s',turn:1,state:'generating' as const,pressure:.6,fatigue:.2};
 const policy={richness:2,reduced:false,idleMotion:'',switchReady:false};const first=d.tick(i,0,policy);
 const held=d.tick(i,30000,policy);assert.equal(held.sceneId,first.sceneId);assert.equal(held.actionId,first.actionId);
 assert.equal(d.tick({...i,state:'waiting-user'},30001,policy).actionId,'confirm');
});
test('new atlas bounds and one-shot flags are validated while older packs still load',()=>{
 const m=structuredClone(manifest);m.scenes[0]!.actions[0]!.animation!.frames=[8];assert.throws(()=>parsePack(m,()=>true),/sequence/);
 const old=structuredClone(manifest);for(const s of old.scenes)for(const a of s.actions)if(a.animation)delete (a.animation as {loop?:boolean}).loop;assert.ok(parsePack(old,()=>true));
});
test('turning off encouragement removes built-in dodge/flinch choices immediately at every intensity',()=>{
 const p=parsePack(manifest,()=>true),i={sessionId:'s',turn:1,state:'generating' as const,pressure:.9,fatigue:.5};
 for(const richness of [0,1,2]){
  const d=new Director(p);d.tick(i,0,{richness,reduced:false,idleMotion:''});
  for(let t=1;t<=60000;t+=300){
   const out=d.tick(i,t,{richness,reduced:false,idleMotion:'',whipEnabled:false,switchReady:true});d.completeTransition();
   const action=p.scenes.find(s=>s.id===out.sceneId)!.actions.find(a=>a.id===out.actionId)!;
   assert.ok(!['dodge','flinch'].includes(action.motion));assert.equal(out.whipAllowed,false);
  }
 }
});
test('external near-miss never enters ordinary working pool, even if authored as working or fallback',()=>{
 const p=fixture();const reaction={...p.animations[1]!,id:'dodge',tags:['near-miss','working','read'],weight:10000};p.animations.unshift(reaction);p.manifest.fallbacks.working='dodge';
 const d=new PetDirector(p,()=>0);
 for(let t=0;t<60000;t+=1000)assert.notEqual(d.choose(input,t).animation.id,'dodge');
 assert.equal(d.choose({...input,preview:'dodge'},60001).animation.id,'dodge'); // Explicit asset inspection remains available.
});

test('external greeting replays on a new idle burst even when the fallback shares its animation ID',()=>{
 const p=fixture();p.animations[0]!.tags.push('greeting');p.animations[0]!.loop=false;const d=new PetDirector(p,()=>0);
 const idle={active:true,showText:true,motion:'wait-sign',text:'你好',serial:1};const i={...input,state:'idle' as const,idle};d.choose(i,0);assert.ok(d.choose(i,3000).time>=3000);
 d.choose({...i,idle:{...idle,active:false}},12000);assert.equal(d.choose({...i,idle:{...idle,serial:2}},30000).time,0);
});
test('external ordinary playback does not advance under an air-swing reaction or rotate urgent poses',()=>{
 const p=fixture(),d=new PetDirector(p,()=>0);d.choose(input,0);const a=d.choose(input,500);
 assert.equal(d.choose({...input,reactionActive:true},5000).time,a.time);
 p.animations.push({...p.animations.find(a=>a.id==='attention')!,id:'attention-alt'});
 const waiting={...input,state:'waiting-user' as const};const first=d.choose(waiting,5100);assert.equal(d.choose(waiting,30000).animation.id,first.animation.id);
});
