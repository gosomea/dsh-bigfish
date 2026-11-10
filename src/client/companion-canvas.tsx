import {SettingsSelect} from './settings-select.js';
import {actorFoot} from './actor-layout.js';
import frameBounds from '../../assets/intelligent-pet/frame-bounds.json' with {type:'json'};
import React,{useEffect,useRef,useState} from 'react';
import {ClipTimeline,atlasFrameRect,atlasSequenceScale,sequenceClip} from '../companion/clip-timeline.js';
import {companionClip,companionClips} from './companion-clips.js';
const images=new Map<string,Promise<HTMLImageElement>>();
interface SourceRect {x:number;y:number;width:number;height:number;exclude?:{x:number;y:number;width:number;height:number}[]}
const decodeTimeoutMs=12000;
function load(url:string){
 const cached=images.get(url);
 if(cached)return cached;
 const image=new Image();
 image.src=url;
 const pending=new Promise<HTMLImageElement>((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('Animation image decode timed out')),decodeTimeoutMs);
  void image.decode().then(()=>resolve(image),reject).finally(()=>clearTimeout(timeout));
 }).catch(error=>{
  images.delete(url);
  throw error;
 });
 images.set(url,pending);
 return pending;
}
/** Authored frames only. Holds are real time; normal requests finish their visible exit. */
export function CompanionCanvas({id,opacity=1,mirror=false,reduced=false,serial='',idleActive=false,holdMs,frameMs,transition='normal',onReady,onFailed,onComplete}:{id:string;opacity?:number;mirror?:boolean;reduced?:boolean;serial?:string;idleActive?:boolean;holdMs?:number|undefined;frameMs?:number|undefined;transition?:'normal'|'urgent';onReady?:()=>void;onFailed?:(serial:string)=>void;onComplete?:(serial:string)=>void}){
 const ref=useRef<HTMLCanvasElement>(null),[error,setError]=useState(false);
 const player=useRef<ClipTimeline|null>(null),reducedBefore=useRef(reduced);
 const records=useRef(new Map<string,{clip:NonNullable<ReturnType<typeof companionClip>>;mirror:boolean;image?:HTMLImageElement|undefined;ready:boolean}>());
 const callbacks=useRef({onReady,onFailed,onComplete});callbacks.current={onReady,onFailed,onComplete};
 const clip=companionClip(id);
 useEffect(()=>{
  if(!clip)return;let raf=0,cancelled=false,last:number|undefined;setError(false);
  const key=`${clip.id}:${serial}:${mirror}`,definition={...sequenceClip({...clip,frameMs:frameMs??clip.frameMs},holdMs??clip.holdMs),id:key};
  const record={clip,mirror,ready:false,image:undefined as HTMLImageElement|undefined};
  const existing=records.current.get(key);records.current.set(key,existing??record);
  if(!player.current||reducedBefore.current!==reduced){player.current=new ClipTimeline(definition,{reducedMotion:reduced});reducedBefore.current=reduced;}
  else player.current.request(definition,transition);
  void load(clip.sheet).then(image=>{
   if(cancelled)return;
   const current=records.current.get(key);
   if(current)current.image=image;
  }).catch(()=>{
   if(cancelled)return;
   cancelAnimationFrame(raf);
   if(callbacks.current.onFailed)callbacks.current.onFailed(serial);
   else setError(true);
  });
  let previous='';
  const draw=(now:number)=>{
   if(cancelled)return;
   const current=player.current!,before=current.snapshot(),visible=records.current.get(before.clip);
   if(before.clip!==key&&!visible?.image&&records.current.get(key)?.image)current.request(definition,'urgent');
   // The lifecycle waits for decoding. Never consume frames while their image is unavailable.
   const elapsed=last===undefined||!visible?.image?0:Math.min(100,now-last);last=now;
   const state=current.advance(elapsed),active=records.current.get(state.clip);
   if(active?.image){
    const image=active.image,c=active.clip,canvas=ref.current!,ctx=canvas.getContext('2d')!;
    const signature=`${state.clip}:${state.frame}`;
    if(signature!==previous){
     const rects=(frameBounds as Record<string,SourceRect[]>)[c.id];
     const r:SourceRect=rects?.[state.frame]??atlasFrameRect(image.width,image.height,c.columns,c.rows,state.frame);
     // Some authored rows are staggered: lie-down's standing entry is taller than half its atlas.
     const scale=atlasSequenceScale(image.height/c.rows,rects??[r],2*Math.min(actorFoot.x*2,680-actorFoot.x*2),400);
     ctx.clearRect(0,0,680,500);ctx.save();ctx.translate(actorFoot.x*2,actorFoot.y*2);if(active.mirror)ctx.scale(-1,1);
     if(r.exclude?.length){
      ctx.beginPath();ctx.rect(-r.width*scale/2,-r.height*scale,r.width*scale,r.height*scale);
      for(const cut of r.exclude)ctx.rect((cut.x-r.x-r.width/2)*scale,(cut.y-r.y-r.height)*scale,cut.width*scale,cut.height*scale);
      ctx.clip('evenodd');
     }
     // Atlas crops have irregular cell spacing. Keep their ground edge fixed rather than assuming 443px cells.
     ctx.drawImage(image,r.x,r.y,r.width,r.height,-r.width*scale/2,-r.height*scale,r.width*scale,r.height*scale);ctx.restore();
     previous=signature;
    }
    canvas.dataset.frame=String(state.frame);canvas.dataset.phase=state.phase;canvas.dataset.motion=c.id;canvas.dataset.atlas='companion';
    if(state.clip===key&&!active.ready){active.ready=true;callbacks.current.onReady?.();}
    if(state.clip===key&&state.finished)callbacks.current.onComplete?.(serial);
   }
   // Keep only the visible and latest requested definitions; decoded images are shared separately.
   for(const old of records.current.keys())if(old!==state.clip&&old!==key)records.current.delete(old);
   if(!state.finished||state.clip!==key)raf=requestAnimationFrame(draw);
  };
  raf=requestAnimationFrame(draw);
  return()=>{cancelled=true;cancelAnimationFrame(raf);};
 },[clip?.id,reduced,mirror,serial,holdMs,frameMs,transition]);
 if(!clip)return null;
 return <div className="bf-stage" style={{opacity}}><canvas ref={ref} data-idle-active={idleActive} data-whip="false" data-reduced={reduced} width={680} height={500} role="img" aria-label={clip.id==='walk'?'附近散步 · 行走试作':`大肥鱼 · ${clip.label}`}/>{error&&<span role="status">动作素材加载失败</span>}</div>;
}
export function CompanionClipPreview(){
 const [opened,setOpened]=useState(false);
 const [id,setId]=useState('stop'),[serial,setSerial]=useState(0),[dark,setDark]=useState(false),[reduced,setReduced]=useState(false);
 return <details className="bf-disclosure" data-testid="companion-clip-preview" onToggle={e=>setOpened(e.currentTarget.open)}><summary>智能宠物新动作 · {companionClips.length} 段生成序列</summary>
 <p className="bf-help">每段 8 帧；行走循环播放，单次动作播完后末帧停留 3 秒。这 32 组已完成逐帧裁切与基础显示检查，动作自然度仍可继续打磨；镜像方向不重复计数。</p>
 <label className="bf-field"><span>预览动作</span><SettingsSelect aria-label="新动作预览" value={id} onChange={e=>setId(e.target.value)}>{companionClips.map(c=><option key={c.id} value={c.id}>{c.label} · 8 帧</option>)}</SettingsSelect></label>
 <div className="bf-button-row"><button type="button" onClick={()=>setSerial(s=>s+1)}>重新播放</button><button type="button" onClick={()=>setDark(v=>!v)}>{dark?'浅色背景':'深色背景'}</button><button type="button" onClick={()=>setReduced(v=>!v)}>{reduced?'恢复动画':'减少动态预览'}</button></div>
 <div style={{background:dark?'#171c29':'#f2f6ff',borderRadius:14}}>{opened&&<CompanionCanvas id={id} serial={String(serial)} reduced={reduced} transition="urgent"/>}</div>
 </details>;
}
