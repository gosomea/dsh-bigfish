import {test,expect} from '@playwright/test';
test('quick switch stops active whip and reaction, persists and preserves pace across role switches',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await page.locator('#demo-state').selectOption('generating');
 const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator(':scope > .bf-stage canvas');
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByLabel('鞭策节奏').selectOption('rhythm');
 await expect(canvas).toHaveAttribute('data-whip','true');
 await widget.getByLabel('启用鞭策动作').uncheck();await expect(canvas).toHaveAttribute('data-whip','false');
 await expect(canvas).not.toHaveAttribute('data-motion',/dodge|flinch/);await expect(widget.getByLabel('鞭策节奏')).toHaveCount(0);
 await widget.getByRole('button',{name:'完整设置',exact:true}).click();await expect(page.getByLabel('启用鞭策动作')).not.toBeChecked();
 await page.getByText('角色库',{exact:true}).click();await page.getByLabel('角色包文件').setInputFiles('dist/bigfish-adult-1.0.0.dshpet');await page.getByRole('button',{name:'安装并使用',exact:true}).click();await expect(page.getByText('角色已安装并使用',{exact:true})).toBeVisible();
 await expect(canvas).toHaveAttribute('data-pet','bigfish-adult');await expect(canvas).toHaveAttribute('data-whip','false');await expect(canvas).not.toHaveAttribute('data-motion','adult:near-miss');
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.reload();
 await page.getByRole('button',{name:'完整设置',exact:true}).click();await expect(page.getByLabel('启用鞭策动作')).not.toBeChecked();
 await page.getByLabel('动作表现').selectOption('0');await page.getByLabel('启用鞭策动作').check();await expect(page.getByLabel('鞭策节奏')).toBeDisabled();
 await page.getByLabel('启用鞭策动作').uncheck();await expect(page.getByLabel('启用鞭策动作')).not.toBeChecked();
 await page.getByLabel('动作表现').selectOption('1');await page.getByLabel('启用鞭策动作').check();await expect(page.getByLabel('鞭策节奏')).toHaveValue('rhythm');
});
