import {test,expect,type Page,type Locator} from '@playwright/test';
import {readFile,readdir} from 'node:fs/promises';
import {writeZip} from '../src/pet/archive.js';
import {roleLibrary,lifeSettings,selectControl,settingOptions} from './helpers/settings.js';
import {lifeActions} from './helpers/interactions.js';

async function roleBytes(paired:boolean){
 const files:Record<string,Uint8Array>={};for(const name of await readdir('examples/bigfish-adult'))files[name]=new Uint8Array(await readFile(`examples/bigfish-adult/${name}`));
 const manifest=JSON.parse(new TextDecoder().decode(files['pet.json']!));
 manifest.id=paired?'buddy-azure':'buddy-still';manifest.name=paired?'蓝蓝伙伴':'未提供双宠的伙伴';
 if(paired){manifest.capabilities.push('paired');manifest.body={bounds:{x:0,y:0,width:372,height:512},foot:{x:186,y:500}};manifest.behaviors={paired:{greet:'adult:idle',exchange:'adult:typing',part:'adult:success'}};}
 files['pet.json']=new TextEncoder().encode(JSON.stringify(manifest));return Buffer.from(writeZip(files));
}
async function start(page:Page,partnerRole='builtin'){
 let requests=0;page.on('request',r=>{if(/\/api\/bigfish-companion|\/chat\/completions|\/responses(?:\?|$)/.test(r.url()))requests++;});
 await page.addInitScript(role=>{if(!localStorage.getItem('bigfish.demo.preferences.v1'))localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'quiet',whipEnabled:false,richness:2,sceneryVisible:false,lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'all',groups:{body:true,play:true,steward:true,memory:true,home:true,growth:true,adventures:true,perception:true},movement:'fixed',pairEnabled:true,partnerRole:role})}));},partnerRole);
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();await roleLibrary(page);
 return {requests:()=>requests};
}
async function importRole(page:Page,paired:boolean){
 await page.getByLabel('角色包文件').setInputFiles({name:'local-buddy.dshpet',mimeType:'application/zip',buffer:await roleBytes(paired)});
 await expect(page.getByLabel('角色动作预览')).toBeVisible();await page.getByRole('button',{name:'安装并使用',exact:true}).click();
 await expect(page.getByText('角色已安装并使用',{exact:true})).toBeVisible();
}
async function widgetSettings(page:Page,pet:Locator){
 if(!await pet.locator('.bf-popover').isVisible())await pet.getByRole('button',{name:'设置',exact:true}).click();
 const full=pet.getByRole('button',{name:'完整设置',exact:true});if(await full.count())await full.click();await lifeSettings(pet);
 return pet.getByTestId('partner-settings');
}
async function invite(pet:Locator){
 const life=await lifeActions(pet);
 return life.getByRole('button',{name:'邀请小伙伴 · 本地双宠链',exact:true});
}
async function untilMotion(page:Page,canvas:Locator,motion:string){
 await expect.poll(async()=>{await page.clock.runFor(200);return canvas.getAttribute('data-motion');},{timeout:15000,intervals:[15]}).toBe(motion);
}

test('a different installed buddy renders its own authored phases in both primary-role directions without a second model client',async({page})=>{
 test.setTimeout(60000);const {requests}=await start(page);await importRole(page,true);
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const pet=page.getByTestId('bigfish-widget');await expect(pet.locator('canvas').first()).toHaveAttribute('data-pet','buddy-azure');
 const settings=await widgetSettings(page,pet);await selectControl(settings.getByLabel('小伙伴角色',{exact:true}),'builtin');
 await expect(settings).toContainText('双方招呼、互动和告别素材已就绪');await pet.getByRole('button',{name:'关闭',exact:true}).click();
 await page.clock.install();await (await invite(pet)).click();
 const secondary=pet.locator('.bf-paired-pet');await expect(secondary).toHaveAttribute('data-partner','builtin');
 await untilMotion(page,secondary.locator('canvas'),'wave');await expect(pet.locator('canvas').first()).toHaveAttribute('data-pet','buddy-azure');
 // Changing the primary cancels the previous pair; selecting a buddy never selects it as primary.
 await widgetSettings(page,pet);await roleLibrary(pet);await pet.getByRole('button',{name:'使用大肥鱼',exact:true}).click();
 await lifeSettings(pet);const buddy=pet.getByTestId('partner-settings');await selectControl(buddy.getByLabel('小伙伴角色',{exact:true}),'buddy-azure@1.0.0');
 await expect(buddy).toContainText('双方招呼、互动和告别素材已就绪');await buddy.getByRole('button',{name:'预览伙伴动作',exact:true}).click();
 await expect(buddy.getByLabel('伙伴动作预览').locator('canvas')).toHaveAttribute('data-pet','buddy-azure');
 await expect(page.locator('.bf-demo-stage canvas')).not.toHaveAttribute('data-pet');
 await pet.getByRole('button',{name:'关闭',exact:true}).click();await expect(pet.locator('.bf-paired-pet')).toHaveCount(0);
 await (await invite(pet)).click();await expect(secondary).toHaveAttribute('data-partner','buddy-azure@1.0.0');
 const canvas=secondary.locator('canvas');await untilMotion(page,canvas,'adult:idle');await expect(canvas).toHaveAttribute('data-pet','buddy-azure');
 const first=await canvas.getAttribute('data-frame');await expect.poll(async()=>{await page.clock.runFor(200);return canvas.getAttribute('data-frame');}).not.toBe(first);
 await untilMotion(page,canvas,'adult:typing');
 await untilMotion(page,pet.locator('canvas').first(),'tea');await expect(pet.locator('.bf-dialogue-text')).toContainText('分一杯茶');
 await untilMotion(page,canvas,'adult:success');
 const bounds=await canvas.getAttribute('data-bounds');await page.clock.runFor(200);await expect(canvas).toHaveAttribute('data-bounds',bounds!);
 expect(requests()).toBe(0);expect(await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).lifestyleJson).partnerRole)).toBe('buddy-azure@1.0.0');
});

test('missing or incompatible buddy artwork disables invitation while keeping the choice and a truthful material preview',async({page})=>{
 test.setTimeout(60000);const {requests}=await start(page,'missing-buddy@1.0.0');await importRole(page,false);
 await page.getByRole('button',{name:'使用大肥鱼',exact:true}).click();await lifeSettings(page);
 const settings=page.getByTestId('partner-settings');await expect(settings).toContainText('尚未安装或已移除');
 await expect((await settingOptions(settings.getByLabel('小伙伴角色',{exact:true}))).filter({hasText:'未安装 · missing-buddy@1.0.0'})).toBeVisible();await page.keyboard.press('Escape');
 await selectControl(settings.getByLabel('小伙伴角色',{exact:true}),'buddy-still@1.0.0');await expect(settings).toContainText('缺少当前动作档位下已解锁');
 await settings.getByRole('button',{name:'预览伙伴动作',exact:true}).click();await expect(settings.getByLabel('伙伴动作预览').locator('canvas')).toHaveAttribute('data-pet','buddy-still');
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const pet=page.getByTestId('bigfish-widget');
 await expect(await invite(pet)).toBeDisabled();await expect(pet.getByTestId('life-actions')).toContainText('缺少当前动作档位下已解锁');await expect(pet.locator('.bf-paired-pet')).toHaveCount(0);
 await widgetSettings(page,pet);await roleLibrary(pet);await pet.getByRole('button',{name:'移除',exact:true}).click();await lifeSettings(pet);
 await expect(pet.getByTestId('partner-settings')).toContainText('尚未安装或已移除');
 await pet.getByRole('button',{name:'关闭',exact:true}).click();await expect(await invite(pet)).toBeDisabled();
 expect(await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).lifestyleJson).partnerRole)).toBe('buddy-still@1.0.0');expect(requests()).toBe(0);
});
