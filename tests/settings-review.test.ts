import {PreferenceStore} from '../src/client/preferences-store.js';
import {idleSignFrame} from '../src/domain/idle-frames.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {IdleDirector,idleInterval,isSign} from '../src/domain/idle.js';
import {Presentation} from '../src/domain/presentation.js';
import {decodePreferences,preferenceDefaults as defaults,preferenceRanges} from '../src/contract/preferences.js';
import {fixture} from './helpers.js';

test('all five idle presets and custom use post-gesture rest with bounded deadlines',()=>{
 for(const idleMode of ['occasional','natural','frequent','continuous','custom'] as const){
  const p={...defaults,idleMode,idleMinSeconds:8,idleMaxSeconds:15,idleHoldSeconds:18};
  const d=new IdleDirector(undefined,()=>.5);const start=d.tick(1000,true,true,p);
  assert.equal(start.active,true);const [min,max]=idleInterval(p);
  assert.ok(d.memory.nextAt>=19000+min*1000&&d.memory.nextAt<=19000+max*1000);
  assert.equal(d.tick(18999,true,true,p).active,true);assert.equal(d.tick(19000,true,true,p).active,false);
  const next=d.memory.nextAt;assert.equal(d.tick(next-1,true,true,p).active,false);assert.equal(d.tick(next,true,true,p).active,true);
 }
});
test('background, folding and remounting never postpone an existing idle deadline',()=>{
 const p={...defaults,greetOnOpen:false};const d=new IdleDirector(undefined,()=>.5);
 d.tick(1000,true,true,p);const due=d.memory.nextAt;
 d.tick(2000,true,false,p);d.tick(4000,true,true,p);assert.equal(d.memory.nextAt,due);
 const restored=new IdleDirector(d.memory,()=>.5);restored.tick(5000,true,true,p);assert.equal(restored.memory.nextAt,due);
 assert.equal(restored.tick(due,true,true,p).active,true);
});
test('a new tab opened while working still greets when it first becomes idle',()=>{
 const d=new IdleDirector(undefined,()=>.5);d.tick(0,false,true,defaults);
 assert.equal(d.tick(1000,true,true,defaults).motion,'wait-sign');
});
test('sign preferences honor no-sign, blank dialogue and motion tiers',()=>{
 for(const richness of [0,1,2])for(const idleSignPreference of ['prefer','balanced','none'] as const){
  const p={...defaults,richness,idleSignPreference};const d=new IdleDirector(undefined,()=>.99);let now=0,priorSign=true;
  for(let i=0;i<20;i++){
   const v=d.tick(now,true,true,p),sign=isSign(v.motion);
   if(idleSignPreference==='none')assert.equal(sign,false);
   if(idleSignPreference==='prefer')assert.ok(priorSign||sign);
   priorSign=sign;now=d.memory.nextAt;
  }
 }
 const d=new IdleDirector(undefined,()=>.9);assert.equal(isSign(d.tick(0,true,true,{...defaults,dialogueJson:'{"idle":[]}'}).motion),false);
});
test('reduced motion explains why idle is paused and resumes when normal is selected',()=>{
 const d=new IdleDirector(undefined,()=>.5);assert.equal(d.tick(0,true,true,defaults,true).reason,'reduced');
 assert.equal(d.tick(120000,true,true,defaults,true).active,false);assert.equal(d.tick(120001,true,true,defaults,false).active,true);
});
test('stopped sessions settle without altering real outcomes; errors and waiting stay visible',()=>{
 const snapshot=fixture().engine.snapshot();
 for(const state of ['cancelled','interrupted'] as const){
  const d=new Presentation(),s={...snapshot,state};assert.equal(d.show(s,defaults,0).state,state);
  assert.equal(d.show(s,defaults,3999).state,state);assert.equal(d.show(s,defaults,4000).state,'idle');assert.equal(s.state,state);
  const other={...s,sessionId:'other'};assert.equal(d.show(other,defaults,5000).state,state);
 }
 for(const state of ['waiting-user','failed','disconnected','blocked'] as const){const d=new Presentation(),s={...snapshot,state};d.show(s,defaults,0);assert.equal(d.show(s,defaults,999999).state,state);}
});
test('configuration validates every numeric range, custom interval and legacy display choices',()=>{
 for(const [key,[min,max]] of Object.entries(preferenceRanges)){
  assert.throws(()=>decodePreferences({...defaults,[key]:min-1}),key);assert.throws(()=>decodePreferences({...defaults,[key]:max+1}),key);
  assert.throws(()=>decodePreferences({...defaults,[key]:NaN}),key);
 }
 assert.throws(()=>decodePreferences({...defaults,idleMinSeconds:30,idleMaxSeconds:10}));
 for(const idleMode of ['quiet','occasional','frequent'] as const)assert.equal(decodePreferences({version:2,idleMode}).idleMode,idleMode);
 const p=decodePreferences({bubbleText:true,bubbleStatus:false});assert.equal(p.bubbleStatus,false);assert.equal(p.bubbleText,true);
});

test('sign keeps its raised middle pose for most of the window and only lowers at the end',()=>{
 const frames=[0,1,2,2,2,2,3,2,2,2,1,0];
 assert.equal(frames[idleSignFrame(0,2.5,frames.length,12)],0);
 for(const t of [2,4,6,8])assert.equal(frames[idleSignFrame(t,2.5,frames.length,12)],2);
 assert.equal(frames[idleSignFrame(11.9,2.5,frames.length,12)],0);
 assert.equal(idleSignFrame(100,2.5,frames.length,12),frames.length-1);
});


test('queued idle sliders couple against the latest confirmed Host bounds',async()=>{
 let value={...defaults};let revision=0;
 const store=new PreferenceStore({getSnapshot:()=>({status:'ready',value,writable:true,mode:'host',revision}),subscribe:()=>()=>{},mutate:async(ops,expected)=>{
  assert.equal(expected,revision);await Promise.resolve();
  value=decodePreferences({...value,...Object.fromEntries(ops.map(op=>[op.path[0],op.value]))});revision++;
 }},null);
 await Promise.all([store.update({idleMinSeconds:60}),store.update({idleMaxSeconds:20}),store.update({idleMinSeconds:30})]);
 assert.equal(value.idleMinSeconds,30);assert.equal(value.idleMaxSeconds,30);assert.equal(revision,3);
 await assert.rejects(store.update({idleMinSeconds:50,idleMaxSeconds:10}));
 assert.equal(value.idleMaxSeconds,30);store.dispose();
});
