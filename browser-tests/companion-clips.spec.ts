import {roleLibrary,selectControl,settingOptions} from './helpers/settings.js';
import {test,expect} from '@playwright/test';
import catalog from '../assets/intelligent-pet/catalog.json' with {type:'json'};
test('all 32 generated sequences load and play; one-shots hold their final pose',async({page})=>{
 test.setTimeout(140000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();
 await roleLibrary(page);const preview=page.getByTestId('companion-clip-preview');await preview.locator('summary').click();
 await expect((await settingOptions(preview.getByRole('combobox',{name:'新动作预览',exact:true})))).toHaveCount(32);
 for(const row of catalog){
  await selectControl(preview.getByLabel('新动作预览'),row.id);const canvas=preview.locator('canvas');
  await expect(canvas).toHaveAttribute('data-motion',row.id);
  if(row.loop){await expect(canvas).toHaveAttribute('data-phase','loop');const first=await canvas.getAttribute('data-frame');await expect.poll(()=>canvas.getAttribute('data-frame'),{intervals:[30],timeout:2000}).not.toBe(first);}
  else await expect.poll(()=>canvas.getAttribute('data-frame'),{intervals:[30],timeout:5000}).toBe('7');
  await canvas.screenshot({path:`artifacts/companion/clips/${row.id}-light.png`});
 }
 await selectControl(preview.getByLabel('新动作预览'),'head-pat');const canvas=preview.locator('canvas');
 await expect(canvas).toHaveAttribute('data-phase','hold',{timeout:5000});await page.waitForTimeout(1000);await expect(canvas).toHaveAttribute('data-frame','7');await expect(canvas).toHaveAttribute('data-phase','hold');
 await preview.getByRole('button',{name:'深色背景',exact:true}).click();await preview.screenshot({path:'artifacts/companion/clips/head-dark.png'});
 await preview.getByRole('button',{name:'减少动态预览',exact:true}).click();await expect(canvas).toHaveAttribute('data-frame','7');await page.waitForTimeout(400);await expect(canvas).toHaveAttribute('data-frame','7');expect(errors).toEqual([]);
});
test('direct head touch uses new frames; toy responds while settings remain open',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',movement:'fixed'})})));
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const pet=page.getByTestId('bigfish-widget');
 await pet.getByRole('button',{name:'设置',exact:true}).click();
 await pet.getByTestId('life-actions').locator(':scope > summary').click();
 await pet.getByRole('button',{name:'摸摸头',exact:true}).click();
 await expect(pet.locator('canvas')).toHaveAttribute('data-motion','head-pat');await expect(pet.locator('.bf-dialogue-text')).toContainText('摸摸头');
 await expect(pet.locator('canvas')).toHaveAttribute('data-phase','hold',{timeout:6000});await page.waitForTimeout(1000);await expect(pet.locator('canvas')).toHaveAttribute('data-frame','7');
 await page.waitForTimeout(2000);await pet.getByRole('button',{name:'设置',exact:true}).click();
 await pet.getByTestId('life-actions').locator(':scope > summary').click();
 await pet.getByText('玩具箱',{exact:false}).first().click();const pad=pet.getByRole('button',{name:'点垫子抛球，也可按回车键'});await pad.press('Enter');
 await expect(pet.locator('.bf-dialogue-text')).toContainText('接住');await expect(pet.locator('canvas')).toHaveAttribute('data-motion','ball-catch');await expect(pet.locator('.bf-popover')).toBeVisible();
});
