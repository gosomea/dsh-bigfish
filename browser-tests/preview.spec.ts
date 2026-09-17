import { test, expect } from '@playwright/test';
test('preview renders generated sprites, responds to task state, and preserves settings', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '大肥鱼的工作室' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('data-scene', 'rest');
  await page.selectOption('#demo-state', 'tool-running');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene', 'workshop');
  await expect(page.locator('canvas')).toHaveAttribute('data-whip', 'false');
  await page.selectOption('#demo-state', 'completed');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene', 'delivery');
  await expect(page.locator('canvas')).toHaveAttribute('data-whip', 'false');
  await page.getByRole('button', { name: '完整设置', exact: true }).click();
  await page.getByText('外观与动画',{exact:true}).click();await page.getByLabel('动画',{exact:true}).selectOption('reduced');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '完整设置', exact: true }).click();
  await page.getByText('外观与动画',{exact:true}).click();await expect(page.getByLabel('动画',{exact:true})).toHaveValue('reduced');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.screenshot({ path: 'artifacts/preview-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('floating controls synchronize settings, collapse, drag and reject invalid packs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '展开大肥鱼', exact: true }).click();
  const widget = page.getByTestId('bigfish-widget'); await expect(widget).toBeVisible();
  await widget.getByRole('button', { name: '设置', exact: true }).click();
  await widget.getByLabel('鞭策节奏').selectOption('rhythm');
  await expect(widget.getByText('保存在此浏览器', { exact: true })).toBeVisible();
  await widget.getByRole('button',{name:'完整设置',exact:true}).click();await widget.getByText('高级与重置',{exact:true}).click();await widget.getByText('内置大肥鱼动作编排（JSON）',{exact:true}).click();
  await widget.locator('input[accept="application/json,.json"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') });
  await expect(widget.getByText('动作包无效或缺少必要资源')).toBeVisible();
  await widget.getByRole('button', { name: '关闭', exact: true }).click();
  const drag = widget.locator('.bf-dialogue-text'); const box = (await drag.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.down(); await page.mouse.move(box.x - 90, box.y - 60, { steps: 8 }); await page.mouse.up();
  await widget.getByRole('button', { name: '收起大肥鱼' }).click(); await expect(widget).toHaveCount(0);
  await page.getByRole('button', { name: '展开大肥鱼', exact: true }).last().click();
  await expect(page.getByTestId('bigfish-widget')).toBeVisible();
});
test('narrow screen keeps preview controls in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('canvas')).toHaveAttribute('data-expression', /\d/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/preview-mobile.png', fullPage: true });
});

test('five sign routines play actual image frames and remain non-contact', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByLabel('动作表现').selectOption('2');await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('#demo-state').selectOption('idle');
  const canvas = page.locator('.bf-demo-stage canvas');
  await expect(canvas).toHaveAttribute('data-motion', 'wait-sign');
  for (const motion of ['wait-sign', 'sign-overhead', 'sign-peek', 'sign-tail', 'sign-bounce']) {
    await page.locator('#demo-motion').selectOption(motion);
    await expect(canvas).toHaveAttribute('data-motion', motion);
    await expect(canvas).toHaveAttribute('data-whip', 'false');
    const frame = await canvas.getAttribute('data-frame');
    await expect.poll(() => canvas.getAttribute('data-frame')).not.toBe(frame);
    await page.locator('.bf-demo-stage').screenshot({ path: `artifacts/${motion}.png` });
  }
  await page.locator('#demo-motion').selectOption('type');
  await expect(canvas).toHaveAttribute('data-atlas', 'motions');
  const frame = await canvas.getAttribute('data-frame'); await expect.poll(() => canvas.getAttribute('data-frame')).not.toBe(frame);
});

test('quiet mode stops high-energy frame cycling while keeping the companion visible', async ({ page }) => {
  await page.goto('/'); await page.locator('#demo-state').selectOption('generating'); await page.locator('#demo-motion').selectOption('type');
  const canvas = page.locator('.bf-demo-stage canvas'); await expect(canvas).toHaveAttribute('data-atlas', 'motions');
  await page.getByRole('button', { name: '完整设置', exact: true }).click(); await page.getByLabel('动作表现').selectOption('0');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-atlas', 'classic'); await expect(canvas).toHaveAttribute('data-frame', '3');
});

test('pet body and collapsed icon drag without accidental expansion; positions survive refresh', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '展开大肥鱼', exact: true }).click();
  const widget = page.getByTestId('bigfish-widget'); const canvas = widget.locator('canvas');
  const before = (await widget.boundingBox())!, body = (await canvas.boundingBox())!;
  await page.mouse.move(body.x + body.width * .7, body.y + body.height * .45); await page.mouse.down();
  await page.mouse.move(body.x + body.width * .7 - 100, body.y + body.height * .45 - 70, { steps: 8 }); await page.mouse.up();
  const after = (await widget.boundingBox())!; expect(after.x).toBeCloseTo(before.x - 100, 0); expect(after.y).toBeCloseTo(before.y - 70, 0);
  await widget.getByRole('button', { name: '收起大肥鱼' }).click(); const icon = page.locator('.bf-restore'); const box = (await icon.boundingBox())!;
  await page.mouse.move(box.x + 24, box.y + 24); await page.mouse.down(); await page.mouse.move(box.x - 66, box.y - 26, { steps: 8 }); await page.mouse.up();
  await expect(icon).toBeVisible(); await expect(widget).toHaveCount(0);
  const moved = (await icon.boundingBox())!; expect(moved.x).toBeCloseTo(box.x - 90, 0); expect(moved.y).toBeCloseTo(box.y - 50, 0);
  await icon.click(); await expect(widget).toBeVisible(); const saved = await page.evaluate(() => localStorage.getItem('bigfish.position.v1'));
  await page.reload(); await page.getByRole('button', { name: '展开大肥鱼', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('bigfish.position.v1'))).toBe(saved);
  await widget.getByRole('button', { name: '设置', exact: true }).click(); await expect(widget.locator('.bf-popover')).toBeVisible();
  await widget.locator('.bf-popover-top').getByRole('button', { name: '关闭' }).click(); await expect(widget.locator('.bf-popover')).toHaveCount(0);
});
test('air swing drives the rendered expression and stops during tool execution', async ({ page }) => {
  await page.goto('/'); await page.locator('#demo-state').selectOption('generating');
  await page.getByRole('button', { name: '完整设置', exact: true }).click();
  await page.getByText('高级与重置',{exact:true}).click();await page.getByLabel('按模型自动校准').uncheck(); await page.getByLabel('鞭策节奏').selectOption('rhythm');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const canvas = page.locator('.bf-demo-stage canvas'); await expect(canvas).toHaveAttribute('data-whip', 'true');
  await expect.poll(async () => canvas.evaluate(c => c.dataset.beat === 'react' && c.dataset.frame === c.dataset.beatPose && c.dataset.reaction !== 'none')).toBe(true);
  await page.locator('.bf-demo-stage').screenshot({ path: 'artifacts/whip-linked.png' });
  await page.locator('#demo-state').selectOption('tool-running'); await expect(canvas).toHaveAttribute('data-whip', 'false'); await expect(canvas).toHaveAttribute('data-reaction', 'none');
});

test('editable dialogue persists, previews animation, and tool rules validate',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByText('自定义台词与工具',{exact:true}).click();
 await page.getByLabel('台词分类').selectOption('read');await page.getByLabel('台词列表').fill('正在查看 {file}～\n我去找线索！');await page.getByRole('button',{name:'保存这一类台词'}).click();
 await expect(page.getByText('已保存',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'预览气泡与动作'}).click();await expect(page.getByLabel('台词动作预览').locator('canvas')).toHaveAttribute('data-motion','read');
 await page.getByText('工具与扩展 · 专属规则',{exact:true}).click();await page.getByLabel('工具名称或前缀').fill('my_reader*');await page.getByLabel('工具显示名称').fill('我的文件工具');await page.getByLabel('工具分类',{exact:true}).selectOption('read');await page.getByRole('button',{name:'保存工具规则'}).click();
 await expect(page.getByText('my_reader*',{exact:true})).toBeVisible();await page.screenshot({path:'artifacts/dialogue-settings.png'});
 await page.reload();await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByText('自定义台词与工具',{exact:true}).click();await page.getByText('工具与扩展 · 专属规则',{exact:true}).click();await expect(page.getByLabel('台词列表')).toHaveValue('正在查看 {file}～\n我去找线索！');await expect(page.getByText('my_reader*',{exact:true})).toBeVisible();
 await page.getByLabel('台词列表').fill('{secret}');await page.getByRole('button',{name:'保存这一类台词'}).click();await expect(page.getByText('保存失败，请检查内容或刷新后重试')).toBeVisible();
});

test('one card stays above the pet, with stats and controls together', async ({ page }) => {
 await page.goto('/'); await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),card=widget.locator('.bf-card');
 await expect(card).toHaveCount(1); await expect(widget.locator('.bf-toolbar')).toHaveCount(0);
 await expect(card.getByRole('button',{name:'设置',exact:true})).toBeVisible();
 await expect(widget.locator('.bf-stats')).toHaveCount(0);
 const assertGap=async()=>{const c=(await card.boundingBox())!,body=(await widget.locator('canvas').boundingBox())!;expect(body.y-c.y-c.height).toBeGreaterThanOrEqual(9);};
 await assertGap();await page.locator('#demo-state').selectOption('generating');
 await expect(card.locator('.bf-stats')).toBeVisible();await assertGap();
 await page.locator('#demo-state').selectOption('idle');await expect(card.locator('.bf-stats')).toHaveCount(0);
 await widget.screenshot({path:'artifacts/unified-pet.png'});
});

test('long dialogue, large pet and viewport changes respect measured bounds',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({size:300,bubbleWidth:400,bubbleFont:20,dialogueJson:JSON.stringify({idle:['我在这里等你呀～'.repeat(20)]})}));
  localStorage.setItem('bigfish.position.v1',JSON.stringify({right:16,bottom:700}));
 });
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget');
 for(const viewport of [{width:1360,height:980},{width:390,height:600},{width:640,height:360}]){
  await page.setViewportSize(viewport);
  await expect.poll(async()=>widget.evaluate(e=>{const w=e.getBoundingClientRect(),c=e.querySelector('.bf-card')!.getBoundingClientRect(),p=e.querySelector('canvas')!.getBoundingClientRect();return w.top>=7&&w.bottom<=innerHeight&&w.right<=innerWidth&&w.left>=0&&p.top>=c.bottom+9&&p.bottom<=innerHeight;})).toBe(true);
  await expect(widget.getByRole('button',{name:'设置',exact:true})).toBeVisible();
 }
 await widget.screenshot({path:'artifacts/unified-pet-small-viewport.png'});
 await page.evaluate(()=>{localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({bubbleEnabled:false}));dispatchEvent(new Event('storage'));});
 await expect(widget.locator('.bf-bubble')).toHaveCount(0);await expect(widget.locator('.bf-card')).toHaveCount(1);
 await widget.getByRole('button',{name:'设置',exact:true}).click();await expect(widget.locator('.bf-popover')).toBeVisible();
});

test('quiet companion does not rotate signs or messages over ten minutes and reload',async({page})=>{
 await page.clock.install();await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');
 await expect(widget.locator('canvas')).toHaveAttribute('data-motion','wait-sign');
 await page.clock.fastForward(9000);await expect(widget.locator('canvas')).toHaveAttribute('data-motion','breathe');await expect(widget.locator('.bf-dialogue-text')).toHaveCount(0);
 await page.clock.fastForward(600000);await expect(widget.locator('canvas')).toHaveAttribute('data-motion','breathe');await expect(widget.locator('.bf-dialogue-text')).toHaveCount(0);await expect(widget.locator('.bf-card-actions button')).toHaveCount(2);
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await expect(widget.locator('canvas')).toHaveAttribute('data-motion','breathe');await expect(widget.locator('.bf-dialogue-text')).toHaveCount(0);
 await page.locator('#demo-state').selectOption('waiting-user');await expect(widget.locator('.bf-state')).toContainText('等你确认');await page.clock.fastForward(600000);await expect(widget.locator('.bf-state')).toContainText('等你确认');
});

test('settings preview shares idle budget and display-only-buttons has no status leakage',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByText('预览当前效果',{exact:true}).click();const preview=page.getByLabel('行为预览');
 await expect(preview.locator('canvas')).toHaveAttribute('data-motion','wait-sign');await preview.getByRole('button',{name:'快进 30 秒',exact:true}).click();await expect(preview.locator('canvas')).toHaveAttribute('data-motion','breathe');await expect(preview.locator('.bf-dialogue-text')).toHaveCount(0);
 await page.getByLabel('空闲互动',{exact:true}).selectOption('frequent');await preview.getByRole('button',{name:'重新预览',exact:true}).click();await preview.getByRole('button',{name:'快进 120 秒',exact:true}).click();await expect(preview.locator('canvas')).toHaveAttribute('data-idle-active','true');
 await page.getByLabel('消息显示',{exact:true}).selectOption('buttons');await expect(preview.locator('.bf-state')).toHaveCount(0);await expect(preview.locator('.bf-dialogue-text')).toHaveCount(0);
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');await page.locator('#demo-state').selectOption('generating');await expect(widget.locator('.bf-state,.bf-stats,.bf-dialogue-text')).toHaveCount(0);await expect(widget.getByRole('button',{name:'设置',exact:true})).toBeVisible();
});

test('animation tiers, reduced motion, explicit whip off and saved preferences change actual rendering',async({page})=>{
 await page.goto('/');await page.locator('#demo-state').selectOption('generating');await page.locator('#demo-motion').selectOption('run');const canvas=page.locator('.bf-demo-stage canvas');
 await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByLabel('启用鞭策动作').uncheck();await page.getByLabel('动作表现').selectOption('2');await expect(canvas).toHaveAttribute('data-motion','run');await expect(canvas).toHaveAttribute('data-whip','false');
 await page.getByLabel('动作表现').selectOption('1');await expect(canvas).not.toHaveAttribute('data-motion','run');await page.getByLabel('动作表现').selectOption('0');await expect(canvas).toHaveAttribute('data-atlas','classic');
 await page.getByLabel('动作表现').selectOption('2');await expect(canvas).toHaveAttribute('data-motion','run');await page.getByText('外观与动画',{exact:true}).click();await page.getByLabel('动画',{exact:true}).selectOption('reduced');await expect(canvas).toHaveAttribute('data-reduced','true');const frame=await canvas.getAttribute('data-frame');await page.waitForTimeout(400);await expect(canvas).toHaveAttribute('data-frame',frame!);
 await page.getByLabel('动画',{exact:true}).selectOption('normal');await expect(canvas).toHaveAttribute('data-motion','run');await page.reload();await page.getByRole('button',{name:'完整设置',exact:true}).click();await expect(page.getByLabel('启用鞭策动作')).not.toBeChecked();await expect(page.getByLabel('动作表现')).toHaveValue('2');
});
