import {test,expect} from '@playwright/test';

async function homeDemo(page:import('@playwright/test').Page){
 let modelCalls=0;page.on('request',request=>{if(request.url().includes('/api/bigfish-companion'))modelCalls++;});
 await page.addInitScript(()=>localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'frequent',richness:2,lifestyleJson:JSON.stringify({version:1,preset:'all',basedOn:'all',groups:{home:true},movement:'fixed'})})));
 await page.goto('/');const stage=page.locator('.bf-demo-pet-scene');await expect(stage.locator('canvas')).toHaveAttribute('data-motion',/.+/);
 return {stage,modelCalls:()=>modelCalls};
}
test('main demo uses a full painted room with furniture at character scale and local animated details',async({page})=>{
 const {stage,modelCalls}=await homeDemo(page),home=stage.locator('.bf-home');
 await expect(home).toHaveAttribute('data-ambient','playing');await expect(home).toHaveAttribute('data-actor-foot','236,213');await expect(home).toHaveAttribute('data-primary-furniture','bed');await expect(home.locator('[data-scene-prop=desk]')).toHaveCount(0);
 const bed=home.locator('[data-scene-prop="bed"]');expect(Number(await bed.getAttribute('width'))).toBeGreaterThanOrEqual(130);expect(Number(await bed.getAttribute('height'))).toBeGreaterThanOrEqual(100);
 expect(await home.locator('animate,animateTransform').count()).toBeGreaterThan(3);
 // Sample a real SMIL opacity rather than counting static decoration nodes as animation.
 const ripple=home.locator('[data-scene-detail="atmosphere"] > path').first();const initial=await ripple.evaluate(el=>getComputedStyle(el).opacity);
 await expect.poll(()=>ripple.evaluate(el=>getComputedStyle(el).opacity)).not.toBe(initial);
 await page.locator('#demo-state').selectOption('tool-running');await expect(home).toHaveAttribute('data-context','work');await expect(home).toHaveAttribute('data-primary-furniture','desk');await expect(home.locator('[data-scene-prop=bed]')).toHaveCount(0);await expect(home.locator('[data-scene-prop=desk]')).toHaveCount(1);
 await stage.screenshot({path:'artifacts/companion/living-main-stage.png'});expect(modelCalls()).toBe(0);expect(initial).toBeDefined();
});
test('home follows the displayed activity and stops ambient details for reduced motion and open settings',async({page})=>{
 const {stage}=await homeDemo(page),home=stage.locator('.bf-home');
 await page.locator('#demo-motion').selectOption('tea');await expect(home).toHaveAttribute('data-context','tea');await expect(home.locator('[data-scene-detail="tea-steam"]')).toBeVisible();
 const canvas=stage.locator('canvas'),frame=await canvas.getAttribute('data-frame');await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(frame);
 await page.getByRole('button',{name:'完整设置',exact:true}).click();await expect(home).toHaveAttribute('data-ambient','still');await expect(home.locator('animate,animateTransform')).toHaveCount(0);
 // The environment pauses, while the character stays a live preview of preference edits.
 const renders=Number(await canvas.getAttribute('data-render-count'));await expect.poll(async()=>Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(renders);
 await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();await expect(home).toHaveAttribute('data-ambient','playing');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(home).toHaveAttribute('data-ambient','still');await expect(home.locator('animate,animateTransform')).toHaveCount(0);
});
test('sign lettering preserves the full dialogue while wrapping at a readable size',async({page})=>{
 const {stage}=await homeDemo(page);await page.locator('#demo-motion').selectOption('sign-peek');const canvas=stage.locator('canvas');
 await expect(canvas).toHaveAttribute('data-sign-text',/.+/);await expect(canvas).toHaveAttribute('data-sign-lines',/[12]/);expect(Number(await canvas.getAttribute('data-sign-font'))).toBeGreaterThanOrEqual(10.5);
 await stage.screenshot({path:'artifacts/companion/readable-sign-main-stage.png'});
});
