import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('backup exports, previews without mutation and restores roles, settings and choreography',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();
 await page.getByLabel('启用鞭策动作').uncheck();await page.getByLabel('空闲互动',{exact:true}).selectOption('frequent');
 await page.getByText('角色库',{exact:true}).click();await page.getByLabel('角色包文件').setInputFiles('dist/bigfish-adult-1.0.0.dshpet');await page.getByRole('button',{name:'安装并使用',exact:true}).click();await expect(page.getByText('角色已安装并使用',{exact:true})).toBeVisible();
 await page.getByText('备份与恢复',{exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整备份'}).click();const file=await download,path=await file.path();expect(path).toBeTruthy();
 await page.getByRole('button',{name:'使用大肥鱼',exact:true}).click();await page.getByRole('button',{name:'移除',exact:true}).click();await page.getByLabel('启用鞭策动作').check();await page.getByLabel('空闲互动',{exact:true}).selectOption('quiet');
 await page.getByLabel('备份文件').setInputFiles({name:'backup.zip',mimeType:'application/zip',buffer:await readFile(path!)});
 await expect(page.getByText('校验通过，尚未修改任何设置。',{exact:true})).toBeVisible();await expect(page.getByLabel('启用鞭策动作')).toBeChecked();await expect(page.locator('.bf-role-card')).toHaveCount(1);
 await page.getByRole('button',{name:'确认恢复备份'}).click();await expect(page.getByText('恢复完成。已有角色已保留，角色选择、偏好、台词和动作编排已恢复。',{exact:true})).toBeVisible();
 await expect(page.getByLabel('启用鞭策动作')).not.toBeChecked();await expect(page.getByLabel('空闲互动',{exact:true})).toHaveValue('frequent');await expect(page.locator('.bf-role-card')).toHaveCount(2);
 await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-adult');await page.locator('.bf-modal').screenshot({path:'artifacts/backup-restored-050.png'});
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.reload();await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-adult');
 await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByText('备份与恢复',{exact:true}).click();await page.getByLabel('备份文件').setInputFiles({name:'broken.zip',mimeType:'application/zip',buffer:Buffer.from('bad')});await expect(page.getByText(/无法恢复：/)).toBeVisible();await expect(page.getByLabel('启用鞭策动作')).not.toBeChecked();await expect(page.getByRole('button',{name:'确认恢复备份'})).toHaveCount(0);
});

test('restore refuses stale preview and rolls back preferences when browser catalog changed',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByLabel('启用鞭策动作').uncheck();await page.getByText('备份与恢复',{exact:true}).click();
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整备份'}).click();const path=await(await downloading).path();await page.getByLabel('启用鞭策动作').check();
 await page.getByLabel('备份文件').setInputFiles({name:'backup.zip',mimeType:'application/zip',buffer:await readFile(path!)});await expect(page.getByText('校验通过，尚未修改任何设置。',{exact:true})).toBeVisible();
 const other=await context.newPage();await other.goto('/');await other.getByRole('button',{name:'完整设置',exact:true}).click();await other.getByText('角色库',{exact:true}).click();await other.getByLabel('角色包文件').setInputFiles('dist/bigfish-adult-1.0.0.dshpet');await other.getByRole('button',{name:'安装并使用',exact:true}).click();await expect(other.getByText('角色已安装并使用',{exact:true})).toBeVisible();await other.close();await page.bringToFront();
 await page.getByRole('button',{name:'确认恢复备份'}).click();await expect(page.getByText(/恢复失败：角色库在预览后已变化/)).toBeVisible();await expect(page.getByLabel('启用鞭策动作')).toBeChecked();
});

test('tea, wipe and stretch use distinct authored frames and settle after finishing',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByText('角色库',{exact:true}).click();await page.locator('.bf-role-card').first().getByRole('button',{name:'预览',exact:true}).click();
 const canvas=page.getByTestId('builtin-pet-preview').locator('canvas');
 for(const [motion,first,last]of [['tea','0','3'],['wipe','4','7'],['stretch','8','11']]){
  await page.getByLabel('内置角色动作预览').selectOption(motion!);await expect(canvas).toHaveAttribute('data-atlas','daily');await expect(canvas).toHaveAttribute('data-frame',first!);
  await expect(canvas).toHaveAttribute('data-frame',last!,{timeout:6000});await page.waitForTimeout(300);await expect(canvas).toHaveAttribute('data-frame',last!);
  await page.getByTestId('builtin-pet-preview').screenshot({path:`artifacts/daily-${motion}-050.png`});
 }
});
