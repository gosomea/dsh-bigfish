/** Real-wall-clock lifecycle soak. BIGFISH_SOAK_SECONDS defaults to 1800. */
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const server=createServer(async(_req,res)=>{res.setHeader('content-type','text/html');res.end(await readFile('dist/preview.html'));});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=(server.address() as {port:number}).port,browser=await chromium.launch();
const seconds=Number(process.env.BIGFISH_SOAK_SECONDS??1800);
if(!Number.isFinite(seconds)||seconds<60||seconds>86400)throw Error('Soak duration must be 60–86400 seconds');
const cycles=Math.ceil(seconds/10);
const started=Date.now(),samples:{elapsedMs:number;nodes:number;canvases:number;pet:string;heapBytes:number}[]=[],errors:string[]=[];
try{
 const page=await browser.newPage(),cdp=await page.context().newCDPSession(page);
 page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}`);
 await page.getByRole('button',{name:'展开大肥鱼',exact:true}).click();
 const widget=page.getByTestId('bigfish-widget');await expect(widget).toBeVisible();
 await widget.getByRole('button',{name:'设置',exact:true}).click();if(await widget.getByRole('button',{name:'完整设置',exact:true}).isVisible())await widget.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByText('角色库',{exact:true}).click();
 await page.getByLabel('角色包文件').setInputFiles('dist/bigfish-adult-1.0.0.dshpet');await page.getByRole('button',{name:'安装并使用',exact:true}).click();await expect(page.getByText('角色已安装并使用',{exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
 const states=['idle','generating','tool-running','waiting-user','failed','completed'];
 for(let cycle=0;cycle<cycles;cycle++){
  await page.locator('#demo-state').selectOption(states[cycle%states.length]!);
  await page.waitForTimeout(10000);
  await cdp.send('HeapProfiler.collectGarbage');const usage=await cdp.send('Runtime.getHeapUsage');
  const info=await page.evaluate(()=>({nodes:document.querySelectorAll('*').length,canvases:document.querySelectorAll('canvas').length,pet:document.querySelector('.bf-widget canvas')?.getAttribute('data-pet')??'builtin'}));
  expect(info.canvases).toBe(2);samples.push({elapsedMs:Date.now()-started,...info,heapBytes:usage.usedSize});
  if(cycle%6===5){console.log(JSON.stringify({cycle:cycle+1,elapsedSeconds:Math.round((Date.now()-started)/1000),...info,heapBytes:usage.usedSize}));
   await widget.getByRole('button',{name:'收起大肥鱼'}).click();await expect(widget).toHaveCount(0);await page.getByRole('button',{name:'展开大肥鱼',exact:true}).last().click();await expect(widget).toBeVisible();
   await widget.getByRole('button',{name:'设置',exact:true}).click();if(await widget.getByRole('button',{name:'完整设置',exact:true}).isVisible())await widget.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByText('角色库',{exact:true}).click();
   const builtin=cycle%12===5;
   if(builtin)await page.getByRole('button',{name:'使用大肥鱼',exact:true}).click();
   else await page.locator('.bf-role-card').filter({hasText:'大肥鱼 · 成年版'}).getByRole('button',{name:'使用',exact:true}).click();
   await page.getByRole('button',{name:'关闭',exact:true}).click();
  }
 }
 expect(errors).toEqual([]);await page.screenshot({path:'artifacts/soak-final.png'});
 const warm=samples.slice(Math.min(12,Math.floor(samples.length/3)));
 const midpoint=Math.floor(warm.length/2),average=(items:typeof samples)=>items.reduce((n,s)=>n+s.heapBytes,0)/items.length;
 const heapGrowthRatio=average(warm.slice(midpoint))/average(warm.slice(0,midpoint));
 expect(heapGrowthRatio).toBeLessThan(1.5);expect(Math.max(...warm.map(s=>s.nodes))-Math.min(...warm.map(s=>s.nodes))).toBeLessThan(150);
 const report={ok:true,heapGrowthRatio,date:new Date().toISOString(),durationMs:Date.now()-started,virtualClock:false,paidApiCalled:false,cycles,errors,samples};
 await writeFile('artifacts/soak.json',JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,durationMs:report.durationMs,cycles}));
}finally{await browser.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
