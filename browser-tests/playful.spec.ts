import {test,expect} from '@playwright/test';

test('built-in Bigfish previews all 101 old and new motions without installing another role',async({page})=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 const live=page.locator('.bf-demo-stage canvas');await expect(live).toHaveAttribute('data-action-count','101');
 await page.getByRole('button',{name:'完整设置',exact:true}).click();
 await page.getByLabel('启用鞭策动作',{exact:true}).uncheck();
 await page.getByLabel('空闲互动',{exact:true}).selectOption('quiet');
 await page.getByText('角色库',{exact:true}).click();await page.locator('.bf-role-card').filter({hasText:'大肥鱼 · 内置'}).getByRole('button',{name:'预览',exact:true}).click();
 const select=page.getByLabel('内置角色动作预览'),preview=page.getByTestId('builtin-pet-preview'),canvas=preview.locator('canvas');
 await expect(select.locator('option')).toHaveCount(101);
 const ids=await select.locator('option').evaluateAll(items=>items.map(i=>(i as HTMLOptionElement).value));
 expect(ids.filter(id=>id.startsWith('bigfish:'))).toHaveLength(72);
 for(const id of ids){await select.selectOption(id);await expect(canvas).toHaveAttribute('data-motion',id);await expect(canvas).not.toHaveAttribute('data-error');}
 await select.selectOption('bigfish:sign-flip');
 const before=await canvas.getAttribute('data-frame');await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(before);
 await page.waitForTimeout(1900);await preview.screenshot({path:'artifacts/playful-preview-light.png'});
 await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));await preview.screenshot({path:'artifacts/playful-preview-dark.png'});
 await page.getByRole('button',{name:'关闭预览',exact:true}).click();
 await expect(page.getByLabel('启用鞭策动作',{exact:true})).not.toBeChecked();await expect(page.getByLabel('空闲互动',{exact:true})).toHaveValue('quiet');
 await expect(page.locator('.bf-role-card')).toHaveCount(1);
 await page.reload();await expect(live).toHaveAttribute('data-action-count','101');await expect(live).not.toHaveAttribute('data-pet');
 expect(errors).toEqual([]);
});

test('new built-in idle signs use action dialogue and honor quiet and reduced settings',async({page})=>{
 await page.addInitScript(()=>{Math.random=()=>.99;});await page.goto('/');
 const live=page.locator('.bf-demo-stage canvas');await expect(live).toHaveAttribute('data-action-count','101');
 await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByLabel('启用鞭策动作',{exact:true}).uncheck();
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.clock.install();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator('canvas');
 await expect(canvas).toHaveAttribute('data-action-count','101');await expect(canvas).toHaveAttribute('data-motion',/^bigfish:sign-/);
 await expect(widget.locator('.bf-dialogue-text')).not.toHaveText('');
 const motion=await canvas.getAttribute('data-motion');await page.clock.runFor(2400);
 const held=await canvas.getAttribute('data-frame');await page.clock.runFor(4000);await expect(canvas).toHaveAttribute('data-frame',held!);await expect(canvas).toHaveAttribute('data-motion',motion!);
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByLabel('空闲互动').selectOption('quiet');
 await page.clock.fastForward(600000);await expect(canvas).toHaveAttribute('data-motion','breathe');
 await widget.getByRole('button',{name:'完整设置',exact:true}).click();await widget.getByText('外观与动画',{exact:true}).click();await widget.getByLabel('动画',{exact:true}).selectOption('reduced');
 await page.locator('#demo-state').selectOption('generating');await expect(canvas).toHaveAttribute('data-frame','0');await expect(canvas).toHaveAttribute('data-whip','false');
});
