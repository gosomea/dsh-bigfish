import {settingsDisclosure,companionship,roleLibrary} from './helpers/settings.js';
import {wave} from './helpers/interactions.js';
import { test, expect, type Locator } from '@playwright/test';
import { fileURLToPath } from 'node:url';

async function readable(locator: Locator) {
  const ratio = await locator.evaluate(element => {
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => {
        const c = n / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    let background: Element | null = element;
    while (background && getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)') background = background.parentElement;
    if (!background) throw Error('No opaque background');
    const foreground = luminance(getComputedStyle(element).color);
    const behind = luminance(getComputedStyle(background).backgroundColor);
    return (Math.max(foreground, behind) + .05) / (Math.min(foreground, behind) + .05);
  });
  expect(ratio, `text contrast for ${await locator.textContent()}`).toBeGreaterThanOrEqual(4.5);
}

test('settings follow the host theme immediately, with readable controls and previews', async ({ page }) => {
  // OS dark must not override an explicitly light host theme.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.addStyleTag({ path: fileURLToPath(new URL('./fixtures/dsh-theme.css', import.meta.url)) });
  await page.getByRole('button', { name: '完整设置', exact: true }).click();
  const modal = page.locator('.bf-modal');
  for (const dark of [false, true, false]) {
    await page.evaluate(value => document.body.toggleAttribute('data-ds-dark-theme', value), dark);
    const daily=await companionship(modal);
    await expect(daily.getByLabel('活跃程度')).toHaveCSS('color', dark ? 'rgb(249, 250, 251)' : 'rgb(15, 17, 21)');
    for(const control of [modal.locator('h2'),daily.locator('h3').first(),daily.locator('.bf-help').first(),daily.getByLabel('活跃程度')])await readable(control);
    const menu=daily.getByRole('combobox',{name:'活动范围',exact:true});await menu.click();const list=page.getByRole('listbox',{name:'活动范围',exact:true});await readable(list);await readable(list.getByRole('option').first());await modal.screenshot({path:`artifacts/companion/settings-menu-${dark?'dark':'light'}-full.png`});await menu.press('Escape');await expect(modal).toBeVisible();
    await roleLibrary(modal);await readable(modal.locator('.bf-role-card strong').first());
    const advanced=await settingsDisclosure(modal,'高级与数据','自定义台词与工具');
    await expect(advanced.getByLabel('台词列表')).toHaveCSS('color-scheme',dark?'dark':'light');await readable(advanced.getByLabel('台词列表'));
    const button=advanced.getByRole('button',{name:'保存这一类台词'});await button.hover();
    await expect(button).toHaveCSS('background-color',dark?'rgb(53, 54, 56)':'rgb(241, 243, 245)');await readable(button);
    await page.keyboard.press('Tab');await button.focus();expect(await button.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
    await advanced.getByLabel('台词列表').fill('{secret}');await button.click();await readable(advanced.getByText('保存失败，请检查内容或刷新后重试'));
    if(dark){await modal.evaluate(el=>{el.scrollTop=0;});await modal.screenshot({path:'artifacts/settings-dark.png'});}
  }
  await modal.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('alertdialog',{name:'放弃未保存修改？'}).getByRole('button',{name:'丢弃修改并关闭',exact:true}).click();
  await page.getByRole('button', { name: '展开大肥鱼', exact: true }).click();
  const widget = page.getByTestId('bigfish-widget');
  await wave(widget);await expect(widget.locator('.bf-dialogue-text')).toBeVisible();
  await widget.getByRole('button', { name: '设置', exact: true }).click();
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await readable(widget.locator('.bf-dialogue-text'));
  await readable(widget.getByLabel('活跃程度'));
  await widget.getByRole('button', { name: '完整设置', exact: true }).click();
  await readable(widget.locator('.bf-disclosure > summary').first());
  await widget.locator('.bf-popover').screenshot({ path: 'artifacts/popover-dark.png' });
});
