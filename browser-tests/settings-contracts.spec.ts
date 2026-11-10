import {settingsDisclosure,lifeSettings} from './helpers/settings.js';
import {lifeActions} from './helpers/interactions.js';
import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

let fixtureHTML='';
test.beforeAll(async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('./fixtures/settings-components.tsx',import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',loader:{'.css':'text','.png':'dataurl'},plugins:[{
  name:'unused-settings-previews',setup(builder){
   // These tests never play a clip. Keep bitmap-heavy preview modules outside the component fixture.
   builder.onResolve({filter:/\/(?:companion-canvas|life-program-preview)\.js$/},args=>({path:args.path,namespace:'unused-settings-preview'}));
   builder.onLoad({filter:/.*/,namespace:'unused-settings-preview'},()=>({contents:'export const CompanionCanvas=()=>null; export const LifeProgramPreview=()=>null;',loader:'js'}));
  },
 }]});
 fixtureHTML='<!doctype html><html><meta charset="utf-8"><div id="root"></div><script>'+bundle.outputFiles[0]!.text.replaceAll('</script','<\\/script')+'</script></html>';
});
async function components(page:Page,mode='life'){
 await page.route('**/__settings_components**',route=>route.fulfill({contentType:'text/html',body:fixtureHTML}));
 await page.goto(`/__settings_components?mode=${mode}`);
}

test('life request failures stay visible in their own section and keep the delete confirmation open',async({page})=>{
 await components(page);const life=page.getByTestId('life-settings');await life.locator('summary').first().click();
 await life.getByRole('button',{name:'清空相处记录',exact:true}).click();
 await life.getByRole('button',{name:'确认清空相处记录',exact:true}).click();
 await expect(life.getByRole('alert')).toContainText('清空失败');await expect(life.getByRole('group',{name:'确认清空相处记录'})).toBeVisible();
 await expect(page.getByTestId('intelligence-settings')).not.toHaveAttribute('open','');
 await page.evaluate(()=>(window as any).settingsFixture.retryClear());
 await life.getByRole('button',{name:'确认清空相处记录',exact:true}).click();
 await expect(life.getByRole('group',{name:'确认清空相处记录'})).toHaveCount(0);await expect(life.getByRole('status').filter({hasText:'相处记录已清空'})).toContainText('相处记录已清空');
 await life.getByRole('button',{name:'移除明信片',exact:true}).click();await expect(life.getByRole('alert')).toContainText('明信片移除失败');
 expect(await page.evaluate(()=>(window as any).settingsFixture.calls.map((c:any)=>c.op).filter((op:string)=>op!=='configuration-options'))).toEqual(['clear-diary','clear-diary','remove-collection']);
});

test('intelligence number drafts validate at save and do not dispatch invalid settings',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await components(page);
 const intelligence=page.getByTestId('intelligence-settings');await intelligence.locator('summary').first().click();
 await intelligence.getByTestId('intelligence-budget').locator('summary').click();
 const number=intelligence.getByLabel('每日 token 上限',{exact:true});await number.fill('');await expect(number).toHaveValue('');
 await number.pressSequentially('1200');await intelligence.getByRole('button',{name:'仅保存配置',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).settingsFixture.calls.filter((c:any)=>c.op==='configure').length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).settingsFixture.calls.find((c:any)=>c.op==='configure').body.policy.dailyTokens)).toBe(1200);
 await number.fill('');await intelligence.getByRole('button',{name:'仅保存配置',exact:true}).click();
 await expect(intelligence.getByTestId('intelligence-feedback')).toContainText('请输入 1000–1000000 的整数');
 expect(await page.evaluate(()=>(window as any).settingsFixture.calls.filter((c:any)=>c.op==='configure').length)).toBe(1);expect(errors).toEqual([]);
});

test('intelligence overview exposes model and scope while paid permission stays off and advanced forms stay collapsed',async({page})=>{
 await components(page);const intelligence=page.getByTestId('intelligence-settings');await intelligence.locator('summary').first().click();
 await expect(intelligence.getByRole('region',{name:'智能模式状态'})).toContainText('普通模式');
 await expect(intelligence.getByRole('combobox',{name:'智能管家模型',exact:true})).toBeVisible();
 await expect(intelligence.getByRole('combobox',{name:'工作范围',exact:true})).toBeVisible();
 await expect(intelligence.getByLabel('每日 token 上限',{exact:true})).toBeHidden();
 await expect(intelligence.getByLabel('确认长期偏好',{exact:true})).toBeHidden();
 await expect(intelligence.getByRole('button',{name:'确认并启用',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).settingsFixture.calls.filter((c:any)=>c.op!=='configuration-options').length)).toBe(0);
});

test('local actions are explicit and rejected performances stay in the interaction menu',async({page})=>{
 await components(page,'actions');const actions=page.getByTestId('life-actions');
 expect(await page.evaluate(()=>(window as any).settingsFixture.localActions)).toEqual([]);
 await actions.getByRole('button',{name:'递茶',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).settingsFixture.localActions)).toEqual([{kind:'tea'}]);
 await actions.getByRole('button',{name:'邀请小伙伴 · 本地双宠链',exact:true}).click();
 await expect(actions.getByRole('status')).toContainText('眼前还有重要的事');
 expect(await page.evaluate(()=>(window as any).settingsFixture.localActions)).toEqual([{kind:'tea'},{kind:'paired'}]);
 expect(await page.evaluate(()=>(window as any).settingsFixture.calls)).toEqual([]);
});

test('desktop polling preserves empty/default drafts and a Host switch fences an old environment response',async({page})=>{
 await page.clock.install();await components(page,'desktop');const desktop=page.getByTestId('desktop-settings');await desktop.locator('summary').first().click();
 const endpoint=desktop.getByLabel('桌面转写端点'),model=desktop.getByLabel('语音模型',{exact:true}),key=desktop.locator('input[type=password]');
 await expect(endpoint).toHaveValue('https://old.invalid/transcribe');await endpoint.fill('');await model.fill('whisper-1');await key.fill('fixture-secret');
 await page.clock.fastForward(10000);await expect(endpoint).toHaveValue('');await expect(model).toHaveValue('whisper-1');await expect(key).toHaveValue('fixture-secret');
 await endpoint.fill('https://saved.invalid/transcribe');await desktop.getByRole('button',{name:'保存本机语音服务',exact:true}).click();
 await expect(key).toHaveValue('');expect(await page.evaluate(()=>(window as any).settingsFixture.calls[0].body.model)).toBe('whisper-1');
 await endpoint.fill('https://unsaved.invalid/transcribe');await key.fill('unsaved-secret');
 await page.evaluate(()=>(window as any).settingsFixture.holdEnvironment());await page.clock.fastForward(10000);
 await page.evaluate(()=>(window as any).settingsFixture.switchHost());await expect(endpoint).toHaveValue('https://new-host.invalid/transcribe');await expect(key).toHaveValue('');
 await page.evaluate(()=>(window as any).settingsFixture.releaseOld());await expect(endpoint).toHaveValue('https://new-host.invalid/transcribe');await expect(model).toHaveValue('new-model');
});

async function openWidget(page:Page){
 await page.addInitScript(()=>{localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'quiet',lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'all',groups:{growth:true,adventures:true,play:true},movement:'fixed',growthUnlocks:true,pairEnabled:true})}));});
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const pet=page.getByTestId('bigfish-widget');await pet.getByRole('button',{name:'设置',exact:true}).click();await pet.getByRole('button',{name:'完整设置',exact:true}).click();
 await lifeSettings(pet);
 const life=pet.getByTestId('life-settings');if(await life.locator(':scope > summary').count())await life.locator(':scope > summary').click();return {pet,life};
}
test('story interval text is editable and only a valid explicit save changes preferences',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const {life}=await openWidget(page);
 await life.getByText('成长规则',{exact:true}).click();await life.getByLabel('成长故事自动演出').check();await life.getByText('高级 · 故事冷却',{exact:true}).click();const number=life.getByLabel('故事最短冷却 · 分钟',{exact:true});
 await number.fill('');await expect(number).toHaveValue('');await number.pressSequentially('20');
 const saved=()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).lifestyleJson).storyMinutes);
 expect(await saved()).toBe(60);await life.getByRole('button',{name:'保存故事冷却',exact:true}).click();await expect.poll(saved).toBe(20);
 await number.fill('14');await life.getByRole('button',{name:'保存故事冷却',exact:true}).click();await expect(life.getByRole('alert')).toContainText('请输入 15–1440 的整数');expect(await saved()).toBe(20);expect(errors).toEqual([]);
});
test('turning groups off suspends saved growth locks and blocks paired invitations in the actual Widget',async({page})=>{
 const {pet,life}=await openWidget(page);await settingsDisclosure(pet,'高级与数据','自定义能力');const lifestyle=pet.getByTestId('custom-capabilities');
 await lifestyle.getByLabel('成长与故事',{exact:true}).uncheck();await lifestyle.getByLabel('桌面奇遇',{exact:true}).uncheck();
 await lifeSettings(pet);await expect(life).toContainText('成长解锁与自动故事暂不生效');await expect(life.getByLabel('允许邀请小伙伴',{exact:true})).toBeDisabled();
 const stored=await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).lifestyleJson));expect(stored.growthUnlocks).toBe(true);expect(stored.pairEnabled).toBe(true);
 await lifeActions(pet);const toys=pet.getByTestId('pet-playground');await toys.locator('summary').click();await toys.getByRole('button',{name:'点垫子抛球，也可按回车键'}).press('Enter');
 await expect(pet.locator('canvas').first()).toHaveAttribute('data-motion','ball-catch');await expect(pet.locator('.bf-paired-pet')).toHaveCount(0);
});
