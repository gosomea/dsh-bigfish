import test from 'node:test';
import assert from 'node:assert/strict';
import {LifeRoutineDirector,type RoutineInput} from '../src/companion/routines.js';
import {presetConfig} from '../src/companion/config.js';
import type {Task} from '../src/companion/state.js';

// A fixed custom cadence isolates clip timing from the shared activity presets.
const defaults=():RoutineInput=>({enabled:true,config:presetConfig('balanced'),idleMode:'custom',idleMinSeconds:75,idleMaxSeconds:75,state:'idle',tasks:[],blocked:false,urgent:false,interacting:false,quiet:false});
function advance(d:LifeRoutineDirector,input:RoutineInput,from:number,to:number,step=1000){for(let t=from;t<to;t+=step)d.tick(input,t);return d.tick(input,to);}
const task=(state:Task['state'],seq:number,updatedAt:number,session='one'):Task=>({workspace:'/a',session,seq,state,updatedAt,parent:null,title:`任务 ${session}`,excerpt:'真实公开结果'});

test('a custom life cadence holds its final pose and exits without replaying the entry',()=>{
 const d=new LifeRoutineDirector(),i=defaults();
 assert.equal(d.tick(i,0),null);assert.equal(advance(d,i,1000,74999),null);
 const entry=d.tick(i,75000)!;assert.equal(entry.clip,'sit-down');assert.equal(entry.phase,'entry');
 const hold=d.tick(i,77240)!;assert.equal(hold.phase,'hold');assert.equal(hold.serial,entry.serial);
 assert.equal(d.tick(i,85000)!.serial,entry.serial);
 const exit=d.tick(i,87240)!;assert.equal(exit.clip,'stretch');assert.equal(exit.phase,'exit');assert.notEqual(exit.serial,entry.serial);
 assert.equal(d.tick(i,92480),null);assert.equal(d.tick(i,100000),null);
});
test('quiet idle never launches repeated life scenes and a frequency change does not leave an infinite deadline',()=>{
 const d=new LifeRoutineDirector(),quiet={...defaults(),idleMode:'quiet' as const};
 for(let t=0;t<3600000;t+=10000)assert.equal(d.tick(quiet,t),null);
 const normal={...quiet,idleMode:'custom' as const};assert.equal(d.tick(normal,3600000),null);
 assert.equal(advance(d,normal,3601000,3674999),null);assert.equal(d.tick(normal,3675000)?.clip,'sit-down');
});
test('sleep finishes its chain, direct idle activity wakes, and real work takes the actor immediately',()=>{
 const d=new LifeRoutineDirector(),i=defaults();d.tick(i,0);
 advance(d,i,1000,75000);advance(d,i,76000,92480);
 const lie=advance(d,i,93480,167480)!;assert.equal(lie.clip,'lie-down');
 const sleep=advance(d,i,168480,173720)!;assert.equal(sleep.clip,'sleep');
 assert.equal(d.tick({...i,interacting:true},174000),null);
 assert.equal(d.tick({...i,interacting:true,state:'outputting'},175000),null);
 assert.equal(d.tick({...i,state:'outputting'},176000),null);
 assert.equal(d.tick({...i,state:'outputting'},178540),null);
 assert.equal(d.tick({...i,state:'outputting'},179000),null);
 const touched=new LifeRoutineDirector();touched.tick(i,0);advance(touched,i,1000,75000);advance(touched,i,76000,92480);advance(touched,i,93480,167480);advance(touched,i,168480,173720);
 assert.equal(touched.tick({...i,interacting:true},174000),null);
 assert.equal(touched.tick(i,175000)?.clip,'wake-up');
});
test('drag, important notices, quiet timers and reduced motion prevent ambient performances',()=>{
 for(const blocker of [{blocked:true},{urgent:true},{interacting:true},{quiet:true},{reducedMotion:true}]){
  const d=new LifeRoutineDirector(),i={...defaults(),...blocker};
  for(let t=0;t<300000;t+=10000)assert.equal(d.tick(i,t),null);
 }
 const d=new LifeRoutineDirector(),i=defaults();d.tick(i,0);advance(d,i,1000,75000);
 assert.equal(d.tick({...i,urgent:true},76000),null);assert.equal(d.tick(i,77000),null);
});
test('home furniture choices obey enabled groups and disappear promptly when disabled',()=>{
 const d=new LifeRoutineDirector(),i={...defaults(),config:presetConfig('gentle')};d.tick(i,0);
 assert.equal(advance(d,i,1000,75000)?.clip,'desk-tidy');
 assert.equal(d.tick({...i,config:{...i.config,desk:false}},76000),null);
 const missing={...defaults(),availableClips:[]};const noArt=new LifeRoutineDirector();noArt.tick(missing,0);assert.equal(advance(noArt,missing,1000,300000),null);
});
test('only observed real terminal transitions trigger once and restored completions never replay',()=>{
 const d=new LifeRoutineDirector(),i={...defaults(),idleMode:'quiet' as const,tasks:[task('completed',1,0)]};
 assert.equal(d.tick(i,0),null);assert.equal(d.tick(i,1000),null);
 d.tick({...i,tasks:[task('running',2,1100)]},1100);
 const finished={...i,tasks:[task('completed',3,2000)]};
 const entry=d.tick(finished,2000)!;assert.equal(entry.clip,'book-close');assert.equal(entry.text,'「任务 one」已完成。');assert.deepEqual(entry.sources,[{workspace:'/a',session:'one',seq:3}]);
 assert.equal(d.tick(finished,7240)?.clip,'success-bow');assert.equal(d.tick(finished,13480),null);
 assert.equal(d.tick({...finished,tasks:[task('completed',4,14000)]},14000),null);
 assert.equal(advance(d,finished,15000,200000),null);
});
test('terminal reminders merge facts, validate current state and respect quiet completion settings',()=>{
 const i={...defaults(),idleMode:'quiet' as const,tasks:[task('running',1,0),task('running',1,0,'two')]};
 const d=new LifeRoutineDirector();d.tick(i,0);
 const done={...i,tasks:[task('completed',2,1000),task('completed',2,1000,'two')]};
 const frame=d.tick(done,1000)!;assert.equal(frame.sources.length,2);assert.ok(frame.text.startsWith('2 个会话已完成'));
 const stale=new LifeRoutineDirector();stale.tick(i,0);assert.equal(stale.tick({...done,blocked:true},1000),null);
 assert.equal(stale.tick({...done,tasks:[task('running',3,2000),task('running',3,2000,'two')]},2000),null);
 for(const completionMode of ['quiet','message'] as const){const p=new LifeRoutineDirector();p.tick(i,0);assert.equal(p.tick({...done,completionMode},1000),null);}
});
test('failures retain their true source and reduced mode uses one held pose',()=>{
 const d=new LifeRoutineDirector(),i={...defaults(),idleMode:'quiet' as const,reducedMotion:true,tasks:[task('running',1,0)]};d.tick(i,0);
 const failed={...i,tasks:[task('failed',2,1000)]},frame=d.tick(failed,1000)!;
 assert.equal(frame.clip,'failure-check');assert.equal(frame.phase,'hold');assert.ok(frame.text.includes('执行失败'));assert.equal(frame.sources[0]?.seq,2);
 assert.equal(d.tick(failed,5000),null);assert.equal(d.tick(failed,6000),null);
});
test('background time jumps do not replay missed scenes on return',()=>{
 const d=new LifeRoutineDirector(),i=defaults();d.tick(i,0);advance(d,i,1000,75000);
 assert.equal(d.tick(i,300000),null);assert.equal(d.tick(i,301000),null);
 assert.equal(d.tick(i,100),null);
});
test('an active terminal scene stops on a changed fact or deletion, not a harmless status revision',()=>{
 const i={...defaults(),idleMode:'quiet' as const,tasks:[{...task('running',1,0),statusRevision:1}]};
 const d=new LifeRoutineDirector();d.tick(i,0);
 const done={...i,tasks:[{...task('completed',2,1000),statusRevision:2}]};
 const frame=d.tick(done,1000)!;assert.equal(frame.sources[0]?.statusRevision,2);
 const sampled={...done,tasks:[{...task('completed',2,1100),statusRevision:3}]};
 assert.equal(d.tick(sampled,1100)?.serial,frame.serial);
 assert.equal(d.tick({...done,tasks:[{...task('running',2,1200),statusRevision:4}]},1200),null);
 const newDone={...done,tasks:[{...task('completed',2,1300),statusRevision:5}]};
 const newFrame=d.tick(newDone,1300)!;assert.notEqual(newFrame.serial,frame.serial);assert.equal(newFrame.sources[0]?.statusRevision,5);
 assert.equal(d.tick({...done,tasks:[]},1400),null);
});
test('disabled routines do not retain events to replay when enabled again',()=>{
 const d=new LifeRoutineDirector(),i={...defaults(),idleMode:'quiet' as const,tasks:[task('running',1,0)]};d.tick(i,0);
 const done={...i,tasks:[task('completed',2,1000)]};assert.equal(d.tick({...done,enabled:false},1000),null);
 assert.equal(d.tick(done,2000),null);
});
test('a steward can sit beside background work but does not sleep through running or waiting sessions',()=>{
 for(const state of ['running','waiting'] as const){
  const active={...task(state,1,0),runtimeStatus:'running' as const,...(state==='waiting'?{pendingQuestions:[{callId:'q',state:'continued' as const}]}:{})};
  const d=new LifeRoutineDirector(),i={...defaults(),tasks:[active]};d.tick(i,0);
  for(let t=1000;t<=400000;t+=1000){const frame=d.tick(i,t);assert.ok(frame?.clip!=='sleep'&&frame?.clip!=='lie-down');}
 }
 const d=new LifeRoutineDirector(),i=defaults();d.tick(i,0);advance(d,i,1000,75000);advance(d,i,76000,92480);advance(d,i,93480,167480);assert.equal(advance(d,i,168480,173720)?.clip,'sleep');
 assert.equal(d.tick({...i,tasks:[{...task('running',1,174000),runtimeStatus:'running'}]},174000)?.clip,'wake-up');
 const off={...defaults(),config:{...presetConfig('balanced'),groups:{...presetConfig('balanced').groups,steward:false}},tasks:[task('running',1,0)]};
 const unmanaged=new LifeRoutineDirector();unmanaged.tick(off,0);advance(unmanaged,off,1000,75000);advance(unmanaged,off,76000,92480);advance(unmanaged,off,93480,167480);assert.equal(advance(unmanaged,off,168480,173720)?.clip,'sleep');
});
test('cold task history and a completed driver do not prevent rest; continued questions still wake the steward',()=>{
 for(const history of [task('running',1,0),{...task('running',1,0),runtimeStatus:'idle' as const},task('waiting',1,0),{...task('completed',1,0),runtimeStatus:'running' as const}]){
  const d=new LifeRoutineDirector(),i={...defaults(),tasks:[history]};d.tick(i,0);
  advance(d,i,1000,75000);advance(d,i,76000,92480);advance(d,i,93480,167480);
  assert.equal(advance(d,i,168480,173720)?.clip,'sleep');
  assert.equal(d.tick({...i,tasks:[{...task('waiting',2,174000),runtimeStatus:'idle',pendingQuestions:[{callId:'q',state:'continued'}]}]},174000)?.clip,'wake-up');
 }
});
test('old idle gestures defer a new chain without cancelling one after it starts',()=>{
 const d=new LifeRoutineDirector(),i=defaults();d.tick(i,0);
 assert.equal(advance(d,{...i,blockStart:true},1000,80000),null);
 const frame=d.tick(i,81000)!;assert.equal(frame.clip,'sit-down');
 const holding=d.tick({...i,blockStart:true},84000)!;assert.equal(holding.serial,frame.serial);assert.equal(holding.phase,'hold');
 assert.equal(d.tick({...i,blocked:true},85000),null);
});
test('an explicit renderer handshake preserves the complete entry while decoding is delayed',()=>{
 const d=new LifeRoutineDirector(),i={...defaults(),playbackReady:''};d.tick(i,0);
 const first=advance(d,i,1000,75000)!;assert.equal(first.clip,'sit-down');
 for(let now=76000;now<=79000;now+=1000){const waiting=d.tick(i,now)!;assert.equal(waiting.serial,first.serial);assert.equal(waiting.phase,'entry');}
 const ready={...i,playbackReady:first.serial};assert.equal(d.tick(ready,80000)?.phase,'entry');
 assert.equal(d.tick(ready,81240)?.phase,'hold');
 assert.equal(d.tick({...ready,state:'outputting'},81300),null);
});
test('autonomous amplitude can omit a large exit without hiding real terminal feedback',()=>{
 const d=new LifeRoutineDirector(),i={...defaults(),idleMode:'frequent' as const,ambientClips:['sit-down']};
 d.tick(i,0);assert.equal(d.tick(i,7500)?.clip,'sit-down');assert.equal(d.tick(i,19740),null);
 const facts={...i,idleMode:'quiet' as const,tasks:[task('running',1,20000)]};d.tick(facts,20000);
 assert.equal(d.tick({...facts,tasks:[task('failed',2,21000)]},21000)?.clip,'failure-check');
});
