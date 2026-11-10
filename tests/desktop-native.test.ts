import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileBounds,CrossScreenTravel,nearWindowEdge,motionChanged} from '../desktop/geometry.mjs';
import {parseWindowGeometry,readWindowGeometry} from '../desktop/native-geometry.mjs';
import {voiceEndpoint,transcribeAudio} from '../desktop/voice-protocol.mjs';
test('screen removal and mixed DPI use DIP work areas, retain negative coordinates and never double-scale',()=>{
 const screens=[{id:1,scaleFactor:2,workArea:{x:0,y:30,width:1440,height:870}},{id:2,scaleFactor:1.25,workArea:{x:-1920,y:0,width:1920,height:1080}}];
 const pet={x:-1700,y:500,width:420,height:540};assert.deepEqual(reconcileBounds(pet,screens),pet);assert.deepEqual(reconcileBounds(pet,[screens[0]!]),{x:0,y:360,width:420,height:540});
 assert.deepEqual(reconcileBounds({x:9999,y:9999,width:2000,height:2000},[screens[0]!]),{x:0,y:30,width:1440,height:870});
});
test('a finished authored chain publishes rest even when the director serial did not change',()=>{
 const last={serial:'wander-9',phase:'stop',clip:'wake-up',mirror:false,holdMs:0},rest={...last,phase:'rest',clip:null};assert.equal(motionChanged(last,rest),true);assert.equal(motionChanged(rest,{...rest}),false);
});
test('cross-screen travel waits for authored preparation and decoded frames, walks, and holds planted stop before ending',()=>{
 const trip=new CrossScreenTravel();trip.start({x:100,y:100,width:100,height:100},{workArea:{x:250,y:0,width:150,height:200}},0);const before={...trip.position};
 for(let t=0;t<1000;t+=32)trip.tick(t,100,false);assert.deepEqual(trip.position,before);
 let now=1000;for(;now<5000;now+=32)trip.tick(now,100,true);assert.deepEqual(trip.position,before);
 for(;now<10000&&trip.snapshot().clip!=='stop';now+=32)trip.tick(now,100,true);assert.equal(trip.snapshot().clip,'stop');const stop={...trip.position};for(let i=0;i<4000;i+=32)trip.tick(now+i,100,true);assert.equal(trip.active,true);assert.deepEqual(trip.position,stop);trip.tick(now+100000,100,true);assert.deepEqual(trip.position,stop);assert.equal(trip.active,true,'sleep cannot fast-forward the final hold');trip.cancel();assert.equal(trip.active,false);
});
test('a cross-screen trip without real walk artwork cannot start; missing optional preparation is skipped',()=>{
 const trip=new CrossScreenTravel(),bounds={x:0,y:0,width:100,height:100},display={workArea:{x:200,y:0,width:300,height:200}};trip.start(bounds,display,0,['turn','stop']);assert.equal(trip.active,false);trip.start(bounds,display,0,['walk']);assert.equal(trip.snapshot().clip,'walk');trip.tick(32,50,false);assert.deepEqual(trip.position,{x:0,y:0});trip.tick(64,50,true);assert.ok(trip.position!.x>0);
});
test('window geometry adapter drops titles/content/owner data and reports denied permission without taking screenshots',async()=>{
 assert.deepEqual(parseWindowGeometry(JSON.stringify([{pid:12,x:10,y:20,width:300,height:200,title:'private',content:'secret'},{pid:99,x:0,y:0,width:500,height:500}]),99),[{x:10,y:20,width:300,height:200}]);
 let command='';await assert.rejects(readWindowGeometry('darwin',1,(file,args,_options,callback)=>{command=file+' '+args.join(' ');callback(Error('denied'),'');}),/辅助功能/);assert.doesNotMatch(command,/screencapture|GetWindowText|\.name\(/);assert.equal(nearWindowEdge({x:0,y:0,width:200,height:200},[{x:0,y:125,width:300,height:300}]),true);
});
test('configured transcription protocol is bounded, sends only explicit audio, uses no redirects and returns preview text',async()=>{
 for(const u of ['http://remote.invalid/transcribe','https://u:p@host/x','https://host/x?key=secret'])assert.throws(()=>voiceEndpoint(u));
 let calls=0;const transport=(async(url:URL|RequestInfo,init?:RequestInit)=>{calls++;assert.equal(url,'http://127.0.0.1:1/transcriptions');assert.equal(init?.redirect,'error');const body=init?.body as FormData;assert.equal(body.get('model'),'local');assert.equal((body.get('file') as File).size,3);assert.deepEqual([...body.keys()],['model','file']);return Response.json({text:' 用户先确认这句话 '});}) as typeof fetch;
 const config={endpoint:'http://127.0.0.1:1/transcriptions',model:'local',key:'test'};assert.equal(await transcribeAudio(config,Uint8Array.of(1,2,3),'audio/webm',new AbortController().signal,transport),'用户先确认这句话');assert.equal(calls,1);
 await assert.rejects(transcribeAudio(config,new Uint8Array(3*1024*1024+1),'audio/webm',new AbortController().signal,transport),/3 MiB/);assert.equal(calls,1);
});
