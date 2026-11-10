import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {settingsDisclosure} from './helpers/settings.js';

async function openDialogue(page:Page){
 await settingsDisclosure(page,'高级与数据','自定义台词与工具');return page.getByLabel('台词列表',{exact:true});
}
async function seedDialogueDraft(page:Page,text='尚未保存的草稿 {tool}'){
 const editor=await openDialogue(page);await editor.fill(text);return editor;
}
const discardDialog=(page:Page)=>page.getByRole('alertdialog',{name:'放弃未保存修改？',exact:true});

test('backup restoration invalidates preference drafts instead of letting them overwrite restored values',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();
 await settingsDisclosure(page,'高级与数据','备份与恢复');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整备份'}).click();const path=await(await downloading).path();
 const editor=await seedDialogueDraft(page,'恢复前的旧草稿');
 await settingsDisclosure(page,'高级与数据','备份与恢复');await page.getByLabel('备份文件').setInputFiles({name:'backup.zip',mimeType:'application/zip',buffer:await readFile(path!)});await page.getByRole('button',{name:'确认恢复备份'}).click();
 await expect(page.getByText(/恢复完成。已有角色已保留/)).toBeVisible();await expect(editor).not.toHaveValue('恢复前的旧草稿');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).dialogueJson)).not.toContain('恢复前的旧草稿');
});

test('closing settings confirms only dirty drafts and cancel preserves the editor',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();const panel=page.getByRole('dialog');const editor=await seedDialogueDraft(page);
 await panel.getByRole('button',{name:'关闭',exact:true}).first().click();const confirmation=discardDialog(page);await expect(confirmation).toBeVisible();await expect(panel).toBeVisible();
 await confirmation.screenshot({path:'artifacts/companion/settings-discard-draft.png'});
 await confirmation.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(confirmation).toHaveCount(0);await expect(editor).toHaveValue('尚未保存的草稿 {tool}');
 await panel.getByRole('button',{name:'关闭',exact:true}).first().click();await discardDialog(page).getByRole('button',{name:'丢弃修改并关闭',exact:true}).click();await expect(panel).toHaveCount(0);
 await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByRole('button',{name:'关闭',exact:true}).first().click();await expect(discardDialog(page)).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('returning to quick settings asks before discarding a full-settings draft',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();
 const editor=await seedDialogueDraft(widget);await widget.getByRole('button',{name:'返回快捷设置',exact:true}).click();const confirmation=discardDialog(page);await expect(confirmation).toBeVisible();
 await confirmation.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(editor).toHaveValue('尚未保存的草稿 {tool}');
 await widget.getByRole('button',{name:'返回快捷设置',exact:true}).click();await discardDialog(page).getByRole('button',{name:'丢弃修改并返回',exact:true}).click();await expect(widget.locator('.bf-popover')).toHaveAttribute('data-mode','quick');
});

test('Escape and backdrop use the same dirty-draft guard without double closing',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();const panel=page.getByRole('dialog');await seedDialogueDraft(page);
 await page.keyboard.press('Escape');let confirmation=discardDialog(page);await expect(confirmation).toBeVisible();await expect(panel).toBeVisible();await confirmation.getByRole('button',{name:'继续编辑',exact:true}).click();
 await page.locator('.bf-modal-backdrop').click({position:{x:4,y:4}});confirmation=discardDialog(page);await expect(confirmation).toBeVisible();await expect(panel).toBeVisible();await confirmation.getByRole('button',{name:'丢弃修改并关闭',exact:true}).click();await expect(panel).toHaveCount(0);
});

test('activity-area reload can cancel or explicitly discard only the area draft',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByTestId('activity-area-disclosure').locator('summary').click();const panel=page.getByTestId('activity-area-settings');
 await panel.getByRole('button',{name:'添加允许区',exact:true}).click();await expect(panel.getByLabel('允许区 width',{exact:true})).toHaveValue('100');await panel.getByRole('button',{name:'重新读取',exact:true}).click();
 const confirmation=discardDialog(page);await expect(confirmation).toBeVisible();await expect(confirmation).toContainText('活动区域与回家点');await confirmation.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(panel.getByRole('button',{name:'保存活动区域',exact:true})).toBeEnabled();
 await panel.getByRole('button',{name:'重新读取',exact:true}).click();await discardDialog(page).getByRole('button',{name:'丢弃修改并重新读取',exact:true}).click();await expect(panel.getByRole('button',{name:'保存活动区域',exact:true})).toBeDisabled();
});
