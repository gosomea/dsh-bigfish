import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,expect} from '@playwright/test';
const root=process.cwd(),harness=resolve('../../deepseek-harness'),home=process.env.BIGFISH_SMOKE_HOME;
if(!home)throw Error('Set BIGFISH_SMOKE_HOME to a registered isolated home');
const cli=resolve(harness,'apps/cli/lib/bin.js'),llm=pathToFileURL(resolve(harness,'packages/llm/llm/lib/index.js')).href;
await rm(resolve(home,'pets/dsh-bigfish/companion'),{recursive:true,force:true});
const env={...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'};
const run=(args:string[])=>{const r=spawnSync(process.execPath,[cli,...args],{env,cwd:root,encoding:'utf8',timeout:90000});if(r.status!==0)throw Error(`Isolated DSH command failed: ${r.stderr.slice(-2000)}`);};
const tarball=await readFile('dist/dsh-bigfish-0.7.0-dev.0.tgz');
const installPath=resolve(home,`bigfish-${createHash('sha256').update(tarball).digest('hex').slice(0,16)}.tgz`);
await writeFile(installPath,tarball);
run(['plugin','--profile','bigfish-smoke','add',installPath,'--registry=https://registry.npmjs.org']);
const fixture=resolve(home,'companion-fixture.mjs'),patch=resolve(home,'companion.patch.yml'),workspace=resolve(home,'workspace');await mkdir(workspace,{recursive:true});
await writeFile(fixture,`import {LlmAdapter,createUserMessage} from ${JSON.stringify(llm)};
class Mock extends LlmAdapter {
 listModels(){return Promise.resolve([{id:'companion-test',name:'Companion local test'}]);}
 resolveModel(provider,model){return Promise.resolve({provider,id:model,name:model});}
 async *stream(options){yield {type:'block-start',index:0,blockType:'text'};const text=JSON.stringify({text:'测试会话已完成，结果来自真实完成事件。'});yield {type:'text-delta',index:0,text};yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'usage',usage:{inputTokens:90,outputTokens:10,totalTokens:100}};yield {type:'finish',reason:{kind:'stop'}};}
}
export const inject=['llm','sessions'];export function apply(ctx){ctx.llm.registerAdapter(['bigfish-local'],new Mock());ctx.effect(()=>{const timer=setTimeout(()=>{const s=ctx.sessions.create(undefined,{meta:{cwd:${JSON.stringify(workspace)}}});s.append('turn/start',{turn:1});s.append('user/message',createUserMessage({source:{kind:'user'},content:[{type:'text',text:'测试工作区的花园计划'}]}),{surfaceOp:'append'});s.append('turn/end',{turn:1,reason:{kind:'completed'}});},3000);return()=>clearTimeout(timer);});}
`);
await writeFile(patch,`- insert:\n    - id: bigfish-companion-fixture\n      name: ${JSON.stringify(fixture)}\n`);
const browser=await chromium.launch();let output='';const child=spawn(process.execPath,[cli,'--profile','bigfish-smoke','--patch',patch,'--port','0','--no-open'],{env,cwd:root,stdio:['pipe','pipe','pipe']});
child.stdout.on('data',b=>{output+=String(b);});child.stderr.on('data',b=>{output+=String(b);});
const checks:string[]=[];
try{
 await expect.poll(()=>output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)?.[0],{timeout:30000}).toBeTruthy();
 const url=output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)![0],page=await browser.newPage();await page.goto(url);
 const continueButton=page.getByRole('button',{name:'Continue',exact:true});if(await continueButton.isVisible())await continueButton.click();
 const endpoint=new URL('/api/bigfish-companion',url).href;
 // Exercise the actual desktop login exchange, without a browser cookie jar.
 const {exchangeHost}=await import('../desktop/host-connection.mjs');
 let desktopConnection;try{desktopConnection=await exchangeHost(url);}catch(error){console.error('Desktop exchange:',error instanceof Error?error.message:'failed');throw error;}
 const desktopResponse=await fetch(endpoint,{headers:{cookie:desktopConnection.cookie}});
 expect(desktopResponse.ok).toBe(true);checks.push('desktop launch-token exchange and authenticated Host request');
 const get=async()=>{const r=await page.request.get(endpoint);expect(r.ok()).toBe(true);return r.json();};
 const post=async(body:unknown)=>{const r=await page.request.post(endpoint,{data:body});if(!r.ok()){const detail=await r.json().catch(()=>({error:'non-JSON'}));console.error('Companion API rejected:',detail.error);throw Error('Companion API rejected');}return (await r.json()).result;};
 let state=await get();expect(state.policy.enabled).toBe(false);expect(state.today.used).toBe(0);checks.push('normal mode starts without model use');
 const claims=await Promise.all([post({op:'introduce'}),post({op:'introduce'})]);expect(claims.filter(Boolean)).toHaveLength(1);checks.push('atomic once-only invitation');
 await expect.poll(async()=>(await get()).tasks.some((t:any)=>t.workspace===workspace),{timeout:15000}).toBe(true);state=await get();
 const task=state.tasks.find((t:any)=>t.workspace===workspace);expect(task.state).toBe('completed');checks.push('native session events populate authoritative ledger');
 await post({op:'configure',policy:{...state.policy,enabled:true,provider:'bigfish-local',model:'companion-test',workspaces:[workspace],automaticLimit:0},revision:state.policyRevision});
 const reply=await post({op:'understand',workspace,question:'任务完成了吗？'});expect(reply.sources[0].session).toBe(task.session);expect(reply.text).toContain('完成');
 state=await get();expect(state.today.used).toBe(100);expect(state.today.reserved).toBe(0);expect(state.memories[0].kind).toBe('summary');checks.push('real Host model adapter, exact usage and derived memory');
 await post({op:'collect',source:{workspace,session:task.session,seq:task.seq}});expect((await get()).collections).toHaveLength(1);checks.push('postcard retains actual source event');
 await post({op:'forget',workspace});state=await get();expect(state.memories).toHaveLength(0);expect(state.insights).toHaveLength(0);expect(state.tasks.filter((t:any)=>t.workspace===workspace)).toHaveLength(0);checks.push('forget deletes derived context');
 await mkdir('artifacts/companion',{recursive:true});await writeFile('artifacts/companion/native-smoke.json',JSON.stringify({checks,harnessVersion:JSON.parse(await readFile(resolve(harness,'package.json'),'utf8')).version,model:'local in-process mock, no paid API'},null,2));
 console.log(JSON.stringify({checks}));
}catch(e){console.error(JSON.stringify({completedChecks:checks}));await mkdir('artifacts/companion',{recursive:true});await writeFile('artifacts/companion/native-failure.txt',output.replace(/(token|auth)=[^\s&]+/gi,'$1=[redacted]'));throw Error(`Companion native smoke failed: ${e instanceof Error?e.name:'unknown'}. See local redacted evidence.`);}
finally{child.stdin.end();child.kill('SIGTERM');await browser.close();}
