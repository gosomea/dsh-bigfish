import {settingsDisclosure,roleLibrary,appearance,selectControl} from './helpers/settings.js';
import {test,expect} from '@playwright/test';
test('three local adventures use real clips, honor reduced motion, and never request a model',async({page})=>{
 let calls=0;page.on('request',r=>{if(r.url().includes('/api/bigfish-companion'))calls++;});
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();
 await settingsDisclosure(page,'高级与数据','自定义能力');await page.getByTestId('custom-capabilities').getByLabel('桌面奇遇',{exact:true}).check();
 await settingsDisclosure(page,'高级与数据','专家参数','活动精确参数');await page.getByLabel('使用精确间隔覆盖').check();
 await page.getByLabel('彩蛋最短间隔 · 分钟',{exact:true}).fill('60');await page.getByRole('button',{name:'保存活动参数',exact:true}).click();await expect(page.getByLabel('彩蛋最短间隔 · 分钟',{exact:true})).toHaveValue('60');
 await roleLibrary(page);const preview=page.getByTestId('adventure-preview');await preview.locator('summary').click();await expect(preview.locator('canvas')).toHaveCount(0);
 for(const kind of ['box','paper-boat','fishing']){
  await selectControl(preview.getByLabel('预览小剧场'),kind);await preview.getByRole('button',{name:'开始小剧场预览'}).click();await expect(preview.locator(`svg[data-adventure="${kind}"]`)).toHaveCount(2);await expect(preview.locator('canvas')).toHaveAttribute('data-atlas','companion');await expect(preview.locator('canvas')).toHaveAttribute('data-phase','hold',{timeout:6000});await preview.screenshot({path:`artifacts/companion/adventure-${kind}.png`});await preview.getByRole('button',{name:'结束预览'}).click();await expect(preview.locator('canvas')).toHaveCount(0);
 }
 await appearance(page);await selectControl(page.getByLabel('动画',{exact:true}),'reduced');await roleLibrary(page);
 await preview.getByRole('button',{name:'开始小剧场预览'}).click();await expect(preview.locator('canvas')).toHaveAttribute('data-frame','7');await page.waitForTimeout(300);await expect(preview.locator('canvas')).toHaveAttribute('data-frame','7');
 expect(calls).toBe(0);
});
