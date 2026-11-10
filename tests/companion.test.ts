import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeLifestyle,editLifestyle,presetConfig,decodeSchemes,exportScheme} from '../src/companion/config.js';
import {BehaviorScheduler,noticeSourceKey,sourcesCovered,type Intent} from '../src/companion/scheduler.js';
import {Walker,clampPoint} from '../src/companion/movement.js';
import {CompanionHostStore} from '../src/companion/host-store.js';
import {defaultPolicy,type Task} from '../src/companion/state.js';
test('presets and imports cannot carry permission, billing, or duplicate schemes',()=>{
  const all=presetConfig('all');assert.equal(Object.values(all.groups).every(Boolean),true);
  assert.throws(()=>decodeLifestyle({...all,enabled:true}));assert.throws(()=>decodeLifestyle({...all,apiKey:'secret'}));
  const edited=editLifestyle(all,{nickname:'朋友'});assert.equal(edited.preset,'custom');assert.equal(edited.basedOn,'all');
  assert.equal(exportScheme({...all,quietUntil:1234}).quietUntil,0);
  assert.throws(()=>decodeSchemes([{name:'x',config:all},{name:'x',config:all}]));
  assert.throws(()=>decodeLifestyle({...all,speed:NaN}));
});
const intent=(id:string,priority:Intent['priority'],key=id):Intent=>({id,key,priority,motion:'wave',text:id,createdAt:0,expiresAt:100000,durationMs:10000,interruptibleAfterMs:4000,cooldownMs:1000});
test('one main chain, merge same key, urgent interrupts, quiet preserves direct interaction',()=>{
  const s=new BehaviorScheduler();s.submit(intent('tea','life'),0);assert.equal(s.tick(0)?.intent.id,'tea');
  s.submit(intent('work','foreground'),1);assert.equal(s.tick(100)?.intent.id,'tea');
  assert.equal(s.tick(4000)?.intent.id,'work');s.submit(intent('confirm','urgent'),4001);assert.equal(s.tick(4001)?.intent.id,'confirm');
  s.quiet(5000);s.submit(intent('noise','life'),5001);assert.equal(s.tick(5001),null);
  s.submit(intent('touch','interaction'),5002);assert.equal(s.tick(5002)?.intent.id,'touch');assert.equal(s.tick(5003,true),null);
  s.quietUntil=0;s.submit(intent('a','background','tasks'),6000);s.submit(intent('b','background','tasks'),6001);assert.equal(s.tick(6002)?.intent.id,'b');
});
test('background notices wait for an existing local exit; critical facts and direct touch never wait',()=>{
 const s=new BehaviorScheduler();s.submit(intent('notice','background'),0);
 assert.equal(s.tick(0,false,{occupied:true,boundary:false}),null);
 assert.equal(s.tick(5000,false,{occupied:true,boundary:false}),null);
 s.submit(intent('question','urgent'),5001);assert.equal(s.tick(5001,false,{occupied:true,boundary:false})?.intent.id,'question');
 s.submit(intent('touch','interaction'),5002);assert.equal(s.tick(5002,false,{occupied:true,boundary:false})?.intent.id,'touch');
 const normal=new BehaviorScheduler();normal.submit(intent('tea','life'),0);normal.tick(0);normal.submit(intent('work','foreground'),1);
 assert.equal(normal.tick(6000,false,{boundary:false})?.intent.id,'tea');
 assert.equal(normal.tick(6040,false,{boundary:true})?.intent.id,'work');
});
test('local completion coverage deduplicates only exact sourced facts and never unsourced or partly new notices',()=>{
 const source={workspace:'/work',session:'one',seq:9},covered=new Set([noticeSourceKey(source)]);
 assert.equal(sourcesCovered([source],covered),true);
 assert.equal(sourcesCovered([{...source,seq:10}],covered),false);
 assert.equal(sourcesCovered([{...source,workspace:'/other'}],covered),false);
 assert.equal(sourcesCovered([source,{...source,session:'two'}],covered),false);
 assert.equal(sourcesCovered([],covered),false);assert.equal(sourcesCovered(undefined,covered),false);
});
test('walker never slides missing artwork, clamps monitor changes and yields to user placement',()=>{
 const area={x:-200,y:0,width:400,height:300},size={width:80,height:100};
 assert.deepEqual(clampPoint({x:1000,y:1000},area,size),{x:120,y:200});
 const w=new Walker({x:0,y:100},()=>.9),opts={enabled:true,capable:false,radius:120,speed:35,restMin:1,restMax:1};
 w.tick(1,area,size,opts);assert.equal(w.tick(999999,area,size,opts).x,0);
 for(let t=1000000;t<1020000;t+=50){const p=w.tick(t,area,size,{...opts,capable:true});assert.ok(p.x>=-200&&p.x<=120);}
 w.place({x:50,y:90},area,size,1030000);assert.equal(w.tick(1030016,area,size,{...opts,capable:true}).x,50);
});
async function fixture(fn:(a:CompanionHostStore,b:CompanionHostStore,clock:{now:number})=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'bigfish-intelligence-'));const clock={now:1700000000000};try{await fn(new CompanionHostStore(dir,()=>clock.now),new CompanionHostStore(dir,()=>clock.now),clock);}finally{await rm(dir,{recursive:true,force:true});}}
test('Host invitation and display ownership are shared across clients',()=>fixture(async(a,b,c)=>{
 await a.lease('web','web');assert.equal((await b.snapshot()).introducedAt,null);
 const result=await Promise.all([a.introduce('web'),b.introduce('web')]);assert.equal(result.filter(Boolean).length,1);
 await a.lease('web','web');assert.equal((await b.lease('desk','desktop'))?.client,'desk');assert.equal((await a.lease('web','web'))?.client,'desk');
 c.now+=16000;assert.equal((await a.lease('web','web'))?.client,'web');
}));
test('atomic reservations, no duplicate inference, stale facts and deleted memory invalidate responses',()=>fixture(async(a,b,c)=>{
 const s=await a.snapshot();await a.configure({...defaultPolicy,enabled:true,provider:'test',model:'test',workspaces:['/a'],dailyTokens:1000},s.policyRevision);
 const source={workspace:'/a',session:'one',seq:1};await a.observe({...source,title:'测试任务',excerpt:'公开回复',state:'running',updatedAt:c.now,parent:null});
 const rs=await Promise.allSettled([a.reserve('/a',true,500,200,{seq:1}),b.reserve('/a',true,500,200,{seq:1})]);assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);
 const r=rs.find(r=>r.status==='fulfilled')!.value;
 assert.equal((await a.accept(r,'正在执行','notice',[source]))?.text,'正在执行');
 await a.observe({...source,seq:2,title:'测试任务',excerpt:'完成',state:'completed',updatedAt:c.now,parent:null});assert.equal(await a.accept(r,'还在运行','notice',[source]),null);
 await b.settle(r.id);const state=await a.snapshot();assert.equal(state.today.used,700);assert.equal(state.today.estimated,true);
 await assert.rejects(a.reserve('/b',false,1,1,{}));await assert.rejects(a.reserve('/a',false,500,200,{seq:2}));
 await a.forget('/a');assert.equal(await a.accept(r,'旧记忆','notice',[source]),null);
}));
test('unknown in-flight usage is conservatively charged after Host restart and midnight',()=>fixture(async(a,b,c)=>{
 const s=await a.snapshot();await a.configure({...defaultPolicy,enabled:true,provider:'x',model:'x',workspaces:['/a']},s.policyRevision);
 const r=await a.reserve('/a',false,100,100,{seq:1});c.now+=86400000;await b.lease('web','web');const state=await b.snapshot();assert.equal(state.usage[r.day]?.used,200);assert.equal(state.today.used,0);
}));

test('local growth records real interactions without penalties or model budget changes',()=>fixture(async(a,b,c)=>{
 assert.equal((await a.snapshot()).life.interactions,0);
 await a.recordInteraction('tea');await b.recordInteraction('tea');assert.equal((await a.snapshot()).life.interactions,1);
 c.now+=7*86400000;assert.equal((await a.snapshot()).life.interactions,1);await a.recordInteraction('wave');
 const state=await a.snapshot();assert.equal(state.life.interactions,2);assert.equal(state.today.used,0);
 await b.clearDiary();assert.equal((await a.snapshot()).life.journal.length,0);
}));

test('display heartbeats and task events do not invalidate a settings draft, concurrent settings do',()=>fixture(async(a,b,c)=>{
 const draft=await a.snapshot();await b.lease('desktop','desktop');await b.introduce('desktop');
 await a.configure({...draft.policy,dailyTokens:40000},draft.policyRevision);
 await assert.rejects(b.configure({...draft.policy,dailyTokens:50000},draft.policyRevision),/另一窗口/);
}));
test('an outward choice at the screen edge turns inward instead of skipping its walk',()=>{
 const w=new Walker({x:320,y:0},()=>.9),area={x:0,y:0,width:400,height:300},size={width:80,height:100};
 const options={enabled:true,capable:true,radius:120,speed:35,restMin:1,restMax:1};
 w.tick(1,area,size,options);w.tick(1002,area,size,options);assert.equal(w.phase,'walk-left');assert.ok(w.position.x<320);
});

test('a Host insight is announced by one display exactly once across handover',()=>fixture(async(a,b,c)=>{
 await a.configure({...defaultPolicy,enabled:true,provider:'x',model:'x',workspaces:['/a']},0);
 const source={workspace:'/a',session:'one',seq:1};await a.observe({...source,title:'任务',excerpt:'结果',state:'completed',updatedAt:c.now,parent:null});
 const reservation=await a.reserve('/a',false,100,100,{seq:1});await a.accept(reservation,'完成','celebrate',[source]);await a.settle(reservation.id,20);
 await a.lease('web','web');assert.equal(await b.announce(reservation.id,'wrong'),false);
 assert.equal(await a.announce(reservation.id,'web'),true);await b.lease('desktop','desktop');assert.equal(await b.announce(reservation.id,'desktop'),false);
}));

test('same-event runtime waiting changes invalidate model context without inventing a new event sequence',()=>fixture(async(a,b,c)=>{
 await a.configure({...defaultPolicy,enabled:true,provider:'x',model:'x',workspaces:['/a']},0);
 const task={workspace:'/a',session:'one',seq:7,title:'工作',excerpt:'公开内容',state:'running' as const,executionState:'running' as const,updatedAt:c.now,parent:null};
 await a.observe(task);const before=(await a.snapshot()).tasks[0]!;
 const reservation=await a.reserve('/a',false,100,100,{seq:7});
 const source={workspace:before.workspace,session:before.session,seq:before.seq,statusRevision:before.statusRevision!};
 assert.equal(await b.observe({...before,state:'waiting',pendingRemote:{question:2,approval:0}},{runtime:true}),true);
 const changed=(await a.snapshot()).tasks[0]!;
 assert.equal(changed.seq,7);assert.equal(changed.statusRevision,source.statusRevision+1);
 assert.equal(await a.accept(reservation,'仍在运行','notice',[source]),null);
 assert.equal(await b.observe(changed,{runtime:true}),false);
 assert.equal((await a.snapshot()).tasks[0]!.statusRevision,changed.statusRevision);
 await a.settle(reservation.id,50);
}));

test('important task facts produce sourced reminders even with intelligence disabled',()=>fixture(async(a,b,c)=>{
 const task={workspace:'/a',session:'one',seq:1,title:'测试',excerpt:'',state:'waiting' as const,updatedAt:c.now,parent:null};
 await a.observe(task);let state=await a.snapshot();assert.equal(state.policy.enabled,false);assert.equal(state.today.used,0);assert.equal(state.insights.length,1);assert.equal(state.insights[0]?.intent,'attention');
 await b.lease('web','web');await b.announce(state.insights[0]!.id,'web');
 await a.observe({...task,seq:2});state=await a.snapshot();assert.equal(state.insights.length,0);
}));

test('forget prevents pre-deletion queued events from restoring erased context',()=>fixture(async(a,b,c)=>{
 const task={workspace:'/a',session:'one',seq:1,title:'任务',excerpt:'删除内容',state:'running' as const,updatedAt:c.now,parent:null};
 await a.observe(task);await a.forget('/a');assert.equal(await b.observe({...task,seq:2}),false);assert.equal((await a.snapshot()).tasks.length,0);
 c.now++;assert.equal(await b.observe({...task,seq:3,excerpt:'新公开内容',updatedAt:c.now}),true);
}));

test('budget warning is local, durable and delivered once across clients; exhausted budget supersedes it',()=>fixture(async(a,b,c)=>{
 await a.configure({...defaultPolicy,enabled:true,provider:'x',model:'x',workspaces:['/a'],dailyTokens:1000},0);
 const r=await a.reserve('/a',false,500,300,{seq:1});await a.settle(r.id,800);
 let state=await b.snapshot();const warning=state.insights.find(i=>i.id.startsWith('alert-budget-warning-'))!;
 assert.equal(warning.system,true);assert.equal(warning.intent,'notice');assert.deepEqual(warning.sources,[]);assert.match(warning.text,/80%/);
 const next=await b.reserve('/a',false,50,50,{seq:2});await b.settle(next.id,100);
 assert.equal((await a.snapshot()).insights.filter(i=>i.id.startsWith('alert-budget-warning-')).length,1);
 await a.lease('web','web');const won=await Promise.all([a.announce(warning.id,'web'),b.announce(warning.id,'web')]);assert.equal(won.filter(Boolean).length,1);
 await b.lease('desktop','desktop');assert.equal(await b.announce(warning.id,'desktop'),false);
 await assert.rejects(a.reserve('/a',false,100,100,{seq:3}));
 await Promise.all([a.alert('budget','宠物预算不足'),b.alert('budget','宠物预算不足')]);
 state=await a.snapshot();assert.equal(state.insights.filter(i=>i.id.startsWith('alert-budget-')&&!i.id.startsWith('alert-budget-warning-')).length,1);
 assert.equal(state.today.used,900);assert.equal(state.today.reserved,0);
}));

test('an unclaimed budget notice expires at the next budget day, and an old-day settlement does not warn today',()=>fixture(async(a,b,c)=>{
 await a.configure({...defaultPolicy,enabled:true,provider:'x',model:'x',workspaces:['/a'],dailyTokens:1000},0);
 const r=await a.reserve('/a',false,500,300,{seq:1});await a.alert('budget','预算不足');
 const alert=(await a.snapshot()).insights[0]!;c.now+=86400000;await b.lease('web','web');
 assert.equal(await b.announce(alert.id,'web'),false);
 await b.settle(r.id,900);const state=await a.snapshot();assert.equal(state.today.used,0);assert.equal(state.insights.length,1);
}));

test('task quota facts bypass the steward display switch but retain only real event sources',()=>fixture(async(a,b,c)=>{
 const source={workspace:'/a',session:'one',seq:1};
 await a.observe({...source,title:'编写测试',excerpt:'',state:'failed',failureKind:'credit',updatedAt:c.now,parent:null});
 let state=await a.snapshot();assert.equal(state.insights[0]?.system,true);assert.deepEqual(state.insights[0]?.sources,[source]);
 assert.match(state.insights[0]!.text,/额度或余额不足/);
 await a.taskLimit({...source,seq:2},'output-limit');await b.taskLimit({...source,seq:2},'output-limit');
 state=await a.snapshot();assert.equal(state.insights.filter(i=>i.id.startsWith('limit-')).length,1);assert.match(state.insights.at(-1)!.text,/不表示账户余额不足/);
}));

test('untracked task token reminders disappear when the source resumes; erased queued limits stay erased',()=>fixture(async(a,b,c)=>{
 const source={workspace:'/a',session:'one',seq:1};
 await a.taskLimit(source,'credit',c.now);assert.equal((await a.snapshot()).insights.length,1);
 await b.clearTaskLimits({...source,seq:2});assert.equal((await a.snapshot()).insights.length,0);
 await a.forget('/a');assert.equal(await b.taskLimit({...source,seq:3},'context',c.now),false);
 c.now++;assert.equal(await b.taskLimit({...source,seq:4},'output-limit',c.now),true);
}));
test('fact notices count only live work and answerable interactions, never cold running or terminal drivers',()=>fixture(async(a,b,c)=>{
 const base={workspace:'/a',seq:1,title:'真实任务',excerpt:'',updatedAt:c.now,parent:null};
 const rows:Task[]=[
  {...base,session:'cold-running',state:'running',runtimeStatus:'idle'},
  {...base,session:'unknown-runtime',state:'running'},
  {...base,session:'terminal-driver',state:'completed',runtimeStatus:'running'},
  {...base,session:'live-work',state:'running',runtimeStatus:'running'},
  {...base,session:'continued-question',state:'waiting',runtimeStatus:'idle',pendingQuestions:[{callId:'q',state:'continued'}]},
  {...base,session:'approval',state:'waiting',pendingApprovals:['approval']},
  {...base,session:'remote',state:'waiting',pendingRemote:{question:1,approval:1}},
  {...base,session:'blocked-without-interaction',state:'waiting',executionState:'waiting'},
 ];
 for(const row of rows)await a.observe(row);
 const state=await b.snapshot(),notice=state.insights.at(-1)!;
 assert.match(notice.text,/等待处理。当前还有 1 个会话运行，3 个等待确认/);
 assert.ok(!notice.text.startsWith('「真实任务」需要你确认'));
 assert.equal(state.tasks.find(t=>t.session==='cold-running')?.state,'running');
 assert.equal(state.tasks.find(t=>t.session==='blocked-without-interaction')?.state,'waiting');
 assert.equal(state.tasks.find(t=>t.session==='terminal-driver')?.state,'completed');
 assert.equal(state.today.used,0);
}));
