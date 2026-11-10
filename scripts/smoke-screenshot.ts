/** Native screenshot flow: real DSH image admission with an in-process vision fixture, never a paid provider. */
import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {mkdir,mkdtemp,readFile,realpath,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deflateSync} from 'node:zlib';
import {chromium,expect,type Page} from '@playwright/test';
import {settingsDisclosure,selectSetting} from '../browser-tests/helpers/settings.js';
import {presetConfig} from '../src/companion/config.js';
import {MAX_SCREENSHOT_BODY_BYTES} from '../src/companion/screenshot.js';

const root=process.cwd(),harness=resolve('../../deepseek-harness'),profile='bigfish-smoke',environmentId='bigfish-intelligent-dev';
const registry=resolve('../../../../skills/dsh-plugin-isolated-test/scripts/environments.py');
const home=process.env.BIGFISH_SMOKE_HOME,expectedHome='/private/tmp/dsh-bigfish-intelligent-home',evidence=resolve('artifacts/companion');
await mkdir(evidence,{recursive:true});
const checks:string[]=[],traffic:{method:string;path:string;status:number}[]=[],clientErrors:string[]=[];
let stage='preflight',child:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,output='',hash='',activePage:Page|undefined;
const checkpoint=async(error?:unknown)=>writeFile(resolve(evidence,'screenshot-checkpoint.json'),JSON.stringify({stage,checks,packageSha256:hash||null,failure:error?(error instanceof Error?error.name:'unknown'):null},null,2));
const registryCall=(args:string[])=>{const result=spawnSync('python3',[registry,...args],{encoding:'utf8',timeout:15000});if(result.status!==0)throw Error('Environment registry unavailable; refusing to install or start an isolated Host.');return JSON.parse(result.stdout);};
const redact=(text:string)=>text.replace(/https?:\/\/[^\s]+/g,value=>{try{const url=new URL(value);return url.origin+url.pathname+(url.search?'?[redacted]':'');}catch{return '[URL redacted]';}}).replace(/((?:cookie|authorization|api[_-]?key|token)\s*[:=])[^\r\n]*/gi,'$1[redacted]');

/** A deterministic real PNG larger than the normal 32 KiB request ceiling, with no personal image content. */
function fixturePng():Buffer{
 const crc=(bytes:Buffer)=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;}return (value^0xffffffff)>>>0;};
 const chunk=(type:string,data:Buffer)=>{const name=Buffer.from(type),size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([size,name,data,checksum]);};
 const width=160,height=160,pixels=Buffer.alloc((width*3+1)*height);let seed=0x12345678;
 for(let y=0;y<height;y++)for(let x=1;x<=width*3;x++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;pixels[y*(width*3+1)+x]=seed&255;}
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}

try{
 await checkpoint();
 if(!home||await realpath(home)!==expectedHome)throw Error('Only the registered disposable BIGFISH_SMOKE_HOME is eligible.');
 const record=registryCall(['show',environmentId]),observation=registryCall(['check',environmentId]);
 if(record.home!==expectedHome||record.project!==root||record.source!==harness||record.profile!==profile)throw Error('Registered environment identity mismatch.');
 if(observation.process==='matches'||observation.process==='identity-changed')throw Error('Registered Host is alive or changed identity; wait for its task owner before reusing this home.');
 const processes=spawnSync('ps',['-axo','pid=,command='],{encoding:'utf8',timeout:10000});
 if(processes.status!==0||processes.stdout.split('\n').some(line=>/--profile(?:=|\s+)bigfish-smoke(?:\s|$)/.test(line)&&/apps\/cli\/(?:lib|src)\/bin/.test(line)))throw Error('Cannot establish isolated Host inactivity.');
 checks.push('registered disposable home and native Host inactivity verified before installation');
 const version=JSON.parse(await readFile('package.json','utf8')).version,bytes=await readFile(resolve(process.argv[2]??`dist/dsh-bigfish-${version}.tgz`));
 hash=createHash('sha256').update(bytes).digest('hex');const installPath=resolve(home,`bigfish-screenshot-${hash.slice(0,20)}.tgz`);await writeFile(installPath,bytes);
 const cli=resolve(harness,'apps/cli/lib/bin.js'),env={...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'};
 stage='install-content-hash-package';await checkpoint();
 const install=spawnSync(process.execPath,[cli,'plugin','--profile',profile,'add',installPath,'--registry=https://registry.npmjs.org'],{env,cwd:root,encoding:'utf8',timeout:120000});
 if(install.status!==0)throw Error('Isolated package installation failed; raw installer output is deliberately not printed.');
 const fixture=resolve(home,'screenshot-fixture.mjs'),patch=resolve(home,'screenshot.patch.yml'),llm=pathToFileURL(resolve(harness,'packages/llm/llm/lib/index.js')).href;
 await writeFile(fixture,`import {LlmAdapter} from ${JSON.stringify(llm)};
const counts={prepared:0,dispatched:0,images:0,invalidPurpose:0,lastImageBytes:0,waiting:0,aborted:0};
let mode='ok';
class Mock extends LlmAdapter {
 listModels(){return Promise.resolve([{id:'vision',name:'Local screenshot vision',inputModalities:['text','image']},{id:'text',name:'Local text-only',inputModalities:['text']}]);}
 resolveModel(provider,id){counts.prepared++;return Promise.resolve({provider,id,name:id,inputModalities:id==='text'?['text']:['text','image']});}
 async *stream(options){
  counts.dispatched++;if(options.purpose!=='bigfish-screenshot')counts.invalidPurpose++;
  const images=options.messages.flatMap(m=>m.content).filter(b=>b.type==='image');counts.images+=images.length;
  counts.lastImageBytes=images[0]?.attachment?.bytes??0;
  if(mode==='hold'){counts.waiting++;await new Promise(resolve=>{if(options.signal.aborted)return resolve();options.signal.addEventListener('abort',resolve,{once:true});});counts.waiting--;counts.aborted++;return;}
  yield {type:'usage',usage:{inputTokens:21,outputTokens:13,totalTokens:34}};
  if(mode==='quota'){yield {type:'finish',reason:{kind:'error',failure:{code:'ACCOUNT_QUOTA',message:'Local screenshot quota fixture.'}}};return;}
  yield {type:'text-delta',text:'本地看图验证：这是一张用于测试的彩色像素图片。'};
  yield {type:'finish',reason:{kind:'stop'}};
 }
}
export const inject=['llm','connection'];
export function apply(ctx){ctx.llm.registerAdapter(['bigfish-screenshot-local'],new Mock());ctx.effect(()=>ctx.connection.fetch.register({path:'/api/bigfish-screenshot-fixture',methods:['GET','POST'],requestBody:'buffered',fetch:async request=>{if(request.method==='POST'){const data=await request.json();if(!['ok','hold','quota'].includes(data.mode))return new Response(null,{status:400});mode=data.mode;}return Response.json({...counts,mode},{headers:{'cache-control':'no-store'}});}}));}
`);
 await writeFile(patch,`- id: agent-default-model\n  config:\n    provider: bigfish-screenshot-local\n    model: vision\n- insert:\n    - id: bigfish-screenshot-fixture\n      name: ${JSON.stringify(fixture)}\n`);
 stage='start-isolated-host';await checkpoint();browser=await chromium.launch();
 child=spawn(process.execPath,[cli,'--profile',profile,'--patch',patch,'--port','0','--no-open'],{env,cwd:harness,stdio:['pipe','pipe','pipe']});
 child.stdout!.on('data',b=>output+=String(b));child.stderr!.on('data',b=>output+=String(b));
 await expect.poll(()=>output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)?.[0],{timeout:30000}).toBeTruthy();
 const launchUrl=output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)![0],origin=new URL(launchUrl).origin;
 registryCall(['update',environmentId,'--pid',String(child.pid),'--url',origin,'--note','Screenshot native regression in progress; do not reuse concurrently.']);
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage();activePage=page;
 page.on('pageerror',error=>clientErrors.push(redact(error.message).slice(0,500)));
 page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/'))traffic.push({path,method:response.request().method(),status:response.status()});});
 await page.goto(launchUrl);const proceed=page.getByRole('button',{name:'Continue',exact:true});if(await proceed.isVisible())await proceed.click();
 const get=async()=>{const response=await page.request.get(origin+'/api/bigfish-companion');expect(response.ok()).toBe(true);return response.json();};
 const post=async(body:Record<string,unknown>,ok=true)=>{const response=await page.request.post(origin+(body.op==='screenshot'?'/api/bigfish-companion-screenshot':'/api/bigfish-companion'),{data:body});expect(response.ok()).toBe(ok);return response.json();};
 const metrics=async(mode?:string)=>{const response=mode?await page.request.post(origin+'/api/bigfish-screenshot-fixture',{data:{mode}}):await page.request.get(origin+'/api/bigfish-screenshot-fixture');expect(response.ok()).toBe(true);return response.json();};
 const remote=async(method:string,request:unknown)=>{const response=await page.request.post(origin+'/api/'+method,{data:{type:'client-request',rpcId:randomUUID(),method,payload:{args:method==='session/list'?{_request:request}:{request}}}});if(!response.ok())throw Error('Native RPC transport failed.');const result=await response.json();if(!result.result?.ok)throw Error('Native RPC rejected fixture operation.');return result.result.value;};
 expect((await remote('session/list',{})).items.filter((s:any)=>s.running)).toHaveLength(0);
 const preset=presetConfig('all');
 const setting=await page.request.post(origin+'/api/settings/mutate',{data:{type:'client-request',rpcId:randomUUID(),method:'settings/mutate',payload:{args:{ns:'bigfish',ops:[{op:'set',path:['lifestyleJson'],value:JSON.stringify(preset)}]}}}});
 expect((await setting.json()).result?.ok).toBe(true);
 const workspace=await mkdtemp('/private/tmp/dsh-bigfish-screenshot-case-');await remote('workspace/create',{path:workspace});
 registryCall(['bind',environmentId,'--case','screenshot-native','--workspace',workspace,'--purpose','Native image admission and in-process vision mock; no paid model']);
 const png=fixturePng(),image={mediaType:'image/png',data:png.toString('base64')};expect(png.length).toBeGreaterThan(32768);
 const imagePath=resolve(home,'screenshot-fixture.png');await writeFile(imagePath,png);
 const payload={op:'screenshot',workspace,confirmed:true,question:'本次唯一截图问题标记，不应保留。',image};
 const configure=async(patch:Record<string,unknown>)=>{const current=await get();await post({op:'configure',policy:{...current.policy,...patch},revision:current.policyRevision});};
 await configure({enabled:false,provider:'bigfish-screenshot-local',model:'vision',workspaces:[workspace],dailyTokens:100000,automaticLimit:0});
 await post({op:'introduce'});await expect(page.locator('.bf-widget canvas')).toBeVisible({timeout:20000});
 expect((await get()).screenshotAvailable).toBe(true);
 stage='explicit-consent-and-authorization';await checkpoint();let before=await metrics();
 expect((await post(payload,false)).error).toContain('授权');
 await configure({enabled:true});expect((await post({...payload,confirmed:false},false)).error).toContain('确认');
 expect((await post({...payload,workspace:workspace+'/other'},false)).error).toContain('授权');
 expect(await metrics()).toEqual(before);checks.push('native attachment/model services available; consent and workspace authorization reject before provider work');
 stage='native-image-validation';await checkpoint();before=await metrics();
 const broken=Buffer.from(png);broken.fill(0,41,broken.length-12);
 await post({...payload,image:{...image,data:broken.toString('base64')}},false);
 expect(await metrics()).toEqual(before);
 const giant=Buffer.from(png);giant.writeUInt32BE(2049,16);
 expect((await post({...payload,image:{...image,data:giant.toString('base64')}},false)).error).toContain('2048');
 // The native streaming carrier may close an unread oversized upload before
 // the HTTP client has completed sending; either outcome must leave it live.
 try{const oversize=await page.request.post(origin+'/api/bigfish-companion-screenshot',{headers:{'content-type':'application/json'},data:'x'.repeat(MAX_SCREENSHOT_BODY_BYTES+1)});expect(oversize.status()).toBe(413);}
 catch(error){if(!(error instanceof Error)||!/ECONNRESET|EPIPE|socket hang up/.test(error.message))throw error;}
 expect((await get()).screenshotAvailable).toBe(true);
 expect(await metrics()).toEqual(before);checks.push('real native image decoder rejects corrupt raster; edge and bounded streaming request reject without provider dispatch');
 stage='text-only-model-refusal';await checkpoint();await configure({model:'text'});before=await metrics();
 expect((await post(payload,false)).error).toContain('声明支持图片');expect((await metrics()).dispatched).toBe(before.dispatched);expect((await get()).today.reserved).toBe(0);
 checks.push('exact text-only model is refused before adapter dispatch and releases the reservation');
 stage='native-vision-and-large-body';await checkpoint();await configure({model:'vision'});const usageBefore=(await get()).today.used;before=await metrics();
 const answer=await post(payload);expect(answer.result).toEqual({text:'本地看图验证：这是一张用于测试的彩色像素图片。',estimated:false,cached:true});
 let after=await metrics();expect(after.dispatched-before.dispatched).toBe(1);expect(after.images-before.images).toBe(1);expect(after.lastImageBytes).toBeGreaterThan(0);expect(after.invalidPurpose).toBe(0);
 let state=await get();expect(state.today.used-usageBefore).toBe(34);expect(state.today.reserved).toBe(0);expect(JSON.stringify(state)).not.toContain(payload.question);expect(JSON.stringify(state)).not.toContain(answer.result.text);expect(JSON.stringify(state)).not.toContain(image.data.slice(100,300));
 checks.push('real native attachment admission accepts a PNG over 32 KiB; one local vision request receives one durable image and exact shared usage');
 stage='manual-ui-confirmation';await checkpoint();
 await page.locator('.bf-card-actions').getByRole('button',{name:/^(Settings|设置)$/}).click();
 await page.locator('.bf-popover').getByRole('button',{name:/^(All settings|完整设置)$/}).click();
 await settingsDisclosure(page,'智能管家','语音与主动分享');
 const disclosure=page.locator('[data-testid=screenshot-settings]');await expect(disclosure).toBeVisible({timeout:20000});await disclosure.locator('summary').click();
 await page.getByLabel('本次分享的截图',{exact:true}).setInputFiles(imagePath);await expect(page.getByAltText('本次将发送的图片预览')).toBeVisible();
 await selectSetting(page,'截图工作区',workspace);const send=page.getByRole('button',{name:'解释本次图片 · 消耗 token',exact:true});await expect(send).toBeDisabled();
 before=await metrics();await page.waitForTimeout(1500);expect((await metrics()).dispatched).toBe(before.dispatched);
 await page.getByLabel('确认发送本次截图',{exact:true}).check();await send.click();
 await expect(disclosure).toContainText('本地看图验证：这是一张用于测试的彩色像素图片。',{timeout:20000});await expect(disclosure).toContainText('本次用量已计入共享模型预算。');
 await disclosure.screenshot({path:resolve(evidence,'screenshot-confirmed-ui.png')});expect((await metrics()).dispatched-before.dispatched).toBe(1);
 checks.push('native Web file preview sends nothing until explicit confirmation; result and usage appear only in manual screenshot UI');
 await page.locator('.bf-popover-top').getByRole('button',{name:/^(Close|关闭)$/}).click();
 stage='local-budget-reminder';await checkpoint();await configure({dailyTokens:1000});before=await metrics();const used=(await get()).today.used;
 expect((await post(payload,false)).error).toContain('预算不足');await expect(page.locator('.bf-widget .bf-dialogue-text')).toContainText('预算不够这次看图',{timeout:25000});
 await page.locator('.bf-widget').screenshot({path:resolve(evidence,'screenshot-budget-reminder.png')});expect(await metrics()).toEqual(before);state=await get();expect(state.today.used).toBe(used);expect(state.today.reserved).toBe(0);
 checks.push('insufficient pet budget causes a visible local reminder with zero provider preparation/dispatch and no usage');
 stage='explicit-cancellation';await checkpoint();await configure({dailyTokens:100000});await metrics('hold');before=await metrics();
 const pending=post(payload,false);await expect.poll(async()=>(await metrics()).waiting,{timeout:15000}).toBe(1);await post({op:'cancel-screenshot'});await pending;
 await expect.poll(async()=>(await metrics()).waiting).toBe(0);expect((await metrics()).aborted-before.aborted).toBe(1);expect((await get()).today.reserved).toBe(0);
 checks.push('explicit cancel aborts the local vision stream, rejects stale output and settles shared reservation');
 stage='quota-screenshot-reminder';await checkpoint();await metrics('quota');before=await metrics();
 expect((await post(payload,false)).error).toContain('额度或余额不足');await expect(page.locator('.bf-widget .bf-dialogue-text')).toContainText('额度或余额不足',{timeout:25000});
 await page.locator('.bf-widget').screenshot({path:resolve(evidence,'screenshot-quota-reminder.png')});state=await get();expect(state.today.reserved).toBe(0);expect((await metrics()).dispatched-before.dispatched).toBe(1);
 expect(JSON.stringify(state.memories)).not.toContain(payload.question);expect(JSON.stringify(state.insights)).not.toContain('本地看图验证');
 checks.push('structured screenshot account quota error directly reaches pet bubble without remembering screenshot content');
 stage='passed';await checkpoint();
 await writeFile(resolve(evidence,'screenshot-native-smoke.json'),JSON.stringify({checks,packageSha256:hash,harnessVersion:JSON.parse(await readFile(resolve(harness,'package.json'),'utf8')).version,model:'Local in-process image-capable adapter; no paid provider',fixturePngBytes:png.length,metrics:await metrics(),clientErrors},null,2));
 console.log(JSON.stringify({checks,packageSha256:hash}));
}catch(error){
 await checkpoint(error);await writeFile(resolve(evidence,'screenshot-failure-detail.json'),JSON.stringify({stage,traffic:traffic.slice(-25),clientErrors,message:redact(error instanceof Error?error.message:'unknown').slice(0,2500),view:await activePage?.evaluate(()=>({petText:document.querySelector('.bf-widget')?.textContent?.slice(0,600),screenshotText:document.querySelector('[data-testid=screenshot-settings]')?.textContent?.slice(-700)})).catch(()=>null)},null,2));
 await writeFile(resolve(evidence,'screenshot-host-redacted.log'),redact(output));console.error(JSON.stringify({stage,completedChecks:checks,failure:error instanceof Error?error.name:'unknown'}));throw Error('Screenshot smoke failed; see safe artifacts/companion/screenshot-checkpoint.json.');
}finally{
 if(child&&child.exitCode===null){const owned=child;await new Promise<void>(done=>{const timeout=setTimeout(()=>owned.kill('SIGKILL'),5000);owned.once('exit',()=>{clearTimeout(timeout);done();});owned.stdin?.end();owned.kill('SIGTERM');});}
 await browser?.close();if(child)try{registryCall(['update',environmentId,'--state','retained','--note',`Screenshot regression ${stage}; this script's process stopped. Check artifacts/companion/screenshot-checkpoint.json before reuse.`]);}catch{/* The checkpoint remains available if the registry itself cannot be updated. */}
}
