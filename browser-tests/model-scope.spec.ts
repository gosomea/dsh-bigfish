import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {selectControl} from './helpers/settings.js';

let html='';
test.beforeAll(async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('./fixtures/settings-components.tsx',import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',loader:{'.css':'text','.png':'dataurl'},plugins:[{name:'unused-model-settings-previews',setup(builder){
  builder.onResolve({filter:/\/(?:companion-canvas|life-program-preview)\.js$/},args=>({path:args.path,namespace:'unused-preview'}));
  builder.onLoad({filter:/.*/,namespace:'unused-preview'},()=>({contents:'export const CompanionCanvas=()=>null; export const LifeProgramPreview=()=>null;',loader:'js'}));
 }}]});
 html='<!doctype html><meta charset="utf-8"><div id="root"></div><script>'+result.outputFiles[0]!.text.replaceAll('</script','<\\/script')+'</script>';
});
async function open(page:Page,query=''){
 await page.route('**/__model_scope*',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('/__model_scope?mode=models'+query);
 const panel=page.getByTestId('intelligence-settings');await expect(panel.getByRole('combobox',{name:'智能管家模型',exact:true})).toBeVisible();return panel;
}
const state=(page:Page)=>page.evaluate(()=>(window as any).settingsFixture.modelState());
const mutating=(value:{calls:{op:string}[]})=>value.calls.filter(call=>call.op!=='configuration-options');
const pair=(provider:string,model:string)=>JSON.stringify([provider,model]);

test('a fresh setup preselects the current model and all existing workspaces without enabling or configuring intelligence',async({page})=>{
 const panel=await open(page);
 await expect(panel.getByRole('combobox',{name:'智能管家模型',exact:true})).toHaveAttribute('data-value',pair('first','fast'));
 await expect(panel.getByRole('combobox',{name:'工作范围',exact:true})).toHaveAttribute('data-value','all');
 await expect(panel.getByRole('button',{name:'确认并启用',exact:true})).toBeEnabled();
 await expect(panel.getByLabel('每日 token 上限',{exact:true})).not.toBeVisible();
 const current=await state(page);expect(current.policy).toMatchObject({enabled:false,provider:'',model:'',workspaces:[]});expect(current.used).toBe(0);expect(mutating(current)).toEqual([]);
});

test('choosing a grouped pet model saves its exact route and never changes the main session model',async({page})=>{
 const panel=await open(page,'&current=second'),combo=panel.getByRole('combobox',{name:'智能管家模型',exact:true});
 await expect(combo).toHaveAttribute('data-value',pair('second','craft'));
 await combo.click();const menu=page.getByRole('listbox',{name:'智能管家模型',exact:true});
 await expect(menu).toContainText('First Provider');await expect(menu).toContainText('Second Provider');await combo.press('Escape');
 await selectControl(combo,pair('first','thought'));expect(mutating(await state(page))).toEqual([]);
 await panel.getByTestId('intelligence-budget').locator('summary').click();
 await panel.getByRole('button',{name:'仅保存配置',exact:true}).click();
 await expect.poll(async()=>(await state(page)).policy.model).toBe('thought');
 const current=await state(page);expect(current.policy).toMatchObject({provider:'first',model:'thought',workspaces:['/alpha','/beta'],enabled:false});
 expect(current.mainSelection).toEqual({provider:'second',model:'craft'});expect(mutating(current).map(call=>call.op)).toEqual(['configure']);expect(current.used).toBe(0);
});

test('the single enable action authorizes exactly the preselected model and scope, and closing retains both',async({page})=>{
 const panel=await open(page),enable=panel.getByRole('button',{name:'确认并启用',exact:true});
 await expect(enable).toBeEnabled();
 expect((await state(page)).policy).toMatchObject({enabled:false,provider:'',model:'',workspaces:[]});expect(mutating(await state(page))).toEqual([]);
 await enable.click();
 await expect.poll(async()=>(await state(page)).policy.enabled).toBe(true);
 const current=await state(page);expect(current.policy).toMatchObject({enabled:true,provider:'first',model:'fast',workspaces:['/alpha','/beta']});expect(current.used).toBe(0);expect(mutating(current).map(call=>call.op)).toEqual(['configure']);
 await panel.getByRole('button',{name:'关闭智能模式',exact:true}).click();
 await expect.poll(async()=>(await state(page)).policy.enabled).toBe(false);
 expect((await state(page)).policy).toMatchObject({provider:'first',model:'fast',workspaces:['/alpha','/beta']});
});

test('an existing custom model and workspace selection survive edits, save and reload',async({page})=>{
 const panel=await open(page,'&saved=custom');
 await expect(panel.getByRole('combobox',{name:'智能管家模型',exact:true})).toHaveAttribute('data-value',pair('second','craft'));
 await expect(panel.getByRole('combobox',{name:'工作范围',exact:true})).toHaveAttribute('data-value','custom');
 await expect(panel.getByLabel('允许理解 /alpha',{exact:true})).not.toBeChecked();await expect(panel.getByLabel('允许理解 /beta',{exact:true})).toBeChecked();
 await panel.getByLabel('允许理解 /alpha',{exact:true}).check();await panel.getByLabel('允许理解 /beta',{exact:true}).uncheck();
 expect((await state(page)).policy.workspaces).toEqual(['/beta']);
 await panel.getByTestId('intelligence-budget').locator('summary').click();
 await panel.getByRole('button',{name:'仅保存配置',exact:true}).click();
 await expect(panel.getByTestId('revoke-workspaces-confirmation')).toBeVisible();
 expect((await state(page)).policy.workspaces).toEqual(['/beta']);
 await panel.getByRole('button',{name:'确认撤销并保存',exact:true}).click();
 await expect.poll(async()=>(await state(page)).policy.workspaces).toEqual(['/alpha']);
 await page.reload();await expect(panel.getByRole('combobox',{name:'工作范围',exact:true})).toHaveAttribute('data-value','custom');
 await expect(panel.getByLabel('允许理解 /alpha',{exact:true})).toBeChecked();await expect(panel.getByLabel('允许理解 /beta',{exact:true})).not.toBeChecked();
 await expect(panel.getByRole('combobox',{name:'智能管家模型',exact:true})).toHaveAttribute('data-value',pair('second','craft'));expect((await state(page)).policy.enabled).toBe(false);
});

test('task book has a separate view and switching views preserves the unsaved model',async({page})=>{
 const panel=await open(page),model=panel.getByRole('combobox',{name:'智能管家模型',exact:true});
 await selectControl(model,pair('first','thought'));
 await panel.getByRole('button',{name:'打开任务本',exact:true}).click();
 await expect(panel.getByTestId('intelligence-tasks')).toBeVisible();
 await expect(model).toBeHidden();
 await expect(panel.getByRole('button',{name:'理解任务 · 消耗 token',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'返回智能设置',exact:true}).click();
 await expect(model).toHaveAttribute('data-value',pair('first','thought'));
 expect(mutating(await state(page))).toEqual([]);
});

test('refreshing a new workspace does not expand the saved authorization range',async({page})=>{
 const panel=await open(page,'&saved=all');await expect(panel.getByRole('combobox',{name:'工作范围',exact:true})).toHaveAttribute('data-value','all');
 await page.evaluate(()=>(window as any).settingsFixture.addWorkspace());await panel.getByRole('button',{name:'刷新模型和工作区',exact:true}).click();
 await expect(panel.getByRole('combobox',{name:'工作范围',exact:true})).toHaveAttribute('data-value','custom');
 await expect(panel.getByLabel('允许理解 /gamma',{exact:true})).not.toBeChecked();expect((await state(page)).policy.workspaces).toEqual(['/alpha','/beta']);expect(mutating(await state(page))).toEqual([]);
});

test('an unavailable catalog preserves the saved model and makes no model or configuration call',async({page})=>{
 const panel=await open(page,'&saved=missing&catalogError=1');
 await expect(panel.getByRole('combobox',{name:'智能管家模型',exact:true})).toHaveAttribute('data-value',pair('retired','old-model'));
 await expect(panel.getByText('无法读取 DSH 模型和工作区，请重试。',{exact:true})).toBeVisible();
 expect((await state(page)).policy).toMatchObject({enabled:false,provider:'retired',model:'old-model',workspaces:['/beta']});expect(mutating(await state(page))).toEqual([]);
});

test('a delayed old catalog cannot replace a new Host model or workspace list',async({page})=>{
 const panel=await open(page);await expect(panel.getByRole('combobox',{name:'智能管家模型',exact:true})).toHaveAttribute('data-value',pair('first','fast'));
 await page.evaluate(()=>(window as any).settingsFixture.holdOptions());await panel.getByRole('button',{name:'刷新模型和工作区',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).settingsFixture.heldOptions())).toBe(1);
 await page.evaluate(()=>(window as any).settingsFixture.switchModelHost());
 await expect(panel.getByRole('combobox',{name:'智能管家模型',exact:true})).toHaveAttribute('data-value',pair('new-provider','new-default'));
 await page.evaluate(()=>(window as any).settingsFixture.releaseOptions());
 await expect(panel.getByRole('combobox',{name:'智能管家模型',exact:true})).toHaveAttribute('data-value',pair('new-provider','new-default'));
 await selectControl(panel.getByRole('combobox',{name:'工作范围',exact:true}),'custom');
 await expect(panel.getByLabel('允许理解 /new-host',{exact:true})).toBeVisible();await expect(panel.getByLabel('允许理解 /alpha',{exact:true})).toHaveCount(0);
 expect((await state(page)).policy).toMatchObject({enabled:false,provider:'',model:'',workspaces:[]});expect(mutating(await state(page))).toEqual([]);
});
