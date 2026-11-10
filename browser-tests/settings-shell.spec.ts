import {selectControl,settingsDisclosure,settingsPage} from './helpers/settings.js';
import {presetConfig} from '../src/companion/config.js';
import {test,expect} from '@playwright/test';

test('four settings pages prioritize daily choices, preserve drafts, and never enable intelligence',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/bigfish-companion'))requests.push(r.url());});
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).first().click();
 const panel=page.locator('.bf-modal'),nav=panel.getByRole('navigation',{name:'大肥鱼设置分区'}),daily=panel.locator('[data-settings-page="companionship"]');
 await expect(nav.getByRole('button')).toHaveCount(4);await expect(daily).toBeVisible();
 for(const name of ['陪伴方案','活跃程度','活动范围','显示场景','启用鞭策动作'])await expect(daily.getByLabel(name,{exact:true})).toBeVisible();
 await expect(daily.getByRole('button',{name:'更换角色',exact:true})).toBeVisible();
 await expect(daily.getByLabel('动作幅度',{exact:true})).not.toBeVisible();
 await expect(daily.getByTestId('smart-summary')).toContainText('额外消耗 token');
 await daily.getByRole('button',{name:'了解并设置',exact:true}).click();await expect(nav.getByRole('button',{name:'智能管家',exact:true})).toHaveAttribute('aria-current','page');
 await expect(panel.getByTestId('intelligence-settings')).toContainText('模拟演示');await expect(panel.getByTestId('intelligence-settings')).toContainText('不会编造会话记录');
 await expect(panel.getByRole('heading',{name:'智能管家',exact:true})).toBeFocused();
 await nav.getByRole('button',{name:'高级与数据',exact:true}).click();await panel.getByText('自定义台词与工具',{exact:true}).click();
 await panel.getByLabel('台词列表',{exact:true}).fill('尚未保存的草稿 {tool}');
 await nav.getByRole('button',{name:'日常陪伴',exact:true}).click();await expect(panel.getByLabel('台词列表',{exact:true})).not.toBeVisible();
 await nav.getByRole('button',{name:'高级与数据',exact:true}).click();await expect(panel.getByLabel('台词列表',{exact:true})).toHaveValue('尚未保存的草稿 {tool}');
 expect(requests).toEqual([]);
});

test('settings inherit live Host theme tokens and close remains reachable on a narrow screen',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).first().click();const panel=page.locator('.bf-modal');
 await page.addStyleTag({content:':root { --dsw-font-family: monospace; --dsw-alias-label-primary: rgb(31, 42, 53); --dsw-alias-bg-layer-1: rgb(252, 251, 250); }'});
 await expect(panel.locator('.bf-settings')).toHaveCSS('font-family','monospace');await expect(panel.locator('.bf-settings')).toHaveCSS('color','rgb(31, 42, 53)');
 await page.addStyleTag({content:'body[data-ds-dark-theme] { --dsw-alias-label-primary: rgb(240, 241, 242); --dsw-alias-bg-layer-1: rgb(29, 30, 31); }'});
 await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
 await expect(panel.locator('.bf-settings')).toHaveCSS('color','rgb(240, 241, 242)');await expect(panel).toHaveCSS('background-color','rgb(29, 30, 31)');
 await page.setViewportSize({width:390,height:844});const nav=panel.getByRole('navigation');
 await nav.getByRole('button',{name:'外观与生活',exact:true}).click();await panel.getByText('外观与动画',{exact:true}).click();await expect(panel.getByLabel('动画',{exact:true})).toBeVisible();
 expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await nav.getByRole('button',{name:'高级与数据',exact:true}).click();await panel.getByText('自定义能力',{exact:true}).click();
 await panel.evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(panel.getByRole('button',{name:'关闭',exact:true})).toBeInViewport();
 await panel.getByRole('button',{name:'关闭',exact:true}).click();await expect(panel).toHaveCount(0);
});

test('the character card remains readable in a very narrow preview panel',async({page})=>{
 await page.setViewportSize({width:300,height:640});
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();
 const panel=page.locator('.bf-modal'),card=panel.getByRole('region',{name:'当前角色'});
 const metrics=await panel.locator('.bf-character-summary').evaluate(el=>{
  const text=el.querySelector('div')!.getBoundingClientRect(),image=el.querySelector('img')!.getBoundingClientRect(),button=el.querySelector('button')!.getBoundingClientRect();
  return {textWidth:text.width,buttonBelow:button.top>=Math.max(text.bottom,image.bottom),overflows:el.scrollWidth>el.clientWidth};
 });
 expect(metrics.textWidth).toBeGreaterThan(90);expect(metrics.buttonBelow).toBe(true);expect(metrics.overflows).toBe(false);
 await expect(panel.getByRole('button',{name:'更换角色',exact:true})).toBeVisible();
});

test('capability disclosure reports all eight groups from current settings without enabling paid services',async({page})=>{
 const posts:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/bigfish-companion'))posts.push(request.url());});
 await page.addInitScript(config=>localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({lifestyleJson:JSON.stringify(config)})),presetConfig('all'));
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();const panel=page.locator('.bf-modal'),readiness=panel.getByTestId('capability-readiness');
 await expect(panel.getByRole('combobox',{name:'陪伴方案',exact:true})).toContainText('全能型 · 预览版');await readiness.locator('summary').click();
 await expect(readiness.locator('[data-capability]')).toHaveCount(8);await expect(readiness.locator('[data-capability="body"]')).toHaveAttribute('data-status','available');await expect(readiness.locator('[data-capability="steward"]')).toHaveAttribute('data-status','demo');await expect(readiness.locator('[data-capability="memory"]')).toHaveAttribute('data-status','demo');
 await panel.getByRole('navigation').getByRole('button',{name:'高级与数据',exact:true}).click();await panel.getByText('自定义能力',{exact:true}).click();await panel.getByRole('checkbox',{name:'身体与活动',exact:true}).uncheck();
 await panel.getByRole('navigation').getByRole('button',{name:'日常陪伴',exact:true}).click();await expect(readiness.locator('[data-capability="body"]')).toHaveAttribute('data-status','off');expect(posts).toEqual([]);
});

test('full-screen movement is an explicit saved choice and does not grant cross-screen permission',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).first().click();const daily=page.getByRole('dialog').locator('[data-settings-page="companionship"]'),movement=daily.getByRole('combobox',{name:'活动范围',exact:true});
 await selectControl(movement,'screen');await expect(movement).toContainText('全屏自由活动');await expect(daily).toContainText('不会自动跨屏');
 const stored=()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).lifestyleJson));expect((await stored()).movement).toBe('screen');expect((await stored()).groups.body).toBe(true);
 await page.reload();await page.getByRole('button',{name:'完整设置',exact:true}).first().click();await expect(movement).toHaveAttribute('data-value','screen');
 const precision=await settingsDisclosure(page,'高级与数据','专家参数','活动精确参数'),radius=precision.getByRole('spinbutton',{name:'附近活动半径 · 像素',exact:true}),savedRadius=(await stored()).radius;
 await expect(radius).toBeDisabled();await expect(radius).toHaveValue(String(savedRadius));await expect(precision).toContainText('全屏自由活动按屏幕边界选择路线，不使用附近半径；半径偏好会保留。');
 await settingsPage(page,'日常陪伴');await selectControl(movement,'fixed');await settingsPage(page,'高级与数据');await expect(radius).toBeDisabled();await expect(radius).toHaveValue(String(savedRadius));
 await settingsPage(page,'日常陪伴');await selectControl(movement,'nearby');await settingsPage(page,'高级与数据');await expect(radius).toBeEnabled();await expect(radius).toHaveValue(String(savedRadius));
 await radius.fill('185');await settingsPage(page,'日常陪伴');await selectControl(movement,'screen');await settingsPage(page,'高级与数据');await expect(radius).toBeDisabled();await expect(radius).toHaveValue('185');expect((await stored()).radius).toBe(savedRadius);
 await settingsPage(page,'日常陪伴');await selectControl(movement,'nearby');await settingsPage(page,'高级与数据');await expect(radius).toBeEnabled();await expect(radius).toHaveValue('185');expect((await stored()).radius).toBe(savedRadius);
});
