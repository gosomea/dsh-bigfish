import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {restoreLiveTask,projectTask,type HostEvent} from '../src/companion/intelligence.js';
import {CompanionHostStore} from '../src/companion/host-store.js';
import {installCompanion} from '../src/companion/host.js';
import {presetConfig} from '../src/companion/config.js';
import {consumedTaskSeq,defaultPolicy,taskStatusKey,type Task} from '../src/companion/state.js';
import {taskSource,workspaceContextKey} from '../src/companion/tool-context.js';
const session={id:'recovered',seq:17,header:{cwd:'/fixture'}},projection={asOfSeq:15,values:{title:'正在执行的任务'}};
const call:HostEvent={type:'tool/call',seq:15,time:1000,data:{callId:'same',name:'fixture_tool',turn:1,step:1}};
const result:HostEvent={type:'tool/result',seq:16,time:1001,data:{turn:1,step:1,message:{role:'tool',source:{kind:'tool',callId:'same'},toolCallId:'same',isError:true,content:[{type:'text',text:'公开失败结果'}]}}};

test('a recovery observation at seq15 does not consume a queued call15 or its paired result16',()=>{
 const recovered=restoreLiveTask(undefined,{session,status:'running'},projection,undefined,1002)!;
 assert.equal(recovered.seq,15);const started=projectTask(recovered,session,call);assert.ok(started,'same-sequence observed snapshot must not swallow an unconsumed real call');
 const finished=projectTask(started,session,result)!;assert.equal(finished.seq,16);assert.equal(finished.tools?.[0]?.state,'failed');assert.equal(finished.tools?.[0]?.callSeq,15);assert.equal(finished.tools?.[0]?.resultSeq,16);
 assert.equal(projectTask(finished,session,call),null);assert.equal(projectTask(finished,session,result),null);
});

test('a queued historical turn end cannot regress a newer running observation or announce an old completion',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bigfish-watermark-history-'));try{
  const store=new CompanionHostStore(dir,()=>2000),recovered=restoreLiveTask(undefined,{session,status:'running'},projection,undefined,1002)!;
  await store.observe(recovered,{runtime:true});const before=(await store.snapshot()).tasks[0]!;
  const older=projectTask(before,session,{type:'turn/end',seq:14,time:999,data:{reason:{kind:'completed'}}});assert.ok(older);assert.equal(older.seq,15);assert.equal(older.state,'running');
  assert.equal(await store.observe(older),false);const after=await store.snapshot();assert.equal(after.tasks[0]?.statusRevision,before.statusRevision);assert.equal(after.insights.length,0);
  const started=projectTask(after.tasks[0],session,call);assert.ok(started);assert.equal(await store.observe(started),true);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('runtime sample and queued real events overlap behind an explicit barrier without losing tool provenance',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bigfish-watermark-overlap-')),cleanups:(()=>void)[]=[];
 let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{entered=resolve;});
 try{
  const store=new CompanionHostStore(dir,()=>2000),observe=store.observe.bind(store);let first=true;
  store.observe=async(...args)=>{if(first){first=false;entered();await blocked;}return observe(...args);};
  const callbacks=new Map<string,(...args:any[])=>any>(),ctx:any={sessions:{},agents:{list:()=>[{session,status:'running'}]},sessionProjections:{snapshot:()=>projection},
   on(name:string,callback:(...args:any[])=>any){callbacks.set(name,callback);},effect(fn:()=>()=>void){cleanups.push(fn());},inject(keys:string[],fn:(ctx:any)=>void){if(keys.every(key=>this[key]!==undefined))fn(this);}};
  installCompanion(ctx,store,()=>presetConfig('balanced'));await ready;
  callbacks.get('session/event')!(session,call);callbacks.get('session/event')!(session,result);
  const settled=callbacks.get('agent/status')!();release();await settled;
  const task=(await store.snapshot()).tasks.find(t=>t.session===session.id)!;assert.equal(task.tools?.[0]?.state,'failed');assert.equal(task.tools?.[0]?.resultSeq,16);
 }finally{release();for(const cleanup of cleanups)cleanup();await rm(dir,{recursive:true,force:true});}
});

test('legacy event watermarks remain consumed and invalid stored cursors degrade conservatively after reload',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bigfish-watermark-reload-'));try{
  const store=new CompanionHostStore(dir,()=>2000),legacy:Task={workspace:'/fixture',session:session.id,seq:15,title:'已完成',state:'completed',executionState:'completed',updatedAt:1000,parent:null,excerpt:'当前正文'};
  await store.observe(legacy);assert.equal(projectTask(legacy,session,call),null);assert.equal(restoreLiveTask(legacy,{session,status:'running'},projection,undefined,2000)?.state,'completed');
  const raw=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));
  for(const invalid of [-2,16,1.5,'15']){
   raw.tasks[0].consumedSeq=invalid;await writeFile(join(dir,'state.json'),JSON.stringify(raw));const restored=(await store.snapshot()).tasks[0]!;
   assert.equal(restored.consumedSeq,undefined);assert.equal(consumedTaskSeq(restored),15);assert.equal(projectTask(restored,session,call),null);
  }
  for(const consumedSeq of [-2,16,1.5,NaN])assert.throws(()=>store.observe({...legacy,consumedSeq}),/任务事件无效/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('cursor-only writes preserve source revision, model fingerprint, summary, notification and usage',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bigfish-watermark-context-'));try{
  const store=new CompanionHostStore(dir,()=>2000);await store.configure({...defaultPolicy,enabled:true,provider:'local',model:'fixture',workspaces:['/fixture']},0);
  await store.observe(restoreLiveTask(undefined,{session,status:'running'},projection,undefined,1002)!,{runtime:true});
  let snapshot=await store.snapshot();const current=snapshot.tasks[0]!,reservation=await store.reserve('/fixture',false,10,10,{fixture:'cursor'});await store.accept(reservation,'当前模型摘要','notice',[taskSource(current)]);await store.settle(reservation.id,7);snapshot=await store.snapshot();
  const oldBody=projectTask(snapshot.tasks[0],session,{type:'assistant/message',seq:14,time:999,surfaceOp:'append',data:{message:{content:[{type:'text',text:'不可覆盖的旧正文'}]}}})!;
  assert.equal(oldBody.excerpt,current.excerpt);assert.equal(taskStatusKey(oldBody),taskStatusKey(current));assert.equal(await store.observe(oldBody),false);
  const after=await store.snapshot();assert.equal(after.tasks[0]?.consumedSeq,14);assert.equal(after.tasks[0]?.statusRevision,current.statusRevision);assert.equal(workspaceContextKey(after.tasks,'/fixture'),workspaceContextKey(snapshot.tasks,'/fixture'));
  assert.deepEqual(after.memories,snapshot.memories);assert.deepEqual(after.insights,snapshot.insights);assert.deepEqual(after.today,snapshot.today);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('question projection stays authoritative for queued and equal-sequence calls, results and prior replies',()=>{
 const recovered=restoreLiveTask(undefined,{session,status:'running'},{...projection,values:{userQuestions:{active:[{callId:'question',state:'continued'}]}}},undefined,1002)!;
 const ask:HostEvent={...call,data:{...call.data,callId:'question',name:'ask_user_question',arguments:JSON.stringify({questions:[{id:'q',question:'测试问题'}]})}};
 const equal=projectTask(recovered,session,ask)!;assert.equal(equal.pendingQuestions?.[0]?.state,'continued');assert.equal(equal.state,'waiting');assert.equal(taskStatusKey(equal),taskStatusKey(recovered));
 const oldResult={...result,seq:14,data:{message:{toolCallId:'question',content:[{type:'text',text:'{}'}]}}};
 assert.equal(projectTask(recovered,session,oldResult)?.pendingQuestions?.[0]?.state,'continued');
 assert.equal(projectTask(recovered,session,{type:'user/message',seq:14,time:999,data:{source:{kind:'user-question-reply',callId:'question'}}})?.pendingQuestions?.[0]?.state,'continued');
 assert.equal(projectTask(equal,session,{...oldResult,seq:16})?.pendingQuestions?.length,0);
});

test('a Host without question projections falls back to an equal-sequence observed question call and continued result',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bigfish-watermark-question-legacy-'));try{
  const store=new CompanionHostStore(dir,()=>2000),recovered=restoreLiveTask(undefined,{session,status:'running'},projection,undefined,1002)!;
  assert.equal(recovered.pendingQuestions,undefined);await store.observe(recovered,{runtime:true});
  const ask:HostEvent={...call,data:{...call.data,callId:'question',name:'ask_user_question',arguments:JSON.stringify({questions:[{id:'q',question:'测试问题'}]})}};
  const started=projectTask((await store.snapshot()).tasks[0],session,ask)!;assert.equal(started.pendingQuestions?.[0]?.state,'open');assert.equal(started.state,'waiting');assert.equal(await store.observe(started,{eventTime:ask.time}),true);
  const continued:HostEvent={...result,data:{message:{toolCallId:'question',content:[{type:'text',text:'{"pending":true}'}]}}};
  const finished=projectTask((await store.snapshot()).tasks[0],session,continued)!;assert.equal(finished.pendingQuestions?.[0]?.state,'continued');assert.equal(finished.state,'waiting');assert.equal(await store.observe(finished,{eventTime:continued.time}),true);assert.equal((await store.snapshot()).tasks[0]?.pendingQuestions?.[0]?.state,'continued');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('an explicitly empty current question projection does not revive a queued equal-sequence ask',()=>{
 const recovered=restoreLiveTask(undefined,{session,status:'running'},{...projection,values:{userQuestions:{active:[]}}},undefined,1002)!;
 assert.deepEqual(recovered.pendingQuestions,[]);
 const ask:HostEvent={...call,data:{...call.data,callId:'question',name:'ask_user_question',arguments:JSON.stringify({questions:[{id:'q',question:'已结束的问题'}]})}};
 const next=projectTask(recovered,session,ask)!;assert.deepEqual(next.pendingQuestions,[]);assert.equal(next.state,'running');assert.equal(taskStatusKey(next),taskStatusKey(recovered));
});

test('recovery cursors never cross sessions or workspaces and cannot bypass a deletion event-time cutoff',async()=>{
 const recovered=restoreLiveTask(undefined,{session,status:'running'},projection,undefined,1002)!;
 assert.equal(projectTask(recovered,{...session,id:'other'},result),null);assert.equal(projectTask(recovered,{...session,header:{cwd:'/other'}},result),null);
 const fresh=projectTask(recovered,{...session,id:'other'},call)!;assert.equal(fresh.session,'other');assert.equal(fresh.consumedSeq,15);assert.equal(fresh.tools?.[0]?.state,'running');
 const dir=await mkdtemp(join(tmpdir(),'bigfish-watermark-forget-'));try{
  const store=new CompanionHostStore(dir,()=>2000);await store.forget('/fixture');const old=projectTask(undefined,session,call)!;assert.equal(await store.observe(old),false);assert.equal((await store.snapshot()).tasks.length,0);
  const staleCatchup=projectTask(recovered,session,{...call,seq:14})!;assert.equal(staleCatchup.updatedAt,recovered.updatedAt);
  assert.equal(await store.observe({...staleCatchup,updatedAt:3000},{eventTime:1000}),false);assert.equal((await store.snapshot()).tasks.length,0);
  assert.equal(await store.observe({...staleCatchup,updatedAt:3000},{eventTime:1000,cursorOnly:true}),false);assert.equal((await store.snapshot()).tasks.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a stale cursor-only snapshot merges into the locked current task without removing newer tools or pending state',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bigfish-watermark-two-stores-'));try{
  const a=new CompanionHostStore(dir,()=>2000),b=new CompanionHostStore(dir,()=>2000);
  await a.observe(restoreLiveTask(undefined,{session,status:'running'},projection,undefined,1002)!,{runtime:true});
  const stale=(await a.snapshot()).tasks[0]!,cursor=projectTask(stale,session,{type:'assistant/message',seq:14,time:1000,data:{message:{content:[]}}})!;
  const added=projectTask(stale,session,{...call,seq:10})!;assert.equal(await b.observe(added,{eventTime:1000}),true);
  let current=(await b.snapshot()).tasks[0]!;assert.equal(await b.observe({...current,state:'waiting',pendingQuestions:[{callId:'q',state:'continued'}]},{runtime:true}),true);current=(await b.snapshot()).tasks[0]!;
  assert.equal(await a.observe(cursor,{cursorOnly:true,eventTime:1000}),false);let saved=(await b.snapshot()).tasks[0]!;
  assert.equal(saved.consumedSeq,14);assert.equal(saved.tools?.[0]?.callSeq,10);assert.equal(saved.pendingQuestions?.[0]?.state,'continued');assert.equal(saved.statusRevision,current.statusRevision);
  const lower=projectTask(stale,session,{type:'assistant/message',seq:12,time:1000,data:{message:{content:[]}}})!;await a.observe(lower,{cursorOnly:true,eventTime:1000});
  assert.equal((await b.snapshot()).tasks[0]?.consumedSeq,14);
  assert.equal(await a.observe({...saved,pendingQuestions:[],state:'running',statusRevision:stale.statusRevision!},{runtime:true}),false);saved=(await b.snapshot()).tasks[0]!;assert.equal(saved.pendingQuestions?.[0]?.state,'continued');
 }finally{await rm(dir,{recursive:true,force:true});}
});
