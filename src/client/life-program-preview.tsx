import React,{useEffect,useRef,useState} from 'react';
import {LifeProgramDirector,type LifeProgramRequest,type LifeProgramFrame,type LifeProgramEnvironment} from '../companion/life-programs.js';
import {CompanionCanvas} from './companion-canvas.js';
import {PairedPetScene} from './paired-pet-scene.js';
import {OutfitLayer} from './outfit-layer.js';
/** Manual local preview only; uses the same complete chain as the pet stage, with no model/Host work. */
export function LifeProgramPreview({request,environment}:{request:{serial:number;request:LifeProgramRequest}|null;environment:LifeProgramEnvironment}){
 const director=useRef(new LifeProgramDirector()),latest=useRef(environment),ready=useRef(''),actors=useRef({serial:'',values:new Set<string>()});latest.current=environment;
 const [frame,setFrame]=useState<LifeProgramFrame|null>(null),[issue,setIssue]=useState('');
 const markReady=(actor:string)=>{if(!frame)return;if(actors.current.serial!==frame.serial)actors.current={serial:frame.serial,values:new Set()};actors.current.values.add(actor);if(!frame.pairedClip||actors.current.values.size>=2)ready.current=frame.serial;};
 useEffect(()=>{if(!request)return;ready.current='';actors.current={serial:'',values:new Set()};const now=Date.now();director.current.cancel(now,latest.current);const won=director.current.start(request.request,{...latest.current,blocked:false,working:false,playbackReady:ready.current},now);setIssue(won?'':'当前成长条件或真实动作素材不足，暂不能表演这一段。');setFrame(director.current.tick({...latest.current,blocked:false,working:false,playbackReady:ready.current},now));},[request?.serial]);
 useEffect(()=>{if(!request)return;const timer=setInterval(()=>setFrame(director.current.tick({...latest.current,blocked:false,working:false,playbackReady:ready.current},Date.now())),100);return()=>clearInterval(timer);},[request?.serial]);
 if(!request)return null;
 return <section aria-label="本地生活完整动作预览"><p className="bf-help">虚构小剧场预览；使用内置角色真实帧序列，不计入任务经历。</p>{frame&&<><p role="status">{frame.text}</p><div style={{position:'relative',width:340,maxWidth:'100%',aspectRatio:'340/250',background:'var(--bf-soft)',borderRadius:14}}><CompanionCanvas id={frame.clip} serial={frame.serial} reduced={environment.reduced??false} holdMs={frame.holdMs} onReady={()=>markReady('primary')}/><OutfitLayer outfit={environment.options.outfit} clip={frame.clip}/><PairedPetScene enabled={environment.options.pairEnabled} frame={frame} reduced={environment.reduced??false} outfit={environment.options.outfit} onReady={()=>markReady('secondary')}/></div></>}{issue&&<p role="status">{issue}</p>}{!frame&&!issue&&<p>小剧场结束，回到日常陪伴。</p>}</section>;
}
