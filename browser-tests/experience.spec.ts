import {test,expect,type Page} from '@playwright/test';

async function expandPet(page:Page){
 await page.addInitScript(()=>{if(!localStorage.getItem('bigfish.demo.preferences.v1'))localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'quiet'}));});
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 return page.getByTestId('bigfish-widget');
}

async function trackPreferenceWrites(page:Page){
 await page.addInitScript(()=>{
  const writes={count:0};Object.assign(window,{__preferenceWrites:writes});
  const setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='bigfish.demo.preferences.v1')writes.count++;return setItem.call(this,key,value);};
 });
}
const preferenceWrites=(page:Page)=>page.evaluate(()=>(window as unknown as {__preferenceWrites:{count:number}}).__preferenceWrites.count);
const resetPreferenceWrites=(page:Page)=>page.evaluate(()=>{(window as unknown as {__preferenceWrites:{count:number}}).__preferenceWrites.count=0;});

test('transparent stage space lets the underlying page receive the click',async({page})=>{
 const widget=await expandPet(page),stage=widget.locator('.bf-pet-stage'),box=(await stage.boundingBox())!;
 const point={x:box.x+20,y:box.y+box.height*.5};
 await page.evaluate(({x,y})=>{const button=document.createElement('button');button.id='under-pet';button.textContent='底层按钮';button.style.cssText=`position:fixed;left:${x-30}px;top:${y-20}px;width:60px;height:40px;z-index:0`;button.onclick=()=>button.dataset.clicked='true';document.body.append(button);},point);
 const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,point);expect(hit).toBe('under-pet');
 await page.mouse.click(point.x,point.y);await expect(page.locator('#under-pet')).toHaveAttribute('data-clicked','true');
});

test('the Web pet shrinks with the available CSS viewport instead of growing unchecked with browser zoom',async({page})=>{
 const widget=await expandPet(page),stage=widget.locator('.bf-pet-stage');
 await page.setViewportSize({width:1360,height:980});const wide=(await stage.boundingBox())!.width;
 await page.setViewportSize({width:680,height:980});await expect.poll(async()=>(await stage.boundingBox())!.width).toBeLessThan(wide*.65);
 await widget.screenshot({path:'artifacts/companion/ux-pet-680.png'});
 await expect.poll(()=>widget.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
});

test('area notices are compact, dismissible and cleared by taking control of the pet',async({page})=>{
 const widget=await expandPet(page);await widget.getByRole('button',{name:'叫回来',exact:true}).click();
 const notice=widget.locator('.bf-area-notice');await expect(notice).toBeVisible();
 await widget.screenshot({path:'artifacts/companion/ux-area-notice.png'});
 await expect(notice.getByRole('button',{name:'关闭活动区域提示',exact:true})).toBeVisible();
 expect((await notice.boundingBox())!.height).toBeLessThanOrEqual(72);
 await notice.getByRole('button',{name:'关闭活动区域提示',exact:true}).click();await expect(notice).toHaveCount(0);
 await widget.getByRole('button',{name:'叫回来',exact:true}).click();await expect(notice).toBeVisible();
 const body=(await widget.locator('.bf-pet-stage').boundingBox())!;await page.mouse.move(body.x+body.width*.7,body.y+body.height*.45);await page.mouse.down();await page.mouse.move(body.x+body.width*.7-45,body.y+body.height*.45-30,{steps:6});await page.mouse.up();
 await expect(notice).toHaveCount(0);
});

test('corner resizing changes size continuously without moving the pet and persists',async({page})=>{
 const widget=await expandPet(page),stage=widget.locator('.bf-pet-stage'),before=(await stage.boundingBox())!;
 const position=await widget.evaluate(el=>({right:el.style.right,bottom:el.style.bottom}));
 const handle=widget.getByRole('slider',{name:'调整角色大小',exact:true});await expect(handle).toBeVisible();const grip=(await handle.boundingBox())!;
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+10,grip.y+grip.height/2-55,{steps:8});await page.mouse.up();
 await expect.poll(async()=>(await stage.boundingBox())!.width).toBeGreaterThan(before.width+20);
 expect(await widget.evaluate(el=>({right:el.style.right,bottom:el.style.bottom}))).toEqual(position);
 const size=await page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).size);expect(size).toBeGreaterThan(180);expect(size).toBeLessThanOrEqual(300);
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('bigfish.demo.preferences.v1'))!).size).toBe(size);
});

test('corner resizing previews without writes, commits once on release and stays stable after reload',async({page})=>{
 await trackPreferenceWrites(page);const widget=await expandPet(page);await resetPreferenceWrites(page);
 const stage=widget.locator('.bf-pet-stage'),before=(await stage.boundingBox())!;
 const handle=widget.getByRole('slider',{name:'调整角色大小',exact:true}),grip=(await handle.boundingBox())!;
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
 await page.mouse.move(grip.x+grip.width/2+10,grip.y+grip.height/2-55,{steps:8});
 await expect.poll(async()=>(await stage.boundingBox())!.width).toBeGreaterThan(before.width+20);
 await expect(handle).toHaveAttribute('data-dragging','true');
 expect((await stage.boundingBox())!.x).toBeLessThan(before.x-20);
 expect(await preferenceWrites(page)).toBe(0);
 const previewWidth=(await stage.boundingBox())!.width;await page.mouse.up();
 await expect.poll(()=>preferenceWrites(page)).toBe(1);
 const size=await page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).size);
 await expect.poll(async()=>(await stage.boundingBox())!.width).toBeCloseTo(previewWidth,5);
 await page.waitForTimeout(250);expect(await preferenceWrites(page)).toBe(1);
 expect((await stage.boundingBox())!.width).toBeCloseTo(previewWidth,5);
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).size)).toBe(size);
 await expect.poll(async()=>(await stage.boundingBox())!.width).toBeCloseTo(previewWidth,5);
});

test('the corner does not change the size or open a panel on click and supports keyboard sizing',async({page})=>{
 await page.setViewportSize({width:680,height:850});
 await page.addInitScript(()=>localStorage.setItem('bigfish.position.v1',JSON.stringify({right:999,bottom:999})));
 await trackPreferenceWrites(page);
 const widget=await expandPet(page),stage=widget.locator('.bf-pet-stage');
 const handle=widget.getByRole('slider',{name:'调整角色大小',exact:true}),grip=(await handle.boundingBox())!;
 const x=grip.x+grip.width/2,y=grip.y+grip.height/2;
 const initialWidth=(await stage.boundingBox())!.width;
 await resetPreferenceWrites(page);
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+2,y+1);await page.mouse.up();
 await expect(widget.getByRole('group',{name:'角色大小',exact:true})).toHaveCount(0);
 await expect(handle).toHaveAttribute('aria-valuenow','180');
 expect(await preferenceWrites(page)).toBe(0);
 await handle.press('Shift+ArrowDown');
 await expect(handle).toHaveAttribute('aria-valuenow','170');
 await expect.poll(async()=>(await stage.boundingBox())!.width).toBeLessThan(initialWidth-7);
 await expect.poll(()=>preferenceWrites(page)).toBe(1);
 await handle.press('Shift+ArrowUp');
 await expect(handle).toHaveAttribute('aria-valuenow','180');
 await expect.poll(async()=>(await stage.boundingBox())!.width).toBeCloseTo(initialWidth,4);
 await expect.poll(()=>preferenceWrites(page)).toBe(2);
});

test('all toolbar actions stay together at the smallest pet size',async({page})=>{
 await page.setViewportSize({width:320,height:620});
 await page.addInitScript(()=>localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'quiet',size:120})));
 const widget=await expandPet(page),card=widget.locator('.bf-card');
 const actions=card.locator('.bf-card-actions > button');
 await expect(actions).toHaveCount(3);
 const bar=(await card.boundingBox())!;
 const boxes=await Promise.all((await actions.all()).map(action=>action.boundingBox()));
 for(const box of boxes){
  expect(box!.x).toBeGreaterThanOrEqual(bar.x);
  expect(box!.x+box!.width).toBeLessThanOrEqual(bar.x+bar.width);
  expect(box!.y+box!.height/2).toBeCloseTo(boxes[0]!.y+boxes[0]!.height/2);
 }
 const corner=card.getByRole('slider',{name:'调整角色大小',exact:true});
 const bounds=(await corner.boundingBox())!;
 expect(bounds.y).toBeLessThan(bar.y);
 expect(bounds.y+bounds.height).toBeLessThanOrEqual(boxes[2]!.y);
 expect(bar.x+bar.width-bounds.x-bounds.width).toBeLessThanOrEqual(2);
 expect(await corner.evaluate(el=>getComputedStyle(el).cursor)).toBe('nesw-resize');
 await actions.nth(2).click();
 await expect(page.getByRole('button',{name:'展开大肥鱼',exact:true})).toBeVisible();
});

test('narrow Web drag resizing previews a smaller stage and persists it',async({page})=>{
 await page.setViewportSize({width:680,height:850});
 const widget=await expandPet(page),stage=widget.locator('.bf-pet-stage');
 const handle=widget.getByRole('slider',{name:'调整角色大小',exact:true}),grip=(await handle.boundingBox())!;
 const initialWidth=(await stage.boundingBox())!.width;
 const x=grip.x+grip.width/2,y=grip.y+grip.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-40,y+20,{steps:7});
 await expect.poll(async()=>(await stage.boundingBox())!.width).toBeLessThan(initialWidth-30);
 const previewWidth=(await stage.boundingBox())!.width;
 await page.mouse.up();
 await expect(handle).toHaveAttribute('data-dragging','false');
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 await expect.poll(async()=>(await stage.boundingBox())!.width).toBeCloseTo(previewWidth,4);
});

test('cancelling corner resizing at the edge restores size and placement without a write',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('bigfish.position.v1',JSON.stringify({right:9999,bottom:9999})));
 await trackPreferenceWrites(page);const widget=await expandPet(page);await resetPreferenceWrites(page);
 const stage=widget.locator('.bf-pet-stage'),before=(await stage.boundingBox())!;
 const handle=widget.getByRole('slider',{name:'调整角色大小',exact:true}),grip=(await handle.boundingBox())!;
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
 await page.mouse.move(grip.x+grip.width/2+32,grip.y+grip.height/2,{steps:6});
 await expect.poll(async()=>(await stage.boundingBox())!.width).toBeGreaterThan(before.width+10);
 expect(await preferenceWrites(page)).toBe(0);
 await handle.dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:0});
 await expect.poll(()=>stage.boundingBox()).toEqual(before);
 await page.mouse.up();expect(await preferenceWrites(page)).toBe(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bigfish.demo.preferences.v1')!).size??180)).toBe(180);
});

async function desktopGestureMock(page:Page){
 await page.addInitScript(()=>{
  const calls:{settings:string[];drag:boolean[]}={settings:[],drag:[]};Object.assign(window,{__desktopCalls:calls});
  const bridge={settings:(page?:string)=>calls.settings.push(page??''),dragState:(active:boolean)=>calls.drag.push(active),drag:()=>{},walkPolicy:()=>{},onMotionState:()=>()=>{},recall:()=>{},onRecall:()=>()=>{}};
  Object.defineProperty(window,'bigfishDesktop',{value:bridge,configurable:true});
  localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:'quiet'}));
 });
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();return page.getByTestId('bigfish-widget');
}

test('desktop clicks below the drag threshold do not cancel walking',async({page})=>{
 const widget=await desktopGestureMock(page),body=(await widget.locator('.bf-pet-stage').boundingBox())!;
 await page.mouse.move(body.x+body.width*.7,body.y+body.height*.45);await page.mouse.down();await page.mouse.move(body.x+body.width*.7+2,body.y+body.height*.45+2);await page.mouse.up();
 expect(await page.evaluate(()=>(window as unknown as {__desktopCalls:{drag:boolean[]}}).__desktopCalls.drag)).toEqual([]);
 await page.mouse.move(body.x+body.width*.7,body.y+body.height*.45);await page.mouse.down();await page.mouse.move(body.x+body.width*.7-20,body.y+body.height*.45-20,{steps:4});await page.mouse.up();
 expect(await page.evaluate(()=>(window as unknown as {__desktopCalls:{drag:boolean[]}}).__desktopCalls.drag)).toEqual([true,false]);
});

test('desktop area recovery opens the native settings window at the area editor',async({page})=>{
 const widget=await desktopGestureMock(page);await widget.getByRole('button',{name:'叫回来',exact:true}).click();await widget.getByRole('button',{name:'设置回家点',exact:true}).click();
 expect(await page.evaluate(()=>(window as unknown as {__desktopCalls:{settings:string[]}}).__desktopCalls.settings)).toEqual(['activity-area']);
});
