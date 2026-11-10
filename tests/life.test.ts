import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {InteractionCooldown,playKinds,playLabels,growthStage,growthProgress,lifeCalendar,lifeDefaults,fictionalStory,currentSeason,seasonalStory,sourcedCollections} from '../src/companion/life.js';
import {PetPlayground,toyPosition} from '../src/client/pet-playground.js';
import {LifeSettings,CollectionShelf} from '../src/client/life-settings.js';
import {LifeActions} from '../src/client/life-actions.js';
import {presetConfig} from '../src/companion/config.js';
import {CompanionHostStore} from '../src/companion/host-store.js';
import {defaultPolicy,type Collection} from '../src/companion/state.js';

test('play kinds have real diary labels and a single cooldown applies across toys',()=>{
 for(const kind of playKinds)assert.ok(playLabels[kind].length>0);
 const gate=new InteractionCooldown();
 assert.equal(gate.accept(1000,5000),true);
 assert.equal(gate.accept(2000,5000),false);
 assert.equal(gate.remaining(2000),4000);
 assert.equal(gate.accept(6000,5000),true);
 assert.equal(gate.accept(NaN,5000),false);
 assert.equal(gate.accept(12000,Infinity),false);
});
test('local toy paths stay on their mat, end at rest, and do not move the pet itself',()=>{
 for(const kind of ['ball','toy'] as const){
  for(let i=0;i<=100;i++){
   const p=toyPosition(kind,i/100,{x:500,y:-40});
   assert.ok(p.x>=0&&p.x<=280);assert.ok(p.y>=0&&p.y<=112);
  }
 }
 assert.deepEqual(toyPosition('ball',1,{x:180,y:50}),{x:205,y:79});
 assert.deepEqual(toyPosition('toy',1,{x:175,y:55}),{x:175,y:55});
});
test('opening or rendering a playground does not create gestures, disabled groups render nothing',()=>{
 let calls=0;
 const onInteract=()=>{calls++;};
 assert.equal(renderToStaticMarkup(React.createElement(PetPlayground,{enabled:false,cooldownSeconds:5,onInteract})), '');
 const markup=renderToStaticMarkup(React.createElement(PetPlayground,{enabled:true,cooldownSeconds:5,reducedMotion:true,onInteract}));
 assert.ok(markup.includes('role="button"'));assert.ok(markup.includes('不消耗 token'));
 assert.equal(calls,0);
});
test('growth uses real interaction counts and stories remain clearly fictional source material',()=>{
 const life=lifeDefaults();assert.equal(growthStage(life),'准备认识你');
 assert.equal(growthStage({...life,interactions:1}),'初次相识');
 assert.equal(growthStage({...life,interactions:20}),'默契渐长');
 assert.equal(growthStage({...life,interactions:100}),'熟悉的伙伴');
 for(const theme of ['sea','night','garden'] as const)assert.ok(fictionalStory(theme,1).length>0);
});
test('anniversaries derive from real first interaction and never penalize time away',()=>{
 const firstSeen=1700000000000,day=86400000,life={...lifeDefaults(),firstSeen,interactions:21};
 assert.equal(lifeCalendar(lifeDefaults(),firstSeen),null);
 assert.equal(lifeCalendar(life,firstSeen-1),null);
 assert.equal(lifeCalendar(life,firstSeen)!.dayNumber,1);
 assert.equal(lifeCalendar(life,firstSeen+7*day)!.today,'相识一周');
 assert.equal(lifeCalendar(life,firstSeen+7*day)!.next.days,30);
 assert.equal(lifeCalendar(life,firstSeen+730*day)!.today,'相识 730 天');
 assert.equal(lifeCalendar(life,firstSeen+730*day)!.next.days,1095);
 assert.equal(growthProgress(life).count,21);
 assert.equal(growthProgress(life).next?.count,100);
 assert.equal(growthProgress({...life,interactions:NaN}).count,0);
});
test('seasonal stories are explicit fiction and preview rendering causes no events',()=>{
 assert.equal(currentSeason(new Date(2026,2,1)),'spring');
 assert.equal(currentSeason(new Date(2026,5,1)),'summer');
 assert.equal(currentSeason(new Date(2026,8,1)),'autumn');
 assert.equal(currentSeason(new Date(2026,11,1)),'winter');
 for(const season of ['spring','summer','autumn','winter'] as const){
  const texts=new Set([0,1,2].map(i=>{const s=seasonalStory(season,i);assert.equal(s.fictional,true);return s.text;}));
  assert.equal(texts.size,3);assert.ok(seasonalStory(season,Infinity).text);
 }
 let calls=0;const untouched=()=>{calls++;};
 const markup=renderToStaticMarkup(React.createElement(LifeSettings,{config:presetConfig('growing'),state:{life:lifeDefaults(),collections:[]},onClearDiary:untouched,onRemoveCollection:untouched}));
 assert.ok(markup.includes('首次主动互动')||markup.includes('第一次主动互动'));
 assert.ok(markup.includes('真实相处记录'));assert.ok(!markup.includes('预览本地小剧场'));
 const actions=renderToStaticMarkup(React.createElement(LifeActions,{config:presetConfig('growing'),state:{life:lifeDefaults()},onInteract:untouched,onPlayProgram:untouched}));
 assert.ok(actions.includes('虚构'));assert.ok(actions.includes('预览本地小剧场'));
 assert.ok(!actions.includes('aria-label="虚构季节故事"'));assert.equal(calls,0);
});
test('the visible shelf uses only source-backed Host postcards',()=>{
 const card:Collection={id:'real',kind:'postcard',title:'真实任务',text:'真实结果',createdAt:1700000000000,sources:[{workspace:'/a',session:'one',seq:1}]};
 const cards=[card,{...card,id:'fiction',title:'虚构剧情',sources:[]},{...card,id:'bad',sources:[{workspace:'/a',session:'one',seq:NaN}]}];
 assert.equal(sourcedCollections(cards).length,1);
 const shelf=renderToStaticMarkup(React.createElement(CollectionShelf,{collections:cards,onRemove:()=>{}}));
 assert.ok(shelf.includes('真实结果'));assert.ok(shelf.includes('事件 1'));assert.ok(!shelf.includes('虚构剧情'));
});
test('clearing real diary resets milestones without deleting task facts, memories or postcards',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bigfish-life-'));
 try {
  const clock=1700000000000,store=new CompanionHostStore(dir,()=>clock),source={workspace:'/a',session:'one',seq:1};
  await store.configure({...defaultPolicy,workspaces:['/a']},0);
  await store.observe({...source,title:'真实项目',excerpt:'真实完成结果',state:'completed',updatedAt:clock,parent:null});
  await store.collect(source);
  await store.memory({workspace:'/a',kind:'preference',text:'我喜欢茶',sources:[],expiresAt:null,confirmed:true});
  await store.recordInteraction('head');
  assert.equal((await store.snapshot()).life.firstSeen,clock);
  await store.clearDiary();
  const after=await store.snapshot();assert.deepEqual(after.life,lifeDefaults());
  assert.equal(after.collections.length,1);assert.equal(after.tasks.length,1);assert.equal(after.memories.length,1);assert.equal(after.today.used,0);
 } finally {await rm(dir,{recursive:true,force:true});}
});
