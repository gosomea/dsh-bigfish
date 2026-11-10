import {appearance,selectControl} from './helpers/settings.js';
import {test,expect} from '@playwright/test';

test('speech cadence preserves display mode, and hidden dialogue keeps the saved cadence',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).first().click();
 const panel=page.locator('.bf-modal');
 await appearance(panel);await selectControl(panel.getByLabel('消息显示',{exact:true}),'text');
 const display=panel.getByLabel('消息显示',{exact:true}),cadence=panel.getByLabel('说话频率',{exact:true});
 await selectControl(cadence,'2');await expect(display).toHaveAttribute('data-value','text');
 for(const mode of ['buttons','status']){
  await selectControl(display,mode);await expect(cadence).toBeDisabled();
  await expect(cadence).toHaveAttribute('data-value','2');
  await expect(panel.getByRole('status').filter({hasText:'当前隐藏台词'})).toBeVisible();
 }
 await selectControl(display,'both');await expect(cadence).toBeEnabled();
 await expect(cadence).toHaveAttribute('data-value','2');
});
