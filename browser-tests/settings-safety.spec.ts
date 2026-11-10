import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {selectControl} from './helpers/settings.js';

let settingsHtml='',provenanceHtml='';
test.beforeAll(async()=>{
 const bundle=async(entry:string,name:string)=>{
  const result=await build({entryPoints:[fileURLToPath(new URL(entry,import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',loader:{'.css':'text','.png':'dataurl'},plugins:[{name,setup(builder){
   builder.onResolve({filter:/\/(?:companion-canvas|life-program-preview)\.js$/},args=>({path:args.path,namespace:'unused-settings-safety-preview'}));
   builder.onLoad({filter:/.*/,namespace:'unused-settings-safety-preview'},()=>({contents:'export const CompanionCanvas=()=>null; export const LifeProgramPreview=()=>null;',loader:'js'}));
  }}]});
  return '<!doctype html><meta charset="utf-8"><div id="root"></div><script>'+result.outputFiles[0]!.text.replaceAll('</script','<\\/script')+'</script>';
 };
 [settingsHtml,provenanceHtml]=await Promise.all([bundle('./fixtures/settings-components.tsx','unused-settings-previews'),bundle('./fixtures/provenance-components.tsx','unused-provenance-previews')]);
});

async function openMemory(page:Page){
 await page.route('**/__settings_safety_provenance',route=>route.fulfill({contentType:'text/html',body:provenanceHtml}));
 await page.goto('/__settings_safety_provenance');
 const memory=page.getByTestId('intelligence-memory');await memory.locator('summary').click();
 await selectControl(memory.getByLabel('记忆工作区',{exact:true}),'/alpha');return memory;
}
async function openSavedSettings(page:Page){
 await page.route('**/__settings_safety_models*',route=>route.fulfill({contentType:'text/html',body:settingsHtml}));
 await page.goto('/__settings_safety_models?mode=models&saved=all');
 const panel=page.getByTestId('intelligence-settings');await expect(panel.getByRole('combobox',{name:'智能管家模型',exact:true})).toBeVisible();
 await panel.getByTestId('intelligence-budget').locator('summary').click();return panel;
}
const provenanceCalls=(page:Page)=>page.evaluate(()=>(window as any).provenanceFixture.calls as string[]);
const settingsState=(page:Page)=>page.evaluate(()=>(window as any).settingsFixture.modelState() as {policy:{workspaces:string[]};calls:{op:string}[]});
const configuring=(value:{calls:{op:string}[]})=>value.calls.filter(call=>call.op==='configure');

test('deleting one memory requires inline confirmation and cancellation sends no forget request',async({page})=>{
 const memory=await openMemory(page),remove=memory.getByRole('button',{name:'删除这条记忆及派生摘要',exact:true});
 await remove.click();
 const confirmation=memory.getByTestId('forget-confirmation');await expect(confirmation).toBeVisible();
 await expect(confirmation).toContainText('删除这条记忆及派生摘要还会清空工作区 /alpha 的任务本、工具事实、提醒和来源时间线，且无法撤销。');
 expect(await provenanceCalls(page)).toEqual([]);
 await confirmation.getByRole('button',{name:'取消',exact:true}).click();await expect(confirmation).toHaveCount(0);expect(await provenanceCalls(page)).toEqual([]);
 await remove.click();await memory.getByTestId('forget-confirmation').getByRole('button',{name:'确认删除',exact:true}).click();
 await expect.poll(()=>provenanceCalls(page)).toEqual(['forget']);await expect(memory).not.toContainText('Alpha模型记忆');
});

test('deleting all workspace memory requires inline confirmation and cancellation sends no forget request',async({page})=>{
 const memory=await openMemory(page),remove=memory.getByRole('button',{name:'删除此工作区全部记忆与摘要',exact:true});
 await remove.click();
 const confirmation=memory.getByTestId('forget-confirmation');await expect(confirmation).toBeVisible();
 await expect(confirmation).toContainText('删除此工作区全部记忆与摘要还会清空工作区 /alpha 的任务本、工具事实、提醒和来源时间线，且无法撤销。');
 expect(await provenanceCalls(page)).toEqual([]);
 await confirmation.getByRole('button',{name:'取消',exact:true}).click();await expect(confirmation).toHaveCount(0);expect(await provenanceCalls(page)).toEqual([]);
 await remove.click();await memory.getByTestId('forget-confirmation').getByRole('button',{name:'确认删除',exact:true}).click();
 await expect.poll(()=>provenanceCalls(page)).toEqual(['forget']);
 await page.getByRole('button',{name:'打开任务本',exact:true}).click();
 const timeline=page.getByTestId('provenance-timeline');await timeline.locator('summary').first().click();
 await expect(timeline).toContainText('Beta任务事实');await expect(timeline).not.toContainText('Alpha任务事实');
});

test('saving revoked workspaces lists their data loss and cancellation preserves the draft',async({page})=>{
 const panel=await openSavedSettings(page);await selectControl(panel.getByRole('combobox',{name:'工作范围',exact:true}),'custom');await panel.getByLabel('允许理解 /beta',{exact:true}).uncheck();
 await panel.getByRole('button',{name:'仅保存配置',exact:true}).click();
 const confirmation=panel.getByTestId('revoke-workspaces-confirmation');await expect(confirmation).toBeVisible();
 await expect(confirmation).toContainText('撤销授权还会删除这些工作区已有记忆与摘要');await expect(confirmation.getByRole('listitem')).toHaveText(['/beta']);
 expect(configuring(await settingsState(page))).toEqual([]);
 await confirmation.getByRole('button',{name:'取消',exact:true}).click();await expect(confirmation).toHaveCount(0);
 await expect(panel.getByLabel('允许理解 /beta',{exact:true})).not.toBeChecked();await expect(panel.getByRole('button',{name:'仅保存配置',exact:true})).toBeEnabled();
 expect((await settingsState(page)).policy.workspaces).toEqual(['/alpha','/beta']);expect(configuring(await settingsState(page))).toEqual([]);
 await panel.getByRole('button',{name:'仅保存配置',exact:true}).click();await panel.getByTestId('revoke-workspaces-confirmation').getByRole('button',{name:'确认撤销并保存',exact:true}).click();
 await expect.poll(async()=>(await settingsState(page)).policy.workspaces).toEqual(['/alpha']);expect(configuring(await settingsState(page))).toHaveLength(1);
});

test('saving without revoked workspaces configures directly without another confirmation',async({page})=>{
 const panel=await openSavedSettings(page);
 await selectControl(panel.getByRole('combobox',{name:'智能管家模型',exact:true}),JSON.stringify(['first','thought']));
 await panel.getByRole('button',{name:'仅保存配置',exact:true}).click();
 await expect.poll(async()=>configuring(await settingsState(page)).length).toBe(1);
 await expect(panel.getByTestId('revoke-workspaces-confirmation')).toHaveCount(0);
});
