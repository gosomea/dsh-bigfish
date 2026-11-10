import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {knownSourceTask,provenanceRows,sourceStatus} from '../src/companion/provenance.js';
import {CompanionHostStore} from '../src/companion/host-store.js';
import {emptyState,defaultPolicy,type Task,type Source} from '../src/companion/state.js';
import {ProvenanceSources} from '../src/client/task-timeline.js';
import {TaskLedger} from '../src/client/task-ledger.js';
import {taskSource} from '../src/companion/tool-context.js';

const task:Task={workspace:'/a',session:'s',seq:8,statusRevision:3,title:'检查配置',state:'running',updatedAt:4000,parent:null,excerpt:'当前公开回复',tools:[{callId:'same',callSeq:3,resultSeq:5,name:'read_file',state:'failed',startedAt:1000,finishedAt:2000,excerpt:'文件不存在\nAuthorization: SECRET',errorCode:'FILE_NOT_FOUND'}]};
const source:Source={workspace:'/a',session:'s',seq:8,statusRevision:3,tools:[{callId:'same',callSeq:3,resultSeq:5}]};
const state=()=>({...emptyState(),tasks:[structuredClone(task)]});

test('retained task, paired tool call/result and model explanation keep separate factual labels and real timestamps',()=>{
 const s=state();s.insights=[{id:'model-1',createdAt:3000,intent:'notice',text:'读取配置遇到文件不存在',sources:[source]}];
 const rows=provenanceRows(s,5000);assert.deepEqual(rows.map(r=>r.kind),['task','model','tool','tool']);
 assert.deepEqual(rows.map(r=>r.at),[4000,3000,2000,1000]);assert.match(rows[2]!.title,/执行失败/);
 assert.deepEqual(rows[2]!.sources[0]?.tools,[{callId:'same',callSeq:3,resultSeq:5}]);assert.equal(rows[2]!.sources[0]?.seq,5);assert.equal(rows[3]!.sources[0]?.seq,3);
 assert.doesNotMatch(JSON.stringify(rows),/SECRET/);assert.match(rows[1]!.reason,/真实会话/);
});

test('workspace, event revision and exact tool pairing fence source validity; unknown sessions never become navigation targets',()=>{
 assert.equal(sourceStatus(source,[task]).current,true);
 for(const bad of [{...source,workspace:'/b'},{...source,session:'unknown'},{...source,seq:7},{...source,statusRevision:2},{...source,tools:[{callId:'same',callSeq:3,resultSeq:6}]}])assert.equal(sourceStatus(bad,[task]).current,false);
 assert.equal(knownSourceTask([{...task,workspace:'/b'}],source),undefined);
 assert.equal(knownSourceTask([task],{...source,session:' unknown '}),undefined);
});

test('a retained running event is not presented as live output when the Agent is idle or detached',()=>{
 const s=state();s.tasks=[{...task,runtimeStatus:'idle'},{...task,session:'detached',runtimeStatus:'detached'} as unknown as Task];
 const rows=provenanceRows(s,5000).filter(r=>r.kind==='task');assert.ok(rows.some(r=>r.text.includes('Agent 当前空闲')));assert.ok(rows.some(r=>r.text.includes('当前未恢复此会话')));
});

test('stale, missing and cross-workspace model references do not display old text as current progress',()=>{
 const s=state();s.insights=[
  {id:'stale',createdAt:3000,intent:'notice',text:'STALE_CONTENT',sources:[{...source,seq:7}]},
  {id:'missing',createdAt:3001,intent:'notice',text:'MISSING_CONTENT',sources:[]},
 ];
 s.memories=[{id:'cross',workspace:'/a',kind:'summary',text:'CROSS_CONTENT',sources:[{...source,workspace:'/b'}],expiresAt:null,confirmed:false}];
 const rows=provenanceRows(s,5000,{workspace:'/a'});assert.doesNotMatch(JSON.stringify(rows),/STALE_CONTENT|MISSING_CONTENT|CROSS_CONTENT/);
 const derived=rows.filter(r=>r.kind==='model'||r.kind==='memory');assert.ok(derived.every(r=>!r.current));assert.ok(derived.every(r=>r.sources.every(s=>s.workspace==='/a')));
});

test('filters isolate identical session and call ids across workspaces, and expiration does not fabricate a creation time',()=>{
 const s=state();s.tasks.push({...structuredClone(task),workspace:'/b',title:'另一工作区'});
 s.memories=[{id:'legacy',workspace:'/a',kind:'preference',text:'喜欢短句',sources:[],expiresAt:null,confirmed:true},{id:'expired',workspace:'/a',kind:'summary',text:'EXPIRED',sources:[source],createdAt:1000,expiresAt:4999,confirmed:false}];
 const rows=provenanceRows(s,5000,{workspace:'/a',session:'s'});assert.equal(rows.length,3);assert.ok(rows.every(r=>r.workspace==='/a'));
 const all=provenanceRows(s,5000,{workspace:'/a'}),preference=all.find(r=>r.kind==='preference');assert.equal(preference?.at,null);assert.equal(preference?.text,'喜欢短句');assert.doesNotMatch(JSON.stringify(all),/EXPIRED|另一工作区/);
});

test('unknown source buttons are disabled and unobserved parent ids do not produce an enabled jump',()=>{
 const s=state();s.insights=[{id:'unknown',createdAt:3000,intent:'notice',text:'unknown',sources:[{...source,session:'not-admitted'}]}];
 const html=renderToStaticMarkup(React.createElement(ProvenanceSources,{sources:s.insights[0]!.sources,tasks:s.tasks,onOpen:()=>{}}));assert.match(html,/<button type="button" disabled="">打开来源会话/);assert.match(html,/来源会话未保留/);
 const cards=renderToStaticMarkup(React.createElement(TaskLedger,{tasks:[{...task,parent:'not-admitted'}],busy:false,onOpen:()=>{},onCollect:()=>{}}));assert.doesNotMatch(cards,/打开来源会话/);
});

test('memory timestamps are Host-owned and legacy absent or invalid timestamps remain unknown',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bigfish-provenance-time-'));try{
  const store=new CompanionHostStore(dir,()=>5000);await store.configure({...defaultPolicy,workspaces:['/a']},0);
  const m=await store.memory({workspace:'/a',kind:'preference',text:'短句',sources:[],expiresAt:null,confirmed:true,createdAt:123});assert.equal(m.createdAt,5000);
  const raw=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));raw.memories.push({...raw.memories[0],id:'legacy'});delete raw.memories[1].createdAt;raw.memories.push({...raw.memories[0],id:'invalid',createdAt:9000000000000000});await writeFile(join(dir,'state.json'),JSON.stringify(raw));
  const snapshot=await store.snapshot();assert.equal(snapshot.memories.find(m=>m.id==='legacy')?.createdAt,undefined);assert.equal(snapshot.memories.find(m=>m.id==='invalid')?.createdAt,undefined);
  assert.equal(provenanceRows(snapshot,5000).filter(r=>r.at===null).length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('forget clears the workspace timeline and derived context, preserves another workspace, and rejects late interpretation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bigfish-provenance-forget-'));let clock=5000;try{
  const store=new CompanionHostStore(dir,()=>clock);await store.configure({...defaultPolicy,enabled:true,provider:'local',model:'test',workspaces:['/a','/b']},0);
  await store.observe(task);await store.observe({...task,workspace:'/b'});
  const snapshot=await store.snapshot(),a=snapshot.tasks.find(t=>t.workspace==='/a')!,ref=taskSource(a);
  const r=await store.reserve('/a',false,10,10,{test:'provenance'});const insight=await store.accept(r,'模型摘要','notice',[ref]);assert.ok(insight);assert.equal((await store.snapshot()).memories[0]?.createdAt,5000);
  const late=await store.reserve('/a',false,10,10,{test:'late'});clock=6000;await store.forget('/a');
  assert.equal(await store.accept(late,'删除后不应回填','notice',[ref]),null);
  const rows=provenanceRows(await store.snapshot(),clock);assert.ok(rows.every(r=>r.workspace!=='/a'));assert.ok(rows.some(r=>r.workspace==='/b'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
