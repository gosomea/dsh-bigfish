import {settingsDisclosure,selectControl} from './helpers/settings.js';
import {test,expect} from '@playwright/test';
test('painted themes and each furniture switch affect the actual pet stage without inference',async({page})=>{
 let calls=0;page.on('request',r=>{if(r.url().includes('/api/bigfish-companion'))calls++;});
 await page.addInitScript(()=>{if(!localStorage.getItem('bigfish.demo.preferences.v1'))localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'quiet',lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'growing',groups:{home:true,growth:true},movement:'fixed'})}));});
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const pet=page.getByTestId('bigfish-widget');
 const scene=pet.locator('.bf-home');await expect(scene).toHaveAttribute('data-art','painted');await expect(scene).toHaveAttribute('data-theme','sea');
 const decoded=await scene.locator(':scope > image').evaluate(async el=>{const im=new Image();im.src=el.getAttribute('href')!;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);return {width:im.width,alpha:ctx.getImageData(Math.floor(im.width*.8),Math.floor(im.height*.4),1,1).data[3]};});expect(decoded.width).toBeGreaterThan(1000);expect(decoded.alpha).toBe(0);
 await pet.getByRole('button',{name:'设置',exact:true}).click();await pet.getByRole('button',{name:'完整设置',exact:true}).click();const settings=pet.locator('.bf-popover');await settingsDisclosure(settings,'外观与生活','小窝布置');
 await selectControl(settings.getByLabel('小窝主题',{exact:true}),'night');await expect(scene).toHaveAttribute('data-theme','night');
 await selectControl(settings.getByLabel('小窝主题',{exact:true}),'garden');await expect(scene).toHaveAttribute('data-theme','garden');
 await expect(scene.locator('[data-scene-prop="bed"]')).toHaveCount(1);await settings.getByLabel('小床',{exact:true}).uncheck();await expect(scene.locator('[data-scene-prop="bed"]')).toHaveCount(0);
 await settings.getByRole('button',{name:'关闭',exact:true}).click();await page.locator('#demo-state').selectOption('tool-running');await expect(scene).toHaveAttribute('data-context','work');
 await pet.getByRole('button',{name:'设置',exact:true}).click();await pet.getByRole('button',{name:'完整设置',exact:true}).click();await settingsDisclosure(settings,'外观与生活','小窝布置');
 for(const [name,id]of [['灯','lamp'],['书桌','desk']]){await expect(scene.locator(`[data-scene-prop="${id}"]`)).toHaveCount(1);await settings.getByLabel(name!,{exact:true}).uncheck();await expect(scene.locator(`[data-scene-prop="${id}"]`)).toHaveCount(0);}
 await settings.getByRole('button',{name:'关闭',exact:true}).click();await pet.screenshot({path:'artifacts/companion/painted-garden-widget.png'});expect(calls).toBe(0);
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await expect(page.getByTestId('bigfish-widget').locator('.bf-home')).toHaveAttribute('data-theme','garden');await expect(page.getByTestId('bigfish-widget').locator('.bf-home [data-scene-prop]')).toHaveCount(0);
});

test('the scene visibility switch hides both pet surfaces, persists, and preserves the saved home arrangement',async({page})=>{
 let calls=0;page.on('request',request=>{if(request.url().includes('/api/bigfish-companion'))calls++;});
 await page.addInitScript(()=>{if(!localStorage.getItem('bigfish.demo.preferences.v1'))localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'quiet',whipEnabled:false,lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'growing',movement:'fixed',groups:{home:true},theme:'garden',homeVisible:true,bed:true,desk:false,lamp:true})}));});
 await page.goto('/');const main=page.locator('.bf-demo-pet-scene');await expect(main.locator('.bf-home')).toHaveAttribute('data-theme','garden');
 await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const pet=page.getByTestId('bigfish-widget');await expect(pet.locator('.bf-home')).toBeVisible();
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!)),before=(await saved()).lifestyleJson;
 await pet.getByRole('button',{name:'设置',exact:true}).click();const quick=pet.locator('.bf-popover'),visibility=quick.getByRole('checkbox',{name:'显示场景',exact:true});await expect(visibility).toBeChecked();await visibility.uncheck();
 await expect(main.locator('.bf-home')).toHaveCount(0);await expect(pet.locator('.bf-home')).toHaveCount(0);await expect(main.locator('canvas')).toBeVisible();await expect(pet.locator('canvas')).toBeVisible();
 expect((await saved()).sceneryVisible).toBe(false);expect((await saved()).lifestyleJson).toBe(before);
 await quick.getByRole('button',{name:'完整设置',exact:true}).click();await settingsDisclosure(quick,'外观与生活','小窝布置');await expect(quick.getByText('场景显示已关闭，布置仍会保存；在日常陪伴开启“显示场景”后恢复显示。',{exact:true})).toBeVisible();
 await page.reload();await expect(main.locator('.bf-home')).toHaveCount(0);await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await expect(pet.locator('.bf-home')).toHaveCount(0);
 await pet.getByRole('button',{name:'设置',exact:true}).click();await expect(visibility).not.toBeChecked();await visibility.check();await expect(main.locator('.bf-home')).toHaveAttribute('data-theme','garden');await expect(pet.locator('.bf-home')).toHaveAttribute('data-theme','garden');
 expect((await saved()).lifestyleJson).toBe(before);expect((await saved()).sceneryVisible).toBe(true);expect(calls).toBe(0);
});

test('hiding classic scenery removes actual environment pixels while retaining the character and readable sign',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'quiet',whipEnabled:false,scene:'desk',lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',movement:'fixed',groups:{home:false}})})));
 await page.goto('/');await page.locator('#demo-state').selectOption('generating');await page.locator('#demo-motion').selectOption('type');const canvas=page.locator('.bf-demo-pet-scene canvas');
 const pixels=(region:'environment'|'actor')=>canvas.evaluate((element,region)=>{const c=element as HTMLCanvasElement,dpr=c.width/340,area=region==='environment'?{x:20,y:130,width:105,height:110}:{x:145,y:20,width:180,height:195},bytes=c.getContext('2d')!.getImageData(Math.round(area.x*dpr),Math.round(area.y*dpr),Math.round(area.width*dpr),Math.round(area.height*dpr)).data;let count=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])count++;return count;},region);
 await expect.poll(()=>pixels('environment')).toBeGreaterThan(100);await page.getByRole('button',{name:'完整设置',exact:true}).click();const panel=page.getByRole('dialog');await panel.getByRole('checkbox',{name:'显示场景',exact:true}).uncheck();
 await expect.poll(()=>pixels('environment')).toBe(0);await expect.poll(()=>pixels('actor')).toBeGreaterThan(1000);await expect(canvas).toHaveAttribute('data-motion','type');
 await panel.getByRole('button',{name:'关闭',exact:true}).click();await page.locator('#demo-state').selectOption('idle');await page.locator('#demo-motion').selectOption('sign-peek');
 await expect(canvas).toHaveAttribute('data-sign-text',/.+/);await expect(canvas).toHaveAttribute('data-sign-lines',/[12]/);await expect.poll(()=>pixels('actor')).toBeGreaterThan(1000);
});
