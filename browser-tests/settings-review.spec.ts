import {companionship,appearance,selectControl,settingOptions} from './helpers/settings.js';
import {test,expect} from '@playwright/test';

test('six frequency choices, paired custom bounds and sign preferences persist and affect the widget',async({page})=>{
 // Isolate the frequency/sign controls; life and walking fairness are exercised in their own cases.
 await page.addInitScript(()=>{Math.random=()=>0;if(!localStorage.getItem('bigfish.demo.preferences.v1'))localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',groups:{body:false,home:false},movement:'fixed'})}));});
 await page.clock.install();await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator('canvas');
 await widget.getByRole('button',{name:'设置',exact:true}).click();
 await expect((await settingOptions(widget.getByLabel('活跃程度')))).toHaveCount(6);
 await companionship(widget);await selectControl(widget.getByLabel('活跃程度'),'custom');
 await widget.getByRole('slider',{name:'最短休息时间 · 秒'}).fill('12');
 await expect(widget.getByRole('slider',{name:'最长休息时间 · 秒'})).toHaveValue('12');
 await widget.getByRole('slider',{name:'最长休息时间 · 秒'}).fill('3');
 await expect(widget.getByRole('slider',{name:'最短休息时间 · 秒'})).toHaveValue('3');
 await widget.getByRole('button',{name:'完整设置',exact:true}).click();
 await companionship(widget,true);
 await selectControl(widget.getByLabel('举牌偏好'),'none');
 await expect(widget.getByTestId('idle-status')).toBeVisible();await widget.getByRole('button',{name:'关闭',exact:true}).click();
 await expect.poll(async()=>{await page.clock.fastForward(100);return canvas.getAttribute('data-idle-active');},{intervals:[25],timeout:10000}).toBe('true');await expect(canvas).not.toHaveAttribute('data-motion',/sign/);
 await page.clock.fastForward(12500);await expect(canvas).toHaveAttribute('data-idle-active','false');
  await widget.getByRole('button',{name:'设置',exact:true}).click();
  await widget.getByRole('button',{name:'完整设置',exact:true}).click();
  await companionship(widget,true);await expect(widget.getByText('举牌、生活动作与散步轮流安排，完整播放后再休息；提高活跃度不会加速动画。',{exact:true})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await widget.getByRole('button',{name:'设置',exact:true}).click();
 await expect(widget.getByLabel('活跃程度')).toHaveAttribute('data-value','custom');await expect(widget.getByRole('slider',{name:'最短休息时间 · 秒'})).toHaveValue('3');
});

test('cancelled task returns to idle interaction and reduced motion clearly explains suppression',async({page})=>{
 await page.clock.install();await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator('canvas');
 const card=widget.locator('.bf-card');
 await page.locator('#demo-state').selectOption('cancelled');await expect(card).toHaveAttribute('data-category','stopped');await expect(canvas).toHaveAttribute('data-idle-active','false');
 await page.clock.fastForward(4500);await expect(card).toHaveAttribute('data-category','idle');
 await expect.poll(async()=>{for(let i=0;i<10;i++)await page.clock.fastForward(100);return canvas.evaluate(c=>c.dataset.idleActive==='true'||c.dataset.atlas==='companion');},{intervals:[25],timeout:15000}).toBe(true);
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();
 await appearance(widget);await selectControl(widget.getByLabel('动画',{exact:true}),'reduced');
 await expect(widget.getByText('减弱动态已生效：停止非必要轮播、位移、粒子和空挥，保留状态更新。',{exact:true})).toBeVisible();await expect(canvas).toHaveAttribute('data-idle-active','false');
 await companionship(widget,true);await expect(widget.getByLabel('鞭策节奏')).toBeDisabled();
});

test('text-only display accurately round-trips and sign finishes rather than repeatedly lifting',async({page})=>{
 await page.addInitScript(()=>{Math.random=()=>0;});
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator('canvas');
 await expect(canvas).toHaveAttribute('data-motion','wait-sign');
 await expect(canvas).toHaveAttribute('data-frame','2',{timeout:7000});
 await page.waitForTimeout(5000);await expect(canvas).toHaveAttribute('data-frame','2');
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();await appearance(widget);await selectControl(widget.getByLabel('消息显示'),'text');
 await expect(widget.locator('.bf-state')).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();await appearance(widget);
 await expect(widget.getByLabel('消息显示')).toHaveAttribute('data-value','text');
});
