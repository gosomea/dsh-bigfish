import {SettingsSelect} from './settings-select.js';
import React,{useEffect,useRef,useState,useId} from 'react';
import {AdventureDirector,adventureKinds,adventurePlans,adventureMissingClips,pendingAdventures,type AdventureKind,type AdventureSnapshot} from '../companion/adventures.js';
import {companionClips} from './companion-clips.js';
import {CompanionCanvas} from './companion-canvas.js';
import {actorFoot} from './actor-layout.js';
import {ScenePropImage} from './scene-art.js';
export interface AdventureSceneProps {snapshot:AdventureSnapshot|null;layer?:'back'|'front';reducedMotion?:boolean}
const smooth=(n:number)=>n*n*(3-2*n);
/** Painted props have separate depth layers; only their local motion and ripples are procedural. */
export function AdventureScene({snapshot,layer='front',reducedMotion=snapshot?.reducedMotion??false}:AdventureSceneProps){
 const id=useId().replaceAll(':','');
 if(!snapshot)return null;
 const p=reducedMotion?.5:snapshot.phaseProgress,overall=reducedMotion?.5:snapshot.progress;
 const bob=reducedMotion?0:Math.sin(p*Math.PI*4)*1.8;
 const reveal=snapshot.phase==='discover'?smooth(Math.min(1,p*3)):snapshot.phase==='return'?1-smooth(Math.max(0,(p-.7)/.3)):1;
 const boatX=26+Math.sin(overall*Math.PI)*64;
 const fishX=75+Math.sin(p*Math.PI*2)*13,fishY=208+(snapshot.phase==='release'?smooth(p)*11:Math.sin(p*Math.PI*3)*2);
 return <svg className={`bf-adventure bf-adventure-${layer}`} viewBox="0 0 340 250" role="img" aria-label={`${snapshot.label} · 手绘场景与本地道具`} data-adventure={snapshot.kind} data-phase={snapshot.phase} data-layer={layer} data-art="painted"
  style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:layer==='front'?2:0,overflow:'hidden'}}>
  {snapshot.kind==='box'&&<g opacity={reveal}>
   <defs><clipPath id={`${id}-box`}><rect x="150" y={layer==='front'?181:105} width="184" height={layer==='front'?64:76}/></clipPath></defs>
   <g clipPath={`url(#${id}-box)`}><ScenePropImage kind="box" x={actorFoot.x-82} y={110} width={164} height={135}/></g>
   {layer==='front'&&snapshot.phase==='peek'&&<g stroke="#89b7d4" strokeWidth="2" strokeLinecap="round" opacity={.5+Math.sin(p*Math.PI)*.5}><path d="M169 150l-6-6M311 150l7-5"/></g>}
  </g>}
  {snapshot.kind==='paper-boat'&&(layer==='back'?<ScenePropImage kind="pond" x={0} y={132} width={183} height={114}/>:<g>
   <g transform={`translate(${boatX} ${184+bob})`}><ScenePropImage kind="boat" x={0} y={0} width={76} height={52}/></g>
   {!reducedMotion&&<path d={`M${boatX+3} 231q-11-3-19 0M${boatX+7} 226h-13`} fill="none" stroke="#8fc1d6" strokeWidth="1.2" opacity=".7"/>}
  </g>)}
  {snapshot.kind==='fishing'&&(layer==='back'?<ScenePropImage kind="pond" x={0} y={132} width={183} height={114}/>:<g>
   <g opacity={snapshot.phase==='release'?1-smooth(p):1}><ScenePropImage kind="rod" x={91} y={125} width={84} height={111}/></g>
   <g transform={`translate(${fishX} ${fishY})`} opacity={snapshot.phase==='release'?1-p*.7:.6}><path d="M-11 0Q-2-8 10 0Q-2 8-11 0L-17-5V5Z" fill="#80b4c4"/><circle cx="6" cy="-1" r="1.2" fill="#52758a"/></g>
  </g>)}
 </svg>;
}
const builtinClipIds=companionClips.map(clip=>clip.id);
/** Standalone explicit preview: local clips and props only, without Host requests or hidden automatic playback. */
export function AdventurePreview({disabled=false,availableClips=builtinClipIds,reducedMotion=false}:{disabled?:boolean;availableClips?:readonly string[];reducedMotion?:boolean}){
 const director=useRef(new AdventureDirector({automatic:false,cooldownSeconds:900,kinds:adventureKinds}));
 const [kind,setKind]=useState<AdventureKind>('box'),[snapshot,setSnapshot]=useState<AdventureSnapshot|null>(null),[message,setMessage]=useState('选一段小剧场，再点开始预览。');
 const [opened,setOpened]=useState(false);
 const environment={enabled:!disabled,quiet:false,important:false,working:false,dragging:false,availableClips,reducedMotion};
 useEffect(()=>{
  if(!opened||disabled){director.current.cancel(Date.now());setSnapshot(null);return;}
  if(!snapshot)return;
  let raf=0,last=0;
  const tick=(now:number)=>{if(now-last>=50){last=now;const next=director.current.tick(Date.now(),{enabled:!disabled,quiet:false,important:false,working:false,dragging:false,availableClips,reducedMotion});setSnapshot(next);if(!next)setMessage('小剧场播放完啦，想玩时再开始。');}raf=requestAnimationFrame(tick);};
  raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
 },[opened,disabled,availableClips,reducedMotion,snapshot?.id]);
 const missing=adventureMissingClips(kind,availableClips);
 const start=()=>{if(director.current.start(kind,Date.now(),environment)){setSnapshot(director.current.tick(Date.now(),environment));setMessage('本地虚构小剧场：复用已生成角色动作，不读取会话。');}else setMessage(missing.length?'当前角色缺少这段小剧场需要的动作。':'先结束当前小剧场，再开始下一段。');};
 return <details className="bf-disclosure" data-testid="adventure-preview" onPointerDown={event=>event.stopPropagation()} onToggle={event=>setOpened(event.currentTarget.open)}>
  <summary>桌面奇遇 · 三种本地小剧场</summary>
  <p className="bf-help">角色使用现有生成序列，纸箱、纸鱼船和水面为生成的手绘素材；这三段编排不计作新增绘制动作。不消耗 token。</p>
  <label className="bf-field"><span>预览小剧场</span><SettingsSelect aria-label="预览小剧场" value={kind} disabled={!!snapshot} onChange={event=>setKind(event.target.value as AdventureKind)}>{adventureKinds.map(id=><option key={id} value={id}>{adventurePlans[id].label}</option>)}</SettingsSelect></label>
  <div className="bf-button-row"><button type="button" disabled={disabled||!!snapshot||missing.length>0} onClick={start}>开始小剧场预览</button><button type="button" disabled={!snapshot} onClick={()=>{director.current.cancel(Date.now());setSnapshot(null);setMessage('小剧场收好啦。');}}>结束预览</button></div>
  {missing.length>0&&<p className="bf-help">当前角色缺少：{missing.join('、')}。不会平移站立图代替动作。</p>}
  <p role="status" aria-live="polite">{snapshot?.text??message}</p>
  {snapshot&&<div aria-label={`${snapshot.label}预览`} style={{position:'relative',width:'100%',maxWidth:340,aspectRatio:'340 / 250',margin:'8px auto',background:'var(--bf-soft)',borderRadius:16,overflow:'hidden'}}>
   <AdventureScene snapshot={snapshot} layer="back" reducedMotion={reducedMotion}/>
   <div style={{position:'relative',zIndex:1}}><CompanionCanvas id={snapshot.clip} serial={snapshot.clipSerial} reduced={reducedMotion}/></div>
   <AdventureScene snapshot={snapshot} layer="front" reducedMotion={reducedMotion}/>
  </div>}
  <p className="bf-help">{pendingAdventures}</p>
 </details>;
}
