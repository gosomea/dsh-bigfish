import test from 'node:test';
import assert from 'node:assert/strict';
import {DailyActivityRotation,LocalSpeechGate,activityInterval,movementInterval,adventureInterval,authoredMotionIntensity,autonomousClipAllowed} from '../src/companion/activity.js';
import {IdleDirector} from '../src/domain/idle.js';
import {LifeRoutineDirector} from '../src/companion/routines.js';
import {WanderDirector} from '../src/companion/movement.js';
import {preferenceDefaults as defaults} from '../src/contract/preferences.js';
import {presetConfig} from '../src/companion/config.js';

test('six activity choices share one cadence; advanced overrides preserve their explicit values',()=>{
 const config={...presetConfig('balanced'),restMin:83,restMax:117,adventureMinutes:71};
 for(const [mode,pair] of Object.entries({quiet:[Infinity,Infinity],occasional:[60,120],natural:[15,30],frequent:[5,10],continuous:[1,3],custom:[8,17]})){
  const p={...defaults,idleMode:mode as typeof defaults.idleMode,idleMinSeconds:8,idleMaxSeconds:17};
  assert.deepEqual(activityInterval(p),pair);assert.deepEqual(movementInterval(p,{...config,activityOverrides:false}),pair);
  assert.deepEqual(movementInterval(p,{...config,activityOverrides:true}),[83,117]);
  assert.equal(adventureInterval(p,{...config,activityOverrides:true}),71*60000);
  assert.ok(adventureInterval(p,{...config,activityOverrides:false})>=15*60000);
 }
 assert.equal(config.restMin,83);assert.equal(config.adventureMinutes,71);
});
test('equal deadlines rotate independently of polling order and measure rest after the full gesture',()=>{
 const d=new DailyActivityRotation(()=>0),p={...defaults,idleMode:'continuous' as const};d.configure(p,['idle','life','wander'],0);
 for(let cycle=0;cycle<3;cycle++)for(const [index,channel] of (['idle','life','wander'] as const).entries()){
  const now=(cycle*3+index)*10000+1000;
  for(const other of ['wander','life','idle'] as const)assert.equal(d.canStart(other,now),other===channel);
  d.started(channel,now);for(const other of ['idle','life','wander'] as const)assert.equal(d.canStart(other,now+8000),false);
  d.finished(channel,now+8000);assert.equal(d.canStart(channel,now+8999),false);
 }
});
test('real idle, life and authored movement remain reachable together in frequent mode',()=>{
 const gate=new DailyActivityRotation(()=>0),p={...defaults,greetOnOpen:false,talkLevel:0},config=presetConfig('balanced');gate.configure(p,['idle','life','wander'],0);
 const idle=new IdleDirector({greeted:true},()=>0),life=new LifeRoutineDirector(()=>0),wander=new WanderDirector({x:200,y:50},()=>0);
 const area={x:0,y:0,width:700,height:400},size={width:100,height:150};let living=false,walking=false;
 const counts={idle:0,life:0,wander:0},prior={idle:false,life:false,wander:false};
 for(let now=0;now<=300000;now+=100){
  const gesture=idle.tick(now,!living&&!walking,true,p,false,undefined,{canStart:gate.canStart('idle',now)});
  if(gesture.active)gate.started('idle',now);else gate.finished('idle',now);
  const routine=life.tick({enabled:true,config,idleMode:p.idleMode,state:'idle',tasks:[],blocked:false,blockStart:gesture.active||walking,urgent:false,interacting:false,quiet:false,activity:gate},now);living=!!routine;
  const frame=wander.tick(now,area,size,{enabled:true,capable:true,radius:100,speed:60,restMin:0,restMax:0,blockStart:gesture.active||living||!gate.canStart('wander',now)});walking=frame.phase!=='rest';
  if(walking)gate.started('wander',now);else gate.finished('wander',now);
  const current={idle:gesture.active,life:living,wander:walking};
  assert.ok(Object.values(current).filter(Boolean).length<=1);
  for(const channel of ['idle','life','wander'] as const){if(current[channel]&&!prior[channel])counts[channel]++;prior[channel]=current[channel];}
 }
 for(const [channel,count] of Object.entries(counts))assert.ok(count>=2,`${channel}: ${count}`);
});
test('explicit walk cadence applies to the first outing and repeats without postponing ordinary idle',()=>{
 const d=new DailyActivityRotation(()=>0),p={...defaults,idleMode:'occasional' as const};d.configure(p,['idle','wander'],0,[5,5]);
 assert.equal(d.canStart('wander',4999),false);assert.equal(d.canStart('wander',5000),true);assert.equal(d.canStart('idle',5000),false);
 d.started('wander',5000);assert.equal(d.canStart('idle',60000),false,'an active walk is never cut in half');d.finished('wander',65000);
 assert.equal(d.canStart('idle',65000),true,'the already-due ordinary turn survives an override walk');
 d.started('idle',65000);d.finished('idle',66000);
 assert.equal(d.canStart('wander',69999),false);assert.equal(d.canStart('wander',70000),true);
 d.started('wander',70000);d.finished('wander',71000);assert.equal(d.canStart('wander',76000),true);
 d.configure({...p,idleMode:'quiet'},['idle','wander'],80000,[5,5]);assert.equal(d.canStart('wander',999999),false);
 d.configure(p,['idle','wander'],1000000,[5,5]);assert.equal(d.canStart('wander',1005000),true);
});
test('all authored sequences have amplitude metadata and gentle locomotion retains actual planted-foot clips',()=>{
 assert.equal(Object.keys(authoredMotionIntensity).length,32);
 for(const clip of ['walk','start-step','turn','stop','sit-down','wake-up'])assert.equal(autonomousClipAllowed(clip,0),true);
 for(const clip of ['tiptoe','ball-catch','fish-toy']){assert.equal(autonomousClipAllowed(clip,1),false);assert.equal(autonomousClipAllowed(clip,2),true);}
});
test('a channel without a playable scene or usable geometry yields rather than starving the rest',()=>{
 const d=new DailyActivityRotation(()=>0);d.configure({...defaults,idleMode:'continuous'},['idle','life','wander'],0);
 d.started('idle',0);d.finished('idle',1);assert.equal(d.canStart('life',1001),true);d.declined('life',1001);
 assert.equal(d.canStart('wander',1001),true);assert.equal(d.canStart('idle',3001),true);
});
test('local speech is shared, stable per utterance and direct/factual messages bypass ordinary limits',()=>{
 for(const [level,interval] of [[0,Infinity],[1,30000],[2,10000]] as const){
  const gate=new LocalSpeechGate();assert.equal(gate.allow('greeting',0,level,true),true);
  assert.equal(gate.allow('idle',1000,level),false);assert.equal(gate.allow('idle',60000,level),false);
  assert.equal(gate.allow('life',interval===Infinity?600000:interval,level),level>0);
  assert.equal(gate.allow('manual',2000,level,true),true);assert.equal(gate.allow('failure',2001,level,true),true);
 }
 const sources=new LocalSpeechGate();assert.equal(sources.allow('routine:same-serial',0,1),true);
 assert.equal(sources.allow('adventure:same-serial',1000,1),false,'a different source cannot reuse a cached display decision');
 assert.equal(sources.allow('program:same-serial',30000,1),true);
});
test('events-only idle still rotates signs while retaining one greeting and no autonomous bubble',()=>{
 const d=new IdleDirector(undefined,()=>0),p={...defaults,talkLevel:0,idleMode:'continuous' as const};
 assert.equal(d.tick(0,true,true,p).showText,true);let previous=0,changes=0;
 for(let now=1000;now<=120000;now+=1000){const f=d.tick(now,true,true,p);if(now>=6000)assert.equal(f.showText,false);if(f.serial!==previous){previous=f.serial;changes++;}}
 assert.ok(changes>4);
});
