import {useEffect,useRef,useState} from 'react';
import {companionRequest,type HostSnapshot} from './companion-host.js';

type IntroductionHost=Pick<HostSnapshot,'introducedAt'|'modelAvailable'|'display'>;
/** Rendering the invitation never consumes it. Only an explicit choice confirms it on the Host. */
export function useIntroduction({host,client,eligible,refresh}:{host:IntroductionHost|null;client:string|null;eligible:boolean;refresh:()=>Promise<void>}){
 const [visible,setVisible]=useState(()=>document.visibilityState==='visible');
 const [,leaseExpired]=useState(0);
 const [ready,setReady]=useState(false),[dismissed,setDismissed]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false),generation=useRef(0),latest=useRef({host,client,eligible});latest.current={host,client,eligible};
 const reset=()=>{generation.current++;inFlight.current=false;setReady(false);setDismissed(false);setPending(false);setError('');};
 const allowed=()=>{
  const value=latest.current,display=value.host?.display;
  return value.eligible&&document.visibilityState==='visible'&&value.host?.introducedAt===null&&value.host.modelAvailable&&!!value.client&&display?.client===value.client&&display.expiresAt>Date.now();
 };
 const active=visible&&allowed();
 useEffect(()=>{
  const changed=()=>setVisible(document.visibilityState==='visible');
  document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);
 },[]);
 useEffect(()=>{
  const off=window.bigfishDesktop?.onHostChanged?.(reset);
  return()=>{off?.();generation.current++;};
 },[]);
 useEffect(()=>{
  const expires=host?.display?.expiresAt;if(!expires)return;
  const timer=setTimeout(()=>leaseExpired(value=>value+1),Math.max(0,expires-Date.now()));
  return()=>clearTimeout(timer);
 },[host?.display?.expiresAt]);
 useEffect(()=>{
  if(!active||ready||dismissed)return;
  const timer=setTimeout(()=>{if(allowed())setReady(true);},10000);
  return()=>clearTimeout(timer);
 },[active,ready,dismissed]);
 // A disconnect or Host switch starts a fresh local grace period; the Host retains any completed choice.
 useEffect(()=>{if(!host)reset();else if(host.introducedAt!==null){setReady(false);setDismissed(false);setError('');}},[host?.introducedAt,host===null]);
 const dismiss=async()=>{
  if(inFlight.current||!ready||dismissed||!allowed())return false;
  const owner=latest.current.client!,epoch=generation.current,valid=()=>generation.current===epoch;
  inFlight.current=true;setPending(true);setError('');
  try{
   const confirmed=await companionRequest('introduce',{client:owner});
   if(!valid())return false;
   if(confirmed!==true){await refresh();if(valid())setError('提示状态已变化，请稍后重试。');return false;}
   setDismissed(true);setReady(false);void refresh().catch(()=>{});return true;
  }catch(e){if(valid())setError(e instanceof Error?e.message:'暂时无法保存选择，请重试。');return false;}
  finally{if(valid()){inFlight.current=false;setPending(false);}}
 };
 return {invite:active&&ready&&!dismissed,pending,error,dismiss};
}
