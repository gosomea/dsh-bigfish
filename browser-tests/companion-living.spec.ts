import {test,expect,type Page,type Locator} from '@playwright/test';
import {wave} from './helpers/interactions.js';

async function openLocalPet(page:Page,idleMode='frequent'){
 await page.addInitScript(({mode})=>{
  Math.random=()=>.5;
  localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({greetOnOpen:false,idleMode:mode,idleHoldSeconds:5,idleSignPreference:'none',lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',movement:'fixed'})}));
 },{mode:idleMode});
 await page.clock.install({time:new Date('2026-10-29T04:00:00Z')});
 await page.goto('/');await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const pet=page.getByTestId('bigfish-widget');await expect(pet.locator('canvas')).toBeVisible();
 await expect(pet.locator('canvas')).toHaveAttribute('data-motion',/.+/);
 return pet;
}
/** Small advances preserve the director's suspension guard. No wall-clock 100-second sleeps. */
async function untilMotion(page:Page,pet:Locator,motion:string,seconds=240){
 const timeline:{routine:string|null;motion:string|null;at:number}[]=[];
 for(let i=0;i<seconds;i++){
  const sample=await pet.evaluate(el=>({routine:el.getAttribute('data-routine'),motion:el.querySelector('canvas')?.getAttribute('data-motion')??null,at:Date.now()}));
  if(timeline.at(-1)?.routine!==sample.routine||timeline.at(-1)?.motion!==sample.motion)timeline.push(sample);
  if(sample.routine===motion){
   // Native image.decode() is not controlled by the virtual clock. Do not skip an entire
   // entry while its freshly selected bitmap is still decoding on a busy test machine.
   await expect.poll(async()=>{await page.clock.runFor(32);return pet.locator('canvas').getAttribute('data-motion');},{intervals:[50]}).toBe(motion);return;
  }
  if(sample.motion===motion)return;
  // Each jump stays within the player's 100ms suspension cap. A single 1s jump would
  // advance the director ten times faster than its visible RAF; runFor would wait in real time.
  for(let step=0;step<10;step++)await page.clock.fastForward(100);
 }
 await test.info().attach('life-motion-timeline',{body:JSON.stringify(timeline,null,2),contentType:'application/json'});
 await expect(pet.locator('canvas')).toHaveAttribute('data-motion',motion);
}

test('local life plays an entry, holds the final pose, and yields without model calls',async({page})=>{
 test.setTimeout(90000);let hostRequests=0;page.on('request',request=>{if(request.url().includes('/api/bigfish-companion'))hostRequests++;});
 const pet=await openLocalPet(page),canvas=pet.locator('canvas');
 // The existing demo's idle renderer remains a UI fixture, not evidence of a native Host/model run.
 await untilMotion(page,pet,'sit-down',125);
 await page.clock.runFor(2700);await expect(canvas).toHaveAttribute('data-frame','7');await expect(canvas).toHaveAttribute('data-phase','hold');
 await page.clock.runFor(3000);await expect(canvas).toHaveAttribute('data-motion','sit-down');await expect(canvas).toHaveAttribute('data-frame','7');
 await untilMotion(page,pet,'stretch',15);await expect(canvas).toHaveAttribute('data-whip','false');
 expect(hostRequests).toBe(0);
});

test('new work immediately interrupts idle sleep instead of hiding output behind a wake-up scene',async({page})=>{
 test.setTimeout(120000);const pet=await openLocalPet(page),canvas=pet.locator('canvas');
 await untilMotion(page,pet,'sleep',300);
 await page.clock.runFor(2700);await expect(canvas).toHaveAttribute('data-frame','7');
 await page.locator('#demo-state').selectOption('generating');await page.clock.runFor(200);
 await expect(canvas).not.toHaveAttribute('data-motion',/^(sleep|lie-down|wake-up|sit-down)$/);
 await page.clock.runFor(2900);await expect(canvas).not.toHaveAttribute('data-motion',/^(sleep|lie-down|wake-up|sit-down)$/);
 await expect(pet.locator('.bf-state')).toContainText('正在输出');
});

test('direct interaction and important waiting state take priority over a living scene',async({page})=>{
 test.setTimeout(90000);const pet=await openLocalPet(page),canvas=pet.locator('canvas');
 await untilMotion(page,pet,'sit-down',125);
 await wave(pet);await page.clock.runFor(200);
 await expect(canvas).toHaveAttribute('data-motion','wave');await expect(pet.locator('.bf-dialogue-text')).toContainText('我在这里');
 await page.clock.runFor(8200);await page.locator('#demo-state').selectOption('waiting-user');await page.clock.runFor(200);
 await expect(canvas).not.toHaveAttribute('data-motion',/^(sleep|lie-down|sit-down|nest|desk-tidy|lamp)$/);
 await expect(pet.locator('.bf-state')).toContainText('等你确认');
});

test('quiet idle does not start life scenes after long simulated rests or a reload',async({page})=>{
 test.setTimeout(90000);const pet=await openLocalPet(page,'quiet'),canvas=pet.locator('canvas');
 for(let i=0;i<12;i++)await page.clock.fastForward(30000);
 await expect(canvas).toHaveAttribute('data-motion','breathe');await expect(pet.locator('.bf-dialogue-text')).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();await page.clock.runFor(200);
 for(let i=0;i<6;i++)await page.clock.fastForward(30000);
 await expect(canvas).toHaveAttribute('data-motion','breathe');
});
