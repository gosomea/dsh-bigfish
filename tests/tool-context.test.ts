import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectTask,IntelligenceService,type HostEvent,type ModelService} from '../src/companion/intelligence.js';
import {CompanionHostStore} from '../src/companion/host-store.js';
import {defaultPolicy,type Task} from '../src/companion/state.js';
import {normalizeToolFacts,projectToolCall,projectToolResult,safeToolText,taskSource,toolResultExcerpt} from '../src/companion/tool-context.js';
import {presetConfig} from '../src/companion/config.js';
const session={id:'a',header:{cwd:'/work'}},now=Date.now();
const call=(seq=1,callId='same',turn=1):HostEvent=>({type:'tool/call',seq,time:now+seq,data:{turn,step:0,callId,name:'read_file',arguments:'{"password":"ARGUMENT_MUST_NOT_BE_STORED"}'}});
const result=(seq=2,callId='same',turn=1):HostEvent=>({type:'tool/result',seq,time:now+seq+999,data:{turn,step:0,message:{role:'tool',source:{kind:'tool',callId},toolCallId:callId,isError:false,content:[{type:'text',text:'{"summary":"公开结果：找到配置文档","env":{"SECRET":"ENV_MUST_NOT_BE_STORED"}}'}]},meta:{private:'META_MUST_NOT_BE_STORED'}}});
const initial=()=>projectTask(undefined,session,call())!;
async function setup(fn:(s:CompanionHostStore,path:string)=>Promise<void>){const path=await mkdtemp(join(tmpdir(),'bigfish-tool-context-'));try{await fn(new CompanionHostStore(path),path);}finally{await rm(path,{recursive:true,force:true});}}
const allow=async(s:CompanionHostStore)=>s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'test',workspaces:['/work'],dailyTokens:100000},(await s.snapshot()).policyRevision);

test('paired public tool facts retain execution, result, elapsed time and exact provenance without completing the task',()=>{
 const start=initial();assert.equal(start.state,'running');assert.equal(start.tools?.[0]?.state,'running');
 const done=projectTask(start,session,result())!,fact=done.tools![0]!;
 assert.equal(done.state,'running');assert.equal(done.executionState,'running');assert.equal(fact.state,'succeeded');assert.equal(fact.durationMs,1000);
 assert.equal(fact.callSeq,1);assert.equal(fact.resultSeq,2);assert.match(fact.excerpt,/找到配置文档/);
 assert.doesNotMatch(JSON.stringify(done),/ARGUMENT_MUST|ENV_MUST|META_MUST/);
 assert.deepEqual(taskSource(done).tools,[{callId:'same',callSeq:1,resultSeq:2}]);
 assert.equal(projectTask(done,session,result()),null);
});

test('results never bind across workspace, session, step or turn; unknown calls and ambiguous legacy ids are ignored',()=>{
 const start=initial();
 assert.equal(projectTask(start,{id:'b',header:{cwd:'/work'}},result()),null);
 assert.equal(projectTask(start,{id:'a',header:{cwd:'/other'}},result()),null);
 assert.equal(projectTask(start,session,result(2,'other')),null);
 assert.equal(projectTask(start,session,result(2,'same',2)),null);
 const step=result();step.data.step=1;assert.equal(projectTask(start,session,step),null);
 const malformed=result();malformed.data.turn='1';assert.equal(projectTask(start,session,malformed),null);
 const foreign=result();foreign.data.message.source.callId='different';assert.equal(projectTask(start,session,foreign),null);
 const second=projectTask(start,session,call(3,'same',2))!;
 const legacy=result(4);delete legacy.data.turn;delete legacy.data.step;
 assert.equal(projectTask(second,session,legacy),null);
 const own=projectTask(second,session,result(4,'same',2))!;
 assert.equal(own.tools?.find(t=>t.turn===1)?.state,'running');assert.equal(own.tools?.find(t=>t.turn===2)?.state,'succeeded');
 const reused=projectTask(projectTask(start,session,result())!,session,call(3,'same',2))!;
 assert.equal(projectTask(reused,session,legacy),null,'A late duplicate without turn/step cannot become the new invocation result');
});

test('tool errors use structured identity and unknown execution is distinct from failure and task completion',()=>{
 const error=result();error.data.message.isError=true;error.data.message.content=[];error.data.error={code:'FILE_NOT_FOUND',reason:'File absent; password=ERROR_SECRET',stack:'STACK_SECRET'};
 const failed=projectTask(initial(),session,error)!;assert.equal(failed.tools?.[0]?.state,'failed');assert.equal(failed.tools?.[0]?.errorCode,'FILE_NOT_FOUND');assert.doesNotMatch(JSON.stringify(failed),/ERROR_SECRET|STACK_SECRET/);assert.equal(failed.state,'running');
 error.data.error.code='TOOL_OUTCOME_UNKNOWN';assert.equal(projectTask(initial(),session,error)?.tools?.[0]?.state,'unknown');
 error.data.message.isError=false;assert.equal(projectTask(initial(),session,error)?.tools?.[0]?.state,'succeeded');assert.equal(projectTask(initial(),session,error)?.tools?.[0]?.errorCode,undefined);
 const ended=projectTask(initial(),session,{type:'turn/end',seq:3,time:now+3000,data:{reason:{kind:'aborted'}}})!;
 assert.equal(ended.state,'cancelled');assert.equal(ended.tools?.[0]?.state,'unknown');assert.equal(ended.tools?.[0]?.resultSeq,undefined);
});

test('output whitelist strips opaque JSON, environment, credentials, encoded media, private and hidden blocks with strict bounds',()=>{
 const output=toolResultExcerpt([{type:'reasoning',text:'HIDDEN_SECRET'},{type:'image',source:{data:'IMAGE_SECRET'}},{type:'text',text:JSON.stringify({summary:'发现3处引用',stdout:'PATH=/private/environment\nAPI_KEY=ENV_SECRET\npassword: PASSWORD_SECRET\nAuthorization: Bearer AUTH_SECRET\nhttps://user:URL_SECRET@example.test/a?token=QUERY_SECRET#FRAGMENT_SECRET\n公开行',env:{SECRET:'JSON_SECRET'},arguments:{password:'ARGS_SECRET'},reasoning:'REASONING_SECRET',unknown:{text:'UNKNOWN_SECRET'}})},{type:'text',text:'data:image/png;base64,'+'a'.repeat(1000)}]);
 assert.match(output,/发现3处引用/);assert.match(output,/公开行/);assert.match(output,/https:\/\/example.test\/a/);
 assert.doesNotMatch(output,/SECRET|private\/environment|a{80}/);assert.ok(output.length<=360);
 assert.equal(toolResultExcerpt([{type:'text',text:'{"summary":"'+'X'.repeat(9000)+'","env":"SECRET"}'}]),'');
 assert.equal(toolResultExcerpt([{type:'text',text:'{"env":"SECRET"'}]),'');
 assert.equal(toolResultExcerpt([{type:'text',text:'{"env":{"secret":"SECRET"},"arguments":"SECRET"}'}]),'');
 assert.equal(safeToolText('-----BEGIN PRIVATE KEY-----\nPRIVATE_SECRET\n-----END PRIVATE KEY-----'),'[private material omitted]');
 assert.doesNotMatch(safeToolText('<think>PRIVATE_REASONING_SECRET</think>公开结论'),/SECRET/);
 assert.doesNotMatch(safeToolText('DB_PASSWORD: UNDERSCORE_SECRET\nprocess.env.SECRET=COMPOSITE_SECRET\nfoo=LOWERCASE_ENV_SECRET\npostgres://u:DSN_SECRET@example.test/db?password=QUERY_SECRET'),/SECRET/);
 assert.ok(toolResultExcerpt([{type:'text',text:'公开'.repeat(10000)}]).length<=360);
});

test('bounded facts normalize legacy state and discard arbitrary fields; surface replacement invalidates cached tool results',()=>{
 let t=initial();for(let i=2;i<=15;i++)t=projectTask(t,session,call(i,'c'+i))!;assert.equal(t.tools?.length,6);assert.equal(t.tools?.[0]?.callId,'c10');
 assert.equal(projectToolCall({name:'bad name',callId:'x'},1,1,[]),null);
 assert.equal(projectToolCall({name:'read',callId:'x',get arguments(){throw Error('Arguments must never be accessed');}},1,1,[])?.length,1);
 assert.equal(projectToolResult({message:{toolCallId:'missing'}},2,2,[]),null);
 assert.deepEqual(normalizeToolFacts(undefined),[]);
 const clean=normalizeToolFacts([{...initial().tools![0],arguments:'SECRET',env:'SECRET',excerpt:'token=SECRET'}]);assert.doesNotMatch(JSON.stringify(clean),/SECRET/);
 const done=projectTask(initial(),session,result())!;
 const shadow=projectTask(done,session,{type:'system/message',seq:3,time:now+4000,surfaceOp:{op:'replace',startSeq:2,endSeq:2},data:{content:[{type:'text',text:'REPLACEMENT_SECRET'}]}})!;
 assert.deepEqual(shadow.tools,[]);assert.equal(shadow.seq,3);assert.equal(shadow.state,'running');assert.doesNotMatch(JSON.stringify(shadow),/REPLACEMENT_SECRET/);
 assert.equal(projectTask(done,session,{type:'tool/result',seq:3,time:now+4000,surfaceOp:{op:'replace',startSeq:5,endSeq:2},data:{}}),null);
});

test('authorized understanding includes safe tool facts and links derived memory to exact sources; no new event makes no call',()=>setup(async s=>{
 let calls=0,input='';const model:ModelService={async prepareCall(){calls++;return {config:{},async *stream(options){input=JSON.stringify(options);yield {type:'text-delta',text:'{"text":"读取工具找到了配置文档，任务仍在进行。"}'};yield {type:'usage',usage:{totalTokens:31}};yield {type:'finish',reason:{kind:'stop'}};}};}};
 const done=projectTask(initial(),session,result())!;await s.observe(done);
 const service=new IntelligenceService(s,()=>model);await assert.rejects(service.understand('/work'));assert.equal(calls,0);
 await allow(s);const insight=await service.understand('/work');assert.equal(calls,1);assert.equal(insight?.intent,'notice');assert.match(input,/找到配置文档/);assert.doesNotMatch(input,/ARGUMENT_MUST|ENV_MUST|META_MUST/);assert.match(input,/不可信/);
 const state=await s.snapshot();assert.equal(state.today.used,31);assert.deepEqual(state.memories[0]?.sources[0]?.tools,[{callId:'same',callSeq:1,resultSeq:2}]);
 await assert.rejects(service.understand('/work'));assert.equal(calls,1);
}));

test('a new tool event rejects in-flight interpretation and invalidates derived summaries, without changing confirmed preferences',()=>setup(async s=>{
 const done=projectTask(initial(),session,result())!;await s.observe(done);await allow(s);
 await s.memory({workspace:'/work',kind:'preference',text:'喜欢简短回复',sources:[],confirmed:true,expiresAt:null});
 const model:ModelService={async prepareCall(){return {config:{},async *stream(){yield {type:'text-delta',text:'{"text":"已有工具摘要"}'};yield {type:'finish',reason:{kind:'stop'}};}};}};
 await new IntelligenceService(s,()=>model).understand('/work',false);assert.equal((await s.snapshot()).memories.length,2);
 const advanced=projectTask(done,session,call(3,'new'))!;await s.observe(advanced);assert.equal((await s.snapshot()).memories.length,1);
 const late:ModelService={async prepareCall(){return {config:{},async *stream(){await s.observe(projectTask(advanced,session,result(4,'new'))!);yield {type:'text-delta',text:'{"text":"过时工具摘要"}'};yield {type:'usage',usage:{totalTokens:20}};yield {type:'finish',reason:{kind:'stop'}};}};}};
 assert.equal(await new IntelligenceService(s,()=>late).understand('/work',false),null);const state=await s.snapshot();assert.equal(state.memories.length,1);assert.equal(state.today.reserved,0);assert.equal(state.memories[0]?.kind,'preference');
}));

test('forget clears tool facts and prevents late unpaired results or old memory from recreating deleted context',()=>setup(async s=>{
 const done=projectTask(initial(),session,result())!;await s.observe(done);await allow(s);
 const reservation=await s.reserve('/work',false,100,20,{case:'forget'});await s.forget('/work');
 assert.equal(await s.accept(reservation,'旧工具记忆','notice',[taskSource(done)]),null);assert.equal((await s.snapshot()).tasks.length,0);
 assert.equal(projectTask(undefined,session,result(3)),null);await s.settle(reservation.id,10);assert.equal((await s.snapshot()).memories.length,0);
}));

test('tool references are validated again at acceptance and old state without tools remains readable',()=>setup(async(s,path)=>{
 const done=projectTask(initial(),session,result())!;await s.observe(done);await allow(s);
 const state=await s.snapshot(),source=taskSource(state.tasks[0]!);source.tools![0]!.resultSeq=999;
 const reserve=await s.reserve('/work',false,100,20,{case:'forged'});assert.equal(await s.accept(reserve,'伪来源','notice',[source]),null);await s.settle(reserve.id,0);
 const raw=JSON.parse(await readFile(join(path,'state.json'),'utf8'));delete raw.tasks[0].tools;await writeFile(join(path,'state.json'),JSON.stringify(raw));
 assert.equal((await s.snapshot()).tasks[0]?.tools,undefined);
}));

test('insufficient shared budget blocks rich tool context before provider dispatch',()=>setup(async s=>{
 await s.observe(projectTask(initial(),session,result())!);await s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'test',workspaces:['/work'],dailyTokens:1000},0);
 let calls=0;const model:ModelService={async prepareCall(){calls++;throw Error('must not dispatch');}};
 await assert.rejects(new IntelligenceService(s,()=>model).understand('/work'));assert.equal(calls,0);assert.equal((await s.snapshot()).today.used,0);
}));

test('Host observer routes real tool event shapes, but disabled tracking retains no tool payload or task',()=>setup(async s=>{
 const {installCompanion}=await import('../src/companion/host.js');
 const callbacks=new Map<string,(...args:any[])=>unknown>(),dispose:(()=>void)[]=[];
 let tracked=true,calls=0,finished!:()=>void;
 const observe=s.observe.bind(s);s.observe=async(...args)=>{try{return await observe(...args);}finally{finished();}};
 const taskLimit=s.taskLimit.bind(s);s.taskLimit=async(...args)=>{try{return await taskLimit(...args);}finally{finished();}};
 const ctx:any={sessions:{},llm:{async prepareCall(){calls++;throw Error('No model dispatch expected');}},
   on(name:string,fn:(...args:any[])=>unknown){callbacks.set(name,fn);},effect(fn:()=>()=>void){dispose.push(fn());},
   inject(keys:string[],fn:(ctx:any)=>void){if(keys.every(key=>ctx[key]!==undefined))fn(ctx);}};
 installCompanion(ctx,s,()=>{const config=presetConfig('balanced');return {...config,groups:{...config.groups,steward:tracked,memory:tracked}};});
 const emit=async(event:HostEvent)=>{const done=new Promise<void>(resolve=>finished=resolve);callbacks.get('session/event')!(session,event);await done;};
 try{
  await emit(call());await emit(result());let state=await s.snapshot();assert.equal(state.tasks[0]?.tools?.[0]?.state,'succeeded');assert.equal(calls,0);
  await s.forget('/work');tracked=false;callbacks.get('session/event')!(session,call(3,'ignored'));
  await emit({type:'turn/end',seq:4,time:now+5000,data:{reason:{kind:'error',error:{code:'ACCOUNT_QUOTA'}}}});
  state=await s.snapshot();assert.equal(state.tasks.length,0);assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(state),/ARGUMENT_MUST|找到配置文档/);
 }finally{for(const fn of dispose)fn();}
}));

test('a policy change between context capture and reservation cannot send the old provider route',()=>setup(async s=>{
 await s.observe(projectTask(initial(),session,result())!);await allow(s);
 const reserve=s.reserve.bind(s);s.reserve=async(...args)=>{await s.configure({...defaultPolicy,enabled:true,provider:'replacement',model:'new',workspaces:['/work'],dailyTokens:100000},1);return reserve(...args);};
 let dispatched=0;const model:ModelService={async prepareCall(){dispatched++;throw Error('Must not prepare old route');}};
 await assert.rejects(new IntelligenceService(s,()=>model).understand('/work',false));const state=await s.snapshot();assert.equal(dispatched,0);assert.equal(state.today.used,0);assert.equal(state.today.reserved,0);
}));

test('cancellation before registration or during prepare never enters stream and does not charge tokens',()=>setup(async s=>{
 await s.observe(projectTask(initial(),session,result())!);await allow(s);let streams=0,service:IntelligenceService;
 const model:ModelService={async prepareCall(){service.cancel();return {config:{},async *stream(){streams++;yield {type:'finish',reason:{kind:'stop'}};}};}};
 service=new IntelligenceService(s,()=>model);await assert.rejects(service.understand('/work',false));assert.equal(streams,0);assert.equal((await s.snapshot()).today.used,0);
 const reserve=s.reserve.bind(s);s.reserve=async(...args)=>{service.cancel();return reserve(...args);};
 await assert.rejects(service.understand('/work',false));assert.equal(streams,0);assert.equal((await s.snapshot()).today.used,0);
}));

test('a new session is part of the workspace context fence even when every old source is unchanged',()=>setup(async s=>{
 await s.observe(projectTask(initial(),session,result())!);await allow(s);
 await s.memory({workspace:'/work',kind:'summary',text:'原来只有一个任务',sources:[taskSource((await s.snapshot()).tasks[0]!)],confirmed:false,expiresAt:null});
 const model:ModelService={async prepareCall(){return {config:{},async *stream(){await s.observe({...initial(),session:'new-session'});yield {type:'text-delta',text:'{"text":"只有一个会话"}'};yield {type:'usage',usage:{totalTokens:40}};yield {type:'finish',reason:{kind:'stop'}};}};}};
 assert.equal(await new IntelligenceService(s,()=>model).understand('/work',false),null);const state=await s.snapshot();assert.equal(state.memories.length,0);assert.equal(state.today.used,40);
}));

test('cancellation queued immediately before acceptance is checked inside the store lock',()=>setup(async s=>{
 await s.observe(projectTask(initial(),session,result())!);await allow(s);let service:IntelligenceService;
 const accept=s.accept.bind(s);s.accept=async(...args)=>{service.cancel();return accept(...args);};
 const model:ModelService={async prepareCall(){return {config:{},async *stream(){yield {type:'text-delta',text:'{"text":"取消后的旧回复"}'};yield {type:'usage',usage:{totalTokens:40}};yield {type:'finish',reason:{kind:'stop'}};}};}};
 service=new IntelligenceService(s,()=>model);assert.equal(await service.understand('/work',false),null);assert.equal((await s.snapshot()).memories.length,0);assert.equal((await s.snapshot()).today.used,40);
}));

test('concurrent manual models share the same budget before dispatch even with tool context',()=>setup(async(s,path)=>{
 await s.observe(projectTask(initial(),session,result())!);await s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'test',workspaces:['/work'],dailyTokens:5000},0);
 let prepared=0,release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),ready=new Promise<void>(resolve=>started=resolve);
 const model:ModelService={async prepareCall(){prepared++;return {config:{},async *stream(){started();await gate;yield {type:'text-delta',text:'{"text":"有限工具上下文"}'};yield {type:'usage',usage:{totalTokens:40}};yield {type:'finish',reason:{kind:'stop'}};}};}};
 const first=new IntelligenceService(s,()=>model).understand('/work',false);await ready;
 try{await assert.rejects(new IntelligenceService(new CompanionHostStore(path),()=>model).understand('/work',false));assert.equal(prepared,1);}finally{release();}
 assert.ok(await first);const state=await s.snapshot();assert.equal(state.today.used,40);assert.equal(state.today.reserved,0);
}));
