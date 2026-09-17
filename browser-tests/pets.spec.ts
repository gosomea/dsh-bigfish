import {test,expect} from '@playwright/test';
async function library(page:any){await page.getByRole('button',{name:'完整设置',exact:true}).first().click();await page.getByText('角色库',{exact:true}).click();}
async function install(page:any){await library(page);await page.getByLabel('角色包文件').setInputFiles('dist/bigfish-adult-1.0.0.dshpet');await expect(page.getByLabel('角色动作预览')).toBeVisible();await page.getByRole('button',{name:'安装并使用',exact:true}).click();await expect(page.getByText('角色已安装并使用',{exact:true})).toBeVisible();}
test('import custom role, preview custom actions, persist, switch back and keep preferences',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await install(page);
 await expect(page.getByLabel('角色动作预览').locator('option')).toHaveCount(9);await page.getByLabel('角色动作预览').selectOption('adult:read');await expect(page.locator('.bf-pet-preview canvas')).toHaveAttribute('data-motion','adult:read');
 const f=await page.locator('.bf-pet-preview canvas').getAttribute('data-frame');await expect.poll(()=>page.locator('.bf-pet-preview canvas').getAttribute('data-frame')).not.toBe(f);
 await page.getByLabel('空闲互动',{exact:true}).selectOption('quiet');await page.getByLabel('启用鞭策动作',{exact:true}).check();await page.getByLabel('动作表现',{exact:true}).selectOption('0');await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-adult');
 await page.reload();await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-adult');await library(page);await expect(page.getByLabel('动作表现',{exact:true})).toHaveValue('0');await page.getByRole('button',{name:'使用大肥鱼',exact:true}).click();await expect(page.locator('.bf-demo-stage canvas')).not.toHaveAttribute('data-pet');await expect(page.getByLabel('空闲互动',{exact:true})).toHaveValue('quiet');await page.getByRole('button',{name:'移除',exact:true}).click();await expect(page.locator('.bf-role-card')).toHaveCount(1);expect(errors).toEqual([]);
});
test('new role honors quiet idle, real frame changes, reduced mode, drag and icon',async({page})=>{
 await page.goto('/');await install(page);await page.getByLabel('空闲互动',{exact:true}).selectOption('quiet');await page.getByLabel('动作表现',{exact:true}).selectOption('2');await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget'),canvas=widget.locator('canvas');await expect(canvas).toHaveAttribute('data-pet','bigfish-adult');
 await page.clock.install();await page.clock.fastForward(9000);await expect(canvas).toHaveAttribute('data-motion','adult:idle');await page.clock.fastForward(600000);await expect(canvas).toHaveAttribute('data-motion','adult:idle');await expect(widget.locator('.bf-dialogue-text')).toHaveCount(0);
 await page.locator('#demo-state').selectOption('tool-running');await expect(canvas).not.toHaveAttribute('data-motion','adult:idle');await page.locator('#demo-state').selectOption('failed');await expect(canvas).toHaveAttribute('data-motion','adult:error');
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();await widget.getByText('外观与动画',{exact:true}).click();await widget.getByLabel('动画',{exact:true}).selectOption('reduced');await widget.getByRole('button',{name:'关闭',exact:true}).click();await expect(canvas).toHaveAttribute('data-frame','0');await page.clock.fastForward(2000);await expect(canvas).toHaveAttribute('data-frame','0');
 const before=(await widget.boundingBox())!,b=(await canvas.boundingBox())!;await page.mouse.move(b.x+b.width*.6,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.6-70,b.y+b.height*.5-40,{steps:5});await page.mouse.up();expect((await widget.boundingBox())!.x).toBeCloseTo(before.x-70,0);
 await widget.getByRole('button',{name:'收起大肥鱼'}).click();await expect(page.locator('.bf-restore img')).toHaveAttribute('alt','大肥鱼 · 成年版');await page.locator('.bf-restore').click();await expect(widget).toBeVisible();await widget.screenshot({path:'artifacts/adult-widget.png'});
});
test('invalid role archive keeps current pet and shows a useful error',async({page})=>{await page.goto('/');await library(page);await page.getByLabel('角色包文件').setInputFiles({name:'bad.dshpet',mimeType:'application/zip',buffer:Buffer.from('invalid')});await expect(page.getByText('角色包大小无效（最大 32 MB）')).toBeVisible();await expect(page.locator('.bf-demo-stage canvas')).not.toHaveAttribute('data-pet');});

test('built-in role previews all 29 motions without changing the selected role or preferences', async ({page}) => {
 await page.goto('/');await install(page);
 await page.getByLabel('启用鞭策动作',{exact:true}).check();await page.getByLabel('动作表现',{exact:true}).selectOption('0');
 const card=page.locator('.bf-role-card').filter({hasText:'大肥鱼 · 内置'});
 await expect(card).not.toContainText('保留旧动作包');await card.getByRole('button',{name:'预览',exact:true}).click();
 await expect(page.getByLabel('角色动作预览',{exact:true})).toHaveCount(0);
 const select=page.getByLabel('内置角色动作预览'),preview=page.getByTestId('builtin-pet-preview'),canvas=preview.locator('canvas');
 await expect(select.locator('option')).toHaveCount(29);
 const values=await select.locator('option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value));
 for(const value of values){await select.selectOption(value);await expect(canvas).toHaveAttribute('data-motion',value);}
 await select.selectOption('sign-overhead');const frame=await canvas.getAttribute('data-frame');await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(frame);
 await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-adult');await expect(page.getByLabel('动作表现',{exact:true})).toHaveValue('0');
 await preview.screenshot({path:'artifacts/builtin-preview.png'});
 await page.getByRole('button',{name:'关闭预览',exact:true}).click();await expect(preview).toHaveCount(0);
});

test('adult Bigfish imports, previews every animation and preserves the original pet until selected', async ({page}) => {
 await page.goto('/');await library(page);
 await page.getByLabel('角色包文件').setInputFiles('dist/bigfish-adult-1.0.0.dshpet');
 const select=page.getByLabel('角色动作预览',{exact:true}),canvas=page.locator('.bf-pet-preview canvas');
 await expect(select.locator('option')).toHaveCount(9);
 await expect(page.locator('.bf-demo-stage canvas')).not.toHaveAttribute('data-pet');
 for(const id of ['idle','typing','waiting','error','success','read','wave','near-miss']){
  await select.selectOption('adult:'+id);await expect(canvas).toHaveAttribute('data-motion','adult:'+id);
  const before=await canvas.getAttribute('data-frame');await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(before);
 }
 await select.selectOption('adult:idle');await page.locator('.bf-pet-preview').screenshot({path:'artifacts/adult-preview-light.png'});
 await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
 await page.locator('.bf-pet-preview').screenshot({path:'artifacts/adult-preview-dark.png'});
 await page.getByRole('button',{name:'安装并使用',exact:true}).click();
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-adult');
 await page.reload();await expect(page.locator('.bf-demo-stage canvas')).toHaveAttribute('data-pet','bigfish-adult');
});

test('external role keeps identical bounds across air-swing and motion settings',async({page})=>{
 await page.goto('/');await library(page);await page.getByLabel('角色包文件').setInputFiles('dist/bigfish-adult-1.0.0.dshpet');await page.getByRole('button',{name:'安装并使用',exact:true}).click();await expect(page.getByText('角色已安装并使用',{exact:true})).toBeVisible();
 const canvas=page.locator('.bf-demo-stage canvas');await expect(canvas).toHaveAttribute('data-pet','bigfish-adult');const bounds=await canvas.getAttribute('data-bounds');
 await page.getByLabel('鞭策节奏',{exact:true}).selectOption('rhythm');await expect(canvas).toHaveAttribute('data-swing-style','indigo');await expect(canvas).toHaveAttribute('data-bounds',bounds!);
 await page.getByLabel('启用鞭策动作',{exact:true}).uncheck();await expect(canvas).toHaveAttribute('data-bounds',bounds!);
 await page.getByLabel('启用鞭策动作',{exact:true}).check();await page.getByLabel('动作表现',{exact:true}).selectOption('0');await expect(page.getByLabel('鞭策节奏',{exact:true})).toBeDisabled();await expect(page.getByText('当前动作档位没有空挥反应素材，互动已暂停；调高动作档位可启用。')).toBeVisible();await expect(canvas).toHaveAttribute('data-bounds',bounds!);
 await page.getByLabel('动作表现',{exact:true}).selectOption('2');await expect(page.getByLabel('鞭策节奏',{exact:true})).toBeEnabled();await expect(page.getByTestId('motion-availability')).toContainText('8 类动作');await expect(canvas).toHaveAttribute('data-bounds',bounds!);
 await page.getByLabel('鞭策节奏',{exact:true}).selectOption('rhythm');await page.getByRole('button',{name:'关闭',exact:true}).click();await page.locator('#demo-state').selectOption('generating');await expect(canvas).toHaveAttribute('data-whip','true');await expect(canvas).toHaveAttribute('data-motion','adult:near-miss');await expect(canvas).toHaveAttribute('data-bounds',bounds!);await page.locator('.bf-demo-stage').screenshot({path:'artifacts/adult-shared-swing.png'});await page.locator('#demo-state').selectOption('waiting-user');await expect(canvas).toHaveAttribute('data-whip','false');await expect(canvas).toHaveAttribute('data-motion','adult:waiting');
});

test('refined reading, repair and quiet frames animate; confirmation finishes and holds',async({page})=>{
 await page.goto('/');const canvas=page.locator('.bf-demo-stage canvas');
 for(const motion of ['read','repair']){await page.locator('#demo-motion').selectOption(motion);await expect(canvas).toHaveAttribute('data-atlas','work');const f=await canvas.getAttribute('data-frame');await expect.poll(()=>canvas.getAttribute('data-frame')).not.toBe(f);}
 await page.locator('#demo-motion').selectOption('');await page.locator('#demo-state').selectOption('waiting-user');await expect(canvas).toHaveAttribute('data-motion','confirm');await expect(canvas).toHaveAttribute('data-atlas','quiet');await expect(canvas).toHaveAttribute('data-whip','false');
 await page.clock.install();await page.clock.runFor(4000);await expect(canvas).toHaveAttribute('data-frame','7');await page.clock.runFor(15000);await expect(canvas).toHaveAttribute('data-frame','7');
 await page.locator('#demo-state').selectOption('idle');await page.clock.runFor(9000);await expect(canvas).toHaveAttribute('data-motion','breathe');await expect(canvas).toHaveAttribute('data-atlas','quiet');
 const frames=new Set<string|null>();for(let i=0;i<20;i++){await page.clock.runFor(300);frames.add(await canvas.getAttribute('data-frame'));}expect(frames.size).toBeGreaterThan(1);
});

test('closing settings during image decode releases the pending preview object URLs',async({page})=>{
 await page.addInitScript(()=>{
  const created=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),live=new Set<string>();
  (window as any).__livePetUrls=live;
  URL.createObjectURL=value=>{const url=created(value);live.add(url);return url;};URL.revokeObjectURL=url=>{live.delete(url);revoke(url);};
  const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=async function(){await decode.call(this);await new Promise(r=>setTimeout(r,1500));};
 });
 await page.goto('/');await library(page);await page.getByLabel('角色包文件').setInputFiles('dist/bigfish-adult-1.0.0.dshpet');
 await expect.poll(()=>page.evaluate(()=>(window as any).__livePetUrls.size)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__livePetUrls.size),{timeout:7000}).toBe(0);
});
