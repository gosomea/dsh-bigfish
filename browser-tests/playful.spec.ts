import {test,expect} from '@playwright/test';

test('bundled playful pack previews every sequence and installs without changing preferences',async({page})=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('button',{name:'完整设置',exact:true}).click();
 await page.getByLabel('启用鞭策动作',{exact:true}).uncheck();
 await page.getByLabel('空闲互动',{exact:true}).selectOption('quiet');
 await page.getByText('角色库',{exact:true}).click();await page.getByRole('button',{name:'预览趣味版',exact:true}).click();
 const select=page.getByLabel('角色动作预览'),canvas=page.locator('.bf-pet-preview canvas');
 await expect(select.locator('option')).toHaveCount(78);
 await expect(page.locator('.bf-demo-stage canvas')).not.toHaveAttribute('data-pet');
 const ids=await select.locator('option').evaluateAll(items=>items.map(i=>(i as HTMLOptionElement).value).filter(Boolean));
 for(const id of ids){await select.selectOption(id);await expect(canvas).toHaveAttribute('data-motion',id);await expect(canvas).not.toHaveAttribute('data-error');}
 await select.selectOption('bigfish:sign-flip');await expect(canvas).toHaveAttribute('data-frame','0');
 const before=await canvas.getAttribute('data-frame');await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(before);
 await page.waitForTimeout(1900);await page.locator('.bf-pet-preview').screenshot({path:'artifacts/playful-preview-light.png'});
 await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));await page.locator('.bf-pet-preview').screenshot({path:'artifacts/playful-preview-dark.png'});
 await page.getByRole('button',{name:'关闭预览',exact:true}).click();
 await page.getByRole('button',{name:'使用趣味版',exact:true}).click();
 await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-playful');
 await expect(page.getByLabel('启用鞭策动作',{exact:true})).not.toBeChecked();await expect(page.getByLabel('空闲互动',{exact:true})).toHaveValue('quiet');
 await expect(page.locator('.bf-role-card').filter({hasText:'大肥鱼 · 趣味版'})).toHaveCount(1);
 await page.reload();await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-playful');
 expect(errors).toEqual([]);
});

test('playful idle holds a sign, follows action dialogue and honors quiet and reduced settings',async({page})=>{
 await page.addInitScript(()=>{Math.random=()=>0;});await page.goto('/');
 await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByLabel('启用鞭策动作',{exact:true}).uncheck();
 await page.getByText('角色库',{exact:true}).click();await page.getByRole('button',{name:'使用趣味版',exact:true}).click();
 await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-playful');
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.reload();
 await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-playful');
 await page.clock.install();
 await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator('canvas');
 await expect(canvas).toHaveAttribute('data-motion','bigfish:sign-flip');
 await expect(widget.locator('.bf-dialogue-text')).toHaveText(/这面才对|翻过来/);
 await page.clock.runFor(2300);await expect(canvas).toHaveAttribute('data-frame','3');
 await page.clock.runFor(5000);await expect(canvas).toHaveAttribute('data-frame','3');
 await page.clock.runFor(6000);await expect(canvas).toHaveAttribute('data-motion','bigfish:base-idle');
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByLabel('空闲互动').selectOption('quiet');
 await page.clock.fastForward(600000);await expect(canvas).toHaveAttribute('data-motion','bigfish:base-idle');
 await widget.getByRole('button',{name:'完整设置',exact:true}).click();await widget.getByText('外观与动画',{exact:true}).click();await widget.getByLabel('动画',{exact:true}).selectOption('reduced');
 await page.locator('#demo-state').selectOption('generating');await expect(canvas).toHaveAttribute('data-frame','0');await expect(canvas).toHaveAttribute('data-whip','false');
});
