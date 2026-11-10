import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const sourceRoot=resolve('assets/intelligent-pet'),output=resolve('artifacts/companion/frame-review');
const catalog=JSON.parse(await readFile(`${sourceRoot}/catalog.json`,'utf8')) as {id:string;label:string;file:string;rows:number;columns:number;frames:number}[];
const bounds=JSON.parse(await readFile(`${sourceRoot}/frame-bounds.json`,'utf8')) as Record<string,{x:number;y:number;width:number;height:number;exclude?:{x:number;y:number;width:number;height:number}[]}[]>;
await mkdir(output,{recursive:true});
const rows=await Promise.all(catalog.map(async clip=>{const bytes=await readFile(`${sourceRoot}/${clip.file}`),runtimeFile=clip.file.replace(/\.png$/,'.webp'),runtime=await readFile(`${sourceRoot}/${runtimeFile}`);return {...clip,rects:bounds[clip.id]!,image:`data:image/webp;base64,${runtime.toString('base64')}`,sha256:createHash('sha256').update(bytes).digest('hex'),runtimeFile,runtimeSha256:createHash('sha256').update(runtime).digest('hex')};}));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1560}});
 for(let start=0;start<rows.length;start+=8){
  const png=await page.evaluate(async group=>{
   const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=64+group.length*186;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.font='18px sans-serif';ctx.fillStyle='#172743';ctx.fillText('Runtime WebP crops · each row: authored frames 1 → 8 · usability review',18,27);
   ctx.font='14px sans-serif';for(let column=0;column<8;column++)ctx.fillText(String(column+1),172+column*158,52);
   for(let row=0;row<group.length;row++){
    const clip=group[row]!,image=new Image();image.src=clip.image;await image.decode();
    const y=64+row*186;ctx.fillStyle='#162848';ctx.font='15px sans-serif';ctx.fillText(clip.id,10,y+25);ctx.font='14px sans-serif';ctx.fillText(clip.label,10,y+47);
    for(let frame=0;frame<clip.frames;frame++){
     const x=160+frame*158,r=clip.rects[frame]!,scale=Math.min(148/Math.max(image.height/clip.rows,...clip.rects.map(r=>r.height)),(416*148/400)/Math.max(...clip.rects.map(r=>r.width)));
     for(let yy=0;yy<160;yy+=10)for(let xx=0;xx<150;xx+=10){ctx.fillStyle=(xx/10+yy/10)%2?'#e5e9ef':'#fafafa';ctx.fillRect(x+xx,y+yy,10,10);}
     ctx.strokeStyle='#bdc8d8';ctx.strokeRect(x+.5,y+.5,150,160);
     ctx.save();
     if(r.exclude?.length){ctx.beginPath();ctx.rect(x+75-r.width*scale/2,y+155-r.height*scale,r.width*scale,r.height*scale);for(const cut of r.exclude)ctx.rect(x+75+(cut.x-r.x-r.width/2)*scale,y+155+(cut.y-r.y-r.height)*scale,cut.width*scale,cut.height*scale);ctx.clip('evenodd');}
     ctx.drawImage(image,r.x,r.y,r.width,r.height,x+75-r.width*scale/2,y+155-r.height*scale,r.width*scale,r.height*scale);ctx.restore();
     ctx.fillStyle='#5b6880';ctx.font='11px monospace';ctx.fillText(`${r.width}×${r.height}`,x+8,y+176);
    }
   }
   return canvas.toDataURL('image/png').split(',')[1]!;
  },rows.slice(start,start+8));
  const name=`contact-${String(start/8+1).padStart(2,'0')}.png`;await writeFile(`${output}/${name}`,Buffer.from(png,'base64'));console.log(name);
 }
 await writeFile(`${output}/sources.json`,JSON.stringify(rows.map(({id,file,sha256,runtimeFile,runtimeSha256,rects})=>({id,file,sha256,runtimeFile,runtimeSha256,rects})),null,2)+'\n');
}finally{await browser.close();}
