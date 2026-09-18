import {test,expect} from '@playwright/test';

test('six frequency choices, paired custom bounds and sign preferences persist and affect the widget',async({page})=>{
 await page.clock.install();await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator('canvas');
 await widget.getByRole('button',{name:'设置',exact:true}).click();
 await expect(widget.getByLabel('空闲互动').locator('option')).toHaveCount(6);
 await widget.getByLabel('空闲互动').selectOption('custom');
 await widget.getByRole('slider',{name:'最短休息时间 · 秒'}).fill('12');
 await expect(widget.getByRole('slider',{name:'最长休息时间 · 秒'})).toHaveValue('12');
 await widget.getByRole('slider',{name:'最长休息时间 · 秒'}).fill('3');
 await expect(widget.getByRole('slider',{name:'最短休息时间 · 秒'})).toHaveValue('3');
 await widget.getByRole('button',{name:'完整设置',exact:true}).click();
 await widget.getByText('消息内容与空闲习惯',{exact:true}).click();
 await widget.getByLabel('举牌偏好').selectOption('none');
 await page.clock.fastForward(4000);await expect(canvas).toHaveAttribute('data-idle-active','true');await expect(canvas).not.toHaveAttribute('data-motion',/sign/);
 await expect(widget.getByTestId('idle-status')).toContainText('正在播放');
 await page.clock.fastForward(12500);await expect(widget.getByTestId('idle-status')).toContainText('秒后');
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await widget.getByRole('button',{name:'设置',exact:true}).click();
 await expect(widget.getByLabel('空闲互动')).toHaveValue('custom');await expect(widget.getByRole('slider',{name:'最短休息时间 · 秒'})).toHaveValue('3');
});

test('cancelled task returns to idle interaction and reduced motion clearly explains suppression',async({page})=>{
 await page.clock.install();await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator('canvas');
 await page.locator('#demo-state').selectOption('cancelled');await expect(canvas).toHaveAttribute('data-idle-active','false');
 await page.clock.fastForward(4500);await expect(canvas).toHaveAttribute('aria-label',/休息/);
 await page.clock.fastForward(11000);await expect(canvas).toHaveAttribute('data-idle-active','true');
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();
 await widget.getByText('外观与动画',{exact:true}).click();await widget.getByLabel('动画',{exact:true}).selectOption('reduced');
 await expect(widget.getByTestId('idle-status')).toContainText('减弱动态');await expect(canvas).toHaveAttribute('data-idle-active','false');
 await expect(widget.getByLabel('鞭策节奏')).toBeDisabled();
});

test('text-only display accurately round-trips and sign finishes rather than repeatedly lifting',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator('canvas');
 await expect(canvas).toHaveAttribute('data-motion','wait-sign');
 await expect(canvas).toHaveAttribute('data-frame','2',{timeout:7000});
 await page.waitForTimeout(5000);await expect(canvas).toHaveAttribute('data-frame','2');
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByLabel('消息显示').selectOption('text');
 await expect(widget.locator('.bf-state')).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await widget.getByRole('button',{name:'设置',exact:true}).click();
 await expect(widget.getByLabel('消息显示')).toHaveValue('text');
});
