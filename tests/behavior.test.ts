import test from 'node:test';import assert from 'node:assert/strict';
import {IdleDirector} from '../src/domain/idle.js';import {Speech} from '../src/domain/speech.js';
import {decodePreferences,preferenceDefaults as defaults} from '../src/contract/preferences.js';
import {motionAllowed,motionReduced} from '../src/domain/motion-policy.js';
import {Director,seeded} from '../src/domain/director.js';import {parsePack} from '../src/contract/scenes.js';
import manifest from '../packs/classic/manifest.json' with {type:'json'};
const pack=parsePack(manifest,()=>true);
test('quiet idle has one greeting then no speech, signs or actions for ten minutes',()=>{
 const d=new IdleDirector(undefined,()=>0),p={...defaults,richness:2,idleMode:'quiet' as const};
 assert.equal(d.tick(0,true,true,p).motion,'wait-sign');assert.equal(d.tick(5000,true,true,p).motion,'breathe');
 for(let now=8000;now<=600000;now+=200){const v=d.tick(now,true,true,p);assert.equal(v.active,false);assert.equal(v.showText,false);assert.equal(v.motion,'breathe');}
 const restored=new IdleDirector(d.memory);assert.equal(restored.tick(601000,true,true,p).showText,false);
 d.tick(602000,false,true,p);assert.equal(d.tick(603000,true,true,p).showText,false);
});
test('idle modes share a single bounded burst, honor custom fixed/random lines, and stop for work',()=>{
 for(const [idleMode,min,max] of [['occasional',120000,300000],['frequent',20000,40000]] as const){
  const d=new IdleDirector({greeted:true},()=>.5),p={...defaults,idleMode,idleRandomText:true,dialogueJson:'{"idle":["A","B"]}'};
  d.tick(0,true,true,p);assert.ok(d.memory.nextAt>=min&&d.memory.nextAt<=max);const next=d.memory.nextAt;
  assert.equal(d.tick(next-1,true,true,p).active,false);const v=d.tick(next,true,true,p);assert.equal(v.active,true);assert.equal(v.showText,true);
  assert.equal(d.tick(next+6000,true,true,p).active,true);assert.equal(d.tick(next+6000,true,true,p).showText,false);assert.equal(d.tick(next+12000,true,true,p).active,false);const second=d.tick(d.memory.nextAt,true,true,p);assert.notEqual(second.text,v.text);
  assert.equal(d.tick(d.memory.nextAt+1,false,true,p).active,false);
 }
 const d=new IdleDirector(),p={...defaults,idleRandomText:false,dialogueJson:'{"idle":["固定一句","另一句"]}'};assert.equal(d.tick(0,true,true,p).text,'固定一句');
});
test('hidden time, folding, restored cooldown and disabled greeting never replay idle bursts',()=>{
 const p={...defaults,idleMode:'frequent' as const},d=new IdleDirector();d.tick(0,true,true,p);d.tick(1000,true,false,p);
 assert.equal(d.tick(600000,true,true,p).active,false);assert.ok(d.memory.nextAt>600000);
 const restored=new IdleDirector(d.memory);assert.equal(restored.tick(600100,true,true,p).active,false);
 assert.equal(new IdleDirector().tick(0,true,true,{...defaults,greetOnOpen:false}).showText,false);
 assert.equal(new IdleDirector().tick(0,true,true,defaults,true).active,false);
});
test('events-only speech stays stable for ten minutes; important events do not rotate',()=>{
 const d=new Speech(()=>0);assert.equal(d.choose('s','read',['A','B'],0,2.5,0,{}),'A');
 assert.equal(d.choose('s','read',['A','B'],600000,2.5,0,{}),'A');
 assert.equal(d.choose('s','waiting',['确认1','确认2'],600001,2.5,2,{}),'确认1');assert.equal(d.choose('s','waiting',['确认1','确认2'],1200000,2.5,2,{}),'确认1');
 for(const [level,interval] of [[1,30000],[2,10000]]){const s=new Speech(()=>0);s.choose('s','read',['A','B'],0,2.5,level!,{});assert.equal(s.choose('s','read',['A','B'],interval!-1,2.5,level!,{}),'A');assert.equal(s.choose('s','read',['A','B'],interval!,2.5,level!,{}),'B');}
});
test('legacy preferences preserve user content and migrate once to quiet idle',()=>{
 const old={version:1,richness:2,talkLevel:2,dialogueJson:'{"read":["我的台词"]}',toolRulesJson:'[]',size:220,sound:true,reducedMotion:true};const p=decodePreferences(old);
 assert.equal(p.version,2);assert.equal(p.idleMode,'quiet');assert.equal(p.richness,2);assert.equal(p.talkLevel,2);assert.equal(p.dialogueJson,old.dialogueJson);assert.equal(p.size,220);assert.equal(p.sound,true);
 assert.equal(motionReduced(p,false),true);assert.equal(motionReduced({...p,reducedMotion:false,motionPolicy:'normal'},true),false);
 assert.equal(decodePreferences({...p,idleMode:'frequent'}).idleMode,'frequent');assert.throws(()=>decodePreferences({idleMode:'bad'}));
});
test('motion tiers have distinct pools; gentle and reduced keep stable states',()=>{
 assert.equal(motionAllowed('run',0,false),false);assert.equal(motionAllowed('run',1,false),false);assert.equal(motionAllowed('run',2,false),true);
 assert.equal(motionAllowed('stretch',0,false),false);assert.equal(motionAllowed('stretch',1,false),true);
 for(const state of ['idle','generating','reasoning','tool-running','waiting-user','completed'] as const){
  const d=new Director(pack,seeded(2));const motions=new Set();
  for(let now=0;now<600000;now+=1000){const v=d.tick({sessionId:'s',turn:1,state,pressure:now%10000/10000,fatigue:1},now,{richness:2,reduced:true,idleMotion:state==='idle'?'breathe':''});d.completeTransition();motions.add(v.sceneId+':'+v.actionId);}
  assert.equal(motions.size,1,state);
 }
});
