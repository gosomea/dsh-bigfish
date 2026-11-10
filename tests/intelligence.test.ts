import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {IntelligenceService,projectTask,restoreLiveTask,applyQuestionView,runtimeSampleWindow,type ModelService,type HostAgent,type TaskProjection} from '../src/companion/intelligence.js';
import {CompanionHostStore} from '../src/companion/host-store.js';
import {defaultPolicy} from '../src/companion/state.js';
async function setup(fn:(s:CompanionHostStore)=>Promise<void>){const path=await mkdtemp(join(tmpdir(),'bigfish-model-'));try{await fn(new CompanionHostStore(path));}finally{await rm(path,{recursive:true,force:true});}}
const task={workspace:'/work',session:'abc',seq:1,title:'编写测试',state:'running' as const,updatedAt:Date.now(),parent:null,excerpt:'公开回复'};
test('model off means no calls; concurrent clients share one reservation and save derived memory',()=>setup(async s=>{
 let calls=0;
 const model:ModelService={async prepareCall(){calls++;return {config:{},async *stream(){yield {type:'text-delta',text:'{"text":"正在编写测试。"}'};yield {type:'usage',usage:{inputTokens:90,outputTokens:10}};yield {type:'finish',reason:{kind:'stop'}};}};}};
 const service=new IntelligenceService(s,()=>model);await s.observe(task);
 await assert.rejects(service.understand('/work'));assert.equal(calls,0);
 await s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'test',workspaces:['/work']},(await s.snapshot()).policyRevision);
 const replies=await Promise.allSettled([service.understand('/work'),service.understand('/work')]);assert.equal(calls,1);assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);
 const state=await s.snapshot();assert.equal(state.today.used,100);assert.equal(state.memories[0]?.kind,'summary');assert.equal(state.insights[0]?.sources[0]?.session,'abc');
 // Derived summaries must not themselves manufacture a new event.
 await assert.rejects(service.understand('/work'));assert.equal(calls,1);
}));
test('revocation while provider responds discards stale result but still accounts for the call',()=>setup(async s=>{
 await s.observe(task);await s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'test',workspaces:['/work']},(await s.snapshot()).policyRevision);
 const model:ModelService={async prepareCall(){return {config:{},async *stream(){await s.forget('/work');yield {type:'text-delta',text:'{"text":"旧摘要"}'};yield {type:'finish',reason:{kind:'stop'}};}};}};
 const reply=await new IntelligenceService(s,()=>model).understand('/work');assert.equal(reply,null);const state=await s.snapshot();assert.equal(state.insights.length,0);assert.equal(state.memories.length,0);assert.ok(state.today.used>0);assert.equal(state.today.estimated,true);
}));
test('public task projection ignores hidden reasoning, tools, model instructions and stale events',()=>{
 const session={id:'abc',header:{cwd:'/work'}};
 assert.equal(projectTask(undefined,session,{type:'assistant/live-chunk',seq:1,time:1,data:{chunk:{type:'reasoning-delta',text:'private'}}}),null);
 assert.equal(projectTask(undefined,session,{type:'user/message',seq:1,time:1,data:{source:{kind:'tool'},content:[{type:'text',text:'not user'}]}}),null);
 const t=projectTask(undefined,session,{type:'assistant/message',seq:1,time:1,data:{message:{content:[{type:'reasoning',text:'secret'},{type:'text',text:'public'}]}}})!;
 assert.equal(t.excerpt,'public');assert.equal(projectTask(t,session,{type:'turn/end',seq:1,time:2,data:{reason:{kind:'completed'}}}),null);
 assert.equal(projectTask(t,session,{type:'turn/end',seq:2,time:2,data:{reason:{kind:'error'}}})?.state,'failed');
});

test('overlapping approval events stay waiting until every real decision arrives',()=>{
 const session={id:'abc',header:{cwd:'/work'}};
 let t=projectTask(undefined,session,{type:'approval/asked',seq:1,time:1,data:{id:'a'}})!;
 t=projectTask(t,session,{type:'approval/asked',seq:2,time:2,data:{id:'b'}})!;
 assert.equal(t.state,'waiting');
 t=projectTask(t,session,{type:'approval/decided',seq:3,time:3,data:{id:'a'}})!;assert.equal(t.state,'waiting');
 t=projectTask(t,session,{type:'approval/decided',seq:4,time:4,data:{id:'b'}})!;assert.equal(t.state,'running');
 t=projectTask(t,session,{type:'turn/end',seq:5,time:5,data:{reason:{kind:'completed'}}})!;assert.deepEqual(t.pendingApprovals,[]);
});

test('question calls resolve individually and continued questions survive turn end without keeping answers',()=>{
 const session={id:'abc',header:{cwd:'/work'}};
 const ask=(callId:string,seq:number)=>({type:'tool/call',seq,time:seq,data:{name:'ask_user_question',callId,arguments:JSON.stringify({questions:[{id:'q',question:'PRIVATE QUESTION'}]})}});
 let t=projectTask(undefined,session,ask('a',1))!;
 t=projectTask(t,session,ask('b',2))!;assert.equal(t.state,'waiting');
 assert.equal(projectTask(t,session,{type:'tool/result',seq:3,time:3,data:{message:{toolCallId:'unrelated',content:[]}}}),null);
 t=projectTask(t,session,{type:'tool/result',seq:4,time:4,data:{message:{toolCallId:'a',content:[{type:'text',text:'{"answers":[]}' }]}}})!;
 assert.deepEqual(t.pendingQuestions,[{callId:'b',state:'open'}]);assert.equal(t.state,'waiting');
 t=projectTask(t,session,{type:'tool/result',seq:5,time:5,data:{message:{toolCallId:'b',content:[{type:'text',text:'{"pending":true}' }]}}})!;
 t=projectTask(t,session,{type:'turn/end',seq:6,time:6,data:{reason:{kind:'completed'}}})!;
 assert.equal(t.state,'waiting');assert.equal(t.executionState,'completed');
 t=projectTask(t,session,{type:'user/message',seq:7,time:7,data:{source:{kind:'user-question-reply',callId:'b',outcome:'answered'},content:[{type:'text',text:'PRIVATE ANSWER'}]}})!;
 assert.equal(t.state,'completed');assert.deepEqual(t.pendingQuestions,[]);assert.doesNotMatch(JSON.stringify(t),/PRIVATE/);
});

test('question and approval waits do not clear each other, including resumed unknown tool outcomes',()=>{
 const session={id:'abc',header:{cwd:'/work'}};
 let t=projectTask(undefined,session,{type:'approval/asked',seq:1,time:1,data:{id:'a'}})!;
 t=applyQuestionView(t,{active:[{callId:'q',state:'open'},{callId:'other',state:'continued'}]});
 t=projectTask(t,session,{type:'tool/result',seq:2,time:2,data:{message:{toolCallId:'q',content:[]},error:{code:'TOOL_OUTCOME_UNKNOWN'}}})!;
 assert.equal(t.pendingQuestions?.[0]?.state,'continued');
 t=projectTask(t,session,{type:'approval/decided',seq:3,time:3,data:{id:'a'}})!;assert.equal(t.state,'waiting');
 t=applyQuestionView(t,{active:[]});assert.equal(t.state,'running');
});

test('lineage distinguishes explicit subagent origin from ordinary forks and legacy parent metadata',()=>{
 for(const [header,relationship] of [[{cwd:'/work',parentSession:'parent',origin:'subagent' as const},'subagent'],[{cwd:'/work',parentSession:'parent',isSeeded:true},'fork'],[{cwd:'/work',parentSession:'parent'},'lineage']] as const){
   const t=projectTask(undefined,{id:'child',header},{type:'turn/start',seq:1,time:1,data:{}})!;
   assert.equal(t.parent,'parent');assert.equal(t.relationship,relationship);
 }
 const currentFork=projectTask(undefined,{id:'fork',header:{cwd:'/work',isSeeded:true}},{type:'turn/start',seq:1,time:1,data:{}})!;
 assert.equal(currentFork.parent,null);assert.equal(currentFork.relationship,'fork');
});

test('live recovery uses public projections and real runtime status without inventing an idle outcome',()=>{
 const agent:HostAgent={session:{id:'a',seq:20,header:{cwd:'/work',parentSession:'p',origin:'subagent'}},status:'running'};
 const projection:TaskProjection={asOfSeq:19,values:{title:'恢复中的任务',userQuestions:{active:[{callId:'a',state:'continued'}]},turnOutline:[{prompt:'公开提示',response:'公开回复'}]}};
 const restored=restoreLiveTask(undefined,agent,projection,{question:2,approval:1},1000)!;
 assert.equal(restored.seq,19);assert.equal(restored.state,'waiting');assert.equal(restored.title,'恢复中的任务');assert.equal(restored.parent,'p');assert.equal(restored.relationship,'subagent');
 assert.equal(restored.runtimeStatus,'running');assert.equal(restored.pendingRemote?.question,2);
 const refreshed=restoreLiveTask(restored,agent,{...projection,asOfSeq:30,values:{userQuestions:{active:[]}}},{question:1,approval:0},2000)!;
 assert.equal(refreshed.seq,19);assert.equal(refreshed.state,'waiting');
 assert.equal(restoreLiveTask(refreshed,agent,{...projection,values:{userQuestions:{active:[]}}},{question:0,approval:0},3000)?.state,'running');
 assert.equal(restoreLiveTask(undefined,{...agent,status:'idle'},undefined,{question:0,approval:0},1000),null);
 assert.equal(restoreLiveTask(undefined,{...agent,session:{...agent.session,seq:0}},undefined,undefined,1000),null);
 const complete={...restored,state:'completed' as const,executionState:'completed' as const,pendingQuestions:[],pendingRemote:{question:0,approval:0}};
 assert.equal(restoreLiveTask(complete,agent,undefined,{question:0,approval:0},4000)?.state,'completed');
});

test('runtime sampling caps projection work at 100 and eventually visits every active or waiting agent',()=>{
 const agents:HostAgent[]=Array.from({length:237},(_,i)=>({session:{id:String(i),seq:1,header:{cwd:'/work'}},status:i%2?'running':'idle'}));
 const seen=new Set<string>();let offset=0;
 for(let pass=0;pass<3;pass++){
  const window=runtimeSampleWindow(agents,offset);offset=window.next;
  assert.equal(window.selected.length,100);assert.equal(new Set(window.selected.map(a=>a.session.id)).size,100);
  for(const agent of window.selected)seen.add(agent.session.id);
 }
 assert.equal(seen.size,237);assert.ok(seen.has('236'));
 assert.equal(runtimeSampleWindow(agents.slice(0,2),offset).selected.length,2);
 assert.deepEqual(runtimeSampleWindow([],0),{selected:[],next:0});
 assert.throws(()=>runtimeSampleWindow(agents,0,101));
});

test('runtime recovery observes real optional services once, and does not replay deleted workspace context',()=>setup(async s=>{
 const {installCompanion}=await import('../src/companion/host.js');
 const agent:HostAgent={session:{id:'active',seq:5,header:{cwd:'/work'}},status:'running'};
 const handlers=new Map<string,()=>Promise<unknown>>(),dispose:(()=>void)[]=[];
 let pending:{event:string;agentId:string}[]=[];
 let done!:()=>void;let observed=new Promise<void>(resolve=>done=resolve),writes=0;
 const observe=s.observe.bind(s);s.observe=async(...args)=>{const result=await observe(...args);writes++;done();return result;};
 const context:any={agents:{list:()=>[agent]},sessionProjections:{snapshot:()=>({asOfSeq:4,values:{title:'原有任务',userQuestions:{active:[]}}})},typertGateway:{getPendingRemoteEvents:()=>pending},
  on(name:string,fn:()=>Promise<unknown>){handlers.set(name,fn);},effect(fn:()=>()=>void){dispose.push(fn());},
  inject(keys:string[],callback:(ctx:any)=>void){if(keys.every(key=>context[key]!==undefined))callback(context);}};
 installCompanion(context,s);
 try{
  await observed;await handlers.get('agent/status')!();let state=await s.snapshot();assert.equal(state.tasks.length,1);assert.equal(state.tasks[0]!.title,'原有任务');assert.equal(state.today.used,0);
  pending=[{event:'user-questions/request',agentId:'active'},{event:'user-questions/request',agentId:'active'}];
  await handlers.get('agent/status')!();state=await s.snapshot();assert.equal(state.tasks[0]!.state,'waiting');assert.equal(state.tasks[0]!.pendingRemote?.question,2);
  pending.pop();await handlers.get('agent/status')!();state=await s.snapshot();assert.equal(state.tasks[0]!.state,'waiting');assert.equal(state.tasks[0]!.pendingRemote?.question,1);
  pending=[];await handlers.get('agent/status')!();state=await s.snapshot();assert.equal(state.tasks[0]!.state,'running');assert.equal(state.tasks[0]!.seq,4);
  await s.forget('/work');await handlers.get('agent/status')!();
  state=await s.snapshot();assert.equal(state.tasks.length,0);assert.equal(writes,4);
 }finally{for(const fn of dispose)fn();}
}));

test('insufficient pet budget alerts once without sending any model request',()=>setup(async s=>{
 let calls=0;const model:ModelService={async prepareCall(){calls++;throw Error('must not call');}};
 await s.observe(task);await s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'test',workspaces:['/work'],dailyTokens:1000},0);
 const service=new IntelligenceService(s,()=>model);
 await assert.rejects(service.understand('/work'));await assert.rejects(service.understand('/work'));
 const state=await s.snapshot();assert.equal(calls,0);assert.equal(state.today.used,0);assert.equal(state.insights.filter(i=>i.system).length,1);assert.match(state.insights.find(i=>i.system)!.text,/预算/);
}));
test('structured provider credit exhaustion alerts, plain rate limiting is not labeled exhausted credit',()=>setup(async s=>{
 await s.observe(task);await s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'test',workspaces:['/work']},0);
 let code='rate_limit_exceeded';const model:ModelService={async prepareCall(){throw Object.assign(new Error('provider failure'),{status:429,code});}};
 const service=new IntelligenceService(s,()=>model);await assert.rejects(service.understand('/work',false));assert.equal((await s.snapshot()).insights.filter(i=>i.system).length,0);
 code='insufficient_quota';await assert.rejects(service.understand('/work',false));assert.match((await s.snapshot()).insights.find(i=>i.system)!.text,/余额不足/);
}));

test('task token limits distinguish account quota, context overflow and output cap without reading arbitrary messages',()=>{
 const session={id:'a',header:{cwd:'/work'}};
 for(const [code,expected] of [['ACCOUNT_QUOTA','credit'],['QUOTA','credit'],['CONTEXT_WINDOW_EXCEEDED','context'],['RATE_LIMIT',undefined]] as const){
  const t=projectTask(undefined,session,{type:'turn/end',seq:1,time:1,data:{reason:{kind:'error',error:{code,message:'insufficient tokens'}}}})!;assert.equal(t.failureKind,expected);
 }
 const t=projectTask(undefined,session,{type:'turn/end',seq:1,time:1,data:{reason:{kind:'max-tokens'}}})!;assert.equal(t.failureKind,'output-limit');
});

test('in-band DSH finish failures retain the specific quota, context and output-limit reason',()=>setup(async s=>{
 await s.observe(task);await s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'test',workspaces:['/work'],dailyTokens:100000},0);
 let reason:{kind:string;failure?:unknown}={kind:'error',failure:{code:'ACCOUNT_QUOTA'}};
 const model:ModelService={async prepareCall(){return {config:{},async *stream(){yield {type:'finish',reason};}};}};
 const service=new IntelligenceService(s,()=>model);
 await assert.rejects(service.understand('/work',false));let state=await s.snapshot();
 assert.match(state.insights.find(i=>i.system)!.text,/额度或余额不足/);
 reason={kind:'error',failure:{code:'CONTEXT_WINDOW_EXCEEDED'}};
 await assert.rejects(service.understand('/work',false));state=await s.snapshot();assert.match(state.insights.at(-1)!.text,/上下文容量/);
 reason={kind:'max-tokens'};
 await assert.rejects(service.understand('/work',false));state=await s.snapshot();assert.match(state.insights.at(-1)!.text,/输出 token 上限/);
 assert.equal(state.today.reserved,0);
}));

test('wrapped structured limits are recognized but neither HTTP 429 nor arbitrary text claims credit exhaustion',async()=>{
 const {modelLimitKind}=await import('../src/companion/model-errors.js');
 assert.equal(modelLimitKind({cause:{failure:{code:'ACCOUNT_QUOTA'}}}),'credit');
 assert.equal(modelLimitKind({error:{code:'context_length_exceeded'}}),'context');
 assert.equal(modelLimitKind({status:429,message:'insufficient tokens'}),undefined);
 assert.equal(modelLimitKind({code:'RATE_LIMIT',message:'quota exhausted'}),undefined);
 const cycle:{cause?:unknown;message:string}={message:'quota exhausted'};cycle.cause=cycle;
 assert.equal(modelLimitKind(cycle),undefined);
});

test('an old model response cannot issue a quota alert after authorization was revoked',()=>setup(async s=>{
 await s.observe(task);await s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'test',workspaces:['/work']},0);
 const model:ModelService={async prepareCall(){return {config:{},async *stream(){
  await s.configure({...defaultPolicy},1);
  yield {type:'finish',reason:{kind:'error',failure:{code:'QUOTA'}}};
 }};}};
 await assert.rejects(new IntelligenceService(s,()=>model).understand('/work',false));
 assert.equal((await s.snapshot()).insights.length,0);
}));

test('tracking disabled still reports typed task limits without retaining title or message content',()=>setup(async s=>{
 const {installCompanion}=await import('../src/companion/host.js');
 const {presetConfig}=await import('../src/companion/config.js');
 const config=presetConfig('balanced');config.groups.steward=false;config.groups.memory=false;
 let receive:((...args:any[])=>void)|undefined;
 const dispose:(()=>void)[]=[];
 let finish!:()=>void;const done=new Promise<void>(resolve=>finish=resolve);
 const taskLimit=s.taskLimit.bind(s);s.taskLimit=async(...args)=>{const result=await taskLimit(...args);finish();return result;};
 installCompanion({inject(keys,callback){if(keys[0]==='sessions')callback({on(_event:string,handler:(...args:any[])=>void){receive=handler;},effect(fn:()=>()=>void){dispose.push(fn());}});}},s,()=>config);
 try{
  receive!({id:'a',header:{cwd:'/work'}},{type:'turn/end',seq:1,time:Date.now(),data:{title:'PRIVATE TITLE',excerpt:'PRIVATE MESSAGE',reason:{kind:'error',error:{code:'ACCOUNT_QUOTA'}}}});
  await done;const state=await s.snapshot();
  assert.equal(state.tasks.length,0);assert.equal(state.memories.length,0);assert.equal(state.insights.length,1);
  assert.equal(state.insights[0]!.system,true);assert.deepEqual(state.insights[0]!.sources,[{workspace:'/work',session:'a',seq:1}]);
  assert.doesNotMatch(JSON.stringify(state),/PRIVATE/);assert.equal(state.today.used,0);
 }finally{for(const fn of dispose)fn();}
}));

test('browser POSTs work through the native dsh.internal carrier without admitting other origins',()=>setup(async s=>{
 const {installCompanion}=await import('../src/companion/host.js');
 let fetch!:(request:Request)=>Promise<Response>;
 installCompanion({inject(keys,callback){if(keys[0]==='connection')callback({connection:{fetch:{register(route:{path:string;fetch:typeof fetch}){if(route.path==='/api/bigfish-companion')fetch=route.fetch;return()=>{};}}},effect(fn:()=>unknown){fn();}});}},s);
 const post=(headers:Record<string,string>)=>fetch(new Request('http://dsh.internal/api/bigfish-companion',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({op:'lease',client:'browser',kind:'web'})}));
 assert.equal((await post({host:'127.0.0.1:4178',origin:'http://127.0.0.1:4178','sec-fetch-site':'same-origin'})).status,200);
 assert.equal((await s.snapshot()).display?.client,'browser');
 assert.equal((await post({host:'harness.example',origin:'https://harness.example','sec-fetch-site':'same-origin'})).status,200);
 assert.equal((await post({host:'127.0.0.1:4178',origin:'https://evil.example'})).status,403);
 assert.equal((await post({host:'127.0.0.1:4178',origin:'null'})).status,403);
 assert.equal((await post({host:'127.0.0.1:4178',origin:'http://127.0.0.1:4178','sec-fetch-site':'cross-site'})).status,403);
}));
