/** Real local-only tool-result and derived-memory smoke. Only the registered disposable Host may be installed or started. */
import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {mkdir,mkdtemp,readFile,realpath,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {presetConfig} from '../src/companion/config.js';
import {selectControl} from '../browser-tests/helpers/settings.js';
const root=process.cwd(),harness=resolve('../../deepseek-harness'),profile='bigfish-smoke',environmentId='bigfish-intelligent-dev';
const registry=resolve('../../../../skills/dsh-plugin-isolated-test/scripts/environments.py');
const home=process.env.BIGFISH_SMOKE_HOME,expectedHome='/private/tmp/dsh-bigfish-intelligent-home';
const evidence=resolve('artifacts/companion'),checks:string[]=[];await mkdir(evidence,{recursive:true});
let stage='preflight',child:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,output='',hash='';
const redact=(s:string)=>s.replace(/https?:\/\/[^\s]+/g,value=>{try{const u=new URL(value);return u.origin+u.pathname+(u.search?'?[redacted]':'');}catch{return '[URL redacted]';}}).replace(/((?:cookie|authorization|api[_-]?key|token)\s*[:=])[^\r\n]*/gi,'$1[redacted]');
const checkpoint=async(error?:unknown)=>writeFile(resolve(evidence,'tool-context-checkpoint.json'),JSON.stringify({stage,checks,packageSha256:hash||null,failure:error?redact(error instanceof Error?error.message:'unknown').slice(0,1800):null},null,2));
const registryCall=(args:string[])=>{const r=spawnSync('python3',[registry,...args],{encoding:'utf8',timeout:15000});if(r.status!==0)throw Error('Environment registry unavailable; no Host may be installed or started.');return JSON.parse(r.stdout);};
try{
 await checkpoint();
 if(!home||await realpath(home)!==expectedHome)throw Error('Set BIGFISH_SMOKE_HOME to the registered isolated home.');
 const record=registryCall(['show',environmentId]),observation=registryCall(['check',environmentId]);
 if(record.home!==expectedHome||record.project!==root||record.source!==harness||record.profile!==profile)throw Error('Registered environment identity mismatch.');
 if(observation.process==='matches'||observation.process==='identity-changed')throw Error('Registered process is alive or changed identity; do not reuse concurrently.');
 const processes=spawnSync('ps',['-axo','pid=,command='],{encoding:'utf8',timeout:10000});
 if(processes.status!==0)throw Error('Cannot establish isolated Host inactivity.');
 if(processes.stdout.split('\n').some(line=>/--profile(?:=|\s+)bigfish-smoke(?:\s|$)/.test(line)&&/apps\/cli\/(?:lib|src)\/bin/.test(line)))throw Error('A smoke-profile Host is active; refusing installation.');
 checks.push('registered isolated home identity and absence of its Host verified before installation');
 const version=JSON.parse(await readFile('package.json','utf8')).version;
 const bytes=await readFile(resolve(process.argv[2]??`dist/dsh-bigfish-${version}.tgz`));hash=createHash('sha256').update(bytes).digest('hex');
 const installPath=resolve(home,`bigfish-tool-context-${hash.slice(0,20)}.tgz`);await writeFile(installPath,bytes);
 const cli=resolve(harness,'apps/cli/lib/bin.js'),env={...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'};
 stage='install-content-hash-package';await checkpoint();
 const install=spawnSync(process.execPath,[cli,'plugin','--profile',profile,'add',installPath,'--registry=https://registry.npmjs.org'],{env,cwd:root,encoding:'utf8',timeout:120000});
 if(install.status!==0)throw Error('Isolated package installation failed; raw command output deliberately not printed.');
 const fixture=resolve(home,'tool-context-fixture.mjs'),patch=resolve(home,'tool-context.patch.yml');
 const llm=pathToFileURL(resolve(harness,'packages/llm/llm/lib/index.js')).href,toolsModule=pathToFileURL(resolve(harness,'packages/core/tools/lib/index.js')).href;
 await writeFile(fixture,`import {LlmAdapter} from ${JSON.stringify(llm)};
import {defineTool} from ${JSON.stringify(toolsModule)};
const counts={pet:0,task:0,tool:0},released=new Set(),waiters=new Set();let petHeld=false,petInput='';
const wait=(signal,condition)=>new Promise((resolve,reject)=>{const stop=()=>{waiters.delete(done);reject(signal?.reason??Error('Aborted'));};const done=()=>{if(!condition())return;signal?.removeEventListener('abort',stop);waiters.delete(done);resolve();};waiters.add(done);if(signal?.aborted)stop();else{signal?.addEventListener('abort',stop,{once:true});done();}});
class Mock extends LlmAdapter {
 listModels(){return Promise.resolve([{id:'tool-context-test',name:'Local tool context fixture'}]);}
 resolveModel(provider,model){return Promise.resolve({provider,id:model,name:model});}
 async *stream(options){
  if(options.purpose==='bigfish-companion'){
   counts.pet++;petInput=JSON.stringify(options.messages);if(petHeld)await wait(options.signal,()=>!petHeld);
   const text=JSON.stringify({text:'工具A找到了两个入口；工具B执行失败。任务是否完成仍以会话事实为准。'});
   yield {type:'text-delta',text};yield {type:'usage',usage:{inputTokens:30,outputTokens:10,totalTokens:40}};yield {type:'finish',reason:{kind:'stop'}};return;
  }
  if(options.purpose)throw Error('Unexpected fixture purpose');counts.task++;
  const input=JSON.stringify(options.messages),label=input.includes('BIGFISH_TOOL_CONTEXT_A')?'A':input.includes('BIGFISH_TOOL_CONTEXT_B')?'B':null;
  if(!label)throw Error('Unknown fixture task');
  if(!options.messages.some(m=>m.role==='tool')){
   if(!options.tools?.some(t=>t.name==='bigfish_context_fixture'))throw Error('Native fixture tool schema absent');
   const id='context-same-id',name='bigfish_context_fixture',args=JSON.stringify({label,secret:'ARGUMENT_SENTINEL'});
   yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name,argumentsDelta:args};yield {type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:args}};yield {type:'finish',reason:{kind:'tool-calls'}};return;
  }
  await wait(options.signal,()=>released.has(label));
  const text='本地工具任务'+label+'收尾完成。';yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text};yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'usage',usage:{inputTokens:10,outputTokens:10,totalTokens:20}};yield {type:'finish',reason:{kind:'stop'}};
 }
}
export const inject=['llm','connection','agents','tools','sessionProjections'];
export function apply(ctx){
 ctx.llm.registerAdapter(['bigfish-tool-context-local'],new Mock());
 ctx.tools.register(defineTool({name:'bigfish_context_fixture',description:'Only local test data; no filesystem or network access.',parameters:{label:{type:'string',required:true},secret:{type:'string',required:true}},
  output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}],presentationMeta:()=>({private:'META_SENTINEL'})},
  execute:async args=>{counts.tool++;if(args.label==='B')throw Error('本地工具B失败；password=ERROR_SENTINEL');return JSON.stringify({summary:'工具事实A：找到2个入口',stdout:'PATH=/private/ENV_SENTINEL\\nAPI_KEY=TOKEN_SENTINEL\\n公开结果A',env:{secret:'JSON_ENV_SENTINEL'},arguments:'JSON_ARGUMENT_SENTINEL',media:'a'.repeat(1000)});}}));
 ctx.effect(()=>ctx.connection.fetch.register({path:'/api/bigfish-tool-context-fixture',methods:['GET','POST'],requestBody:'buffered',fetch:async request=>{
  try{
   if(request.method==='GET')return Response.json({counts,petInput,agents:ctx.agents.list().map(a=>({id:a.session.id,status:a.status,title:ctx.sessionProjections.snapshot(a.session,['title']).values.title}))});
   const b=await request.json();if(b.op==='release')released.add(b.label);else if(b.op==='hold-pet')petHeld=true;else if(b.op==='release-pet')petHeld=false;else throw Error('Unknown local action');
   for(const done of [...waiters])done();return Response.json({result:true});
  }catch{return Response.json({error:'Local fixture operation rejected'},{status:400});}
 }}));
}
`);
 await writeFile(patch,`- id: agent-default-model\n  config:\n    provider: bigfish-tool-context-local\n    model: tool-context-test\n- insert:\n    - id: preset-bigfish-tool-context\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: bigfish-tool-context\n        name: Bigfish local tool context test\n        order: 90\n        plugins:\n          - id: native-fixture-executor\n            name: '@deepseek-ai/dsh-tool-executor-native'\n    - id: bigfish-tool-context-fixture\n      name: ${JSON.stringify(fixture)}\n`);
 stage='start-isolated-host';await checkpoint();
 browser=await chromium.launch();
 child=spawn(process.execPath,[cli,'--profile',profile,'--patch',patch,'--port','0','--no-open'],{env,cwd:harness,stdio:['pipe','pipe','pipe']});
 child.stdout!.on('data',b=>output+=String(b));child.stderr!.on('data',b=>output+=String(b));
 await expect.poll(()=>output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)?.[0],{timeout:30000}).toBeTruthy();
 const launchUrl=output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)![0],origin=new URL(launchUrl).origin;
 registryCall(['update',environmentId,'--pid',String(child.pid),'--url',origin,'--note','Native tool context regression in progress; do not reuse concurrently.']);
 const context=await browser.newContext(),page=await context.newPage();await page.goto(launchUrl);
 const proceed=page.getByRole('button',{name:'Continue',exact:true});if(await proceed.isVisible())await proceed.click();
 const get=async()=>{const r=await page.request.get(origin+'/api/bigfish-companion');expect(r.ok()).toBe(true);return r.json();};
 const pet=async(body:unknown)=>{const r=await page.request.post(origin+'/api/bigfish-companion',{data:body});const value=await r.json();if(!r.ok())throw Error(redact(value.error??'Pet operation rejected'));return value.result;};
 const facts=async()=>{const r=await page.request.get(origin+'/api/bigfish-tool-context-fixture');const value=await r.json();if(!r.ok())throw Error(redact(value.error??'Fixture read failed'));return value;};
 const fixturePost=async(body:unknown)=>{const r=await page.request.post(origin+'/api/bigfish-tool-context-fixture',{data:body});const value=await r.json();if(!r.ok())throw Error(redact(value.error??'Fixture action failed'));return value.result;};
 const rpc=async(method:string,request:unknown)=>{
  const response=await page.request.post(origin+'/api/'+method,{data:{type:'client-request',rpcId:randomUUID(),method,payload:{args:method==='session/list'?{_request:request}:{request}}}});
  const value=await response.json();if(!response.ok()||!value.result?.ok)throw Error(redact(value.result?.error?.message??'Native RPC rejected fixture request'));return value.result.value;
 };
 const list=await rpc('session/list',{});expect(list.items.filter((s:any)=>s.running)).toHaveLength(0);checks.push('native Host has no active prior tasks before fixture mutation');
 stage='configure-local-only-case';await checkpoint();
 const config=await page.request.post(origin+'/api/settings/mutate',{data:{type:'client-request',rpcId:randomUUID(),method:'settings/mutate',payload:{args:{ns:'bigfish',ops:[{op:'set',path:['lifestyleJson'],value:JSON.stringify(presetConfig('balanced'))}]}}}});
 if(!(await config.json()).result?.ok)throw Error('Could not enable local tracking');
 let state=await get();await pet({op:'configure',policy:{...state.policy,enabled:false},revision:state.policyRevision});
 const usageBefore=(await get()).today.used,workspace=await mkdtemp('/private/tmp/dsh-bigfish-tool-context-case-');
 const w=await rpc('workspace/create',{path:workspace}),workspaceId=w.workspace.workspaceId;
 const create=async()=>{const value=await rpc('session/create',{workspaceId,agentPreset:'bigfish-tool-context'});return value.sessionId as string;};
 const prompt=async(sessionId:string,text:string)=>rpc('session/prompt',{requestId:randomUUID(),sessionId,mode:'queue',content:[{type:'text',text}]});
 const a=await create(),b=await create();
 for(const [label,sessionId] of [['A',a],['B',b]]){
  registryCall(['bind',environmentId,'--case','tool-context-'+label,'--workspace',workspace,'--session',sessionId!,'--purpose','Real local tool execution and bounded companion context; no paid model']);
  await prompt(sessionId!,'BIGFISH_TOOL_CONTEXT_'+label+'：运行本地测试工具，然后等待测试控制器放行。');
 }
 stage='native-tool-facts';await checkpoint();
 await expect.poll(async()=>{const s=await get();return [a,b].map(id=>s.tasks.find((t:any)=>t.session===id)?.tools?.[0]?.state);},{timeout:25000}).toEqual(['succeeded','failed']);
 await expect.poll(async()=>{const s=await get();return [a,b].every(id=>s.tasks.find((t:any)=>t.session===id)?.runtimeStatus==='running');},{timeout:15000}).toBe(true);
 state=await get();const ta=state.tasks.find((t:any)=>t.session===a),tb=state.tasks.find((t:any)=>t.session===b);
 expect(ta.state).toBe('running');expect(tb.state).toBe('running');expect(ta.tools[0].callId).toBe(tb.tools[0].callId);
 expect(ta.tools[0].excerpt).toContain('工具事实A');expect(tb.tools[0].excerpt).toContain('本地工具B失败');
 for(const t of [ta,tb]){expect(t.tools[0].resultSeq).toBeGreaterThan(t.tools[0].callSeq);expect(t.tools[0].durationMs).toBeGreaterThanOrEqual(0);}
 // Fixture's raw task transcript contains deliberate test sentinels; only the companion projection must omit them.
 expect(JSON.stringify([ta,tb])).not.toMatch(/SENTINEL|a{80}/);
 expect((await facts()).counts.pet).toBe(0);expect((await get()).today.used).toBe(usageBefore);
 checks.push('two actual native tool executions sharing callId stay session-isolated; success/failure do not complete held tasks');
 checks.push('raw arguments, opaque tool meta, environment, credentials and encoded payload are absent from companion facts; intelligence off costs zero');
 stage='authorized-tool-understanding';await checkpoint();
 // Recovery metadata is a real source change. Wait for that independent projection,
 // rather than assuming the first running sample already includes the native title.
 await expect.poll(async()=>{const native=await facts(),s=await get();return [a,b].every(id=>{const title=native.agents.find((agent:any)=>agent.id===id)?.title;return typeof title==='string'&&s.tasks.find((t:any)=>t.session===id)?.title===title;});},{timeout:15000}).toBe(true);
 state=await get();await pet({op:'configure',policy:{...state.policy,enabled:true,provider:'bigfish-tool-context-local',model:'tool-context-test',workspaces:[workspace],dailyTokens:100000,automaticLimit:0},revision:state.policyRevision});
 const insight=await pet({op:'understand',workspace,question:'根据工具结果说明这两个会话正在做什么。'});
 expect(insight?.sources).toHaveLength(2);expect(insight.sources.every((s:any)=>s.tools?.some((r:any)=>r.callId==='context-same-id'&&Number.isInteger(r.resultSeq)))).toBe(true);
 const captured=(await facts()).petInput;expect(captured).toContain('工具事实A');expect(captured).toContain('本地工具B失败');expect(captured).not.toMatch(/SENTINEL|a{80}/);
 state=await get();const memorySources=state.memories.find((m:any)=>m.kind==='summary')?.sources;expect(memorySources).toEqual(insight.sources);expect(state.today.used).toBe(usageBefore+40);
 checks.push('explicitly authorized local understanding receives bounded public tool facts and writes summary memory with exact tool source references');
 stage='native-provenance-timeline';await checkpoint();
 const summaryMemory=state.memories.find((m:any)=>m.kind==='summary');expect(Number.isSafeInteger(summaryMemory?.createdAt)).toBe(true);expect(summaryMemory.createdAt).toBe(insight.createdAt);
 const durable=JSON.parse(await readFile(resolve(home,'pets/dsh-bigfish/companion/state.json'),'utf8'));
 expect(durable.memories.find((m:any)=>m.id===summaryMemory.id)?.createdAt).toBe(summaryMemory.createdAt);
 const otherWorkspace=await mkdtemp('/private/tmp/dsh-bigfish-tool-context-other-'),other=await rpc('workspace/create',{path:otherWorkspace});
 const otherSession=(await rpc('session/create',{workspaceId:other.workspace.workspaceId,agentPreset:'bigfish-tool-context'})).sessionId as string;
 registryCall(['bind',environmentId,'--case','tool-context-other-workspace','--workspace',otherWorkspace,'--session',otherSession,'--purpose','Real independent workspace negative control for provenance filters; no pet model authorization']);
 await prompt(otherSession,'BIGFISH_TOOL_CONTEXT_A：来自另一工作区的独立任务。');await expect.poll(async()=>(await get()).tasks.find((t:any)=>t.session===otherSession)?.tools?.[0]?.state,{timeout:20000}).toBe('succeeded');
 const widget=page.locator('.bf-widget');await expect(widget).toBeVisible({timeout:15000});await widget.locator('.bf-card-actions button[aria-expanded]').click();
 await widget.getByRole('button',{name:/^(完整设置|All settings)$/}).click();
 const panel=widget.locator('.bf-settings:not(.bf-compact)');await panel.getByRole('navigation',{name:'大肥鱼设置分区'}).getByRole('button',{name:'智能管家',exact:true}).click();
 const timeline=panel.getByTestId('provenance-timeline');await timeline.locator('summary').first().click();
 await expect(timeline.locator('.bf-provenance-item')).toContainText([otherSession]);
 await selectControl(timeline.getByLabel('来源工作区',{exact:true}),workspace);await expect(timeline).toContainText('工具事实A');await expect(timeline).toContainText('本地工具B失败');await expect(timeline.locator('.bf-provenance-item')).not.toContainText([otherSession]);
 await expect(timeline.locator('[data-kind="memory"]')).toContainText(summaryMemory.text);await expect(timeline.locator('[data-kind="memory"] time')).toHaveAttribute('datetime',new Date(summaryMemory.createdAt).toISOString());
 checks.push('a real second workspace is visible before filtering and absent from the selected workspace timeline despite reused tool identity; filtering grants no model access');
 for(const [sessionId,nativeTask] of [[b,tb],[a,ta]] as const){
  const row=timeline.locator('.bf-provenance-item[data-kind="tool"]').filter({hasText:'工具结果'}).filter({hasText:sessionId});
  await row.getByText('为什么这样提醒／记录？',{exact:true}).click();await expect(row).toContainText(`调用 ${nativeTask.tools[0].callSeq} → 结果 ${nativeTask.tools[0].resultSeq}`);
  await row.getByRole('button',{name:'打开来源会话',exact:true}).click();await expect(page.locator(`[data-conversation-session="${sessionId}"]`)).toBeVisible({timeout:15000});
 }
 expect((await facts()).counts.pet).toBe(1);
 await timeline.screenshot({path:resolve(evidence,'tool-context-native-provenance.png')});
 checks.push('real settings timeline matches durable summary creation time and exact native tool call/result sequences; source buttons open the corresponding real main conversation without model calls');
 stage='source-change-rejects-late-model';await checkpoint();
 await fixturePost({op:'hold-pet'});const pending=pet({op:'understand',workspace,question:'等待期间的工具状态。'});
 await expect.poll(async()=>(await facts()).counts.pet,{timeout:15000}).toBe(2);
 await fixturePost({op:'release',label:'A'});
 await expect.poll(async()=>(await get()).tasks.find((t:any)=>t.session===a)?.state,{timeout:15000}).toBe('completed');
 expect((await get()).memories.filter((m:any)=>m.kind==='summary')).toHaveLength(0);
 await fixturePost({op:'release-pet'});expect(await pending).toBeNull();
 expect((await get()).memories.filter((m:any)=>m.kind==='summary')).toHaveLength(0);
 checks.push('real subsequent task events invalidate the earlier summary and reject an in-flight tool interpretation while still settling its usage');
 await fixturePost({op:'release',label:'B'});
 await expect.poll(async()=>(await get()).tasks.find((t:any)=>t.session===b)?.state,{timeout:15000}).toBe('completed');
 await expect.poll(async()=>(await get()).tasks.find((t:any)=>t.session===otherSession)?.state,{timeout:15000}).toBe('completed');
 const memorySection=panel.getByTestId('intelligence-memory');await memorySection.locator('summary').click();await selectControl(memorySection.getByLabel('记忆工作区',{exact:true}),workspace);
 await memorySection.getByRole('button',{name:'删除此工作区全部记忆与摘要',exact:true}).click();await expect(panel.getByTestId('intelligence-feedback')).toContainText('已删除');
 expect((await get()).tasks.some((t:any)=>t.workspace===workspace)).toBe(false);
 expect((await get()).memories.some((m:any)=>m.workspace===workspace)).toBe(false);
 await expect(timeline.locator('.bf-provenance-item')).not.toContainText([a]);await expect(timeline.locator('.bf-provenance-item')).not.toContainText([b]);await expect(timeline).not.toContainText('工具A找到了两个入口');
 expect((await get()).tasks.some((t:any)=>t.session===otherSession)).toBe(true);
 checks.push('deleting through actual memory settings refreshes the timeline and removes native task/tool sources and derived memories without waiting for the polling interval');
 await pet({op:'forget',workspace:otherWorkspace});
 const finalState=await get(),finalCounts=(await facts()).counts;expect(finalCounts.pet).toBe(2);expect(finalState.today.used).toBe(usageBefore+80);expect(finalState.today.reserved).toBe(0);checks.push('forget removes tool facts and derived context; only two explicit local pet calls were dispatched');
 stage='passed';await checkpoint();
 await writeFile(resolve(evidence,'tool-context-native-smoke.json'),JSON.stringify({checks,packageSha256:hash,harnessVersion:JSON.parse(await readFile(resolve(harness,'package.json'),'utf8')).version,petModelRequests:finalCounts.pet,paidModelRequests:0,
  nativeEvidence:{tasks:[ta,tb].map(t=>({workspace:t.workspace,session:t.session,seq:t.seq,statusRevision:t.statusRevision,state:t.state,runtimeStatus:t.runtimeStatus,tools:t.tools})),insightSources:insight.sources,memorySources,memoryCreatedAt:summaryMemory.createdAt,workspaceIsolation:{workspace,otherWorkspace,otherSession},usageBefore,usageAfter:finalState.today,fixtureCounts:finalCounts},
  limitations:['uses a keyless local adapter, not a paid-provider quality evaluation','hidden and unknown content blocks plus replacement invalidation also have controlled Node coverage']},null,2));
 console.log(JSON.stringify({checks,packageSha256:hash}));
}catch(error){await checkpoint(error);await writeFile(resolve(evidence,'tool-context-host-redacted.log'),redact(output));console.error(JSON.stringify({stage,completedChecks:checks,failure:error instanceof Error?error.name:'unknown'}));throw Error('Native tool context smoke failed; see safe artifacts/companion/tool-context-checkpoint.json.');}
finally{
 if(child&&child.exitCode===null){const process=child;await new Promise<void>(done=>{const timeout=setTimeout(()=>process.kill('SIGKILL'),5000);process.once('exit',()=>{clearTimeout(timeout);done();});process.stdin?.end();process.kill('SIGTERM');});}
 await browser?.close();
 if(child)try{registryCall(['update',environmentId,'--state','retained','--note',`Tool context regression ${stage}; this script's isolated Host stopped. Inspect artifacts/companion/tool-context-checkpoint.json before reuse.`]);}catch{/* Safe evidence remains available. */}
}
