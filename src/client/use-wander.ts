import {useCallback,useEffect,useRef,useState} from 'react';
import {Walker,WanderDirector,type WanderFrame,type WanderClip} from '../companion/movement.js';
import type {Lifestyle} from '../companion/config.js';
import type {ActivityGate} from '../companion/activity.js';
import {activityAreaDefaults,activityDefaultHomeTarget,activityAreaMessage,activityReturnRoute,type ActivityAreaConfig,type ActivityAreaStatus} from '../companion/activity-area.js';
import {readActivityArea,listenActivityArea} from './activity-area-store.js';
interface Position {right:number;bottom:number}
interface WanderControls {
 element:HTMLElement|null;position:Position;move:(p:Position)=>void;
 dragging:boolean;hovered:boolean;enabled:boolean;capable:boolean;blockStart:boolean;config:Lifestyle;
 authored?:boolean;availableClips?:readonly string[];activity?:ActivityGate;recallBlocked?:boolean;recallEnabled:boolean;
}
const resting:WanderFrame={phase:'rest',clip:null,serial:'wander-0',mirror:false,holdMs:0,moving:false};
const movementClips:readonly WanderClip[]=['walk','turn','start-step','stop','tail-avoid','tiptoe','edge-peek','sit-down','wake-up'];
function recallUnavailable({recallBlocked,config,capable}:WanderControls):boolean {
 return !!recallBlocked||config.movement==='fixed'||!config.groups.body||!capable;
}
function desktopPolicy(o:WanderControls,readySerial:string,active=false,failedSerial=''){
 const availableClips=o.availableClips?.filter((id):id is WanderClip=>movementClips.includes(id as WanderClip));
 return {recallBlocked:!!o.recallBlocked||o.config.movement==='fixed'||!o.config.groups.body,mode:o.config.movement==='screen'?'screen' as const:'horizontal' as const,enabled:o.enabled&&!o.dragging&&!o.hovered,blockStart:o.blockStart||!active&&!!o.activity&&!o.activity.canStart('wander',Date.now()),capable:o.capable,radius:o.config.movement==='wide'?Math.max(o.config.radius,300):o.config.radius,speed:o.config.speed,restMin:o.config.restMin,restMax:o.config.restMax,readySerial,failedSerial,ready:o.authored===false,...(availableClips?{availableClips}:{})};
}
export function useWander(options:WanderControls){
 const latest=useRef(options);latest.current=options;
 const walker=useRef<Walker|null>(null),director=useRef<WanderDirector|null>(null),wasDragging=useRef(false),ready=useRef(''),motion=useRef<WanderFrame>(resting);
 const [frame,setFrame]=useState<WanderFrame>(resting),[notice,setNotice]=useState<ActivityAreaStatus>(''),[dismissed,setDismissed]=useState<ActivityAreaStatus>('');
 const areaConfig=useRef<ActivityAreaConfig>(activityAreaDefaults()),pendingRecall=useRef(false),failed=useRef('');
 useEffect(()=>{let alive=true;const refresh=async()=>{try{const value=await readActivityArea();if(alive&&JSON.stringify(value.config)!==JSON.stringify(areaConfig.current)){areaConfig.current=value.config;pendingRecall.current=false;setNotice('');setDismissed('');}}catch{/* Invalid or unavailable device config leaves movement locally bounded. */}};void refresh();const off=listenActivityArea(()=>void refresh());return()=>{alive=false;off();};},[]);
 const recall=useCallback(()=>{setDismissed('');const o=latest.current;if(recallUnavailable(o)){pendingRecall.current=false;setNotice('unavailable');return false;}if(window.bigfishDesktop){window.bigfishDesktop.recall();setNotice('');return true;}const b=o.element?.getBoundingClientRect();if(!b)return false;const area={x:8,y:8,width:innerWidth-16,height:innerHeight-28},size={width:b.width,height:b.height},target=activityDefaultHomeTarget(areaConfig.current,area,size);if(!target||!activityReturnRoute({x:b.x,y:b.y},target,area,size,areaConfig.current)){setNotice('home-blocked');return false;}pendingRecall.current=true;setNotice(o.recallEnabled&&!o.dragging?'':'queued');return true;},[]);
 const onReady=useCallback((serial:string)=>{ready.current=serial;if(window.bigfishDesktop)window.bigfishDesktop.walkPolicy(desktopPolicy(latest.current,serial,motion.current.phase!=='rest',failed.current));},[]);
 const onFailed=useCallback((serial:string)=>{
  failed.current=serial;
  window.bigfishDesktop?.walkPolicy(desktopPolicy(latest.current,ready.current,motion.current.phase!=='rest',serial));
 },[]);
 useEffect(()=>{
  if(!window.bigfishDesktop)return;
  window.bigfishDesktop.walkPolicy(desktopPolicy(options,ready.current,motion.current.phase!=='rest',failed.current));
 },[options.enabled,options.dragging,options.hovered,options.blockStart,options.capable,options.authored,options.availableClips?.join(','),options.config.radius,options.config.movement,options.config.speed,options.config.restMin,options.config.restMax]);
 useEffect(()=>{
  if(window.bigfishDesktop){
   const bridge=window.bigfishDesktop;let published='';
   const publish=()=>{const policy=desktopPolicy(latest.current,ready.current,motion.current.phase!=='rest',failed.current),key=JSON.stringify(policy);if(key!==published){published=key;bridge.walkPolicy(policy);}};
   const accept=(next:WanderFrame)=>{motion.current=next;if(next.areaStatus)setNotice('');const activity=latest.current.activity,now=Date.now();if(next.phase==='rest')activity?.finished('wander',now);else activity?.started('wander',now);setFrame(old=>old.serial===next.serial&&old.phase===next.phase&&old.mirror===next.mirror&&old.areaStatus===next.areaStatus?old:next);};
   const off=bridge.onMotionState?bridge.onMotionState(accept):bridge.onMotion(phase=>accept({phase,clip:phase==='rest'?null:phase==='stop'?'stop':'walk',serial:`desktop-${phase}`,mirror:phase==='walk-right',holdMs:phase==='stop'?3000:0,moving:phase==='walk-left'||phase==='walk-right'}));
   publish();const timer=setInterval(publish,100);
   return()=>{off();clearInterval(timer);latest.current.activity?.finished('wander',Date.now());};
  }
  let raf=0,last=0,geometry='';
  const tick=(now:number)=>{
   const o=latest.current,el=o.element;
   if(el&&now-last>=32){
    last=now;const b=el.getBoundingClientRect(),area={x:8,y:8,width:innerWidth-16,height:innerHeight-28},size={width:b.width,height:b.height};
    const shape=[area.x,area.y,area.width,area.height,b.width,b.height,o.config.movement,JSON.stringify(areaConfig.current)].join(':'),resized=!!geometry&&geometry!==shape;geometry=shape;
    if(o.dragging&&pendingRecall.current){pendingRecall.current=false;setNotice('cancelled');}
    if(pendingRecall.current&&recallUnavailable(o)){pendingRecall.current=false;setNotice('unavailable');}
    const policy={activityArea:areaConfig.current,mode:o.config.movement==='screen'?'screen' as const:'horizontal' as const,enabled:!o.dragging&&document.visibilityState==='visible'&&(pendingRecall.current?o.recallEnabled:o.enabled&&!o.hovered),capable:o.capable,radius:o.config.movement==='wide'?Math.max(o.config.radius,300):o.config.radius,speed:o.config.speed,restMin:o.activity?0:o.config.restMin,restMax:o.activity?0:o.config.restMax,quickRecall:true};
    const requestHome=(d:WanderDirector|Walker)=>{
     if(!pendingRecall.current)return;
     if(!policy.enabled){setNotice('queued');return;}
     if(d.areaStatus==='returning')return;
     const target=activityDefaultHomeTarget(areaConfig.current,area,size);
     if(!target||!activityReturnRoute(d.position,target,area,size,areaConfig.current)){pendingRecall.current=false;setNotice('home-blocked');return;}
     if(Math.hypot(d.position.x-target.x,d.position.y-target.y)<1){pendingRecall.current=false;setNotice('');return;}
     d.requestRecall(target,now);setNotice('');
    };
    let next:WanderFrame,p:{x:number;y:number},wasMoving=false;
    if(o.authored!==false){
     const d=director.current??=new WanderDirector({x:b.x,y:b.y});
     wasMoving=d.snapshot().moving;
     if(failed.current!==d.snapshot().serial){
      if(o.dragging||wasDragging.current||resized)d.place({x:b.x,y:b.y},area,size,now);
      requestHome(d);
     }
     next=d.tick(now,area,size,{...policy,blockStart:!pendingRecall.current&&(o.blockStart||!!o.activity&&!o.activity.canStart('wander',Date.now())),ready:ready.current===d.snapshot().serial,failedSerial:failed.current,...(o.availableClips?{availableClips:o.availableClips}:{})});p=d.position;
     if(next.areaStatus==='playback-failed'&&failed.current){
      failed.current='';
      pendingRecall.current=false;
      setDismissed('');
      setNotice('playback-failed');
     }
    }else{
     const w=walker.current??=new Walker({x:b.x,y:b.y});
     wasMoving=w.phase==='walk-left'||w.phase==='walk-right';
     if(o.dragging||wasDragging.current||resized)w.place({x:b.x,y:b.y},area,size,now);
     requestHome(w);p=!pendingRecall.current&&(o.blockStart||!!o.activity&&!o.activity.canStart('wander',Date.now()))&&w.phase==='rest'&&o.enabled?w.position:w.tick(now,area,size,policy);
     next={phase:w.phase,clip:w.phase==='rest'?null:w.phase==='stop'?'stop':'walk',serial:`external-${w.phase}`,mirror:w.phase==='walk-right',holdMs:w.phase==='stop'?3000:0,moving:w.phase==='walk-left'||w.phase==='walk-right',areaStatus:w.areaStatus,...(w.arrivedHome?{arrivedHome:true}:{})};
    }
    if(next.arrivedHome){pendingRecall.current=false;setNotice('');}
    if(next.phase==='rest')o.activity?.finished('wander',Date.now());else o.activity?.started('wander',Date.now());
    wasDragging.current=o.dragging;
    if(policy.enabled&&o.capable&&!o.dragging&&next.areaStatus!=='playback-failed'&&(next.moving||wasMoving&&next.clip==='stop'||next.arrivedHome||resized))o.move({right:innerWidth-p.x-b.width,bottom:innerHeight-p.y-b.height});
    setFrame(old=>old.serial===next.serial&&old.phase===next.phase&&old.mirror===next.mirror&&old.areaStatus===next.areaStatus?old:next);
   }
   raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(raf);latest.current.activity?.finished('wander',Date.now());};
 },[]);
 const status=notice||frame.areaStatus||'';
 const cancelRecall=useCallback(()=>{
  pendingRecall.current=false;setNotice('');setDismissed('');
  if(window.bigfishDesktop){window.bigfishDesktop.cancelRecall();return;}
  const now=performance.now(),d=director.current;
  if(d?.cancelRecall(now))setFrame(d.snapshot());
  if(walker.current?.cancelRecall(now))setFrame(resting);
 },[]);
 useEffect(()=>{if(!status||status==='returning'||status===dismissed)return;const timer=setTimeout(()=>{setDismissed(status);setNotice('');},8000);return()=>clearTimeout(timer);},[status,dismissed]);
 useEffect(()=>{if(!options.dragging)return;setNotice('');if(frame.areaStatus)setDismissed(frame.areaStatus);},[options.dragging,frame.areaStatus]);
 const dismissAreaStatus=useCallback(()=>{if(status)setDismissed(status);setNotice('');},[status]);
 return {...frame,returning:frame.areaStatus==='returning',onReady,onFailed,recall,cancelRecall,dismissAreaStatus,areaStatusKind:status===dismissed?'':status,areaStatus:status===dismissed?'':activityAreaMessage(status)};
}
