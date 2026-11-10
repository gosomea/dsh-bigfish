import test from 'node:test';import assert from 'node:assert/strict';
import {DesktopVoiceSession} from '../src/client/desktop-voice.js';import type {DesktopBridge} from '../src/client/desktop-bridge.js';
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function globals(){const saved=new Map<string,PropertyDescriptor|undefined>();let captures=0,stops=0;
 const set=(name:string,value:unknown)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});};
 class Recorder {static isTypeSupported(){return true;}state='inactive';onstop:(()=>void)|null=null;ondataavailable:((e:{data:Blob})=>void)|null=null;onerror:(()=>void)|null=null;constructor(_stream:unknown,_options:unknown){}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([Uint8Array.of(1,2,3)])});queueMicrotask(()=>this.onstop?.());}}
 set('navigator',{mediaDevices:{getUserMedia:async(request:unknown)=>{assert.deepEqual(request,{audio:true,video:false});captures++;return {getTracks:()=>[{stop(){stops++;}}]};}}});set('MediaRecorder',Recorder);
 return {get captures(){return captures;},get stops(){return stops;},restore(){for(const [key,value]of saved)if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}};
}
test('desktop release before permission resolves never opens a microphone or sends audio',async()=>{
 const g=globals();let grant!:(value:boolean)=>void,requests=0;const bridge={microphone:()=>new Promise<boolean>(r=>{grant=r;}),transcribe:async()=>{requests++;return 'late';},cancelTranscription:async()=>{}} as unknown as DesktopBridge;
 const capture=new DesktopVoiceSession(bridge,()=>{},()=>{throw Error('must not receive text');},()=>{});
 try{const starting=capture.press();capture.release();grant(true);assert.equal(await starting,false);assert.equal(g.captures,0);assert.equal(requests,0);}finally{capture.cancel();g.restore();}
});
test('desktop recording is explicit, closes tracks on release, previews text, and cancel discards in-flight transcription',async()=>{
 const g=globals(),texts:string[]=[],listening:boolean[]=[];let requests=0,resolve!:(value:string)=>void,hold=false;
 const bridge={microphone:async()=>true,cancelTranscription:async()=>{},transcribe:async(audio:Uint8Array,type:string)=>{requests++;assert.equal(type,'audio/webm');assert.deepEqual([...audio],[1,2,3]);return hold?new Promise<string>(r=>{resolve=r;}):'请先确认这段文字';}} as unknown as DesktopBridge;
 const capture=new DesktopVoiceSession(bridge,v=>listening.push(v),v=>texts.push(v),e=>{throw Error(e);});
 try{assert.equal(g.captures,0);await capture.press();assert.equal(g.captures,1);assert.equal(requests,0);capture.release();await flush();assert.equal(g.stops,1);assert.deepEqual(texts,['请先确认这段文字']);assert.equal(requests,1);hold=true;await capture.press();capture.release();await flush();assert.equal(requests,2);capture.cancel();resolve('取消后不应显示');await flush();assert.deepEqual(texts,['请先确认这段文字']);assert.equal(listening.at(-1),false);}finally{capture.cancel();g.restore();}
});
