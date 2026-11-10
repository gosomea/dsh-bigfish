import {appearance,selectControl} from './helpers/settings.js';
import {wave} from './helpers/interactions.js';
import {test,expect,type Page} from '@playwright/test';
async function settings(page:Page){await page.getByRole('button',{name:'完整设置',exact:true}).first().click();return page.locator('.bf-settings:not(.bf-compact)').first();}
async function section(page:Page,name:string){await page.getByRole('navigation',{name:'大肥鱼设置分区'}).getByRole('button',{name,exact:true}).click();}

test('preset application and saved schemes preserve privacy while restoring real daily preferences',async({page})=>{
 let modelRequests=0;page.on('request',r=>{if(r.url().includes('/api/bigfish-companion'))modelRequests++;});
 await page.goto('/');const panel=await settings(page);
 await selectControl(panel.getByLabel('陪伴方案',{exact:true}),'preset:all');await expect(panel.getByLabel('陪伴方案',{exact:true})).toHaveAttribute('data-value','preset:balanced');
 await expect(panel.getByLabel('方案差异')).toContainText('不改变模型权限');await panel.getByRole('button',{name:'应用方案',exact:true}).click();
 await expect(panel.getByLabel('陪伴方案',{exact:true})).toHaveAttribute('data-value','preset:all');await expect(panel.getByTestId('lifestyle-settings')).toContainText('全能型预览版');
 await selectControl(panel.getByLabel('活跃程度',{exact:true}),'occasional');await panel.getByLabel('启用鞭策动作',{exact:true}).uncheck();
 await appearance(page);await selectControl(panel.getByLabel('消息显示',{exact:true}),'status');
 await section(page,'高级与数据');await panel.getByText('自定义能力',{exact:true}).click();await panel.getByLabel('怎么称呼你',{exact:true}).fill('阿鱼');
 await panel.getByText('方案管理',{exact:true}).click();await panel.getByLabel('方案名称',{exact:true}).fill('周末');await panel.getByRole('button',{name:'保存方案',exact:true}).click();await expect(panel.getByRole('button',{name:'使用 周末',exact:true})).toBeVisible();
 await appearance(page);await selectControl(panel.getByLabel('消息显示',{exact:true}),'both');
 await selectControl(panel.getByLabel('说话频率',{exact:true}),'2');
 await section(page,'日常陪伴');await selectControl(panel.getByLabel('活跃程度',{exact:true}),'frequent');await panel.getByLabel('启用鞭策动作',{exact:true}).check();
 await selectControl(panel.getByLabel('陪伴方案',{exact:true}),'saved:0');await expect(panel.getByLabel('活跃程度',{exact:true})).toHaveAttribute('data-value','frequent');
 await panel.getByRole('button',{name:'应用方案',exact:true}).click();await expect(panel.getByLabel('活跃程度',{exact:true})).toHaveAttribute('data-value','occasional');await expect(panel.getByLabel('启用鞭策动作',{exact:true})).not.toBeChecked();
 await appearance(page);await expect(panel.getByLabel('消息显示',{exact:true})).toHaveAttribute('data-value','status');
 await section(page,'高级与数据');await panel.getByText('恢复显示与行为默认',{exact:true}).first().click();await panel.getByRole('button',{name:'恢复显示与行为默认',exact:true}).click();await panel.getByRole('button',{name:'确认恢复显示与行为',exact:true}).click();
 await expect(panel.getByRole('button',{name:'使用 周末',exact:true})).toBeVisible();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!));expect(JSON.parse(stored.schemesJson)[0].version).toBe(2);expect(JSON.parse(stored.lifestyleJson).nickname).toBe('阿鱼');
 expect(modelRequests).toBe(0);
 await page.reload();await settings(page);await section(page,'高级与数据');await page.getByText('自定义能力',{exact:true}).click();await expect(page.getByLabel('怎么称呼你',{exact:true})).toHaveValue('阿鱼');
});

test('precise activity timing is optional, validates drafts and preserves legacy custom intervals',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',restMin:7,restMax:9})})));
 await page.goto('/');const panel=await settings(page);await expect(panel.locator('[data-settings-page="companionship"]')).toContainText('高级精确间隔');
 await section(page,'高级与数据');await panel.getByText('专家参数',{exact:true}).click();await panel.getByText('活动精确参数',{exact:true}).click();
 const override=panel.getByLabel('使用精确间隔覆盖',{exact:true}),number=panel.getByLabel('散步最短休息 · 秒',{exact:true});await expect(override).toBeChecked();await expect(number).toHaveValue('7');
 await number.fill('');await panel.getByRole('button',{name:'保存活动参数',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('需在');
 const stored=()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).lifestyleJson));expect((await stored()).restMin).toBe(7);
 await number.fill('8');await panel.getByRole('button',{name:'保存活动参数',exact:true}).click();await expect.poll(async()=>(await stored()).restMin).toBe(8);
 await override.uncheck();await expect(number).toBeDisabled();await section(page,'日常陪伴');await expect(panel.locator('[data-settings-page="companionship"]')).not.toContainText('高级精确间隔');
});

test('quiet mode suppresses idle gestures and direct interaction remains available',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const w=page.getByTestId('bigfish-widget');
 await w.getByRole('button',{name:'设置',exact:true}).click();await w.getByRole('button',{name:'安静 30 分钟',exact:true}).click();await w.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(w.locator('canvas')).toHaveAttribute('data-idle-active','false');await expect(w.locator('.bf-dialogue-text')).toHaveCount(0);
 await wave(w);await expect(w.locator('.bf-dialogue-text')).toContainText('我在这里');
});

test('nearby walk uses authored frames, remains on screen, and stops when work starts',async({page})=>{
 // Keep the cursor away from the route: hovering the pet deliberately pauses autonomous walking.
 // A fixed left route avoids spending this deadline on three randomly selected preparation clips.
 await page.addInitScript(()=>{Math.random=()=>0;localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'occasional',lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',restMin:5,restMax:5})}));});
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await page.mouse.move(5,5);const w=page.getByTestId('bigfish-widget');
 const canvas=w.getByRole('img',{name:'附近散步 · 行走试作',exact:true});await expect(canvas).toBeVisible({timeout:12000});
 await expect(canvas).toHaveAttribute('data-motion','walk');await expect(canvas).toHaveAttribute('data-frame',/^\d+$/);
 const first=await canvas.getAttribute('data-frame');await expect(canvas).not.toHaveAttribute('data-frame',first!);await expect(canvas).toHaveAttribute('data-motion','walk');
 await expect.poll(()=>w.evaluate(el=>{const b=el.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;})).toBe(true);
 await page.locator('#demo-state').selectOption('generating');await expect(w.getByRole('img',{name:'附近散步 · 行走试作'})).toHaveCount(0);await expect(w.locator('canvas')).toHaveAttribute('data-whip',/true|false/);
});
