import {petLayout} from './layout.js';
import {drawOutfit} from './outfit.js';
import React,{useEffect,useRef} from 'react';
import type {LoadedPet} from './library.js';
import {PetDirector,frameAt,idleFrameAt,type PetInput} from './director.js';
import type {Preferences} from '../contract/preferences.js';
import {AirSwing} from '../domain/air-swing.js';
import {whipBeat} from '../client/whip-choreography.js';
import {drawAirSwing} from '../client/draw-air-swing.js';
import {drawSignText} from '../client/sign-text.js';
export function PetCanvas({loaded,input,prefs,paused=false,scenery=true,onAnimation,onReady,rotationHistory}:{loaded:LoadedPet;input:PetInput;prefs:Preferences;paused?:boolean;scenery?:boolean;onAnimation?:((id:string)=>void)|undefined;onReady?:((serial:string)=>void)|undefined;rotationHistory?:Map<string,number>|undefined}){
 const canvas=useRef<HTMLCanvasElement>(null),live=useRef({input,prefs,paused,scenery,onAnimation,onReady});live.current={input,prefs,paused,scenery,onAnimation,onReady};
 useEffect(()=>{
  const el=canvas.current!,c=el.getContext('2d')!,dpr=Math.min(2,devicePixelRatio||1),director=new PetDirector(loaded.pet,undefined,undefined,rotationHistory),swing=new AirSwing();const readySerials=new Set<string>();let frame=0,previous=0,disposed=false,last=0,announced="";
  el.width=340*dpr;el.height=250*dpr;c.scale(dpr,dpr);
  const draw=(now:number)=>{frame=0;if(disposed||document.hidden)return;if(now-last<1000/30){frame=requestAnimationFrame(draw);return;}last=now;
   const {input:i,prefs:p,paused,scenery}=live.current,dt=previous?Math.min(.1,(now-previous)/1000):0;previous=now;
   const m=loaded.pet.manifest;
   const reactions=loaded.pet.animations.filter(a=>a.tags.includes('near-miss')&&a.intensity<=i.richness);
   const canSwing=reactions.length>0&&m.capabilities.includes('air-swing')&&p.enabled&&p.whipEnabled&&!i.reduced&&!paused;
   const work=['generating','reasoning','streaming-gap'].includes(i.state)&&!i.preview;
   const motion=swing.tick(dt,Math.min(p.maxWhipHz,(i.whipHz??0)*p.intensity),canSwing&&work,canSwing&&work,!canSwing||!work);
   const selected=director.choose({...i,reactionActive:motion.responding},now);let a=selected.animation,f=i.state==='idle'&&i.idle?.active?idleFrameAt(a,selected.time,i.idle.durationMs??12000,selected.still):frameAt({...a,speed:[1,1]},selected.time,0,selected.still);
   if(selected.animation.id!==announced){announced=selected.animation.id;live.current.onAnimation?.(announced);}
   if(motion.responding){const reaction=reactions[Math.floor(motion.cycles)%reactions.length];if(reaction){a=reaction;f=frameAt({...a,loop:false,speed:[1,1]},(motion.cycles%1)*a.frames.reduce((n,f)=>n+f.durationMs,0));}}
   c.clearRect(0,0,340,250);
   const scene=m.scenes?.[a.scene??''];if(scene&&scenery&&p.sceneryVisible){const im=loaded.images[scene.asset]!;c.drawImage(im,0,0,340,250);}
   // Entire frame including any animated extremities fits in the character compartment.
   const {left,right,top,bottom,scale,width,height,x,y}=petLayout(m);
   c.save();c.beginPath();c.rect(left,top,right-left,bottom-top);c.clip();const [sx,sy,sw,sh]=f.rect;c.drawImage(loaded.images[f.asset]!,sx,sy,sw,sh,x,y,width,height);
   const anchors=f.accessories??m.body?.accessories;if(i.outfit&&anchors){c.save();c.translate(x,y);c.scale(scale,scale);drawOutfit(c,i.outfit,anchors);c.restore();}
   delete el.dataset.signText;delete el.dataset.signLines;delete el.dataset.signFont;el.removeAttribute('aria-description');
   if(f.sign&&i.idle?.text){const s=f.sign;c.translate(x+s.x*scale,y+s.y*scale);c.rotate(s.angle*Math.PI/180);const text=drawSignText(c,i.idle.text,s.width*scale/2,s.height*scale/2,s.width*scale*.9,s.height*scale*.9,{minFontSize:10,maxFontSize:13});el.dataset.signText=text.original;el.dataset.signLines=String(text.lines.length);el.dataset.signFont=String(text.fontSize);el.setAttribute('aria-description',text.original);}c.restore();
   const serial=i.previewSerial??'';if(i.preview&&a.id===i.preview&&!readySerials.has(serial)){readySerials.add(serial);if(readySerials.size>100)readySerials.delete(readySerials.values().next().value!);live.current.onReady?.(serial);}
   if(motion.visible){c.save();c.globalAlpha=motion.opacity;drawAirSwing(c,whipBeat(motion.cycles,i.pressure));c.restore();}
   el.dataset.scenery=String(scenery&&p.sceneryVisible);el.dataset.bounds=JSON.stringify([x,y,width,height]);el.dataset.swingStyle='indigo';el.dataset.beat=motion.holding?'hold':motion.visible?'swing':'rest';el.dataset.pet=m.id;el.dataset.motion=a.id;el.dataset.frame=String(a.frames.indexOf(f));el.dataset.reduced=String(i.reduced);el.dataset.idleActive=String(Boolean(i.idle?.active));el.dataset.whip=String(motion.visible);el.dataset.actionCount=String(loaded.pet.animations.length);
   if(!paused)frame=requestAnimationFrame(draw);
  };
  const resume=()=>{cancelAnimationFrame(frame);previous=0;director.resume();if(!document.hidden)frame=requestAnimationFrame(draw);};
  frame=requestAnimationFrame(draw);document.addEventListener('visibilitychange',resume);
  const timer=setInterval(()=>{if(!frame&&!live.current.paused&&!document.hidden){director.resume();frame=requestAnimationFrame(draw);}},200);
  return()=>{disposed=true;cancelAnimationFrame(frame);clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
 },[loaded,rotationHistory]);
 return <div className="bf-stage" style={{opacity:prefs.opacity}}><canvas ref={canvas} role="img" aria-label={`${loaded.pet.manifest.name} · ${input.state}`}/></div>;
}
