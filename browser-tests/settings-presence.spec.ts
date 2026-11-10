import {test,expect} from '@playwright/test';

test('a visible settings panel outside Widget pauses its travel, while a mounted hidden Host pane does not',async({page})=>{
 test.setTimeout(45000);
 await page.addInitScript(()=>{
  Math.random=()=>.75;
  localStorage.setItem('bigfish.position.v1',JSON.stringify({right:930,bottom:600}));
  localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'occasional',richness:2,lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',movement:'screen',restMin:5,restMax:5,speed:100,activityOverrides:true})}));
 });
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await page.mouse.move(5,5);
 const pet=page.getByTestId('bigfish-widget'),canvas=pet.locator('canvas');
 await expect(canvas).toHaveAttribute('data-motion','walk',{timeout:15000});
 await page.getByRole('button',{name:'完整设置',exact:true}).click();
 await expect(pet).toHaveAttribute('data-settings-open','true');await expect(canvas).not.toHaveAttribute('data-motion','walk');
 await page.clock.install();const held=await pet.boundingBox();await page.clock.fastForward(30000);await page.clock.runFor(250);expect(await pet.boundingBox()).toEqual(held);
 // DSH may retain inactive setting panes. Hiding their rendered container must release the pause.
 await page.locator('.bf-modal-backdrop').evaluate(el=>{(el as HTMLElement).style.display='none';});
 await expect(pet).toHaveAttribute('data-settings-open','false');
 await expect.poll(async()=>{await page.clock.runFor(200);return canvas.getAttribute('data-motion');},{timeout:15000,intervals:[15]}).toBe('walk');
 await page.locator('.bf-modal-backdrop').evaluate(el=>{(el as HTMLElement).style.display='';});
 await expect(pet).toHaveAttribute('data-settings-open','true');await expect(canvas).not.toHaveAttribute('data-motion','walk');
 await page.getByRole('dialog',{name:'设置',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
 await expect(pet).toHaveAttribute('data-settings-open','false');
});
