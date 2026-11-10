import test from 'node:test';
import assert from 'node:assert/strict';
import {PushToTalkSession,localVoices,recognitionFactory,type Recognition} from '../src/client/voice-session.js';
function fake(){const calls:string[]=[];const r:Recognition={lang:'',continuous:true,interimResults:true,onresult:null,onerror:null,onend:null,start(){calls.push('start');},stop(){calls.push('stop');},abort(){calls.push('abort');}};return {r,calls};}
test('capture only starts on press, release stops, and a final transcript is text only',()=>{
 const {r,calls}=fake(),states:boolean[]=[],texts:string[]=[];let factories=0;const p=new PushToTalkSession(()=>{factories++;return r;},v=>states.push(v),v=>texts.push(v),()=>{});
 assert.equal(factories,0);assert.equal(p.press(),true);assert.equal(p.press(),false);assert.equal(factories,1);assert.equal(r.continuous,false);assert.equal(r.interimResults,false);
 r.onresult?.({results:{length:1,0:{isFinal:false,length:1,0:{transcript:'partial'}}}});assert.deepEqual(texts,[]);
 p.release();assert.deepEqual(calls,['start','stop']);r.onresult?.({results:{length:1,0:{isFinal:true,length:1,0:{transcript:'问问进展'}}}});assert.deepEqual(texts,['问问进展']);r.onend?.();p.cancel();assert.deepEqual(calls,['start','stop']);assert.equal(states.at(-1),false);
});
test('cancel discards a late result and aborts capture without auto restart',()=>{
 const {r,calls}=fake(),texts:string[]=[];const p=new PushToTalkSession(()=>r,()=>{},v=>texts.push(v),()=>{});p.press();const late=r.onresult;p.cancel();late?.({results:{length:1,0:{isFinal:true,length:1,0:{transcript:'must discard'}}}});assert.deepEqual(texts,[]);assert.deepEqual(calls,['start','abort']);assert.equal(r.onresult,null);
});
test('permission failures end capture and expose a readable issue',()=>{
 const {r,calls}=fake(),issues:string[]=[];const p=new PushToTalkSession(()=>r,()=>{},()=>{},v=>issues.push(v));p.press();r.onerror?.({error:'not-allowed'});p.release();assert.match(issues[0]!,/权限/);assert.deepEqual(calls,['start']);p.cancel();
});
test('voice selection excludes remote defaults and recognition detection has no side effects',()=>{
 const voices=[{voiceURI:'remote',name:'Default',lang:'zh-CN',localService:false},{voiceURI:'local',name:'A',lang:'en-US',localService:true},{voiceURI:'chinese',name:'B',lang:'zh-CN',localService:true}];assert.deepEqual(localVoices(voices).map(v=>v.voiceURI),['chinese','local']);let made=0;class R{constructor(){made++;}}assert.ok(recognitionFactory({webkitSpeechRecognition:R}));assert.equal(made,0);assert.equal(recognitionFactory({}),null);
});
