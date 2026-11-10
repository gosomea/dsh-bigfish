import {readFile} from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';

async function petWithHome(page:Page,home:{x:number;y:number},options:{faultPrefix?:string;greetOnOpen?:boolean}={}){
 await page.setViewportSize({width:1513,height:793});
 await page.addInitScript(({home,faultPrefix,greetOnOpen})=>{
  localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({
   size:121,greetOnOpen,idleMode:'occasional',richness:2,completionMode:'celebrate',completionSeconds:12,
   lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'balanced',movement:'screen',speed:100}),
  }));
  localStorage.setItem('bigfish.activity-area.v1',JSON.stringify({
   revision:1,config:{version:1,enabled:false,allowed:null,forbidden:[],home},
  }));
  if(faultPrefix){
   const decode=HTMLImageElement.prototype.decode;
   let injected=false;
   HTMLImageElement.prototype.decode=function(){
    if(!injected&&this.src.startsWith(faultPrefix)){
     injected=true;
     return new Promise<void>(()=>{});
    }
    return decode.call(this);
   };
  }
 },{home,greetOnOpen:false,...options});
 await page.goto('/');
 await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 return page.getByTestId('bigfish-widget');
}

test('recall interrupts an idle sign and quickly walks to a fractional right-edge home while hovered',async({page})=>{
 test.setTimeout(40000);
 const pet=await petWithHome(page,{x:.99,y:.5},{greetOnOpen:true});
 const canvas=pet.locator('canvas');
 await expect(canvas).toHaveAttribute('data-motion',/^(wait-sign|sign-|bigfish:sign-)/);
 await pet.getByRole('button',{name:'叫回来',exact:true}).click();
 await expect(pet.getByTestId('activity-area-status')).toContainText('来啦',{timeout:1500});
 await expect(canvas).toHaveAttribute('data-motion','walk',{timeout:2000});
 const home={x:8+1497*.99,y:8+765*.5};
 await expect.poll(async()=>{
  const b=(await pet.boundingBox())!;
  return home.x>=b.x&&home.x<=b.x+b.width&&home.y>=b.y&&home.y<=b.y+b.height;
 },{timeout:15000}).toBe(true);
 await expect(pet.getByTestId('activity-area-status')).toHaveCount(0,{timeout:4000});
 await expect(canvas).not.toHaveAttribute('data-motion',/^(start-step|walk)$/);
 await expect(pet.getByText('回家点无法安全到达',{exact:false})).toHaveCount(0);
});

test('recall waits during output and starts at task completion before the celebration can finish',async({page})=>{
 const pet=await petWithHome(page,{x:.65,y:.5});
 const canvas=pet.locator('canvas'),state=page.locator('#demo-state');
 await state.selectOption('generating');
 await pet.getByRole('button',{name:'叫回来',exact:true}).click();
 await expect(pet.getByTestId('activity-area-status')).toContainText('已记下回家请求');
 const position=await pet.getAttribute('style');
 await page.waitForTimeout(1100);
 expect(await pet.getAttribute('style')).toBe(position);
 await expect(canvas).not.toHaveAttribute('data-motion',/^(start-step|walk)$/);
 await state.selectOption('completed');
 await expect(pet.getByTestId('activity-area-status')).toContainText('来啦',{timeout:1500});
 await expect(canvas).toHaveAttribute('data-motion','walk',{timeout:2000});
});

test('a hung start-step decode cancels recall, keeps position, and allows a new recall to walk',async({page})=>{
 test.setTimeout(55000);
 const image=await readFile(new URL('../assets/intelligent-pet/clips/start-step.webp',import.meta.url));
 const pet=await petWithHome(page,{x:.65,y:.5},{faultPrefix:`data:image/webp;base64,${image.subarray(0,96).toString('base64')}`});
 const before=(await pet.boundingBox())!;
 const recall=pet.getByRole('button',{name:'叫回来',exact:true});
 await recall.click();
 await page.mouse.move(20,100);
 const notice=pet.getByTestId('activity-area-status');
 await expect(notice).toContainText('行走素材加载失败',{timeout:28000});
 expect(Math.abs((await pet.boundingBox())!.x-before.x)).toBeLessThan(1);
 await expect(pet.locator('canvas')).not.toHaveAttribute('data-motion','start-step');
 await recall.click();
 await page.mouse.move(20,100);
 await expect(pet.locator('canvas')).toHaveAttribute('data-motion','walk',{timeout:20000});
});

test('reasoning uses the authored think gesture and returns to ordinary reasoning poses',async({page})=>{
 const pet=await petWithHome(page,{x:.65,y:.5});
 await page.locator('#demo-state').selectOption('reasoning');
 const canvas=pet.locator('canvas');
 await expect(canvas).toHaveAttribute('data-motion','think');
 await expect(canvas).toHaveAttribute('data-frame','7');
 await expect(canvas).not.toHaveAttribute('data-motion','think',{timeout:10000});
 await expect(page.locator('#demo-state')).toHaveValue('reasoning');
});
