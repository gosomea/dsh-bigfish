import {lifeSettings,selectControl} from './helpers/settings.js';
import {lifeActions,wave} from './helpers/interactions.js';
import {test,expect,type Page,type Locator} from '@playwright/test';

async function openPet(page:Page,{growthUnlocks=false}={}){
 let serviceRequests=0;
 page.on('request',request=>{if(/\/api\/bigfish-companion|\/chat\/completions|\/responses(?:\?|$)/.test(request.url()))serviceRequests++;});
 await page.addInitScript(({locked})=>{
  Math.random=()=>.5;
  if(!localStorage.getItem('bigfish.demo.preferences.v1'))localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'quiet',whipEnabled:false,lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'all',groups:{body:true,play:true,steward:true,memory:true,home:true,growth:true,adventures:true,perception:true},movement:'fixed',homeVisible:false,pairEnabled:true,growthUnlocks:locked,storyAutomatic:false})}));
 },{locked:growthUnlocks});
 await page.clock.install({time:new Date('2026-10-29T04:00:00Z')});
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const pet=page.getByTestId('bigfish-widget');
 await expect(pet.locator('canvas')).toHaveAttribute('data-motion',/.+/);
 return {pet,requests:()=>serviceRequests};
}
async function openLifeSettings(pet:Locator){
 if(!await pet.locator('.bf-popover').isVisible())await pet.getByRole('button',{name:'设置',exact:true}).click();
 if(await pet.getByRole('button',{name:'完整设置',exact:true}).count())await pet.getByRole('button',{name:'完整设置',exact:true}).click();
 await lifeSettings(pet);
 const life=pet.getByTestId('life-settings'),summary=life.locator(':scope > summary');
 if(await summary.count()&&await life.getAttribute('open')===null)await summary.click();
 return life;
}
async function openLifeActions(pet:Locator){
 return lifeActions(pet);
}
/** Decode is native, so advance in bounded pieces until the requested authored frames are really drawn. */
async function untilMotion(page:Page,pet:Locator,motion:string){
 const canvas=pet.locator('canvas').first();
 await expect.poll(async()=>{await page.clock.runFor(200);return canvas.getAttribute('data-motion');},{timeout:15000,intervals:[25]}).toBe(motion);
}
async function untilPairGone(page:Page,pet:Locator){
 await expect.poll(async()=>{await page.clock.runFor(200);return pet.locator('.bf-paired-pet').count();},{timeout:15000,intervals:[25]}).toBe(0);
}

test('a selected outfit is rendered on the actual Widget and survives reload without model calls',async({page})=>{
 const {pet,requests}=await openPet(page),life=await openLifeSettings(pet);
 await selectControl(life.getByLabel('角色装扮'),'sailor-bow');
 await pet.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(pet.getByRole('img',{name:'佩戴浅海蝴蝶结',exact:true})).toBeVisible();
 await expect(pet.locator('.bf-outfit-layer path')).toHaveCount(1);
 await test.info().attach('widget-local-outfit',{body:await pet.screenshot(),contentType:'image/png'});
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 await expect(pet.getByRole('img',{name:'佩戴浅海蝴蝶结',exact:true})).toBeVisible();
 expect(requests()).toBe(0);
});

test('growth locks block an unearned paired chain and direct toy reaction; disabling locks really enables it',async({page})=>{
 const {pet,requests}=await openPet(page,{growthUnlocks:true}),life=await openLifeSettings(pet);
 await life.getByText('成长规则',{exact:true}).click();
 await expect(life.getByLabel('成长动作解锁')).toBeChecked();
 await expect(life).toContainText('接球：5 次互动 · 尚未解锁');
 let actions=await openLifeActions(pet);
 await expect(actions.getByRole('button',{name:'邀请小伙伴 · 本地双宠链',exact:true})).toBeDisabled();
 await expect(actions).toContainText('双宠分享在 20 次真实互动后解锁');
 await expect(pet.locator('.bf-paired-pet')).toHaveCount(0);
 const toys=pet.getByTestId('pet-playground');await toys.locator('summary').click();
 await toys.getByRole('button',{name:'点垫子抛球，也可按回车键'}).press('Enter');await page.clock.runFor(200);
 await expect(toys).toContainText('先等她处理完眼前的事，再一起玩吧。');
 await expect(pet.locator('canvas')).not.toHaveAttribute('data-motion','ball-catch');
 await openLifeSettings(pet);await life.getByLabel('成长动作解锁').uncheck();
 await expect(life.getByLabel('成长动作解锁')).not.toBeChecked();
 actions=await openLifeActions(pet);await actions.getByRole('button',{name:'邀请小伙伴 · 本地双宠链',exact:true}).click();
 await untilMotion(page,pet,'wave');await expect(pet.locator('.bf-paired-pet')).toBeVisible();
 expect(requests()).toBe(0);
});

test('one Widget plays both real actors through greeting, exchange, tea and farewell then returns to quiet',async({page})=>{
 test.setTimeout(90000);
 const {pet,requests}=await openPet(page),actions=await openLifeActions(pet);
 await actions.getByRole('button',{name:'邀请小伙伴 · 本地双宠链',exact:true}).click();
 await untilMotion(page,pet,'wave');
 await expect(pet.locator('canvas')).toHaveCount(2);await expect(pet.locator('.bf-paired-pet canvas')).toHaveAttribute('data-motion','wave');
 await expect(pet.locator('.bf-dialogue-text')).toContainText('宠物剧情（虚构）');
 await page.clock.runFor(2700);
 await expect(pet.locator('canvas').first()).toHaveAttribute('data-frame','7');
 await expect(pet.locator('canvas').first()).toHaveAttribute('data-phase','hold');
 await untilMotion(page,pet,'ball-catch');
 await expect(pet.locator('.bf-paired-pet canvas')).toHaveAttribute('data-motion','fish-toy');
 await expect(pet.getByRole('img',{name:'在两只宠物边界之间来回传递的小球'})).toBeVisible();
 await page.clock.runFor(2700);await expect(pet.locator('canvas').first()).toHaveAttribute('data-frame','7');
 await page.clock.runFor(2000);await expect(pet.locator('canvas').first()).toHaveAttribute('data-motion','ball-catch');
 await untilMotion(page,pet,'tea');await expect(pet.locator('.bf-paired-pet canvas')).toHaveAttribute('data-motion','biscuit');
 await expect(pet.locator('.bf-dialogue-text')).toContainText('分一杯茶');
 await untilMotion(page,pet,'wave');await expect(pet.locator('.bf-dialogue-text')).toContainText('下次再玩');
 await untilPairGone(page,pet);await page.clock.fastForward(20000);
 await expect(pet.locator('.bf-paired-pet')).toHaveCount(0);await expect(pet.locator('canvas')).toHaveCount(1);
 await expect(pet.locator('.bf-dialogue-text')).toHaveCount(0);
 expect(requests()).toBe(0);
});

test('direct interaction, a waiting task and new work preempt a paired performance without replaying it',async({page})=>{
 const {pet,requests}=await openPet(page);let actions=await openLifeActions(pet);
 await actions.getByRole('button',{name:'邀请小伙伴 · 本地双宠链',exact:true}).click();
 await untilMotion(page,pet,'wave');await expect(pet.locator('.bf-paired-pet')).toBeVisible();
 await wave(pet);await page.clock.runFor(200);
 await expect(pet.locator('.bf-paired-pet')).toHaveCount(0);await expect(pet.locator('.bf-dialogue-text')).toContainText('我在这里');
 await page.clock.runFor(8500);actions=await openLifeActions(pet);
 await actions.getByRole('button',{name:'邀请小伙伴 · 本地双宠链',exact:true}).click();
 await untilMotion(page,pet,'wave');await expect(pet.locator('.bf-paired-pet')).toBeVisible();
 await page.locator('#demo-state').selectOption('waiting-user');await page.clock.runFor(200);
 await expect(pet.locator('.bf-paired-pet')).toHaveCount(0);await expect(pet.locator('.bf-state')).toContainText('等你确认');
 await page.locator('#demo-state').selectOption('idle');await page.clock.runFor(200);actions=await openLifeActions(pet);
 await actions.getByRole('button',{name:'邀请小伙伴 · 本地双宠链',exact:true}).click();
 await untilMotion(page,pet,'wave');await expect(pet.locator('.bf-paired-pet')).toBeVisible();
 await page.locator('#demo-state').selectOption('generating');await page.clock.runFor(200);
 await expect(pet.locator('.bf-paired-pet')).toHaveCount(0);await expect(pet.locator('.bf-state')).toContainText('正在输出');
 await page.locator('#demo-state').selectOption('idle');await page.clock.fastForward(20000);
 await expect(pet.locator('.bf-paired-pet')).toHaveCount(0);await expect(pet.locator('canvas')).toHaveCount(1);
 expect(requests()).toBe(0);
});
