import React,{useEffect,useRef,useState} from 'react';
import {InteractionCooldown,type PlayKind} from '../companion/life.js';

export type ToyKind=Extract<PlayKind,'ball'|'toy'>;
interface Point {x:number;y:number}
export interface PetPlaygroundProps {
 enabled:boolean;
 cooldownSeconds:number;
 reducedMotion?:boolean;
 disabled?:boolean;
 /** Return false when a higher-priority behavior prevents this interaction. */
 onInteract:(kind:ToyKind)=>boolean|void;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
/** Props move within their own play mat; character movement belongs to the authored animation player. */
export function toyPosition(kind:ToyKind,progress:number,target:Point):Point {
 const p=clamp(progress,0,1),x=clamp(target.x,65,240),y=clamp(target.y,25,74);
 if(kind==='toy')return {x:x+Math.sin(p*Math.PI*4)*16*Math.sin(p*Math.PI),y:y+Math.sin(p*Math.PI*6)*7*Math.sin(p*Math.PI)};
 if(p<.55){const t=p/.55;return {x:28+(x-28)*t,y:79+(y-79)*t-Math.sin(t*Math.PI)*36};}
 const t=(p-.55)/.45;
 return {x:x+(205-x)*t,y:y+(79-y)*t-Math.abs(Math.sin(t*Math.PI*3))*14*(1-t)};
}

/** Explicit, free local play. Opening the toy box never triggers an interaction or model call. */
export function PetPlayground({enabled,cooldownSeconds,reducedMotion=false,disabled=false,onInteract}:PetPlaygroundProps){
 const [kind,setKind]=useState<ToyKind>('ball'),[active,setActive]=useState<{kind:ToyKind;at:number}|null>(null);
 const [progress,setProgress]=useState(0),[target,setTarget]=useState<Point>({x:175,y:55});
 const [now,setNow]=useState(0),[coolUntil,setCoolUntil]=useState(0),[message,setMessage]=useState('选一件玩具，再点一下垫子。');
 const gate=useRef(new InteractionCooldown());
 const cooling=now<coolUntil;
 useEffect(()=>{
  if(!coolUntil)return;
  const timer=setInterval(()=>{const at=Date.now();setNow(at);if(at>=coolUntil)clearInterval(timer);},250);
  setNow(Date.now());
  return()=>clearInterval(timer);
 },[coolUntil]);
 useEffect(()=>{
  if(!active)return;
  let frame=0,timer:ReturnType<typeof setTimeout>|undefined;
  const finish=()=>{setActive(null);setMessage(active.kind==='ball'?'球停稳啦，想玩时再叫我。':'纸鱼收好啦，等你下次来玩。');};
  if(reducedMotion){setProgress(1);timer=setTimeout(finish,650);}
  else {
   const duration=active.kind==='ball'?1800:2600;
   const tick=()=>{const p=clamp((Date.now()-active.at)/duration,0,1);setProgress(p);if(p<1)frame=requestAnimationFrame(tick);else timer=setTimeout(finish,650);};
   frame=requestAnimationFrame(tick);
  }
  return()=>{cancelAnimationFrame(frame);if(timer)clearTimeout(timer);};
 },[active,reducedMotion]);
 useEffect(()=>{if(!enabled||disabled)setActive(null);},[enabled,disabled]);
 if(!enabled)return null;
 const pointFromEvent=(e:React.PointerEvent<SVGSVGElement>):Point=>{
  const r=e.currentTarget.getBoundingClientRect();
  return {x:clamp((e.clientX-r.left)/Math.max(r.width,1)*280,65,240),y:clamp((e.clientY-r.top)/Math.max(r.height,1)*112,25,74)};
 };
 const start=(point:Point)=>{
  const at=Date.now();
  if(disabled||active||gate.current.remaining(at)>0)return;
  if(onInteract(kind)===false){setMessage('先等她处理完眼前的事，再一起玩吧。');return;}
  const cooldown=Math.max(1,Math.min(120,cooldownSeconds||1))*1000;
  if(!gate.current.accept(at,cooldown))return;
  setNow(at);setCoolUntil(at+cooldown);setTarget(point);setProgress(0);setActive({kind,at});
  setMessage(kind==='ball'?'抛出小球啦！':'小纸鱼在这里，轻轻晃一晃～');
 };
 const position=toyPosition(active?.kind??kind,active?progress:0,target),busy=disabled||!!active||cooling;
 return <details className="bf-playground" data-testid="pet-playground" onPointerDown={e=>e.stopPropagation()} style={{width:'100%',maxWidth:320,border:'1px solid var(--bf-line)',borderRadius:12,padding:'8px 10px',background:'var(--bf-panel)',cursor:'auto',touchAction:'auto'}}>
  <summary style={{cursor:'pointer'}}>玩具箱 · 抛球与逗鱼</summary>
  <div role="group" aria-label="选择玩具" style={{display:'flex',gap:8,margin:'10px 0 8px'}}>
   <button type="button" aria-pressed={kind==='ball'} disabled={!!active} onClick={()=>setKind('ball')}>小球</button>
   <button type="button" aria-pressed={kind==='toy'} disabled={!!active} onClick={()=>setKind('toy')}>逗鱼棒</button>
  </div>
  <svg viewBox="0 0 280 112" role="button" tabIndex={busy?-1:0} aria-label={kind==='ball'?'点垫子抛球，也可按回车键':'点垫子逗鱼，也可按回车键'} aria-disabled={busy}
   onPointerDown={e=>{e.preventDefault();e.stopPropagation();start(pointFromEvent(e));}}
   onPointerMove={e=>{if(active?.kind==='toy'&&!reducedMotion)setTarget(pointFromEvent(e));}}
   onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();start({x:175,y:55});}}}
   style={{display:'block',width:'100%',borderRadius:10,cursor:busy?'default':'crosshair',background:'var(--bf-soft)',touchAction:'none'}}>
   <ellipse cx="140" cy="89" rx="117" ry="11" fill="var(--bf-blue)" opacity=".1"/>
   <path d="M26 91H254" stroke="var(--bf-blue)" strokeWidth="1" opacity=".22"/>
   {(active?.kind??kind)==='ball'?<g transform={`translate(${active?position.x:28} ${active?position.y:79})`}>
    <circle r="9" fill="#f1c36b" stroke="#946c39" strokeWidth="1.5"/><path d="M-7 -5Q0 0 7 5M-3 -8Q-8 0-3 8" fill="none" stroke="#fff4d3" strokeWidth="2"/>
   </g>:<g>
    <path d={`M267 17Q251 10 ${position.x+6} ${position.y-9}`} fill="none" stroke="var(--bf-muted)" strokeWidth="1.2"/>
    <path d="M267 17L250 48" fill="none" stroke="#ac8259" strokeWidth="5" strokeLinecap="round"/>
    <g transform={`translate(${position.x} ${position.y})`}><path d="M-13 0Q-2-13 12 0Q-2 13-13 0L-21-8V8Z" fill="#77b7d2" stroke="#48768d" strokeWidth="1.2"/><circle cx="7" cy="-1" r="1.5" fill="#29465d"/><path d="M-7 0L0-6V6Z" fill="#b9e2ed"/></g>
   </g>}
  </svg>
  <p role="status" aria-live="polite" style={{fontSize:11,color:'var(--bf-muted)',margin:'6px 0'}}>{message}</p>
  {cooling&&<p aria-live="off" style={{fontSize:11,color:'var(--bf-muted)',margin:'3px 0'}}>休息 {Math.ceil((coolUntil-now)/1000)} 秒，再玩下一次。</p>}
  <p style={{fontSize:11,color:'var(--bf-muted)',margin:0}}>点垫子或按回车开始。逗鱼时可移动指针。仅使用本地动画，不消耗 token。</p>
 </details>;
}
