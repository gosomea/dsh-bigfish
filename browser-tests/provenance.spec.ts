import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {selectControl} from './helpers/settings.js';

let html='';
test.beforeAll(async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('./fixtures/provenance-components.tsx',import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',loader:{'.css':'text','.png':'dataurl'},plugins:[{name:'unused-provenance-previews',setup(builder){
  builder.onResolve({filter:/\/(?:companion-canvas|life-program-preview)\.js$/},args=>({path:args.path,namespace:'unused-preview'}));
  builder.onLoad({filter:/.*/,namespace:'unused-preview'},()=>({contents:'export const CompanionCanvas=()=>null; export const LifeProgramPreview=()=>null;',loader:'js'}));
 }}]});
 html='<!doctype html><meta charset="utf-8"><div id="root"></div><script>'+result.outputFiles[0]!.text.replaceAll('</script','<\\/script')+'</script>';
});
async function openTimeline(page:Page){await page.getByRole('button',{name:'打开任务本',exact:true}).click();const timeline=page.getByTestId('provenance-timeline');await timeline.locator('summary').first().click();return timeline;}
async function open(page:Page){await page.route('**/__provenance',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('/__provenance');return openTimeline(page);}

test('real timeline controls isolate same session ids by workspace, show tool provenance, and reject unknown source jumps',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const timeline=await open(page);
 await selectControl(timeline.getByLabel('来源工作区',{exact:true}),'/alpha');await expect(timeline).toContainText('Alpha公开工具结果');await expect(timeline).not.toContainText('Beta任务事实');await expect(timeline).not.toContainText('DO_NOT_RENDER');await expect(timeline).not.toContainText('UNVERIFIABLE_TEXT');
 const result=timeline.locator('[data-kind="tool"]').filter({hasText:'工具结果'});await result.getByText('为什么这样提醒／记录？',{exact:true}).click();await expect(result).toContainText('调用 3 → 结果 5');await result.getByRole('button',{name:'打开来源会话',exact:true}).click();expect(await page.evaluate(()=>(window as any).provenanceFixture.opened)).toEqual(['shared-id']);
 const unknown=timeline.locator('[data-kind="model"]').filter({hasText:'来源已变化或无法核对'});await unknown.getByText('为什么这样提醒／记录？',{exact:true}).click();await expect(unknown.getByRole('button',{name:'打开来源会话',exact:true})).toBeDisabled();
 await selectControl(timeline.getByLabel('来源工作区',{exact:true}),'');await selectControl(timeline.getByLabel('来源会话',{exact:true}),JSON.stringify(['/beta','shared-id']));await expect(timeline).toContainText('Beta任务事实');await expect(timeline).not.toContainText('Alpha任务事实');expect(await page.evaluate(()=>(window as any).provenanceFixture.calls)).toEqual([]);expect(errors).toEqual([]);
});

test('successful deletion refreshes immediately and an older in-flight read cannot restore memory or its sources',async({page})=>{
 await page.clock.install();const timeline=await open(page);await expect(timeline).toContainText('Alpha模型记忆');
 await page.evaluate(()=>(window as any).provenanceFixture.holdNext());await page.clock.runFor(5000);await expect.poll(()=>page.evaluate(()=>(window as any).provenanceFixture.heldCount())).toBe(1);
 await page.getByRole('button',{name:'返回智能设置',exact:true}).click();
 const memory=page.getByTestId('intelligence-memory');await memory.locator('summary').click();await selectControl(memory.getByLabel('记忆工作区',{exact:true}),'/alpha');await memory.getByRole('button',{name:'删除此工作区全部记忆与摘要',exact:true}).click();
 await memory.getByRole('button',{name:'确认删除',exact:true}).click();
 await expect(page.getByTestId('intelligence-feedback')).toContainText('已删除');
 await openTimeline(page);await expect(timeline).not.toContainText('Alpha模型记忆');await expect(timeline).not.toContainText('Alpha公开工具结果');await expect(timeline).toContainText('Beta任务事实');
 await page.evaluate(()=>(window as any).provenanceFixture.release());await expect(timeline).not.toContainText('Alpha任务事实');await expect(memory).not.toContainText('Alpha模型记忆');expect(await page.evaluate(()=>(window as any).provenanceFixture.calls)).toEqual(['forget']);
});

test('failed deletion preserves records; newer facts suppress stale model text and Host switches clear scoped filters',async({page})=>{
 await page.clock.install();const timeline=await open(page);await page.getByRole('button',{name:'返回智能设置',exact:true}).click();
 const memory=page.getByTestId('intelligence-memory');await memory.locator('summary').click();await selectControl(memory.getByLabel('记忆工作区',{exact:true}),'/alpha');
 await page.evaluate(()=>(window as any).provenanceFixture.rejectDelete(true));await memory.getByRole('button',{name:'删除此工作区全部记忆与摘要',exact:true}).click();await memory.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByTestId('intelligence-feedback')).toContainText('测试删除失败');await openTimeline(page);await expect(timeline).toContainText('Alpha模型记忆');
 await page.evaluate(()=>(window as any).provenanceFixture.advance());await page.clock.runFor(5000);await expect(timeline).not.toContainText('Alpha模型记忆');await expect(timeline).not.toContainText('Alpha模型解读');await expect(timeline).toContainText('来源已变化或无法核对');
 await selectControl(timeline.getByLabel('来源工作区',{exact:true}),'/alpha');await page.evaluate(()=>(window as any).provenanceFixture.switchHost());
 await expect(memory.getByLabel('记忆工作区',{exact:true})).toHaveAttribute('data-value','');await expect(page.getByTestId('intelligence-feedback')).not.toContainText('测试删除失败');
 await openTimeline(page);await expect(timeline).toContainText('NewHost任务');await expect(timeline.getByLabel('来源工作区',{exact:true})).toHaveAttribute('data-value','');
});
