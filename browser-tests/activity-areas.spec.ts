import {test,expect,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
async function seed(page:Page,area:string|null=null){await page.addInitScript(raw=>{Math.random=()=>0;localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'occasional',richness:2,lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',movement:'screen',restMin:5,restMax:5,speed:100,activityOverrides:true})}));if(raw!==null)localStorage.setItem('bigfish.activity-area.v1',raw);},area);await page.goto('/');}
test('device map drawing and keyboard fields save bounded areas and a home without altering portable schemes',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByTestId('activity-area-disclosure').locator('summary').click();const panel=page.getByTestId('activity-area-settings'),map=panel.getByRole('img',{name:'活动区域地图',exact:true});
 await panel.getByRole('button',{name:'添加允许区',exact:true}).click();await panel.getByLabel('允许区 x',{exact:true}).fill('5');await panel.getByLabel('允许区 width',{exact:true}).fill('90');
 await map.click();await panel.getByRole('button',{name:'画禁行区',exact:true}).click();await map.hover();const box=(await map.boundingBox())!;await page.mouse.move(box.x+box.width*.4,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4,{steps:5});await page.mouse.up();
 await expect(panel.getByLabel('禁行区 1 width',{exact:true})).toHaveValue('20');await panel.getByLabel('禁行区 1 height',{exact:true}).fill('15');
 await panel.getByRole('button',{name:'设回家点',exact:true}).click();await map.hover();await map.click({position:{x:box.width*.8,y:box.height*.8}});await panel.getByRole('button',{name:'保存活动区域',exact:true}).click();await expect(panel.getByRole('status').filter({hasText:'本设备活动区域与回家点已保存'})).toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.activity-area.v1')!));expect(saved.config.enabled).toBe(true);expect(saved.config.allowed).toEqual({x:.05,y:0,width:.9,height:1});expect(saved.config.forbidden).toHaveLength(1);expect(saved.config.home.x).toBeCloseTo(.8,1);expect(await page.evaluate(()=>localStorage.getItem('bigfish.demo.preferences.v1'))).not.toContain('activity-area');
 await page.reload();await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByTestId('activity-area-disclosure').locator('summary').click();await expect(panel.getByLabel('允许区 width',{exact:true})).toHaveValue('90');await expect(panel.getByLabel('禁行区 1 height',{exact:true})).toHaveValue('15');
 await page.setViewportSize({width:360,height:700});await expect.poll(()=>panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
test('automatic screen travel chooses a reachable side of a forbidden wall and protects actual full widget bounds',async({page})=>{
 const config={version:1,enabled:true,allowed:null,forbidden:[{x:.4,y:0,width:.2,height:1}],home:null};await seed(page,JSON.stringify({revision:1,config}));await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await page.mouse.move(5,5);const widget=page.getByTestId('bigfish-widget');
 await expect(widget.locator('canvas')).toHaveAttribute('data-motion','walk',{timeout:20000});
 await widget.evaluate(el=>{const rows:{x:number;y:number;right:number;bottom:number}[]=[];(window as any).__areaBounds=rows;(window as any).__areaTimer=setInterval(()=>{const r=el.getBoundingClientRect();rows.push({x:r.x,y:r.y,right:r.right,bottom:r.bottom});},32);});
 await expect.poll(()=>page.evaluate(()=>(window as any).__areaBounds.length)).toBeGreaterThan(20);const samples=await page.evaluate(()=>{clearInterval((window as any).__areaTimer);return (window as any).__areaBounds as {x:number;y:number;right:number;bottom:number}[];});
 const obstacle={left:8+(1360-16)*.4,right:8+(1360-16)*.6};for(const b of samples){expect(b.x>=obstacle.right-.01||b.right<=obstacle.left+.01).toBe(true);expect(b.x>=8&&b.right<=1360-8+.01&&b.y>=8&&b.bottom<=980-20+.01).toBe(true);}expect(new Set(samples.map(b=>`${b.x}:${b.y}`)).size).toBeGreaterThan(1);
});
test('malformed device data stops automatic movement and a deliberate reset repairs it; recall is never silently queued in fixed mode',async({page})=>{
 await seed(page,'{broken');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await page.mouse.move(5,5);const widget=page.getByTestId('bigfish-widget');
 await expect(widget.getByRole('status').filter({hasText:'放不下完整角色'})).toBeVisible();const before=await widget.boundingBox();const canvas=widget.locator('canvas'),count=Number(await canvas.getAttribute('data-render-count'));await expect.poll(async()=>Number(await canvas.getAttribute('data-render-count'))).toBeGreaterThan(count+10);expect(await widget.boundingBox()).toEqual(before);await expect(canvas).not.toHaveAttribute('data-motion','walk');
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByTestId('activity-area-disclosure').locator('summary').click();const panel=page.getByTestId('activity-area-settings');await expect(panel.getByRole('alert')).toContainText('区域配置无法读取');await panel.getByRole('button',{name:'恢复本设备默认',exact:true}).click();await panel.getByRole('button',{name:'保存活动区域',exact:true}).click();await expect(panel.getByRole('alert')).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.activity-area.v1')!).config.enabled)).toBe(false);
 await page.getByRole('button',{name:'关闭',exact:true}).last().click();
 await page.locator('#demo-state').selectOption('generating');
 const recall=widget.getByRole('button',{name:'叫回来',exact:true});
 const notice=widget.getByTestId('activity-area-status');
 await recall.click();await expect(notice).toContainText('已记下回家请求');
 await page.evaluate(()=>{const key='bigfish.demo.preferences.v1',prefs=JSON.parse(localStorage.getItem(key)!);localStorage.setItem(key,JSON.stringify({...prefs,lifestyleJson:JSON.stringify({...JSON.parse(prefs.lifestyleJson),movement:'fixed'})}));dispatchEvent(new Event('storage'));});
 await expect(widget).toHaveAttribute('data-movement','fixed');
 await expect(notice).toContainText('当前为固定、安静或缺少行走素材');
 await recall.click();await expect(notice).toContainText('当前为固定、安静或缺少行走素材');
});
test('Web recall without a custom home walks from a distant drag to the default lower-right safe point',async({page})=>{
 test.setTimeout(90000);const config={version:1,enabled:true,allowed:{x:.05,y:.05,width:.9,height:.9},forbidden:[],home:null};await seed(page,JSON.stringify({revision:1,config}));await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');
 const body=(await widget.locator('.bf-pet-stage').boundingBox())!;await page.mouse.move(body.x+body.width*.7,body.y+body.height*.45);await page.mouse.down();await page.mouse.move(180,180,{steps:8});await page.mouse.up();await widget.hover();
 const away=(await widget.boundingBox())!,initialExpected=await widget.evaluate((el,allowed)=>{const r=el.getBoundingClientRect(),area={x:8,y:8,width:innerWidth-16,height:innerHeight-28};return {x:Math.floor(area.x+(allowed.x+allowed.width)*area.width-r.width),y:Math.floor(area.y+(allowed.y+allowed.height)*area.height-r.height)};},config.allowed);
 expect(Math.hypot(away.x-initialExpected.x,away.y-initialExpected.y)).toBeGreaterThan(100);await widget.getByRole('button',{name:'叫回来',exact:true}).click();await page.mouse.move(5,5);
 await expect(widget.locator('canvas')).toHaveAttribute('data-motion','walk',{timeout:20000});
 await expect.poll(async()=>{const b=(await widget.boundingBox())!,area={x:8,y:8,width:1360-16,height:980-28},right=Math.floor(area.x+(config.allowed.x+config.allowed.width)*area.width),bottom=Math.floor(area.y+(config.allowed.y+config.allowed.height)*area.height);return Math.abs(b.x+b.width-right)<1&&Math.abs(b.y+b.height-bottom)<1;},{timeout:60000}).toBe(true);await expect(widget.getByRole('status').filter({hasText:'还没有保存回家点'})).toHaveCount(0);
});

test('default home is explained and drawn in settings, and a custom home can be restored to default',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByTestId('activity-area-disclosure').locator('summary').click();const panel=page.getByTestId('activity-area-settings');
 await expect(panel.getByText('回家点表示角色对准的位置，边缘时任一部位到点即可；允许区只限制自动散步。',{exact:true})).toBeVisible();await expect(panel.getByText('默认回家点：允许区内靠近屏幕右下角的安全位置',{exact:true})).toBeVisible();const marker=panel.locator('.bf-area-home');await expect(marker).toBeVisible();const transform=await marker.getAttribute('transform'),coordinates=transform?.match(/translate\(([\d.]+) ([\d.]+)\)/);expect(Number(coordinates?.[1])).toBeGreaterThan(50);expect(Number(coordinates?.[2])).toBeGreaterThan(50);
 await panel.getByRole('button',{name:'把当前位置设为回家点',exact:true}).click();await expect(panel.getByText('默认回家点：允许区内靠近屏幕右下角的安全位置',{exact:true})).toHaveCount(0);await panel.getByRole('button',{name:'恢复默认回家点',exact:true}).click();await expect(panel.getByText('默认回家点：允许区内靠近屏幕右下角的安全位置',{exact:true})).toBeVisible();await expect(panel.getByLabel('回家点 x',{exact:true})).toHaveCount(0);
});

test('recall without any safe default point still fails as home-blocked',async({page})=>{
 const config={version:1,enabled:true,allowed:null,forbidden:[{x:0,y:0,width:1,height:1}],home:null};await seed(page,JSON.stringify({revision:1,config}));await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');await widget.getByRole('button',{name:'叫回来',exact:true}).click();await expect(widget.getByTestId('activity-area-status')).toHaveText('回家点无法安全到达，请调整回家点或把大肥鱼拖到同一可达区域。');
});

test('Web recall precheck recovers an unsafe widget top and walks to the safe saved home',async({page})=>{
 const config={version:1,enabled:true,allowed:{x:.5888948367,y:.0747802734,width:.4111051633,height:.8892521973},forbidden:[],home:{x:.85,y:.55}};await seed(page,JSON.stringify({revision:1,config}));await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');
 const body=(await widget.locator('.bf-pet-stage').boundingBox())!;await page.mouse.move(body.x+body.width*.7,body.y+body.height*.45);await page.mouse.down();await page.mouse.move(body.x+body.width*.7,5,{steps:8});await page.mouse.up();await page.mouse.move(5,5);
 const away=(await widget.boundingBox())!;expect(away.y).toBeLessThan(8+(980-28)*config.allowed.y);
 await widget.getByRole('button',{name:'叫回来',exact:true}).click();await page.mouse.move(5,5);const immediately=(await widget.boundingBox())!;expect(Math.abs(immediately.x-away.x)).toBeLessThan(2);
 await expect(widget.locator('canvas')).toHaveAttribute('data-motion','walk',{timeout:20000});const homePoint=await page.evaluate(home=>({x:8+home.x*(innerWidth-16),y:8+home.y*(innerHeight-28)}),config.home);
 await expect.poll(async()=>{const b=(await widget.boundingBox())!;return homePoint.x>=b.x-.01&&homePoint.x<=b.x+b.width+.01&&homePoint.y>=b.y-.01&&homePoint.y<=b.y+b.height+.01;},{timeout:15000}).toBe(true);await expect(widget.getByRole('status').filter({hasText:'回家点无法安全到达'})).toHaveCount(0);
});

test('explicit Web recall leaves a too-short allowed band and really walks the full widget home',async({page})=>{
 test.setTimeout(90000);const config={version:1,enabled:true,allowed:{x:.05,y:.5,width:.9,height:.05},forbidden:[],home:{x:.15,y:.525}};await seed(page,JSON.stringify({revision:1,config}));await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');
 await expect(widget.getByRole('status').filter({hasText:'放不下完整角色'})).toBeVisible();const before=(await widget.boundingBox())!,homePoint=await page.evaluate(home=>({x:8+home.x*(innerWidth-16),y:8+home.y*(innerHeight-28)}),config.home);
 expect(before.height).toBeGreaterThan((980-28)*config.allowed.height);expect(Math.hypot(before.x+before.width/2-homePoint.x,before.y+before.height/2-homePoint.y)).toBeGreaterThan(100);await widget.getByRole('button',{name:'叫回来',exact:true}).click();await page.mouse.move(5,5);const immediately=(await widget.boundingBox())!;expect(Math.hypot(immediately.x-before.x,immediately.y-before.y)).toBeLessThan(20);
 await expect(widget.locator('canvas')).toHaveAttribute('data-motion','walk',{timeout:20000});await expect.poll(async()=>{const b=(await widget.boundingBox())!;return homePoint.x>=b.x-.01&&homePoint.x<=b.x+b.width+.01&&homePoint.y>=b.y-.01&&homePoint.y<=b.y+b.height+.01;},{timeout:60000}).toBe(true);await expect(widget.getByRole('status').filter({hasText:'回家点无法安全到达'})).toHaveCount(0);
});

test('a saved Web home is reached through real walk frames after a user drag rather than jumping to it',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByTestId('activity-area-disclosure').locator('summary').click();const panel=page.getByTestId('activity-area-settings');
 await expect(panel.getByRole('button',{name:'把当前位置设为回家点',exact:true})).toBeEnabled();await panel.getByRole('button',{name:'把当前位置设为回家点',exact:true}).click();await panel.getByRole('button',{name:'保存活动区域',exact:true}).click();const home=(await widget.boundingBox())!,homePoint={x:home.x+home.width/2,y:home.y+home.height/2};
 await page.getByRole('button',{name:'关闭',exact:true}).last().click();const body=(await widget.locator('.bf-pet-stage').boundingBox())!;await page.mouse.move(body.x+body.width*.7,body.y+body.height*.45);await page.mouse.down();await page.mouse.move(body.x+body.width*.7-45,body.y+body.height*.45-30,{steps:8});await page.mouse.up();await page.mouse.move(5,5);
 const away=(await widget.boundingBox())!;expect(Math.abs(away.x-home.x)).toBeGreaterThan(20);await widget.getByRole('button',{name:'叫回来',exact:true}).click();await page.mouse.move(5,5);const immediately=(await widget.boundingBox())!;expect(Math.abs(immediately.x-away.x)).toBeLessThan(2);
 await expect(widget.locator('canvas')).toHaveAttribute('data-motion','walk',{timeout:20000});await expect.poll(async()=>{const b=(await widget.boundingBox())!;return homePoint.x>=b.x-.01&&homePoint.x<=b.x+b.width+.01&&homePoint.y>=b.y-.01&&homePoint.y<=b.y+b.height+.01;},{timeout:15000}).toBe(true);
});

test('stopping a queued or walking recall cancels the route without moving the pet home',async({page})=>{
 const config={version:1,enabled:true,allowed:null,forbidden:[],home:{x:.15,y:.4}};
 await seed(page,JSON.stringify({revision:1,config}));
 await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget'),stage=widget.locator('.bf-pet-stage');
 const recall=widget.getByRole('button',{name:'叫回来',exact:true}),stop=widget.getByRole('button',{name:'停止回家',exact:true});
 const state=page.locator('#demo-state'),notice=widget.getByTestId('activity-area-status'),canvas=stage.locator('canvas');
 const position=async()=>{const {x,y}=(await stage.boundingBox())!;return {x,y};};
 await state.selectOption('generating');await recall.click();
 await expect(notice).toContainText('已记下回家请求');await stop.click();
 await expect(notice).toHaveCount(0);await state.selectOption('idle');
 const away=await position();await page.waitForTimeout(1250);expect(await position()).toEqual(away);
 await recall.click();await expect(notice).toContainText('正在沿安全路线回家');
 await expect(canvas).toHaveAttribute('data-motion','walk');
 await expect.poll(async()=>Math.abs((await position()).x-away.x)).toBeGreaterThan(20);
 await stop.click();await expect(notice).toHaveCount(0);
 const stopped=await position();await page.mouse.move(5,5);await page.waitForTimeout(500);
 expect(await position()).toEqual(stopped);await expect(canvas).not.toHaveAttribute('data-motion','walk');
});

for(const dark of [false,true])test(`a ${dark?'dark':'light'} compact area editor keeps saving reachable after drawing and scrolling`,async({page})=>{
 await page.setViewportSize({width:600,height:560});await seed(page);
 await page.addStyleTag({path:fileURLToPath(new URL('./fixtures/dsh-theme.css',import.meta.url))});
 await page.evaluate(value=>document.body.toggleAttribute('data-ds-dark-theme',value),dark);
 await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();const widget=page.getByTestId('bigfish-widget');
 await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();
 const popover=widget.locator('.bf-popover');await popover.getByTestId('activity-area-disclosure').locator('summary').click();
 const panel=popover.getByTestId('activity-area-settings'),map=panel.getByRole('img',{name:'活动区域地图',exact:true}),save=panel.getByRole('button',{name:'保存活动区域',exact:true});
 await expect(save).toBeDisabled();
 const draw=async(kind:'画允许区'|'画禁行区',from:[number,number],to:[number,number])=>{
  await panel.getByRole('button',{name:kind,exact:true}).click();await map.scrollIntoViewIfNeeded();const box=(await map.boundingBox())!;
  const hit=await map.evaluate((el,point)=>{const r=el.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width*point[0]!,r.y+r.height*point[1]!);return {reachable:target===el||!!target&&el.contains(target),target:target?.outerHTML.slice(0,250),map:{x:r.x,y:r.y,width:r.width,height:r.height}};},from);
  expect(hit.reachable,JSON.stringify(hit)).toBe(true);
  await page.mouse.move(box.x+box.width*from[0],box.y+box.height*from[1]);await page.mouse.down();
  await page.mouse.move(box.x+box.width*to[0],box.y+box.height*to[1],{steps:6});await page.mouse.up();
 };
 await draw('画允许区',[.05,.1],[.95,.9]);await draw('画禁行区',[.4,.2],[.6,.4]);
 await expect(panel.getByRole('status').filter({hasText:'有未保存修改'})).toBeVisible();
 await panel.locator('.bf-area-secondary-actions').scrollIntoViewIfNeeded();
 const bounds=(await popover.boundingBox())!,button=(await save.boundingBox())!;
 expect(button.y).toBeGreaterThanOrEqual(bounds.y);expect(button.y+button.height).toBeLessThanOrEqual(bounds.y+bounds.height);
 expect(await save.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);})).toBe(true);
 await save.click();await expect(panel.getByRole('status').filter({hasText:'本设备活动区域与回家点已保存'})).toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.activity-area.v1')!));
 expect(saved.config.allowed.x).toBeCloseTo(.05,1);expect(saved.config.allowed.width).toBeCloseTo(.9,1);expect(saved.config.forbidden).toHaveLength(1);
 expect(saved.config.forbidden[0].width).toBeCloseTo(.2,1);expect(saved.config.enabled).toBe(true);
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await widget.getByRole('button',{name:'设置',exact:true}).click();await widget.getByRole('button',{name:'完整设置',exact:true}).click();
 await popover.getByTestId('activity-area-disclosure').locator('summary').click();
 expect(Number(await panel.getByLabel('允许区 width',{exact:true}).inputValue())).toBeCloseTo(90,0);expect(Number(await panel.getByLabel('禁行区 1 width',{exact:true}).inputValue())).toBeCloseTo(20,0);
 await expect(panel.getByRole('button',{name:'保存活动区域',exact:true})).toBeDisabled();
});

test('an area save failure remains beside the save action and preserves the draft for retry',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByTestId('activity-area-disclosure').locator('summary').click();
 const panel=page.getByTestId('activity-area-settings');await panel.getByRole('button',{name:'添加允许区',exact:true}).click();await panel.getByLabel('允许区 width',{exact:true}).fill('85');
 await page.evaluate(()=>{const original=Storage.prototype.setItem;(window as any).__rejectAreaSave=true;Storage.prototype.setItem=function(key,value){if(key==='bigfish.activity-area.v1'&&(window as any).__rejectAreaSave)throw Error('测试：本设备暂时无法保存');return original.call(this,key,value);};});
 const save=panel.getByRole('button',{name:'保存活动区域',exact:true});await save.click();
 await expect(panel.getByTestId('activity-area-toolbar').getByRole('alert')).toHaveText('测试：本设备暂时无法保存');await expect(panel.getByLabel('允许区 width',{exact:true})).toHaveValue('85');await expect(save).toBeEnabled();
 expect(await page.evaluate(()=>localStorage.getItem('bigfish.activity-area.v1'))).toBeNull();
 await page.evaluate(()=>(window as any).__rejectAreaSave=false);await save.click();
 await expect(panel.getByRole('alert')).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.activity-area.v1')!).config.allowed.width)).toBe(.85);
});
