import {settingsDisclosure} from './helpers/settings.js';
import {test,expect} from '@playwright/test';
test('sharing a selected file previews and requires per-image consent; demo never sends or captures a screen',async({page})=>{
 let calls=0;page.on('request',r=>{if(r.url().includes('/api/bigfish-companion'))calls++;});
 await page.addInitScript(()=>{localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'assistant',groups:{perception:true}})}));});
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();await settingsDisclosure(page,'智能管家','语音与主动分享');const section=page.getByTestId('screenshot-settings');await section.locator('summary').click();
 await expect(section.getByLabel('确认发送本次截图')).toBeDisabled();
 const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=120;const x=c.getContext('2d')!;x.fillStyle='white';x.fillRect(0,0,300,120);x.fillStyle='#34567a';x.font='18px sans-serif';x.fillText('Selected file preview',20,60);return c.toDataURL('image/png').split(',')[1]!;});
 await section.getByLabel('本次分享的截图').setInputFiles({name:'demo.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});await expect(section.getByAltText('本次将发送的图片预览')).toBeVisible();await expect(section.getByLabel('确认发送本次截图')).not.toBeChecked();await section.getByLabel('确认发送本次截图').check();await expect(section.getByRole('button',{name:'解释本次图片 · 消耗 token'})).toBeDisabled();
 await section.getByRole('button',{name:'移除本次图片'}).click();await expect(section.getByAltText('本次将发送的图片预览')).toHaveCount(0);await expect(section.getByLabel('确认发送本次截图')).not.toBeChecked();expect(calls).toBe(0);
});
