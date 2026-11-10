import React from 'react';
import {createRoot} from 'react-dom/client';
import {IntelligenceSettings} from '../../src/client/intelligence-settings.js';
import {PreferenceStore} from '../../src/client/preferences-store.js';
import {emptyState,type Task} from '../../src/companion/state.js';
import type {Companion} from '../../src/client/controller.js';
import type {DesktopBridge} from '../../src/client/desktop-bridge.js';
import type {HostSnapshot} from '../../src/client/companion-host.js';
import css from '../../src/client/styles.css';

// Controlled reader/deletion races exercise the actual UI; this page never connects to DSH or a model.
const base=emptyState(),preferences=new PreferenceStore(null,null),changed=new Set<()=>void>();
const a:Task={workspace:'/alpha',session:'shared-id',seq:8,statusRevision:2,title:'Alpha任务',state:'running',updatedAt:1700000004000,parent:null,excerpt:'Alpha任务事实',tools:[{callId:'shared-call',name:'read_file',state:'failed',callSeq:3,resultSeq:5,startedAt:1700000001000,finishedAt:1700000002000,excerpt:'Alpha公开工具结果\npassword=DO_NOT_RENDER',errorCode:'FILE_NOT_FOUND'}]};
const b:Task={...a,workspace:'/beta',title:'Beta任务',excerpt:'Beta任务事实',tools:[]};
const source={workspace:a.workspace,session:a.session,seq:a.seq,statusRevision:a.statusRevision};
let host:HostSnapshot={...base,tasks:[a,b],policy:{...base.policy,workspaces:['/alpha','/beta']},modelAvailable:true,today:{used:0,reserved:0,automatic:0,estimated:false},
 memories:[{id:'alpha-memory',workspace:'/alpha',kind:'summary',text:'Alpha模型记忆',sources:[source],createdAt:1700000003000,expiresAt:null,confirmed:false}],
 insights:[{id:'alpha-insight',text:'Alpha模型解读',createdAt:1700000003000,intent:'notice',sources:[source]},
  {id:'unknown-insight',text:'UNVERIFIABLE_TEXT',createdAt:1700000003001,intent:'notice',sources:[{workspace:'/alpha',session:'unknown-session',seq:1}]}]};
let holdNext=false,rejectDelete=false;
const held:(()=>void)[]=[],opened:string[]=[],calls:string[]=[];
const bridge={
 state:async()=>{const snapshot=structuredClone(host);if(holdNext){holdNext=false;return new Promise(resolve=>held.push(()=>resolve({url:'https://fixture.invalid',connected:true,host:snapshot,platform:'fixture'})));}return {url:'https://fixture.invalid',connected:true,host:snapshot,platform:'fixture'};},
 onHostChanged:(fn:()=>void)=>{changed.add(fn);return()=>changed.delete(fn);},
 request:async(op:string,body:Record<string,unknown>)=>{if(op==='configuration-options')return {result:{groups:[],default:null,workspaces:[{path:'/alpha',title:'Alpha'},{path:'/beta',title:'Beta'}],failures:[],catalogAvailable:false}};calls.push(op);if(op!=='forget')throw Error('Unexpected fixture operation');if(rejectDelete)throw Error('测试删除失败');const workspace=body.workspace as string,id=body.id as string|undefined;host={...host,revision:host.revision+1,tasks:host.tasks.filter(t=>t.workspace!==workspace),insights:host.insights.filter(i=>!i.sources.some(s=>s.workspace===workspace)),memories:host.memories.filter(m=>m.workspace!==workspace||!!id&&m.id!==id&&m.kind==='preference')};return {result:true};},
} as unknown as DesktopBridge;
window.bigfishDesktop=bridge;
(window as any).provenanceFixture={
 opened,calls,holdNext:()=>{holdNext=true;},heldCount:()=>held.length,release:()=>{for(const done of held.splice(0))done();},rejectDelete:(value:boolean)=>{rejectDelete=value;},
 advance:()=>{host={...host,tasks:host.tasks.map(t=>t.workspace==='/alpha'?{...t,seq:9,statusRevision:3,updatedAt:1700000005000}:t)};},
 switchHost:()=>{host={...base,tasks:[{...a,title:'NewHost任务',excerpt:'NewHost任务事实'}],policy:{...base.policy,workspaces:['/alpha']},modelAvailable:true,today:{used:0,reserved:0,automatic:0,estimated:false}};for(const fn of changed)fn();},
};
const controller={preferences,canOpenSession:()=>true,openSession:(session:string)=>{opened.push(session);}} as unknown as Companion;
createRoot(document.getElementById('root')!).render(<main className="bf-surface" style={{padding:20,maxWidth:700}}><style>{css}</style><IntelligenceSettings controller={controller} demo={false} section="intelligence" variant="section"/></main>);
