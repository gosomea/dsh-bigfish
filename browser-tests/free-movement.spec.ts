import {test,expect,type Page} from '@playwright/test';
async function screenPet(page:Page){
 await page.addInitScript(()=>{Math.random=()=>0;localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'occasional',richness:2,lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',movement:'screen',restMin:5,restMax:5,speed:100,activityOverrides:true})}));});
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await page.mouse.move(5,5);return page.getByTestId('bigfish-widget');
}
const position=(widget:import('@playwright/test').Locator)=>widget.evaluate(el=>({right:el.style.right,bottom:el.style.bottom}));
test('full viewport travel uses real walk frames along both axes and immediately yields to new work',async({page})=>{
 const widget=await screenPet(page);let calls=0;page.on('request',r=>{if(r.url().includes('/api/bigfish-companion'))calls++;});
 await expect(widget.locator('canvas')).toHaveAttribute('data-motion','walk',{timeout:15000});const start=(await widget.boundingBox())!;
 await expect.poll(async()=>{const b=(await widget.boundingBox())!;return {x:Math.abs(b.x-start.x)>5,y:Math.abs(b.y-start.y)>5};}).toEqual({x:true,y:true});
 await expect(widget.locator('canvas')).toHaveAttribute('data-atlas','companion');const frame=await widget.locator('canvas').getAttribute('data-frame');await expect(widget.locator('canvas')).not.toHaveAttribute('data-frame',frame!);
 await page.locator('#demo-state').selectOption('generating');await expect(widget.locator('canvas')).not.toHaveAttribute('data-motion','walk');const held=await position(widget);
 const canvas=widget.locator('canvas'),count=Number(await canvas.getAttribute('data-render-count'));await expect.poll(async()=>Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(count+2);expect(await position(widget)).toEqual(held);
 await expect.poll(()=>widget.evaluate(el=>{const b=el.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;})).toBe(true);expect(calls).toBe(0);
});
test('dragging reanchors free travel and viewport changes cancel the old route within measured bounds',async({page})=>{
 const widget=await screenPet(page);await expect(widget.locator('canvas')).toHaveAttribute('data-motion','walk',{timeout:15000});const b=(await widget.locator('.bf-pet-stage').boundingBox())!;
 await page.mouse.move(b.x+b.width*.7,b.y+b.height*.45);await page.mouse.down();await page.mouse.move(b.x+b.width*.7-70,b.y+b.height*.45-45,{steps:8});await page.mouse.up();await page.mouse.move(5,5);
 await expect(widget).toHaveAttribute('data-dragging','false');await expect(widget.locator('canvas')).not.toHaveAttribute('data-motion','walk');
 const anchored=await position(widget);await widget.getByRole('button',{name:'设置',exact:true}).click();await expect(widget.locator('.bf-popover')).toBeVisible();expect(await position(widget)).toEqual(anchored);await widget.locator('.bf-popover').getByRole('button',{name:'关闭',exact:true}).click();
 await page.setViewportSize({width:640,height:480});await expect.poll(()=>widget.evaluate(el=>{const b=el.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;})).toBe(true);await expect(widget.locator('canvas')).not.toHaveAttribute('data-motion','walk');
 await page.setViewportSize({width:340,height:360});await expect.poll(()=>widget.evaluate(el=>{const b=el.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;})).toBe(true);
});
test('queued recall keeps work and settings pause intact and explains when the walk will start',async({page})=>{
 const widget=await screenPet(page);await page.locator('#demo-state').selectOption('generating');await widget.getByRole('button',{name:'叫回来',exact:true}).click();await widget.getByRole('button',{name:'设置',exact:true}).click();await page.mouse.move(5,5);
 await expect(widget.getByTestId('activity-area-status')).toHaveText('已记下回家请求，关闭设置并等当前任务结束后走。');await expect(page.locator('#demo-state')).toHaveValue('generating');await expect(widget).toHaveAttribute('data-settings-open','true');
 const held=await position(widget);await page.waitForTimeout(300);expect(await position(widget)).toEqual(held);await expect(widget.locator('canvas')).not.toHaveAttribute('data-motion','walk');
});
test('quiet and collapsed pets start no free route while their activity settings remain available',async({page})=>{
 const widget=await screenPet(page);await expect(widget.locator('canvas')).toHaveAttribute('data-motion','walk',{timeout:15000});
 await page.evaluate(()=>{const key='bigfish.demo.preferences.v1',prefs=JSON.parse(localStorage.getItem(key)!);localStorage.setItem(key,JSON.stringify({...prefs,idleMode:'quiet'}));dispatchEvent(new Event('storage'));});
 await expect(widget.locator('canvas')).not.toHaveAttribute('data-motion','walk');const anchored=await position(widget);const count=Number(await widget.locator('canvas').getAttribute('data-render-count'));await expect.poll(async()=>Number(await widget.locator('canvas').getAttribute('data-render-count'))).toBeGreaterThan(count+2);expect(await position(widget)).toEqual(anchored);
 // A drag over the head must suppress its own click, then allow the next genuine button click.
 const body=(await widget.locator('.bf-pet-stage').boundingBox())!;await page.mouse.move(body.x+body.width*.7,body.y+body.height*.25);await page.mouse.down();await page.mouse.move(body.x+body.width*.7-45,body.y+body.height*.25-25,{steps:8});await page.mouse.up();await page.mouse.move(5,5);
 const after=Number(await widget.locator('canvas').getAttribute('data-render-count'));await expect.poll(async()=>Number(await widget.locator('canvas').getAttribute('data-render-count'))).toBeGreaterThan(after+4);await expect(widget.locator('canvas')).not.toHaveAttribute('data-motion','head-pat');
 await widget.getByRole('button',{name:'设置',exact:true}).click();await expect(widget.locator('.bf-popover')).toBeVisible();await widget.locator('.bf-popover').getByRole('button',{name:'关闭',exact:true}).click();
 await widget.getByRole('button',{name:'收起大肥鱼',exact:true}).click();await expect(widget).toHaveCount(0);await page.getByRole('button',{name:'展开大肥鱼',exact:true}).last().click();await expect(widget.locator('canvas')).not.toHaveAttribute('data-motion','walk');
});
