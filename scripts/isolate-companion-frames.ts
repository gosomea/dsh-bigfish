import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const root='assets/intelligent-pet';
type Rect={x:number;y:number;width:number;height:number;exclude?:Rect[]};
const catalog=JSON.parse(await readFile(`${root}/catalog.json`,'utf8')) as {id:string;file:string}[];
const bounds=JSON.parse(await readFile(`${root}/frame-bounds.json`,'utf8')) as Record<string,Rect[]>;
const images=await Promise.all(catalog.map(async c=>({...c,image:`data:image/png;base64,${(await readFile(`${root}/${c.file}`)).toString('base64')}`,rects:bounds[c.id]!})));
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 const result=await page.evaluate(async images=>{
  const output:Record<string,{x:number;y:number;width:number;height:number;exclude?:{x:number;y:number;width:number;height:number}[]}[]>={},report:{id:string;removedPixels:number[];cutouts:number[]}[]=[];
  for(const item of images){
   // This staggered sheet has touching characters; its hand-authored rectangles are reviewed separately.
   if(item.id==='lie-down'){
    output[item.id]=item.rects.map(({x,y,width,height},frame)=>({x,y,width,height,...(frame===1?{exclude:[{x:454,y:240,width:16,height:210}]}:frame===3?{exclude:[{x:1328,y:350,width:12,height:168},{x:1340,y:350,width:6,height:120}]}:{})}));
    report.push({id:item.id,removedPixels:[],cutouts:output[item.id]!.map(r=>r.exclude?.length??0)});continue;
   }
   const image=new Image();image.src=item.image;await image.decode();const w=image.width,h=image.height;
   const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,w,h).data;
   const labels=new Int32Array(w*h),queue=new Int32Array(w*h);let label=0;
   const components:{label:number;x:number;y:number;x2:number;y2:number;area:number;owner?:number}[]=[];
   for(let first=0;first<labels.length;first++){
    if(labels[first]||rgba[first*4+3]!<64)continue;
    label++;let head=0,tail=0;queue[tail++]=first;labels[first]=label;
    const part={label,x:w,y:h,x2:0,y2:0,area:0};
    while(head<tail){const at=queue[head++]!,x=at%w,y=Math.floor(at/w);part.x=Math.min(part.x,x);part.x2=Math.max(part.x2,x+1);part.y=Math.min(part.y,y);part.y2=Math.max(part.y2,y+1);part.area++;
     for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy||x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;const near=at+dy*w+dx;if(!labels[near]&&rgba[near*4+3]!>=64){labels[near]=label;queue[tail++]=near;}}
    }
    components.push(part);
   }
   const primary=[...components].sort((a,b)=>b.area-a.area).slice(0,8).sort((a,b)=>Number((a.y+a.y2)/2>=h/2)-Number((b.y+b.y2)/2>=h/2)||(a.x+a.x2-b.x-b.x2));
   if(primary.length!==8||primary.filter(p=>(p.y+p.y2)/2<h/2).length!==4)throw Error(item.id+' ambiguous primary components');
   const owners=new Int16Array(label+1);owners.fill(-1);primary.forEach((p,i)=>{owners[p.label]=i;});
   for(const part of components){if(owners[part.label]!>=0||part.area<300)continue;
    const cx=(part.x+part.x2)/2,cy=(part.y+part.y2)/2;
    const distances=primary.map(p=>((cx-(p.x+p.x2)/2)/(w/4))**2+((cy-(p.y+p.y2)/2)/(h/2))**2);
    const nearest=distances.indexOf(Math.min(...distances));if(distances[nearest]!<=.55)owners[part.label]=nearest;
    // These detached props sit past the geometric midpoint; inspect source pose, not nearest body.
    if(item.id==='ball-catch'&&cx>=440&&cx<525&&cy>450&&cy<550)owners[part.label]=5;
    if(item.id==='ball-catch'&&cx>=880&&cx<970&&cy>440&&cy<540)owners[part.label]=6;
    if(item.id==='failure-check'&&cx>=430&&cx<480&&cy>120&&cy<210)owners[part.label]=1;
   }
   const cuts:number[]=[],removedPixels:number[]=[];
   output[item.id]=item.rects.map((r,frame)=>{
    const exclude:{x:number;y:number;width:number;height:number}[]=[],previous=new Map<string,{x:number;y:number;width:number;height:number}>();let removed=0;
    const manual=item.id==='failure-check'&&frame===0?[{x:442,y:130,width:23,height:80}]:item.id==='ball-catch'&&frame===4?[{x:443,y:460,width:70,height:145}]:[];
    for(let y=r.y;y<r.y+r.height;y++){
     const runs:{x:number;y:number;width:number;height:number}[]=[];let start=-1;
     for(let x=r.x;x<=r.x+r.width;x++){
      let remove=false;
      if(x<r.x+r.width&&rgba[(y*w+x)*4+3]!>0){
       if(manual.some(cut=>x>=cut.x&&x<cut.x+cut.width&&y>=cut.y&&y<cut.y+cut.height))remove=true;
       const owner=owners[labels[y*w+x]!]!;
       if(!remove&&owner>=0)remove=owner!==frame;
       else if(!remove){
        let own=false,other=false;
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;const o=owners[labels[yy*w+xx]!]!;if(o===frame)own=true;else if(o>=0)other=true;}
        remove=other&&!own;
       }
      }
      if(remove){if(start<0)start=x;removed++;}else if(start>=0){runs.push({x:start,y,width:x-start,height:1});start=-1;}
     }
     const current=new Map<string,{x:number;y:number;width:number;height:number}>();
     for(const run of runs){const key=run.x+':'+run.width,prior=previous.get(key);if(prior){prior.height++;current.set(key,prior);}else{exclude.push(run);current.set(key,run);}}
     previous.clear();for(const [key,run] of current)previous.set(key,run);
    }
    cuts.push(exclude.length);removedPixels.push(removed);
    return {x:r.x,y:r.y,width:r.width,height:r.height,...(exclude.length?{exclude}:{})};
   });
   report.push({id:item.id,removedPixels,cutouts:cuts});
  }
  return {bounds:output,report};
 },images);
 await writeFile(`${root}/frame-bounds.json`,JSON.stringify(result.bounds,null,2)+'\n');
 await writeFile('artifacts/companion/frame-review/isolation.json',JSON.stringify({method:'Chromium alpha components; excludes pixels owned by a different authored frame, including a protected two-pixel halo. Original PNG/WebP unchanged.',sequences:result.report},null,2)+'\n');
 for(const row of result.report)if(row.cutouts.some(Boolean))console.log(row.id+' '+row.removedPixels.join('/'));
}finally{await browser.close();}
