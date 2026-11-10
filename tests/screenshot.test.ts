import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ScreenshotService,decodeScreenshot,screenshotHeader,readCompanionBody,MAX_SCREENSHOT_BODY_BYTES,type ScreenshotModel,type ScreenshotAttachments} from '../src/companion/screenshot.js';
import {CompanionHostStore} from '../src/companion/host-store.js';
import {defaultPolicy} from '../src/companion/state.js';
// Same tiny complete raster used by canonical DSH's native attachment tests.
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC';
const input={op:'screenshot',workspace:'/work',confirmed:true,question:'请解释这张图',image:{mediaType:'image/png',data:image}};
const ref={attachmentId:'fixture-id',mediaType:'image/png',bytes:Buffer.from(image,'base64').length,width:1,height:1};
async function setup(fn:(store:CompanionHostStore)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'bigfish-screenshot-'));try{await fn(new CompanionHostStore(dir));}finally{await rm(dir,{recursive:true,force:true});}}
const enable=(s:CompanionHostStore,dailyTokens=30000)=>s.configure({...defaultPolicy,enabled:true,provider:'mock',model:'vision',workspaces:['/work'],dailyTokens},0);
function services(options:{modalities?:readonly string[];usage?:boolean;rejectImage?:boolean}={}){
 const count={validate:0,cache:0,prepare:0,dispatch:0},requests:Record<string,unknown>[]=[];
 const attachments:ScreenshotAttachments={async validateImage(){count.validate++;if(options.rejectImage)throw Error('native decoder rejected');},async admitPromptContent(){count.cache++;return [{type:'image',attachment:ref}];}};
 const model:ScreenshotModel={async prepareCall(){count.prepare++;return {config:{provider:'mock',model:'vision',maxTokens:512},inputModalities:options.modalities??['text','image'],async *stream(request){count.dispatch++;requests.push(request);yield {type:'text-delta',text:'这张图中有一个蓝色像素。'};if(options.usage!==false)yield {type:'usage',usage:{inputTokens:20,outputTokens:10}};yield {type:'finish',reason:{kind:'stop'}};}};}};
 return {count,requests,attachments,model};
}
test('explicit consent, intelligence and workspace authorization are required before validating or dispatching an image',()=>setup(async store=>{
 const s=services(),screen=new ScreenshotService(store,()=>s.model,()=>s.attachments);
 await assert.rejects(screen.understand({...input,confirmed:false}),/确认/);
 await assert.rejects(screen.understand(input),/授权/);await enable(store);
 await assert.rejects(screen.understand({...input,workspace:'/other'}),/授权/);
 assert.deepEqual(s.count,{validate:0,cache:0,prepare:0,dispatch:0});assert.equal((await store.snapshot()).today.used,0);
}));
test('successful screenshot calls contain durable native refs only and do not persist the image, question or answer as pet context',()=>setup(async store=>{
 await enable(store);const s=services(),answer=await new ScreenshotService(store,()=>s.model,()=>s.attachments).understand(input);
 assert.equal(answer.text,'这张图中有一个蓝色像素。');assert.equal(answer.estimated,false);assert.equal(answer.cached,true);
 assert.deepEqual(s.count,{validate:1,cache:1,prepare:1,dispatch:1});assert.doesNotMatch(JSON.stringify(s.requests),new RegExp(image));
 const state=await store.snapshot();assert.equal(state.today.used,30);assert.equal(state.today.reserved,0);assert.equal(state.today.automatic,0);
 assert.deepEqual(state.memories,[]);assert.deepEqual(state.insights,[]);assert.doesNotMatch(JSON.stringify(state),/蓝色像素|请解释这张图/);
}));
test('budget rejection happens before provider preparation, cache publication or dispatch and only creates one local budget reminder',()=>setup(async store=>{
 await enable(store,1000);const s=services(),screen=new ScreenshotService(store,()=>s.model,()=>s.attachments);
 await assert.rejects(screen.understand(input),/预算不足/);await assert.rejects(screen.understand(input),/预算不足/);
 assert.deepEqual(s.count,{validate:2,cache:0,prepare:0,dispatch:0});const state=await store.snapshot();assert.equal(state.today.used,0);assert.equal(state.today.reserved,0);assert.equal(state.insights.length,1);
}));
test('a text-only or undeclared-modality model is refused before cache publication or provider dispatch',()=>setup(async store=>{
 await enable(store);
 for(const modalities of [['text'],[]]){
  const s=services({modalities});await assert.rejects(new ScreenshotService(store,()=>s.model,()=>s.attachments).understand(input),/声明支持图片/);
  assert.equal(s.count.cache,0);assert.equal(s.count.dispatch,0);
 }
 assert.equal((await store.snapshot()).today.used,0);assert.equal((await store.snapshot()).today.reserved,0);
}));
test('native decode rejection and untrusted/native-reference dimension mismatches never reach the model',()=>setup(async store=>{
 await enable(store);const rejected=services({rejectImage:true});
 await assert.rejects(new ScreenshotService(store,()=>rejected.model,()=>rejected.attachments).understand(input),/native decoder/);assert.equal(rejected.count.prepare,0);
 const s=services();s.attachments.admitPromptContent=async()=>[{type:'image',attachment:{...ref,originalDimensions:{width:3000,height:1}}}];
 await assert.rejects(new ScreenshotService(store,()=>s.model,()=>s.attachments).understand(input),/2048/);assert.equal(s.count.dispatch,0);assert.equal((await store.snapshot()).today.used,0);
 assert.throws(()=>decodeScreenshot({...input,image:{...input.image,width:1,height:1}}),/PNG/);
}));
test('unknown usage remains estimated and source changes discard an in-flight image answer while retaining its actual usage',()=>setup(async store=>{
 await enable(store);const estimated=services({usage:false});const reply=await new ScreenshotService(store,()=>estimated.model,()=>estimated.attachments).understand(input);
 assert.equal(reply.estimated,true);assert.equal((await store.snapshot()).today.estimated,true);
 const baseline=(await store.snapshot()).today.used,s=services();
 s.model.prepareCall=async()=>({config:{},inputModalities:['image'],async *stream(){
  await store.observe({workspace:'/work',session:'new',seq:1,title:'新任务',state:'running',updatedAt:Date.now(),parent:null,excerpt:''});
  yield {type:'text-delta',text:'不应该显示的旧截图答案'};yield {type:'usage',usage:{totalTokens:17}};yield {type:'finish',reason:{kind:'stop'}};
 }});
 await assert.rejects(new ScreenshotService(store,()=>s.model,()=>s.attachments).understand(input),/状态已变化/);
 const state=await store.snapshot();assert.equal(state.today.used,baseline+17);assert.equal(state.today.reserved,0);assert.doesNotMatch(JSON.stringify(state),/旧截图答案/);
}));
test('explicit cancellation and authorization changes discard screenshot output; tool calls are never accepted',()=>setup(async store=>{
 await enable(store);const s=services();let screen:ScreenshotService;
 s.model.prepareCall=async()=>({config:{},inputModalities:['image'],async *stream(){screen.cancel();yield {type:'text-delta',text:'取消后不能显示'};}});
 screen=new ScreenshotService(store,()=>s.model,()=>s.attachments);await assert.rejects(screen.understand(input));
 const before=(await store.snapshot()).today.used;
 s.model.prepareCall=async()=>({config:{},inputModalities:['image'],async *stream(){await store.forget('/work');yield {type:'text-delta',text:'已撤销的截图'};yield {type:'usage',usage:{totalTokens:7}};yield {type:'finish',reason:{kind:'stop'}};}});
 await assert.rejects(screen.understand(input),/授权或会话状态/);assert.equal((await store.snapshot()).today.used,before+7);
 s.model.prepareCall=async()=>({config:{},inputModalities:['image'],async *stream(){yield {type:'tool-call-delta'};}});
 await assert.rejects(screen.understand(input),/不允许调用工具/);
}));
test('PNG/JPEG/WebP header bounds ignore browser dimensions and reject images over the pixel or edge ceiling early',()=>{
 assert.deepEqual(screenshotHeader(Buffer.from(image,'base64'),'image/png'),{width:1,height:1});
 const png=Buffer.from(image,'base64');png.writeUInt32BE(2048,16);png.writeUInt32BE(2048,20);assert.throws(()=>screenshotHeader(png,'image/png'),/400 万/);
 png.writeUInt32BE(2049,16);png.writeUInt32BE(1,20);assert.throws(()=>screenshotHeader(png,'image/png'),/2048/);
 const jpeg=Buffer.from([255,216,255,192,0,8,8,0,2,0,3,1]);assert.deepEqual(screenshotHeader(jpeg,'image/jpeg'),{width:3,height:2});
 const webp=Buffer.alloc(30);webp.write('RIFF');webp.writeUInt32LE(22,4);webp.write('WEBP',8);webp.write('VP8X',12);webp.writeUInt32LE(10,16);webp.writeUIntLE(2,24,3);webp.writeUIntLE(1,27,3);
 assert.deepEqual(screenshotHeader(webp,'image/webp'),{width:3,height:2});
 assert.throws(()=>decodeScreenshot({...input,image:{mediaType:'image/gif',data:image}}),/PNG/);
 assert.throws(()=>decodeScreenshot({...input,image:{...input.image,data:image+'\n'}}),/编码/);
});
test('body size is checked before reading declared oversize input, and streaming/normal-op limits remain bounded',async()=>{
 let read=false;
 const request={headers:new Headers({'content-length':String(MAX_SCREENSHOT_BODY_BYTES+1)}),body:{getReader(){read=true;throw Error('must not read');}}} as unknown as Request;
 await assert.rejects(readCompanionBody(request),/请求过大/);assert.equal(read,false);
 await assert.rejects(readCompanionBody(new Request('http://host',{method:'POST',body:JSON.stringify({op:'understand',padding:'x'.repeat(32768)})})),/请求过大/);
 let cancelled=false;const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(MAX_SCREENSHOT_BODY_BYTES));controller.enqueue(Uint8Array.of(1));},cancel(){cancelled=true;}});
 await assert.rejects(readCompanionBody(new Request('http://host',{method:'POST',body:stream,duplex:'half'} as RequestInit)),/请求过大/);assert.equal(cancelled,true);
 assert.equal((await readCompanionBody(new Request('http://host',{method:'POST',body:JSON.stringify(input)}))).op,'screenshot');
});

test('Host registers a separate streaming screenshot route, preserves ordinary GETs and cancels image work on configure',()=>setup(async store=>{
 await enable(store);const {installCompanion}=await import('../src/companion/host.js');
 type Route={path:string;requestBody:string;fetch:(request:Request)=>Promise<Response>};
 const routes=new Map<string,Route>(),s=services();let hold!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>hold=resolve),started=new Promise<void>(resolve=>entered=resolve);
 s.model.prepareCall=async()=>({config:{},inputModalities:['image'],async *stream(){entered();await gate;yield {type:'text-delta',text:'旧图片'};yield {type:'usage',usage:{totalTokens:9}};yield {type:'finish',reason:{kind:'stop'}};}});
 const dispose:(()=>void)[]=[];
 const effect=(fn:()=>unknown)=>{const cleanup=fn();if(typeof cleanup==='function')dispose.push(cleanup as ()=>void);};
 installCompanion({inject(keys,callback){if(keys[0]==='llm')callback({llm:s.model,effect});if(keys[0]==='attachments')callback({attachments:s.attachments,effect});if(keys[0]==='connection')callback({connection:{fetch:{register(route:Route){routes.set(route.path,route);return()=>{};}}},effect});}},store);
 try{
  const main=routes.get('/api/bigfish-companion')!,upload=routes.get('/api/bigfish-companion-screenshot')!;
  assert.equal(main.requestBody,'buffered');assert.equal(upload.requestBody,'streaming');
  const status=await main.fetch(new Request('http://dsh.internal/api/bigfish-companion'));assert.equal(status.status,200);assert.equal((await status.json()).screenshotAvailable,true);
  const request=new Request('http://dsh.internal/api/bigfish-companion-screenshot',{method:'POST',headers:{'content-type':'application/json',host:'127.0.0.1:4178',origin:'http://127.0.0.1:4178'},body:JSON.stringify(input)});
  const pending=upload.fetch(request);await started;
  const state=await store.snapshot();await main.fetch(new Request('http://dsh.internal/api/bigfish-companion',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'configure',policy:state.policy,revision:state.policyRevision})}));
  hold();const response=await pending;assert.equal(response.status,400);assert.equal((await store.snapshot()).today.reserved,0);assert.equal((await store.snapshot()).memories.length,0);
  const oversized=await upload.fetch(new Request('http://dsh.internal/api/bigfish-companion-screenshot',{method:'POST',headers:{'content-type':'application/json','content-length':String(MAX_SCREENSHOT_BODY_BYTES+1)},body:'{}'}));assert.equal(oversized.status,413);
 }finally{hold();for(const fn of dispose)fn();}
}));

test('structured screenshot quota failures also create one pet reminder, while revoked authority cannot announce an old error',()=>setup(async store=>{
 await enable(store);const s=services();
 s.model.prepareCall=async()=>({config:{},inputModalities:['image'],async *stream(){yield {type:'usage',usage:{totalTokens:11}};yield {type:'finish',reason:{kind:'error',failure:{code:'ACCOUNT_QUOTA'}}};}});
 const screen=new ScreenshotService(store,()=>s.model,()=>s.attachments);
 await assert.rejects(screen.understand(input),/额度或余额不足/);await assert.rejects(screen.understand(input),/额度或余额不足/);
 const notices=(await store.snapshot()).insights;assert.equal(notices.length,1);assert.equal(notices[0]!.system,true);assert.equal((await store.snapshot()).today.used,22);
 const state=await store.snapshot();await store.configure(state.policy,state.policyRevision);
 s.model.prepareCall=async()=>({config:{},inputModalities:['image'],async *stream(){await store.configure({...defaultPolicy},2);yield {type:'finish',reason:{kind:'error',failure:{code:'QUOTA'}}};}});
 await assert.rejects(screen.understand(input),/额度或余额不足/);assert.equal((await store.snapshot()).insights.length,0);
}));
