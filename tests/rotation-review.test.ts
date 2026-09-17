import test from 'node:test';
import assert from 'node:assert/strict';
import {AirSwing} from '../src/domain/air-swing.js';
import {WorkMotion} from '../src/domain/work-motion.js';
import {IdleDirector} from '../src/domain/idle.js';
import {Speech} from '../src/domain/speech.js';
import {TaskContext} from '../src/domain/task-context.js';
import {preferenceDefaults as defaults,decodePreferences} from '../src/contract/preferences.js';
import {Director} from '../src/domain/director.js';
import {parsePack} from '../src/contract/scenes.js';
import {parseLines,formatLine} from '../src/contract/dialogue.js';
import manifest from '../packs/classic/manifest.json' with {type:'json'};

test('continuous high-speed air swings hold the last pose for 2.5 seconds without a one-frame work flash',()=>{
 const d=new AirSwing();let entered=false,held=0,phase=0,starts=0,previous=false;
 for(let t=0;t<12;t+=.02){const s=d.tick(.02,2.2,true,true);if(s.visible&&!previous)starts++;previous=s.visible;
  if(s.holding){assert.equal(s.visible,false);assert.equal(s.responding,true);if(!entered){entered=true;phase=s.cycles;}if(s.cycles===phase)held+=.02;}
  if(entered)assert.equal(s.responding,true,'no base-frame flash between complete gestures');
 }
 assert.ok(held>=2.48&&held<=2.54);assert.ok(starts>=3&&starts<=4);
 const stopped=d.tick(.02,2.2,true,true,true);assert.equal(stopped.visible,false);assert.equal(stopped.responding,false);
});
test('air swing never starts outside work and interrupts recovery for a tool or user confirmation',()=>{
 const d=new AirSwing();for(let i=0;i<100;i++)assert.equal(d.tick(.05,2,true,false).responding,false);
 for(let i=0;i<40;i++)d.tick(.05,2,true,true);
 assert.equal(d.tick(.05,0,false,false).responding,false);
});
test('frequent idle shows a 12-second gesture with a 6-second bubble; every two bursts contain a sign',()=>{
 const d=new IdleDirector(undefined,()=>.99),p={...defaults,idleRandomText:true};let now=0,lastNonSign=false,lastText='';
 for(let i=0;i<20;i++){
  const v=d.tick(now,true,true,p),sign=v.motion==='wait-sign'||v.motion.startsWith('sign-');assert.equal(v.active,true);assert.ok(sign||!lastNonSign);lastNonSign=!sign;
  assert.notEqual(v.text,lastText);lastText=v.text;
  const midway=d.tick(now+7000,true,true,p);assert.equal(midway.active,true);assert.equal(midway.showText,false);assert.equal(midway.motion,v.motion);
  assert.equal(d.tick(now+12000,true,true,p).active,false);now=d.memory.nextAt;
 }
 const silent=new IdleDirector(undefined,()=>.9).tick(0,true,true,{...defaults,dialogueJson:'{"idle":[]}'});assert.equal(silent.active,true);assert.equal(silent.showText,false);assert.ok(!silent.motion.includes('sign'));
});
test('new defaults are lively while an explicitly quiet existing profile stays quiet',()=>{
 assert.equal(defaults.idleMode,'frequent');assert.equal(defaults.richness,2);assert.equal(defaults.talkLevel,1);
 const saved=decodePreferences({...defaults,idleMode:'quiet',richness:0,talkLevel:0});assert.equal(saved.idleMode,'quiet');assert.equal(saved.richness,0);assert.equal(saved.talkLevel,0);
});
test('tool poses coalesce rapid changes, wait at least four seconds, and stop immediately',()=>{
 const d=new WorkMotion();assert.equal(d.choose(true,'read',0,true),'read');assert.equal(d.choose(true,'repair',500,true),'read');assert.equal(d.choose(true,'type',1000,true),'read');
 assert.equal(d.choose(true,'type',3999,true),'read');assert.equal(d.choose(true,'type',4000,false),'read');assert.equal(d.choose(true,'type',4300,true),'type');
 assert.equal(d.choose(true,'repair',4500,false),'type');assert.equal(d.choose(true,'repair',10500,false),'repair');assert.equal(d.choose(false,'repair',10501,false),'');
});
test('pressure changes do not evict an ordinary action before its hold; beginning work interrupts idle',()=>{
 const d=new Director(parsePack(manifest,()=>true)),p={richness:2,reduced:false,idleMotion:''},i={sessionId:'s',turn:1,state:'generating' as const,pressure:0,fatigue:0};
 const first=d.tick(i,0,p);for(let t=100;t<12000;t+=100){const v=d.tick({...i,pressure:t%200?1:0},t,{...p,switchReady:true});d.completeTransition();assert.equal(v.actionId,first.actionId);assert.equal(v.sceneId,first.sceneId);}
 d.tick({...i,state:'idle'},13000,{...p,idleMotion:'wait-sign',switchReady:false});const next=d.tick(i,13001,{...p,switchReady:false});assert.notEqual(next.sceneId,'rest');
});
test('same-category new tool calls refresh wording; values stay current and rapid events coalesce',()=>{
 const d=new Speech(()=>0),lines=['读 {file}','检查 {file}'];assert.equal(d.choose('s','read',lines,0,2.5,0,{file:'a.ts'},'a'),'读 a.ts');
 assert.equal(d.choose('s','read',lines,3000,2.5,0,{file:'b.ts'},'b'),'检查 b.ts');assert.equal(d.choose('s','read',lines,3100,2.5,0,{file:'c.ts'},'c'),'我在继续处理～');
 assert.equal(d.choose('s','read',lines,5600,2.5,0,{file:'c.ts'},'c'),'读 c.ts');assert.equal(formatLine(parseLines('{"writing":["正在处理 {task}"]}').writing![0]!,{task:'做个游戏'}),'正在处理 做个游戏');
});
test('task cue uses only bounded user text, ignores tool/agent messages and clears on demand',()=>{
 const d=new TaskContext(),user=(text:string)=>({role:'user',source:{kind:'user'},content:[{type:'text',text}]});d.accept('user/message',user('  做一个\n小游戏  '));assert.equal(d.text,'做一个 小游戏');
 d.accept('assistant/live-chunk',user('推理'));d.accept('user/message',{...user('工具结果'),source:{kind:'tool'}});assert.equal(d.text,'做一个 小游戏');
 d.accept('user/message',user('长'.repeat(1000)));assert.equal(d.text.length,48);assert.ok(d.text.endsWith('…'));d.clear();assert.equal(d.text,'');
});
