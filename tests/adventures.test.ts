import test from 'node:test';
import assert from 'node:assert/strict';
import {AdventureDirector,adventureKinds,adventurePlans,adventureDuration,adventureMissingClips,type AdventureEnvironment} from '../src/companion/adventures.js';
const clips=[...new Set(adventureKinds.flatMap(kind=>adventurePlans[kind].steps.map(step=>step.clip)))];
const environment:AdventureEnvironment={enabled:true,quiet:false,important:false,working:false,dragging:false,availableClips:clips};
test('automatic amplitude restrictions never prevent an explicit local scene',()=>{
 const env={...environment,automaticClips:[]},d=new AdventureDirector({automatic:true,cooldownSeconds:60,kinds:adventureKinds});
 d.maybeStart(0,env);assert.equal(d.maybeStart(60000,env),false);
 assert.equal(d.start('paper-boat',61000,env,'manual'),true);assert.equal(d.tick(61000,env)?.source,'manual');
});
test('manual scenes retain each authored clip for its sequence and final hold, then actually finish',()=>{
 for(const kind of adventureKinds){
  const d=new AdventureDirector();assert.equal(d.start(kind,0,environment),true);
  let elapsed=0;
  for(const [index,step] of adventurePlans[kind].steps.entries()){
   const first=d.tick(elapsed,environment)!,last=d.tick(elapsed+step.durationMs-1,environment)!;
   assert.equal(first.phaseIndex,index);assert.equal(first.clip,step.clip);assert.equal(last.clip,step.clip);assert.equal(first.clipSerial,last.clipSerial);
   assert.ok(step.durationMs>=8*280+3000);assert.equal(first.fictional,true);elapsed+=step.durationMs;
  }
  assert.equal(elapsed,adventureDuration(kind));assert.equal(d.tick(elapsed,environment),null);
 }
});
test('automatic scenes wait a real cooldown, do not reset it each tick and avoid immediate repeats',()=>{
 const d=new AdventureDirector({automatic:true,cooldownSeconds:60,kinds:adventureKinds},()=>0);
 assert.equal(d.maybeStart(0,environment),false);assert.equal(d.readyAt,60000);
 for(let n=1000;n<60000;n+=1000)assert.equal(d.maybeStart(n,environment),false);
 assert.equal(d.maybeStart(60000,environment),true);const first=d.tick(60000,environment)!;
 assert.equal(d.maybeStart(60001,environment),false);const end=60000+adventureDuration(first.kind);
 assert.equal(d.tick(end,environment),null);assert.equal(d.maybeStart(end+59999,environment),false);
 assert.equal(d.maybeStart(end+60000,environment),true);assert.notEqual(d.tick(end+60000,environment)!.kind,first.kind);
});
test('quiet and work suppress automatic scenes; an explicit preview may still play quietly',()=>{
 for(const blocked of [{quiet:true},{working:true},{important:true},{dragging:true},{visible:false},{enabled:false}]){
  const d=new AdventureDirector({automatic:true,cooldownSeconds:60,kinds:adventureKinds});
  d.maybeStart(0,environment);assert.equal(d.maybeStart(60000,{...environment,...blocked}),false);
 }
 const d=new AdventureDirector();assert.equal(d.start('fishing',0,{...environment,quiet:true,working:true}),true);
 assert.equal(d.tick(1,{...environment,quiet:true,working:true})?.source,'manual');
});
test('important events and dragging cancel the chain without replaying an interrupted prop scene',()=>{
 for(const blocked of [{important:true},{dragging:true},{visible:false},{enabled:false}]){
  const d=new AdventureDirector({automatic:true,cooldownSeconds:60,kinds:adventureKinds});
  assert.equal(d.start('box',0,environment),true);assert.equal(d.tick(100,{...environment,...blocked}),null);
  assert.equal(d.tick(1000,environment),null);assert.equal(d.maybeStart(60099,environment),false);
 }
 const d=new AdventureDirector({automatic:true,cooldownSeconds:60,kinds:adventureKinds});d.maybeStart(0,environment);d.maybeStart(60000,environment);
 assert.equal(d.tick(60100,{...environment,quiet:true}),null);
});
test('missing character clips never turn into a translated standing image or a pretend capability',()=>{
 const d=new AdventureDirector();assert.equal(d.start('box',0,{...environment,availableClips:['wave']}),false);
 assert.ok(adventureMissingClips('box',['wave']).includes('lie-down'));
 d.maybeStart(0,environment);assert.equal(d.maybeStart(900000,{...environment,availableClips:[]}),false);
 assert.equal(d.readyAt,1800000);
});
test('configuration changes, clock rollback and invalid randomness cannot bypass cooldown or rewind poses',()=>{
 const d=new AdventureDirector({automatic:false,cooldownSeconds:60,kinds:['box']},()=>NaN);
 assert.equal(d.maybeStart(0,environment),false);d.configure({automatic:true,cooldownSeconds:60,kinds:['box']},0);
 assert.equal(d.maybeStart(59999,environment),false);assert.equal(d.maybeStart(60000,environment),true);
 const a=d.tick(62000,environment)!;assert.equal(d.tick(61000,environment)?.phaseProgress,a.phaseProgress);
 d.configure({automatic:false,cooldownSeconds:60,kinds:['box']},62000);assert.equal(d.tick(62001,environment),null);
 assert.throws(()=>new AdventureDirector({automatic:true,cooldownSeconds:0,kinds:[]}));
});

test('only the current display may act, configured kinds are respected and changing the 30-minute interval arms once',()=>{
 const d=new AdventureDirector(),configured={...environment,autoIntervalMs:1800000,allowedKinds:['fishing'] as const,reducedMotion:true};
 assert.equal(d.maybeStart(0,configured),false);assert.equal(d.readyAt,1800000);
 assert.equal(d.maybeStart(1800000,{...configured,displayOwner:false}),false);
 assert.equal(d.maybeStart(1800000,configured),true);const scene=d.tick(1800000,configured)!;
 assert.equal(scene.kind,'fishing');assert.equal(scene.reducedMotion,true);
 assert.equal(d.tick(1800100,{...configured,displayOwner:false}),null);
 assert.equal(d.start('box',1800200,configured),false);
 assert.equal(d.maybeStart(1800300,configured),false);
 assert.equal(d.start('fishing',1800400,configured,'automatic'),false);
});

test('imported 120-minute automatic interval remains effective beyond the three UI presets',()=>{
 const d=new AdventureDirector(),env={...environment,autoIntervalMs:7200000};
 assert.equal(d.maybeStart(0,env),false);assert.equal(d.readyAt,7200000);
 assert.equal(d.maybeStart(3600000,env),false);assert.equal(d.maybeStart(7200000,env),true);
});
