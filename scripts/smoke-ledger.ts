/** Real local-model question/lineage smoke. Only the registered disposable Host may be installed or started. */
import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {mkdir,mkdtemp,readFile,realpath,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {decodeLifestyle,presetConfig} from '../src/companion/config.js';
const root=process.cwd(),harness=resolve('../../deepseek-harness'),profile='bigfish-smoke',environmentId='bigfish-intelligent-dev';
const registry=resolve('../../../../skills/dsh-plugin-isolated-test/scripts/environments.py');
const home=process.env.BIGFISH_SMOKE_HOME,expectedHome='/private/tmp/dsh-bigfish-intelligent-home';
const evidence=resolve('artifacts/companion'),checks:string[]=[];await mkdir(evidence,{recursive:true});
let stage='preflight',child:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,output='',hash='';
const redact=(s:string)=>s.replace(/https?:\/\/[^\s]+/g,value=>{try{const u=new URL(value);return u.origin+u.pathname+(u.search?'?[redacted]':'');}catch{return '[URL redacted]';}}).replace(/((?:cookie|authorization|api[_-]?key|token)\s*[:=])[^\r\n]*/gi,'$1[redacted]');
const checkpoint=async(error?:unknown)=>writeFile(resolve(evidence,'ledger-checkpoint.json'),JSON.stringify({stage,checks,packageSha256:hash||null,failure:error?redact(error instanceof Error?error.message:'unknown').slice(0,1800):null},null,2));
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
 const installPath=resolve(home,`bigfish-ledger-${hash.slice(0,20)}.tgz`);await writeFile(installPath,bytes);
 const cli=resolve(harness,'apps/cli/lib/bin.js'),env={...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'};
 stage='install-content-hash-package';await checkpoint();
 const install=spawnSync(process.execPath,[cli,'plugin','--profile',profile,'add',installPath,'--registry=https://registry.npmjs.org'],{env,cwd:root,encoding:'utf8',timeout:120000});
 if(install.status!==0)throw Error('Isolated package installation failed; raw command output deliberately not printed.');
 const fixture=resolve(home,'ledger-fixture.mjs'),patch=resolve(home,'ledger.patch.yml');
 const llm=pathToFileURL(resolve(harness,'packages/llm/llm/lib/index.js')).href,sessionModule=pathToFileURL(resolve(harness,'packages/core/session/lib/index.js')).href;
 await writeFile(fixture,`import {randomUUID} from 'node:crypto';
import {LlmAdapter,createUserMessage} from ${JSON.stringify(llm)};
import {SessionId} from ${JSON.stringify(sessionModule)};
const counts={pet:0,task:0};let issued=false,released=false;const holds=new Set(),handles=[];
class Mock extends LlmAdapter {
 listModels(){return Promise.resolve([{id:'ledger-test',name:'Local ledger fixture'}]);}
 resolveModel(provider,model){return Promise.resolve({provider,id:model,name:model});}
 async *stream(options){
  if(options.purpose==='bigfish-companion'){counts.pet++;throw Error('Intelligence must remain disabled during ledger smoke.');}
  counts.task++;const input=JSON.stringify(options.messages);
  if(!options.purpose&&input.includes('BIGFISH_LEDGER_QUESTIONS')&&!issued){
   issued=true;
   if(!options.tools?.some(t=>t.name==='ask_user_question'&&t.parameters?.properties?.timeout))throw Error('The real timed question schema is missing.');
   for(let index=0;index<2;index++){
    const id='bigfish-ledger-call-'+index,args=JSON.stringify({questions:[{id:'q'+index,question:'本地问题 '+index+'：请选择测试选项',options:[{label:'确定'}]}],timeout:3});
    yield {type:'block-start',index,blockType:'tool-call'};
    yield {type:'tool-call-delta',index,id,name:'ask_user_question',argumentsDelta:args};
    yield {type:'block-end',index,block:{type:'tool-call',id,name:'ask_user_question',arguments:args}};
   }
   yield {type:'finish',reason:{kind:'tool-calls'}};return;
  }
  if(!options.purpose&&input.includes('BIGFISH_LEDGER_HOLD')&&!released){await new Promise((resolve,reject)=>{const stop=()=>{holds.delete(done);reject(options.signal?.reason??Error('Aborted'));};const done=()=>{options.signal?.removeEventListener('abort',stop);holds.delete(done);resolve();};holds.add(done);if(options.signal?.aborted)stop();else options.signal?.addEventListener('abort',stop,{once:true});});}
  const text='本地真实模型任务已完成。';yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text};yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'usage',usage:{inputTokens:30,outputTokens:10,totalTokens:40}};yield {type:'finish',reason:{kind:'stop'}};
 }
}
export const inject=['llm','connection','agents','sessionProjections','userQuestions'];
export function apply(ctx){
 ctx.llm.registerAdapter(['bigfish-ledger-local'],new Mock());
 ctx.effect(()=>async()=>{for(const h of handles)await h.dispose();});
 ctx.effect(()=>ctx.connection.fetch.register({path:'/api/bigfish-ledger-fixture',methods:['GET','POST'],requestBody:'buffered',fetch:async request=>{
  try{
   if(request.method==='GET')return Response.json({counts,agents:ctx.agents.list().map(agent=>({id:agent.session.id,status:agent.status,header:agent.session.header,projection:ctx.sessionProjections.snapshot(agent.session,['userQuestions','title'])}))});
   const b=await request.json();let result;
   if(b.op==='answer'){
    const agent=ctx.agents.get(SessionId(b.session));if(!agent)throw Error('Question agent missing');
    result=ctx.userQuestions.answer(agent,b.callId,{answers:[{id:b.questionId,selected:['确定']}]});
   }else if(b.op==='child'){
    const parent=ctx.agents.get(SessionId(b.parent));if(!parent)throw Error('Parent agent missing');
    const h=await parent.ctx.agents.create({sessionId:SessionId(randomUUID()),parentAgent:parent,meta:{cwd:b.workspace,parentSession:parent.session.id,origin:'subagent',agentPreset:'bigfish-ledger'},agentOptions:{provider:'bigfish-ledger-local',model:'ledger-test'}});handles.push(h);
    h.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'BIGFISH_LEDGER_HOLD child'}]}));result={sessionId:h.agent.session.id};
   }else if(b.op==='release'){released=true;for(const done of [...holds])done();result=true;}
   else return Response.json({error:'Unknown fixture action'},{status:400});
   return Response.json({result});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'fixture failed'},{status:400});}
 }}));
}
`);
 // A new explicit preset avoids replacing an existing preset's nested tool list.
 await writeFile(patch,`- id: agent-default-model\n  config:\n    provider: bigfish-ledger-local\n    model: ledger-test\n- insert:\n    - id: preset-bigfish-ledger\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: bigfish-ledger\n        name: Bigfish local ledger test\n        order: 90\n        plugins:\n          - id: tool-ask-user\n            name: '@deepseek-ai/dsh-tool-ask-user'\n            config:\n              mode: timed\n              timeout: 3\n    - id: bigfish-ledger-fixture\n      name: ${JSON.stringify(fixture)}\n`);
 stage='start-isolated-host';await checkpoint();
 browser=await chromium.launch();
 child=spawn(process.execPath,[cli,'--profile',profile,'--patch',patch,'--port','0','--no-open'],{env,cwd:harness,stdio:['pipe','pipe','pipe']});
 child.stdout!.on('data',b=>output+=String(b));child.stderr!.on('data',b=>output+=String(b));
 await expect.poll(()=>output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)?.[0],{timeout:30000}).toBeTruthy();
 const launchUrl=output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)![0],origin=new URL(launchUrl).origin;
 registryCall(['update',environmentId,'--pid',String(child.pid),'--url',origin,'--note','Native ledger regression in progress; do not reuse concurrently.']);
 const context=await browser.newContext(),page=await context.newPage();await page.goto(launchUrl);
 const proceed=page.getByRole('button',{name:'Continue',exact:true});if(await proceed.isVisible())await proceed.click();
 const get=async()=>{const r=await page.request.get(origin+'/api/bigfish-companion');expect(r.ok()).toBe(true);return r.json();};
 const pet=async(body:unknown)=>{const r=await page.request.post(origin+'/api/bigfish-companion',{data:body});const value=await r.json();if(!r.ok())throw Error(redact(value.error??'Pet operation rejected'));return value.result;};
 const facts=async()=>{const r=await page.request.get(origin+'/api/bigfish-ledger-fixture');const value=await r.json();if(!r.ok())throw Error(redact(value.error??'Fixture read failed'));return value;};
 const fixturePost=async(body:unknown)=>{const r=await page.request.post(origin+'/api/bigfish-ledger-fixture',{data:body});const value=await r.json();if(!r.ok())throw Error(redact(value.error??'Fixture action failed'));return value.result;};
 const rpc=async(method:string,request:unknown)=>{
  const response=await page.request.post(origin+'/api/'+method,{data:{type:'client-request',rpcId:randomUUID(),method,payload:{args:method==='session/list'?{_request:request}:{request}}}});
  const value=await response.json();if(!response.ok()||!value.result?.ok)throw Error(redact(value.result?.error?.message??'Native RPC rejected fixture request'));return value.result.value;
 };
 const list=await rpc('session/list',{});expect(list.items.filter((s:any)=>s.running)).toHaveLength(0);checks.push('native Host has no active prior tasks before fixture mutation');
 stage='configure-local-only-case';await checkpoint();
 const config=await page.request.post(origin+'/api/settings/mutate',{data:{type:'client-request',rpcId:randomUUID(),method:'settings/mutate',payload:{args:{ns:'bigfish',ops:[{op:'set',path:['lifestyleJson'],value:JSON.stringify(presetConfig('balanced'))}]}}}});
 const configResult=await config.json();if(!configResult.result?.ok)throw Error(redact(configResult.result?.error?.message??'Could not enable local tracking'));
 let state=await get();await pet({op:'configure',policy:{...state.policy,enabled:false},revision:state.policyRevision});
 const usageBefore=(await get()).today.used,workspace=await mkdtemp('/private/tmp/dsh-bigfish-ledger-case-');
 const w=await rpc('workspace/create',{path:workspace}),workspaceId=w.workspace.workspaceId;
 const create=async()=>{const value=await rpc('session/create',{workspaceId,agentPreset:'bigfish-ledger'});return value.sessionId as string;};
 const prompt=async(sessionId:string,text:string)=>rpc('session/prompt',{requestId:randomUUID(),sessionId,mode:'queue',content:[{type:'text',text}]});
 const questionSession=await create();registryCall(['bind',environmentId,'--case','ledger-questions','--workspace',workspace,'--session',questionSession,'--purpose','Real timed user question tools, late answers, and companion ledger; local mock only']);
 stage='question-tool-lifecycle';await checkpoint();
 await prompt(questionSession,'BIGFISH_LEDGER_QUESTIONS：请提出两个独立的本地测试问题。');
 await expect.poll(async()=>(await get()).tasks.find((t:any)=>t.session===questionSession)?.state,{timeout:20000}).toBe('waiting');
 await expect.poll(async()=>((await facts()).agents.find((a:any)=>a.id===questionSession)?.projection.values.userQuestions?.active??[]).filter((q:any)=>q.state==='continued').length,{timeout:20000}).toBe(2);
 await expect.poll(async()=>((await get()).tasks.find((t:any)=>t.session===questionSession)?.pendingQuestions??[]).filter((q:any)=>q.state==='continued').length,{timeout:15000}).toBe(2);
 checks.push('real mock tool calls reach production timed question service; two continued waits survive turn end');
 stage='answer-one-question';await checkpoint();
 expect(await fixturePost({op:'answer',session:questionSession,callId:'bigfish-ledger-call-0',questionId:'q0'})).toBe(true);
 await expect.poll(async()=>((await facts()).agents.find((a:any)=>a.id===questionSession)?.projection.values.userQuestions?.active??[]).map((q:any)=>q.callId),{timeout:15000}).toEqual(['bigfish-ledger-call-1']);
 await expect.poll(async()=>((await get()).tasks.find((t:any)=>t.session===questionSession)?.pendingQuestions??[]).map((q:any)=>q.callId),{timeout:15000}).toEqual(['bigfish-ledger-call-1']);
 expect((await get()).tasks.find((t:any)=>t.session===questionSession)?.state).toBe('waiting');checks.push('one real late answer clears only its call; the other question remains waiting');
 stage='answer-final-question';await checkpoint();
 expect(await fixturePost({op:'answer',session:questionSession,callId:'bigfish-ledger-call-1',questionId:'q1'})).toBe(true);
 await expect.poll(async()=>(await get()).tasks.find((t:any)=>t.session===questionSession)?.state,{timeout:15000}).toBe('completed');
 expect((await get()).tasks.find((t:any)=>t.session===questionSession)?.pendingQuestions).toEqual([]);checks.push('second admitted answer settles final wait and real final turn completion');
 stage='native-lineage-and-running-read';await checkpoint();
 const childSession=(await fixturePost({op:'child',parent:questionSession,workspace})).sessionId;
 registryCall(['bind',environmentId,'--case','ledger-child','--workspace',workspace,'--session',childSession,'--purpose','Actual child Agent with durable subagent metadata and a held local model call']);
 await expect.poll(async()=>(await get()).tasks.find((t:any)=>t.session===childSession)?.runtimeStatus,{timeout:20000}).toBe('running');
 state=await get();const childTask=state.tasks.find((t:any)=>t.session===childSession);expect(childTask.parent).toBe(questionSession);expect(childTask.relationship).toBe('subagent');
 const nativeChild=(await facts()).agents.find((a:any)=>a.id===childSession);expect(nativeChild.header.parentSession).toBe(questionSession);expect(nativeChild.header.origin).toBe('subagent');expect(nativeChild.status).toBe('running');checks.push('real Agent registry and projection readers retain running state and exact subagent parent metadata');
 const fork=(await rpc('session/fork',{sessionId:questionSession})).sessionId;
 await prompt(fork,'BIGFISH_LEDGER_HOLD：普通分支任务。');
 await expect.poll(async()=>(await get()).tasks.find((t:any)=>t.session===fork)?.runtimeStatus,{timeout:20000}).toBe('running');
 state=await get();const forkTask=state.tasks.find((t:any)=>t.session===fork),nativeFork=(await facts()).agents.find((a:any)=>a.id===fork);
 expect(nativeFork.header.isSeeded).toBe(true);expect(forkTask.relationship).toBe('fork');expect(forkTask.parent).toBe(nativeFork.header.parentSession??null);checks.push('native fork preserves isSeeded; pet does not invent a missing source-parent identity');
 stage='release-and-verify-no-pet-cost';await checkpoint();await fixturePost({op:'release'});
 await expect.poll(async()=>(await get()).tasks.filter((t:any)=>[childSession,fork].includes(t.session)).every((t:any)=>t.state==='completed'),{timeout:20000}).toBe(true);
 expect((await facts()).counts.pet).toBe(0);expect((await get()).today.used).toBe(usageBefore);checks.push('ordinary tracking and runtime reads make zero pet model calls and do not change its token usage');
 await page.locator('.bf-widget').screenshot({path:resolve(evidence,'ledger-native-pet.png')});
 stage='native-shared-appearance-settings';await checkpoint();
 const settingsCall=async(method:'describe'|'mutate',args:Record<string,unknown>)=>{
  const response=await page.request.post(origin+'/api/settings/'+method,{data:{type:'client-request',rpcId:randomUUID(),method:'settings/'+method,payload:{args}}});
  const result=await response.json();if(!response.ok()||!result.result?.ok)throw Error(redact(result.result?.error?.message??'Native shared settings request failed'));return result.result.value;
 };
 const readSettings=async()=>{const description=await settingsCall('describe',{}),namespace=description.namespaces.find((value:any)=>value.ns==='bigfish');if(!namespace)throw Error('Native settings descriptor is missing the pet namespace');return namespace;};
 const savedSettings=await readSettings(),savedAppearance={sceneryVisible:savedSettings.value.sceneryVisible,lifestyleJson:savedSettings.value.lifestyleJson};
 expect(typeof savedAppearance.sceneryVisible).toBe('boolean');expect(typeof savedAppearance.lifestyleJson).toBe('string');
 const life=decodeLifestyle(JSON.parse(savedAppearance.lifestyleJson)),screenHome={...life,movement:'screen',groups:{...life.groups,body:true,home:true},homeVisible:true},screenJson=JSON.stringify(screenHome);
 const mutateAppearance=async(sceneryVisible:boolean,lifestyleJson:string,expectedRevision:number)=>settingsCall('mutate',{ns:'bigfish',expectedRevision,ops:[{op:'set',path:['sceneryVisible'],value:sceneryVisible},{op:'set',path:['lifestyleJson'],value:lifestyleJson}]});
 try{
  // An actual room is present first, so the hidden-scene assertion cannot pass vacuously.
  await mutateAppearance(true,screenJson,savedSettings.revision);const widget=page.locator('.bf-widget');
  await expect(widget.locator('.bf-home')).toBeVisible({timeout:15000});await expect(widget).toHaveAttribute('data-movement','screen');
  const beforeHide=await readSettings();expect(beforeHide.value.sceneryVisible).toBe(true);expect(JSON.parse(beforeHide.value.lifestyleJson).movement).toBe('screen');
  await mutateAppearance(false,screenJson,beforeHide.revision);
  // This is a new Host read, not a mutation response or a renderer-owned data attribute.
  const hidden=await readSettings();expect(hidden.revision).toBeGreaterThan(beforeHide.revision);expect(hidden.value.sceneryVisible).toBe(false);expect(hidden.value.lifestyleJson).toBe(screenJson);
  await expect(widget.locator('.bf-home')).toHaveCount(0);await expect(widget.locator('canvas')).toBeVisible();await expect(widget).toHaveAttribute('data-movement','screen');
  await page.reload();await expect(page.locator('.bf-widget')).toBeVisible({timeout:20000});const reloaded=await readSettings();expect(reloaded.value.sceneryVisible).toBe(false);expect(JSON.parse(reloaded.value.lifestyleJson).movement).toBe('screen');
  await expect(page.locator('.bf-widget .bf-home')).toHaveCount(0);await expect(page.locator('.bf-widget')).toHaveAttribute('data-movement','screen');
  await page.locator('.bf-widget').screenshot({path:resolve(evidence,'ledger-native-shared-visibility.png')});
 }finally{
  const current=await readSettings();await mutateAppearance(savedAppearance.sceneryVisible,savedAppearance.lifestyleJson,current.revision);
  const restored=await readSettings();expect(restored.value.sceneryVisible).toBe(savedAppearance.sceneryVisible);expect(restored.value.lifestyleJson).toBe(savedAppearance.lifestyleJson);
 }
 expect((await facts()).counts.pet).toBe(0);expect((await get()).today.used).toBe(usageBefore);
 checks.push('native shared namespace persists scene visibility and full-screen movement across independent Host reads and reload; actual room hides, character stays, and original preferences restore without pet usage');
 stage='desktop-native-namespace';await checkpoint();
 // Stop the Web consumer so these claim races exercise the real Host endpoint itself.
 await page.goto('about:blank');
 const desktopURL=origin+'/api/bigfish-desktop';
 const desktopRead=await page.request.get(desktopURL);expect(desktopRead.ok()).toBe(true);const desktopBefore=await desktopRead.json();
 const policyRevision=(await get()).policyRevision;
 const configure=await page.request.post(desktopURL,{data:{op:'configure',settings:{...desktopBefore.settings,alwaysOnTop:!desktopBefore.settings.alwaysOnTop},revision:desktopBefore.revision}});expect(configure.ok()).toBe(true);
 const staleDesktop=await page.request.post(desktopURL,{data:{op:'configure',settings:desktopBefore.settings,revision:desktopBefore.revision}});expect(staleDesktop.status()).toBe(400);expect((await get()).policyRevision).toBe(policyRevision);
 checks.push('native desktop namespace persists revision-fenced settings independently of model authorization');
 const unknownJump=await page.request.post(desktopURL,{data:{op:'navigate',session:randomUUID()}});expect(unknownJump.status()).toBe(400);
 const jump=await page.request.post(desktopURL,{data:{op:'navigate',session:questionSession}});expect(jump.ok()).toBe(true);const navigation=(await jump.json()).result;
 const claims=await Promise.all([0,1].map(async()=>{const response=await page.request.post(desktopURL,{data:{op:'claim',id:navigation.id}});expect(response.ok()).toBe(true);return (await response.json()).result;}));expect(claims.filter(Boolean)).toHaveLength(1);expect(claims.find(Boolean).session).toBe(questionSession);
 checks.push('native desktop navigation admits only known source sessions and exactly one concurrent consumer');
 const denied=await page.request.post(desktopURL,{headers:{origin:'https://invalid.example','sec-fetch-site':'cross-site'},data:{op:'configure',settings:desktopBefore.settings,revision:desktopBefore.revision+1}});expect(denied.status()).toBe(403);expect((await facts()).counts.pet).toBe(0);
 checks.push('cross-site desktop mutation is rejected without a model request');
 stage='passed';await checkpoint();
 await writeFile(resolve(evidence,'ledger-native-smoke.json'),JSON.stringify({checks,packageSha256:hash,harnessVersion:JSON.parse(await readFile(resolve(harness,'package.json'),'utf8')).version,petModelRequests:0,limitations:['startup reattachment before the plugin activates is not simulated','overlapping approvals are covered by controlled tests, not this native case']},null,2));
 console.log(JSON.stringify({checks,packageSha256:hash}));
}catch(error){await checkpoint(error);await writeFile(resolve(evidence,'ledger-host-redacted.log'),redact(output));console.error(JSON.stringify({stage,completedChecks:checks,failure:error instanceof Error?error.name:'unknown'}));throw Error('Native ledger smoke failed; see safe artifacts/companion/ledger-checkpoint.json.');}
finally{
 if(child&&child.exitCode===null){const process=child;await new Promise<void>(done=>{const timeout=setTimeout(()=>process.kill('SIGKILL'),5000);process.once('exit',()=>{clearTimeout(timeout);done();});process.stdin?.end();process.kill('SIGTERM');});}
 await browser?.close();
 if(child)try{registryCall(['update',environmentId,'--state','retained','--note',`Ledger regression ${stage}; this script's isolated Host stopped. Inspect artifacts/companion/ledger-checkpoint.json before reuse.`]);}catch{/* Safe evidence remains available. */}
}
