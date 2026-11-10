import test from 'node:test';
import assert from 'node:assert/strict';
import {DesktopCompanion,desktopTaskActivity} from '../src/client/desktop-controller.js';
import type {DesktopBridge} from '../src/client/desktop-bridge.js';
import type {HostSnapshot} from '../src/client/companion-host.js';
import {emptyState,type Task} from '../src/companion/state.js';

const task=(patch:Partial<Task>={}):Task=>({workspace:'/a',session:'one',seq:1,title:'真实任务',state:'running',updatedAt:1700000000000,parent:null,excerpt:'',...patch});
const host=(tasks:Task[]):HostSnapshot=>({...emptyState(),tasks,today:{used:0,reserved:0,automatic:0,estimated:false},modelAvailable:true});
const response=(state:HostSnapshot|null,connected=state!==null)=>({host:state,connected,url:'http://127.0.0.1:3080',platform:'test'});
const flush=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};

/** Only this file's Node process globals are replaced, then restored in reverse order. */
function browserGlobals(){
 const saved=new Map<string,PropertyDescriptor|undefined>(),data=new Map<string,string>(),events=new EventTarget();
 const intervals=new Set<()=>void>();
 const set=(name:string,value:unknown)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
 const storage:Storage={get length(){return data.size;},getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,String(v));},removeItem:k=>{data.delete(k);},clear:()=>data.clear(),key:i=>[...data.keys()][i]??null};
 set('localStorage',storage);set('addEventListener',events.addEventListener.bind(events));set('removeEventListener',events.removeEventListener.bind(events));
 set('setInterval',(callback:()=>void)=>{intervals.add(callback);return callback;});set('clearInterval',(callback:()=>void)=>intervals.delete(callback));
 return {tick:()=>{for(const callback of intervals)callback();},intervals,restore:()=>{for(const [name,descriptor] of [...saved].reverse())if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}};
}
function bridge(state:DesktopBridge['state']):DesktopBridge {
 return {state,connect:async()=>false,request:async()=>({result:null}),dragState(){},drag(){},regions(){},appearance(){},walkPolicy(){},onMotion:()=>()=>{},settings(){},recall(){},cancelRecall(){},onRecall:()=>()=>{}};
}

test('desktop activity requires live work or genuine answerable pending state, never cold history',()=>{
 assert.equal(desktopTaskActivity(task()),null);
 assert.equal(desktopTaskActivity(task({state:'waiting'})),null);
 assert.equal(desktopTaskActivity(task({runtimeStatus:'idle'})),null);
 assert.equal(desktopTaskActivity(task({runtimeStatus:'running'})),'awaiting-output');
 for(const state of ['completed','failed','cancelled'] as const)assert.equal(desktopTaskActivity(task({state,runtimeStatus:'running'})),null);
 assert.equal(desktopTaskActivity(task({state:'waiting',runtimeStatus:'idle',pendingQuestions:[{callId:'q',state:'open'}]})),'waiting-user');
 assert.equal(desktopTaskActivity(task({state:'waiting',runtimeStatus:'idle',pendingQuestions:[{callId:'q',state:'continued'}]})),'waiting-user');
 assert.equal(desktopTaskActivity(task({pendingApprovals:['approval']})),'waiting-user');
 assert.equal(desktopTaskActivity(task({pendingRemote:{question:1,approval:0}})),'waiting-user');
 assert.equal(desktopTaskActivity(task({pendingRemote:{question:0,approval:1}})),'waiting-user');
});
test('desktop returns idle on rejected or disconnected Host reads and recovers without synthetic throughput',async()=>{
 const globals=browserGlobals();let value=response(host([task({runtimeStatus:'running'})])),reject=false,calls=0;
 const controller=new DesktopCompanion(bridge(async()=>{calls++;if(reject)throw Error('offline');return value;}));
 try {
  await flush();assert.equal(controller.getSnapshot().snapshot.state,'awaiting-output');assert.equal(controller.getSnapshot().task,'真实任务');
  value=response(value.host,false);globals.tick();await flush();assert.equal(controller.getSnapshot().snapshot.state,'idle');assert.equal(controller.getSnapshot().task,undefined);
  value=response(host([task({runtimeStatus:'running'})]));globals.tick();await flush();assert.equal(controller.getSnapshot().snapshot.state,'awaiting-output');
  reject=true;globals.tick();await flush();assert.equal(controller.getSnapshot().snapshot.state,'idle');assert.equal(controller.getSnapshot().issue,'connectionError');
  reject=false;value=response(null);globals.tick();await flush();assert.equal(controller.getSnapshot().snapshot.state,'idle');
  value=response(host([task({session:'stale',state:'running',runtimeStatus:'idle'}),task({session:'done',state:'completed',runtimeStatus:'running'}),task({session:'answer',state:'waiting',runtimeStatus:'idle',pendingQuestions:[{callId:'q',state:'continued'}]})]));
  globals.tick();await flush();const view=controller.getSnapshot();assert.equal(view.snapshot.state,'waiting-user');assert.equal(view.snapshot.sessionId,'answer');assert.equal(view.issue,null);assert.equal(view.snapshot.rate,null);assert.equal(view.snapshot.pressure,0);assert.equal(view.snapshot.whipHz,0);
  assert.equal(controller.preferences.getSnapshot().value.enabled,true);assert.ok(calls>=6);
 }finally{controller.dispose();assert.equal(globals.intervals.size,0);globals.restore();}
});
test('desktop prioritizes the latest actual pending interaction over newer work and stops publishing after disposal',async()=>{
 const globals=browserGlobals();let resolve:((value:Awaited<ReturnType<DesktopBridge['state']>>)=>void)|undefined;
 const controller=new DesktopCompanion(bridge(()=>new Promise(r=>{resolve=r;})));let changes=0;controller.subscribe(()=>changes++);
 try{
  resolve!(response(host([task({session:'work',runtimeStatus:'running',updatedAt:3000}),task({session:'old-question',state:'waiting',updatedAt:1000,pendingQuestions:[{callId:'q1',state:'open'}]}),task({session:'latest-question',state:'waiting',updatedAt:2000,pendingQuestions:[{callId:'q2',state:'continued'}]})])));await flush();
  assert.equal(controller.getSnapshot().snapshot.sessionId,'latest-question');assert.equal(changes,1);
  globals.tick();controller.dispose();resolve!(response(host([task({runtimeStatus:'running'})])));await flush();assert.equal(changes,1);assert.equal(globals.intervals.size,0);
 }finally{controller.dispose();globals.restore();}
});
