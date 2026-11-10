import {useEffect} from 'react';
import type {Companion} from './controller.js';
/** One visible Web client claims a user-requested jump; no task execution API is involved. */
export function useDesktopNavigation(controller:Companion){useEffect(()=>{
 if(window.bigfishDesktop)return;let disposed=false,busy=false;
 const poll=async()=>{if(disposed||busy||!controller.canOpenSession?.()||document.visibilityState!=='visible')return;busy=true;try{const r=await fetch('/api/bigfish-desktop',{cache:'no-store'});if(!r.ok)return;const n=(await r.json()).navigation;if(!n||disposed)return;const claim=await fetch('/api/bigfish-desktop',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'claim',id:n.id})});if(!claim.ok)return;const value=(await claim.json()).result;if(value&&!disposed)await controller.openSession?.(value.session);}catch{/* Navigation is retried only while the Host intent remains unclaimed. */}finally{busy=false;}};
 void poll();const timer=setInterval(()=>void poll(),3000);return()=>{disposed=true;clearInterval(timer);};
 },[controller]);}
