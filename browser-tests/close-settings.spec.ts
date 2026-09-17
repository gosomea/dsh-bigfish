import {test,expect} from '@playwright/test';

for(const kind of ['popover','modal'] as const)test(`${kind} close button stays visible and clickable at the bottom on desktop and mobile`,async({page})=>{
 for(const viewport of [{width:1360,height:980},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto('/');await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
  if(kind==='popover'){
   await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await page.getByTestId('bigfish-widget').getByRole('button',{name:'设置',exact:true}).click();await page.getByTestId('bigfish-widget').getByRole('button',{name:'完整设置',exact:true}).click();
  }else await page.getByRole('button',{name:'完整设置',exact:true}).first().click();
  const panel=page.locator(kind==='popover'?'.bf-popover':'.bf-modal');await panel.getByText('高级与重置',{exact:true}).click();
  await panel.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  expect(await panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  const close=panel.getByRole('button',{name:'关闭',exact:true}),before=(await close.boundingBox())!,bounds=(await panel.boundingBox())!;
  expect(before.y).toBeGreaterThanOrEqual(bounds.y);expect(before.y+before.height).toBeLessThan(bounds.y+bounds.height);
  expect(await close.evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);})).toBe(true);
  await close.click();await expect(panel).toHaveCount(0);
 }
});
