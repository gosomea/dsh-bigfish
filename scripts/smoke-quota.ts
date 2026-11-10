/** Native quota UI regression. Only the registered disposable home is eligible; no paid model is used. */
import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {mkdir,mkdtemp,readFile,realpath,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,expect,type Page} from '@playwright/test';
import {settingsDisclosure} from '../browser-tests/helpers/settings.js';
import {presetConfig} from '../src/companion/config.js';
const root=process.cwd(),harness=resolve('../../deepseek-harness'),profile='bigfish-smoke',environmentId='bigfish-intelligent-dev';
const registry=resolve('../../../../skills/dsh-plugin-isolated-test/scripts/environments.py');
const home=process.env.BIGFISH_SMOKE_HOME,expectedHome='/private/tmp/dsh-bigfish-intelligent-home';
const evidence=resolve('artifacts/companion');await mkdir(evidence,{recursive:true});
const traffic:{method:string;path?:string;op?:string;status:number}[]=[],clientErrors:string[]=[];
const checks:string[]=[],announcements:{id:string;page:string}[]=[];
let activePage:Page|undefined;
let stage='preflight',child:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,output='',hash='';
const checkpoint=async(error?:unknown)=>writeFile(resolve(evidence,'quota-checkpoint.json'),JSON.stringify({stage,checks,packageSha256:hash||null,failure:error?(error instanceof Error?error.name:'unknown'):null},null,2));
const registryCall=(args:string[])=>{const r=spawnSync('python3',[registry,...args],{encoding:'utf8',timeout:15000});if(r.status!==0)throw Error('Environment registry unavailable; no Host may be installed or started.');return JSON.parse(r.stdout);};
const redact=(s:string)=>s.replace(/https?:\/\/[^\s]+/g,value=>{try{const url=new URL(value);return url.origin+url.pathname+(url.search?'?[redacted]':'');}catch{return '[URL redacted]';}}).replace(/((?:cookie|authorization|api[_-]?key|token)\s*[:=])[^\r\n]*/gi,'$1[redacted]');
try{
 await checkpoint();
 if(!home||await realpath(home)!==expectedHome)throw Error('This smoke requires the registered isolated BIGFISH_SMOKE_HOME.');
 const record=registryCall(['show',environmentId]),observation=registryCall(['check',environmentId]);
 if(record.home!==expectedHome||record.project!==root||record.source!==harness||record.profile!==profile)throw Error('Registered environment identity mismatch.');
 if(observation.process==='matches'||observation.process==='identity-changed')throw Error('Registered process is alive or changed identity; inspect task activity before reuse.');
 const processes=spawnSync('ps',['-axo','pid=,command='],{encoding:'utf8',timeout:10000});
 if(processes.status!==0)throw Error('Cannot establish isolated Host inactivity.');
 if(processes.stdout.split('\n').some(line=>/--profile(?:=|\s+)bigfish-smoke(?:\s|$)/.test(line)&&/apps\/cli\/(?:lib|src)\/bin/.test(line)))throw Error('A smoke-profile Host is still active; refusing to replace served artifacts.');
 checks.push('registered isolated home identified; no matching Host process before install');
 const version=JSON.parse(await readFile('package.json','utf8')).version;
 const bytes=await readFile(resolve(process.argv[2]??`dist/dsh-bigfish-${version}.tgz`));hash=createHash('sha256').update(bytes).digest('hex');
 const installPath=resolve(home,`bigfish-quota-${hash.slice(0,20)}.tgz`);await writeFile(installPath,bytes);
 const cli=resolve(harness,'apps/cli/lib/bin.js'),env={...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'};
 stage='install-content-hash-package';await checkpoint();
 const install=spawnSync(process.execPath,[cli,'plugin','--profile',profile,'add',installPath,'--registry=https://registry.npmjs.org'],{env,cwd:root,encoding:'utf8',timeout:120000});
 if(install.status!==0)throw Error('Isolated package installation failed; raw command output is deliberately not printed.');
 const fixture=resolve(home,'quota-fixture.mjs'),patch=resolve(home,'quota.patch.yml');
 const llm=pathToFileURL(resolve(harness,'packages/llm/llm/lib/index.js')).href;
 await writeFile(fixture,`import {LlmAdapter} from ${JSON.stringify(llm)};
const counts={pet:0,total:0};
class Mock extends LlmAdapter {
 listModels(){return Promise.resolve([{id:'quota-test',name:'Local quota fixture'}]);}
 resolveModel(provider,model){return Promise.resolve({provider,id:model,name:model});}
 async *stream(options){counts.total++;if(options.purpose==='bigfish-companion')counts.pet++;yield {type:'finish',reason:{kind:'error',failure:{code:'QUOTA',message:'Local fixture quota exhausted.'}}};}
}
export const inject=['llm','connection'];
export function apply(ctx){ctx.llm.registerAdapter(['bigfish-quota-local'],new Mock());ctx.effect(()=>ctx.connection.fetch.register({path:'/api/bigfish-quota-fixture',methods:['GET'],requestBody:'buffered',fetch:()=>Response.json(counts,{headers:{'cache-control':'no-store'}})}));}
`);
 await writeFile(patch,`- id: agent-default-model\n  config:\n    provider: bigfish-quota-local\n    model: quota-test\n- insert:\n    - id: bigfish-quota-fixture\n      name: ${JSON.stringify(fixture)}\n`);
 stage='start-isolated-host';await checkpoint();
 browser=await chromium.launch();
 child=spawn(process.execPath,[cli,'--profile',profile,'--patch',patch,'--port','0','--no-open'],{env,cwd:harness,stdio:['pipe','pipe','pipe']});
 child.stdout!.on('data',b=>output+=String(b));child.stderr!.on('data',b=>output+=String(b));
 await expect.poll(()=>output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)?.[0],{timeout:30000}).toBeTruthy();
 const launchUrl=output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)![0],origin=new URL(launchUrl).origin;
 registryCall(['update',environmentId,'--pid',String(child.pid),'--url',origin,'--note','Quota UI regression in progress; do not reuse this home concurrently.']);
 const context=await browser.newContext({viewport:{width:1360,height:980}}),page=await context.newPage();
 activePage=page;
 page.on('pageerror',error=>clientErrors.push(redact(error.message).slice(0,500)));
 page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))traffic.push({path:new URL(response.url()).pathname,method:response.request().method(),...(response.request().method()==='POST'?{op:response.request().postDataJSON()?.op}:{}),status:response.status()});});
 await page.goto(launchUrl);const proceed=page.getByRole('button',{name:'Continue',exact:true});if(await proceed.isVisible())await proceed.click();
 const get=async()=>{const response=await page.request.get(origin+'/api/bigfish-companion');expect(response.ok()).toBe(true);return response.json();};
 const post=async(body:unknown,ok=true)=>{const response=await page.request.post(origin+'/api/bigfish-companion',{data:body});expect(response.ok()).toBe(ok);return response.json();};
 const metrics=async()=>{const response=await page.request.get(origin+'/api/bigfish-quota-fixture');if(!response.ok())throw Error(`Local metrics route rejected with status ${response.status()}`);return response.json();};
 const remote=async(method:string,request:unknown)=>{
  const response=await page.request.post(origin+'/api/'+method,{data:{type:'client-request',rpcId:randomUUID(),method,payload:{args:method==='session/list'?{_request:request}:{request}}}});
  if(!response.ok())throw Error('Native RPC transport failed.');const result=await response.json();if(!result.result?.ok)throw Error('Native RPC rejected fixture operation.');return result.result.value;
 };
 // Establish live inactivity as well, before creating this case's sessions or changing companion state.
 const sessions=await remote('session/list',{});expect(sessions.items.filter((s:any)=>s.running)).toHaveLength(0);checks.push('live isolated Host has no active retained sessions');
 stage='baseline-preset-write';await checkpoint();
 const presetWrite=await page.request.post(origin+'/api/settings/mutate',{data:{type:'client-request',rpcId:randomUUID(),method:'settings/mutate',payload:{args:{ns:'bigfish',ops:[{op:'set',path:['lifestyleJson'],value:JSON.stringify(presetConfig('balanced'))}]}}}});
 const presetResult=await presetWrite.json();if(!presetResult.result?.ok)throw Error(`Fixture preset Host write rejected: ${redact(presetResult.result?.error?.message??'unknown')}`);
 let state=await get();const initialUsage=state.today.used;
 await post({op:'configure',policy:{...state.policy,enabled:false},revision:state.policyRevision});await post({op:'introduce'});
 const track=(target:Page,label:string)=>target.on('response',async response=>{
  if(new URL(response.url()).pathname!=='/api/bigfish-companion'||response.request().method()!=='POST')return;
  const data=response.request().postDataJSON();if(data?.op!=='announce')return;
  try{if((await response.json()).result===true)announcements.push({id:data.id,page:label});}catch{/* Page teardown can abort a poll response. */}
 });
 track(page,'one');await expect(page.locator('.bf-widget canvas')).toBeVisible({timeout:20000});
 const workspace=await mkdtemp('/private/tmp/dsh-bigfish-quota-case-');
 stage='workspace-create';await checkpoint();
 const w=await remote('workspace/create',{path:workspace}),workspaceId=w.workspace.workspaceId;expect(workspaceId).toBeTruthy();
 const startTask=async(title:string)=>{
  stage='session-create';await checkpoint();const created=await remote('session/create',{workspaceId});const id=created.sessionId??created.session?.sessionId??created.session?.id;expect(id).toBeTruthy();
  registryCall(['bind',environmentId,'--case','quota-ui','--workspace',workspace,'--session',id,'--purpose','Local structured QUOTA error and pet budget UI regression; no paid model']);
  stage='session-prompt';await checkpoint();await remote('session/prompt',{requestId:randomUUID(),sessionId:id,mode:'queue',content:[{type:'text',text:title}]});return id as string;
 };
 const bubble=(target:Page)=>target.locator('.bf-widget .bf-dialogue-text');
 const snapshot=async(name:string,target=page)=>target.locator('.bf-widget').screenshot({path:resolve(evidence,name)});
 stage='normal-mode-task-quota';await checkpoint();
 const firstSession=await startTask('额度测试一：本地任务');
 stage='normal-mode-ledger';await checkpoint();
 await expect.poll(async()=>(await get()).tasks.find((t:any)=>t.session===firstSession)?.failureKind,{timeout:30000}).toBe('credit');
 stage='normal-mode-bubble';await checkpoint();
 await expect(bubble(page)).toContainText('额度或余额不足',{timeout:20000});await snapshot('quota-normal-mode.png');
 expect((await get()).policy.enabled).toBe(false);expect((await get()).today.used).toBe(initialUsage);expect((await metrics()).pet).toBe(0);
 checks.push('real native task QUOTA produces visible bubble in ordinary mode without pet model calls');
 const firstInsight=(await get()).insights.find((i:any)=>i.sources.some((s:any)=>s.session===firstSession));expect(firstInsight.announcedAt).toBeDefined();
 // A second authenticated page may take over the display, but must not replay the acknowledged error.
 stage='cross-page-dedup';await checkpoint();
 const second=await context.newPage();track(second,'two');await second.goto(origin);await expect(second.locator('.bf-widget')).toBeVisible({timeout:20000});
 await expect.poll(()=>announcements.filter(a=>a.id===firstInsight.id).length).toBe(1);
 await page.waitForTimeout(12000);await second.reload();await second.waitForTimeout(6000);
 expect(announcements.filter(a=>a.id===firstInsight.id)).toHaveLength(1);await expect(bubble(second).filter({hasText:'额度或余额不足'})).toHaveCount(0);
 checks.push('another page and reload do not replay the same quota notice');
 // End the second display lease so the first page is the only rendering owner for the next two cases.
 await second.close();await page.bringToFront();await expect(page.locator('.bf-widget canvas')).toBeVisible({timeout:25000});
 stage='tracking-disabled-quota';await checkpoint();
 const openFull=async()=>{
  await page.locator('.bf-card-actions').getByRole('button',{name:/^(Settings|设置)$/}).click();
  await page.locator('.bf-popover').getByRole('button',{name:/^(All settings|完整设置)$/}).click();
  await settingsDisclosure(page,'高级与数据','自定义能力');
 };
 await openFull();
 const toggleOff=async(name:string)=>{
  const input=page.getByRole('checkbox',{name,exact:true});
  if(!await input.isChecked())return;
  await expect(page.locator('.bf-save')).toContainText(/Synced with dsh|已与 dsh 设置同步/);
  await input.click();await expect(input).not.toBeChecked({timeout:15000});await expect(page.locator('.bf-save')).toContainText(/Synced with dsh|已与 dsh 设置同步/);
 };
 await toggleOff('任务管家');await toggleOff('记忆与个性');
 await page.locator('.bf-popover-top').getByRole('button',{name:/^(Close|关闭)$/}).click();
 const secondSession=await startTask('额度测试二：不应保存的任务标题');
 await expect(bubble(page)).toContainText('有个会话因模型额度或余额不足停止了',{timeout:25000});await snapshot('quota-tracking-disabled.png');
 state=await get();expect(state.tasks.some((t:any)=>t.session===secondSession)).toBe(false);expect(state.memories.some((m:any)=>m.sources.some((s:any)=>s.session===secondSession))).toBe(false);expect((await metrics()).pet).toBe(0);
 checks.push('tracking disabled still shows quota without retaining its title/message or using pet model');
 stage='budget-preflight';await checkpoint();
 state=await get();await post({op:'configure',policy:{...state.policy,enabled:true,provider:'bigfish-quota-local',model:'quota-test',workspaces:[workspace],dailyTokens:1000,automaticLimit:0},revision:state.policyRevision});
 const before=await metrics(),usageBefore=(await get()).today.used;
 const rejected=await post({op:'understand',workspace,question:'请说明这个任务为什么停止了'},false);expect(rejected.error).toContain('预算不足');
 await expect(bubble(page)).toContainText('我的今日 token 预算不够这次理解',{timeout:25000});await snapshot('quota-pet-budget.png');
 expect(await metrics()).toEqual(before);state=await get();expect(state.today.used).toBe(usageBefore);expect(state.today.reserved).toBe(0);
 const budgetNotice=state.insights.find((i:any)=>i.id.startsWith('alert-budget-'));expect(budgetNotice?.announcedAt).toBeDefined();
 await post({op:'understand',workspace,question:'重复问一次'},false);await page.waitForTimeout(6000);
 expect((await get()).insights.filter((i:any)=>i.id.startsWith('alert-budget-'))).toHaveLength(1);expect(announcements.filter(a=>a.id===budgetNotice.id)).toHaveLength(1);expect(await metrics()).toEqual(before);
 checks.push('1000-token preflight rejects with visible budget bubble and no model request, usage or duplicate notice');
 stage='passed';await checkpoint();
 await writeFile(resolve(evidence,'quota-native-smoke.json'),JSON.stringify({checks,packageSha256:hash,harnessVersion:JSON.parse(await readFile(resolve(harness,'package.json'),'utf8')).version,model:'Local in-process fixture; no paid provider',petModelRequests:(await metrics()).pet,announcedIds:announcements.map(a=>a.id)},null,2));
 console.log(JSON.stringify({checks,packageSha256:hash}));
}catch(error){await checkpoint(error);
 await writeFile(resolve(evidence,'quota-failure-detail.json'),JSON.stringify({stage,traffic:traffic.slice(-30),clientErrors,message:redact(error instanceof Error?error.message:'unknown').slice(0,2500),view:await activePage?.evaluate(async()=>({visibility:document.visibilityState,petText:document.querySelector('.bf-widget')?.textContent?.slice(0,600),persistence:document.querySelector('.bf-save')?.textContent,settingsErrors:[...document.querySelectorAll('.bf-error')].map(n=>n.textContent),host:await fetch('/api/bigfish-companion').then(r=>r.json()).then(s=>({display:s.display,insights:s.insights.map((i:any)=>({id:i.id,system:i.system,announcedAt:i.announcedAt,createdAt:i.createdAt}))})).catch(()=>null)})).catch(()=>null)},null,2));await writeFile(resolve(evidence,'quota-host-redacted.log'),redact(output));console.error(JSON.stringify({stage,completedChecks:checks,failure:error instanceof Error?error.name:'unknown'}));throw Error('Quota smoke failed; see safe artifacts/companion/quota-checkpoint.json.');}
finally{
 if(child&&child.exitCode===null){const process=child;await new Promise<void>(done=>{const timeout=setTimeout(()=>{process.kill('SIGKILL');},5000);process.once('exit',()=>{clearTimeout(timeout);done();});process.stdin?.end();process.kill('SIGTERM');});}
 await browser?.close();
 if(child)try{registryCall(['update',environmentId,'--state','retained','--note',`Quota regression ${stage}; this script's isolated process stopped. Check artifacts/companion/quota-checkpoint.json before reuse.`]);}catch{/* Failure evidence above remains usable even if registry access is unavailable. */}
}
