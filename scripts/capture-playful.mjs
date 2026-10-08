/** Samples the real PetCanvas at authored keyframes; an offline asset showcase, not a model recording. */
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
const html=await readFile('dist/preview.html');const output=resolve('docs/media');await mkdir(output,{recursive:true});
const scratch=await mkdtemp('/private/tmp/bigfish-playful-capture-');
const server=createServer((_,res)=>{res.setHeader('content-type','text/html');res.end(html);});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1360,height:980}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const ids=['bigfish:sign-flip','bigfish:biscuit-share','bigfish:paper-fish','bigfish:search-magnifier','bigfish:image-palette','bigfish:success-paper-confetti'];
try {
 await page.goto(origin);await page.clock.install();await page.getByRole('button',{name:'完整设置',exact:true}).click();await page.getByText('角色库',{exact:true}).click();await page.getByRole('button',{name:'预览趣味版',exact:true}).click();
 await page.getByLabel('角色动作预览').waitFor();
 const animations=JSON.parse(await readFile('examples/bigfish-playful/animations.json','utf8'));const samples=[];
 for(const id of ids){
  const a=animations.find(a=>a.id===id);if(!a)throw Error(`Unknown animation ${id}`);
  await page.getByLabel('角色动作预览').selectOption(id);await page.clock.runFor(100);
  const durations=a.frames.map(f=>f.durationMs);if(a.holdFrame!==undefined)durations[a.holdFrame]=12000-durations.reduce((n,v,i)=>n+(i===a.holdFrame?0:v),0);
  for(let frame=0;frame<a.frames.length;frame++){
   const canvas=page.locator('.bf-pet-preview canvas');const actual=await canvas.getAttribute('data-frame');if(actual!==String(frame))throw Error(`${id} expected ${frame}, actual ${actual}`);
   const file=resolve(scratch,`${samples.length}.png`);await canvas.screenshot({path:file});samples.push({id,label:a.label,frame,durationMs:durations[frame],file});
   await page.clock.runFor(durations[frame]+60);
  }
 }
 await writeFile(resolve(scratch,'samples.json'),JSON.stringify(samples,null,2));
 await writeFile(resolve(output,'playful-capture.json'),JSON.stringify({version:'0.6.0-next.1',recordedAt:new Date().toISOString(),source:'Offline built preview, actual PetCanvas sampled at six authored poses; Playwright virtual clock, no model calls, no chat content.',actions:ids,frames:samples.length,errors},null,2)+'\n');
 if(errors.length)throw Error(errors.join('\n'));console.log(scratch);
}finally{await browser.close();await new Promise(done=>server.close(done));}
