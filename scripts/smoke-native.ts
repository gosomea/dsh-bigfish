/** Real profile/package smoke with a keyless in-process provider and the shipped browser UI. */
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
const root = process.cwd(), harness = resolve(process.argv[2] ?? '../../deepseek-harness');
const packageVersion=JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version;
const tarball = resolve(process.argv[3] ?? `dist/dsh-bigfish-${packageVersion}.tgz`);
const previousTarball = process.argv[4] ? resolve(process.argv[4]) : undefined;
await readFile(tarball); await mkdir('.probe', { recursive: true }); await mkdir('artifacts', { recursive: true });
const home = await mkdtemp(resolve('.probe/package-home-'));
await writeFile(resolve(home, 'package.json'), JSON.stringify({ name: 'bigfish-smoke-fixtures', private: true, type: 'module' }));
const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' };
const cli = resolve(harness, 'apps/cli/lib/bin.js');
function run(args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args], { env, cwd: root, encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) throw new Error(`dsh command failed: ${r.stderr}`);
}
run(['--profile', 'bigfish-smoke', '--from-default-profile', 'web', '--dump-config']);
run(['plugin', '--profile', 'bigfish-smoke', 'add', previousTarball ?? tarball, '--registry=https://registry.npmjs.org']);
const fixture = resolve(home, 'mock.mjs');
await writeFile(fixture, `import {LlmAdapter} from ${JSON.stringify(pathToFileURL(resolve(harness, 'packages/llm/llm/lib/index.js')).href)};
import {setTimeout} from 'node:timers/promises';
class Mock extends LlmAdapter {
 listModels(){return Promise.resolve([{id:'bigfish-test',name:'Bigfish local test'}]);}
 resolveModel(provider,model){return Promise.resolve({provider,id:model,name:model});}
 async *stream(options){yield {type:'block-start',index:0,blockType:'text'};let text='';
 const steps=JSON.stringify(options.messages).includes('并发乙')?240:100;
 for(let i=0;i<steps;i++){await setTimeout(100,undefined,{signal:options.signal});const part='大肥鱼正在测试动画。';text+=part;yield {type:'text-delta',index:0,text:part};}
 yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'usage',usage:{inputTokens:1,outputTokens:1000}};yield {type:'finish',reason:{kind:'stop'}};}
}
export const inject=['llm'];export function apply(ctx){ctx.llm.registerAdapter(['bigfish-local'],new Mock());}
`);
const patch = resolve(home, 'mock.patch.yml');
await writeFile(patch, `- id: agent-default-model\n  config:\n    provider: bigfish-local\n    model: bigfish-test\n- insert:\n    - id: bigfish-mock\n      name: ${JSON.stringify(fixture)}\n`);
const browser = await chromium.launch(); let child: ReturnType<typeof spawn> | undefined;
async function start() {
  let output = '';
  child = spawn(process.execPath, [cli, '--profile', 'bigfish-smoke', '--patch', patch, '--port', '0', '--no-open'], { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout!.on('data', b => { output += String(b); }); child.stderr!.on('data', b => { output += String(b); });
  await expect.poll(() => output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)?.[0], { timeout: 20000 }).toBeTruthy();
  return output.match(/http:\/\/127\.0\.0\.1:[^\s]+/)![0];
}
async function stop() { if (!child || child.exitCode !== null) return; const process = child; await new Promise<void>(done => { process.once('exit', () => done()); process.kill('SIGTERM'); }); }
const checks: string[] = [];
try {
  let url = await start(); const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('response',async r=>{if(r.url().includes('/api/bigfish-pets')&&!r.ok())console.log('Role API failure',r.status(),await r.text());});
  await page.goto(url); const notice = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(notice).toBeVisible({ timeout: 10000 }); await notice.click(); await expect(notice).toBeHidden();
  await expect(page.locator('.bf-widget canvas')).toHaveAttribute('data-motion', 'wait-sign'); checks.push('tarball install, native module, idle waiting sign');
  const settings = async () => { await page.getByRole('button', { name: 'Settings', exact: true }).first().click(); await page.getByText('Bigfish Companion', { exact: true }).first().click(); };
  await settings(); await page.getByText('自定义台词与工具',{exact:true}).click(); await page.getByLabel('台词列表').fill('我在读取 {file}～'); await page.getByRole('button', {name:'保存这一类台词'}).click(); await expect(page.getByText('已保存', {exact:true})).toBeVisible(); await page.getByLabel('鞭策节奏').selectOption('rhythm'); await expect(page.getByLabel('鞭策节奏')).toHaveValue('rhythm');
  await page.getByLabel('启用鞭策动作').click(); await expect(page.getByLabel('启用鞭策动作')).not.toBeChecked();
  await page.reload(); await settings(); await page.getByText('自定义台词与工具',{exact:true}).click(); await expect(page.getByLabel('台词列表')).toHaveValue('我在读取 {file}～'); await expect(page.getByLabel('启用鞭策动作')).not.toBeChecked(); await page.getByLabel('启用鞭策动作').click(); await expect(page.getByLabel('启用鞭策动作')).toBeChecked(); await expect(page.getByLabel('鞭策节奏')).toHaveValue('rhythm');
  await page.screenshot({ path: 'artifacts/native-settings.png' }); checks.push('Host settings write and refresh persistence');
  if(previousTarball){
    const roleBytes=await readFile('dist/bigfish-adult-1.0.0.dshpet');
    expect((await page.request.post(new URL('/api/bigfish-pets-upload?op=import',url).href,{data:roleBytes,headers:{'content-type':'application/octet-stream'}})).ok()).toBe(true);
    expect((await page.request.post(new URL('/api/bigfish-pets?op=select&key=bigfish-adult%401.0.0',url).href)).ok()).toBe(true);
    const catalog=await page.evaluate(async()=>await(await fetch('/api/bigfish-pets')).json());
    await stop();run(['plugin','--profile','bigfish-smoke','add',tarball,'--registry=https://registry.npmjs.org']);url=await start();await page.goto(url);
    await expect(page.locator('.bf-widget canvas')).toHaveAttribute('data-pet','bigfish-adult');
    expect(await page.evaluate(async()=>await(await fetch('/api/bigfish-pets')).json())).toEqual(catalog);
    await settings();await page.getByText('自定义台词与工具',{exact:true}).click();await expect(page.getByLabel('台词列表')).toHaveValue('我在读取 {file}～');await expect(page.getByLabel('鞭策节奏')).toHaveValue('rhythm');
    expect((await page.request.post(new URL('/api/bigfish-pets?op=select',url).href)).ok()).toBe(true);
    await page.reload();await expect(page.locator('.bf-widget canvas')).not.toHaveAttribute('data-pet');await settings();
    checks.push('upgrade from previous tarball preserves Host preferences, role bytes and selected character');
  }
  // Exercise new fields through the real Host schema, not only the demo store.
  const saveSetting = async (change: () => Promise<unknown>) => {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/settings/mutate');
    await change();
    expect((await (await response).json()).result.ok).toBe(true);
  };
  await saveSetting(() => page.getByLabel('空闲互动').selectOption('custom'));
  await saveSetting(() => page.getByRole('slider',{name:'最短休息时间 · 秒'}).fill('12'));
  await saveSetting(() => page.getByRole('slider',{name:'最长休息时间 · 秒'}).fill('15'));
  await page.getByText('消息内容与空闲习惯',{exact:true}).click();
  await saveSetting(() => page.getByLabel('举牌偏好').selectOption('none'));
  await saveSetting(() => page.getByRole('slider',{name:'每次空闲动作展示 · 秒'}).fill('18'));
  await page.reload();await settings();
  await expect(page.getByLabel('空闲互动')).toHaveValue('custom');
  await expect(page.getByRole('slider',{name:'最短休息时间 · 秒'})).toHaveValue('12');
  await expect(page.getByRole('slider',{name:'最长休息时间 · 秒'})).toHaveValue('15');
  await page.getByText('消息内容与空闲习惯',{exact:true}).click();
  await expect(page.getByLabel('举牌偏好')).toHaveValue('none');
  await expect(page.getByRole('slider',{name:'每次空闲动作展示 · 秒'})).toHaveValue('18');
  await page.screenshot({path:'artifacts/settings-review-native.png'});
  await saveSetting(() => page.getByLabel('举牌偏好').selectOption('prefer'));
  await saveSetting(() => page.getByRole('slider',{name:'每次空闲动作展示 · 秒'}).fill('12'));
  await saveSetting(() => page.getByLabel('空闲互动').selectOption('frequent'));
  checks.push('new idle frequency, coupled bounds, sign preference and hold duration persist through native Host schema');
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  const workspace = resolve(home, 'workspace'); await mkdir(workspace);
  const remote = async (method: string, request: unknown) => page.evaluate(async ({ method, request }) => {
    const response = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { request } } }) });
    const message = await response.json(); if (!message.result.ok) throw new Error(message.result.error.message); return message.result.value;
  }, { method, request });
  const w = await remote('workspace/create', { path: workspace }); expect(w.workspace.workspaceId).toBeTruthy(); const created = await remote('session/create', { workspaceId: w.workspace.workspaceId });
  await page.reload(); const input = page.locator('[contenteditable=true]').first();
  let releasePrompt!: () => void;
  const promptGate = new Promise<void>(resolve => { releasePrompt = resolve; });
  await page.route('**/api/session/prompt', async route => { await promptGate; await route.continue(); });
  await input.fill('测试大肥鱼实时动画'); await input.press('Enter');
  try {
    await expect(page.locator('.bf-state')).toHaveText('Getting ready', { timeout: 1000 });
    await expect(page.locator('.bf-widget canvas')).not.toHaveAttribute('data-motion', 'wait-sign', { timeout: 1000 });
    await expect(page.locator('.bf-widget canvas')).toHaveAttribute('data-whip', 'false');
    checks.push('local submit responds before the prompt request reaches Host');
  } finally { releasePrompt(); }

  await expect(page.locator('.bf-state')).toHaveText('Writing', { timeout: 10000 });
  await expect(page.locator('.bf-stats')).toContainText('≈', { timeout: 5000 });
  await expect(page.locator('.bf-task-context')).toContainText('测试大肥鱼实时动画');checks.push('native user-message task cue rendered with actual current turn');
  await expect(page.locator('.bf-widget canvas')).toHaveAttribute('data-whip', 'true');
  await page.waitForTimeout(2000); await page.screenshot({ path: 'artifacts/native-streaming.png' });
  const activeSessionId = await page.evaluate(async () => { const method='session/list'; const result=await (await fetch('/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{_request:{}}}})})).json(); return result.result.value.items.find((item: any) => item.running)?.sessionId; });
  expect(activeSessionId).toBeTruthy();
  await page.evaluate(sessionId => window.dispatchEvent(new CustomEvent('dsh-bigfish:activity', { detail: {version:1, sessionId,id:'image-test',phase:'start',category:'image',label:'本地扩展测试',progress:.5} })), activeSessionId);
  await expect(page.locator('.bf-bubble')).toHaveAttribute('data-category','image');
  await expect(page.locator('.bf-activity')).toContainText('50%');
  await page.screenshot({path:'artifacts/native-dialogue.png'});
  await page.evaluate(sessionId => window.dispatchEvent(new CustomEvent('dsh-bigfish:activity', { detail: {version:1,sessionId,id:'image-test',phase:'end',category:'image',label:'本地扩展测试'} })), activeSessionId);
  await expect(page.locator('.bf-bubble')).not.toHaveAttribute('data-category','image');
  checks.push('custom dialogue Host persistence and extension start/progress/end UI');
  await expect(page.locator('.bf-state')).toHaveText('All done!', { timeout: 12000 }); await page.screenshot({ path: 'artifacts/native-completed.png' });
  await expect(page.locator('.bf-widget canvas')).toHaveAttribute('data-motion','breathe', { timeout: 6000 });await expect(page.locator('.bf-widget .bf-dialogue-text')).toHaveCount(0); checks.push('real dsh session → live chunks → rate → completion → idle');
  await page.reload(); await expect(page.locator('.bf-widget canvas')).not.toHaveAttribute('data-scene', 'delivery'); checks.push('refresh does not replay historical completion');
  // Two actual Host turns overlap while the same browser switches its foreground session.
  const concurrentA = await remote('session/create', { workspaceId: w.workspace.workspaceId });
  const concurrentB = await remote('session/create', { workspaceId: w.workspace.workspaceId });
  const idOf = (value: any): string => value.sessionId ?? value.session?.sessionId ?? value.session?.id;
  const aId = idOf(concurrentA), bId = idOf(concurrentB);
  expect(aId).toBeTruthy(); expect(bId).toBeTruthy();
  await remote('session/rename', { sessionId: aId, title: '并发甲' });
  await remote('session/rename', { sessionId: bId, title: '并发乙' });
  const open = async (title: string) => { try { await page.getByText(title, { exact: true }).first().click({timeout:5000}); } catch(error) { await writeFile('artifacts/native-multi-failure.txt',await page.locator('body').innerText()); throw error; } };
  const runningIds = () => page.evaluate(async () => {
    const method='session/list'; const r=await(await fetch('/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{_request:{}}}})})).json();
    return r.result.value.items.filter((s:any)=>s.running).map((s:any)=>s.sessionId) as string[];
  });
  // Blank sessions are intentionally hidden by the Host sidebar until their first prompt.
  await remote('session/prompt', { requestId: crypto.randomUUID(), sessionId: aId, mode: 'queue', content: [{ type: 'text', text: '并发甲' }] });
  await remote('session/prompt', { requestId: crypto.randomUUID(), sessionId: bId, mode: 'queue', content: [{ type: 'text', text: '并发乙' }] });
  await expect.poll(runningIds).toHaveLength(2);
  await remote('session/rename', { sessionId: aId, title: '并发甲' });
  await remote('session/rename', { sessionId: bId, title: '并发乙' });
  await page.reload();
  await writeFile('artifacts/native-multi-start.txt', await page.locator('body').innerText());
  expect((await runningIds()).sort()).toEqual([aId,bId].sort());
  await open('并发甲'); await expect(page.locator('.bf-state')).toHaveText('Writing');
  await open('并发乙'); await expect(page.locator('.bf-state')).toHaveText('Writing');
  await expect.poll(runningIds, {timeout:15000}).toEqual([bId]);
  await expect(page.locator('.bf-state')).toHaveText('Writing');
  await open('并发甲'); await expect(page.locator('.bf-widget canvas')).toHaveAttribute('data-motion','breathe');
  await expect(page.locator('.bf-widget canvas')).toHaveAttribute('data-whip','false');
  await open('并发乙'); await expect(page.locator('.bf-state')).toHaveText('Writing');
  await page.screenshot({path:'artifacts/native-multi-session.png'});
  await expect(page.locator('.bf-state')).toHaveText('All done!', {timeout:20000});
  checks.push('two concurrent Host sessions: foreground switches, background completion isolated, old completion does not replay, foreground completion works');
  await settings(); await page.getByLabel('显示宠物', { exact: true }).click(); await expect(page.locator('.bf-widget')).toHaveCount(0);
  await page.getByLabel('显示宠物', { exact: true }).click(); await expect(page.locator('.bf-widget')).toHaveCount(1); checks.push('disable/re-enable releases and remounts overlay');
  await page.getByText('角色库',{exact:true}).click();await page.getByLabel('角色包文件').setInputFiles('dist/bigfish-adult-1.0.0.dshpet');
  await page.getByRole('button',{name:'安装并使用',exact:true}).click();try{await expect(page.getByText('角色已安装并使用',{exact:true})).toBeVisible();}catch(e){console.log('Role UI:',await page.locator('.bf-role-library').innerText());throw e;}
  await expect(page.locator('.bf-widget canvas')).toHaveAttribute('data-pet','bigfish-adult');
  const catalog=await page.evaluate(async()=>{const r=await fetch('/api/bigfish-pets');if(!r.ok)throw Error('Host role API failed');return r.json();});
  expect(catalog.selected).toBe('bigfish-adult@1.0.0');expect(catalog.entries.find((e:any)=>e.id==='bigfish-adult').actions).toBe(8);
  await page.reload();await expect(page.locator('.bf-widget canvas')).toHaveAttribute('data-pet','bigfish-adult');
  const other=await browser.newContext();const otherPage=await other.newPage();await otherPage.goto(url);
  const otherNotice=otherPage.getByRole('button',{name:'Continue',exact:true});if(await otherNotice.isVisible())await otherNotice.click();
  await expect(otherPage.locator('.bf-widget canvas')).toHaveAttribute('data-pet','bigfish-adult');await other.close();
  await settings();await page.getByText('角色库',{exact:true}).click();await page.getByRole('button',{name:'使用大肥鱼',exact:true}).click();
  await expect(page.locator('.bf-widget canvas')).not.toHaveAttribute('data-pet');
  checks.push('8-action external role uploads to Host, survives reload, loads in separate browser storage, and switches back');
  await page.getByText('备份与恢复',{exact:true}).click();
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整备份'}).click();
  const backupPath=await(await downloaded).path();expect(backupPath).toBeTruthy();
  const previousWhip=await page.getByLabel('启用鞭策动作').isChecked();
  await page.getByLabel('启用鞭策动作').click();await expect(page.getByLabel('启用鞭策动作')).toBeChecked({checked:!previousWhip});
  await page.getByRole('button',{name:'移除',exact:true}).click();await expect(page.locator('.bf-role-card')).toHaveCount(1);
  await page.getByLabel('备份文件').setInputFiles({name:'restore.zip',mimeType:'application/zip',buffer:await readFile(backupPath!)});
  await expect(page.getByText('校验通过，尚未修改任何设置。',{exact:true})).toBeVisible();await expect(page.locator('.bf-role-card')).toHaveCount(1);
  await page.getByRole('button',{name:'确认恢复备份'}).click();await expect(page.getByText('恢复完成。已有角色已保留，角色选择、偏好、台词和动作编排已恢复。',{exact:true})).toBeVisible();
  await expect(page.getByLabel('启用鞭策动作')).toBeChecked({checked:previousWhip});await expect(page.locator('.bf-role-card')).toHaveCount(2);
  await page.screenshot({path:'artifacts/native-backup-050.png'});
  checks.push('complete backup exported from Host, validated before mutation, restores removed role and Host preferences');

  expect(errors).toEqual([]); checks.push('no browser runtime errors');
  await page.close(); await stop();
  run(['plugin', '--profile', 'bigfish-smoke', 'remove', 'dsh-bigfish']);
  const cleanUrl = await start(); const clean = await browser.newPage(); await clean.goto(cleanUrl);
  await expect(clean.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible(); await expect(clean.locator('.bf-widget')).toHaveCount(0); checks.push('package removal and clean profile restart');
  const report = { date: new Date().toISOString(), node: process.version, tarball, previousTarball, checks, realPaidApiCalled: false, isolatedHome: home };
  await writeFile(previousTarball?'artifacts/native-smoke-upgrade.json':'artifacts/native-smoke.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await stop(); }
