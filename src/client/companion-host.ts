import {createContext,createElement,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {CompanionState,Usage} from '../companion/state.js';
export type HostSnapshot=Omit<CompanionState,'reservations'|'fingerprints'> & {today:Usage;modelAvailable:boolean;screenshotAvailable?:boolean;localClient?:string};
export async function companionRequest(op:string,body:Record<string,unknown>={},keepalive=false){
 if(window.bigfishDesktop)return (await window.bigfishDesktop.request(op,body)).result;
 const r=await fetch(op==='screenshot'?'/api/bigfish-companion-screenshot':'/api/bigfish-companion',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,...body}),keepalive});
 const value=await r.json();if(!r.ok)throw Error(value.error??'Host 请求失败');return value.result;
}
type HostView={state:HostSnapshot|null;error:string;refresh:()=>Promise<void>};
const SettingsHost=createContext<HostView|null>(null);
/** Split settings pages share one reader while keeping their drafts mounted. */
export function CompanionHostProvider({enabled,children}:{enabled:boolean;children:ReactNode}){
 const value=usePolledCompanionHost(enabled);
 return createElement(SettingsHost.Provider,{value},children);
}
export function useCompanionHost(enabled:boolean){
 const shared=useContext(SettingsHost),own=usePolledCompanionHost(enabled&&!shared);
 return shared??own;
}
function usePolledCompanionHost(enabled:boolean){
 const [state,setState]=useState<HostSnapshot|null>(null),[error,setError]=useState('');
 const refreshReader=useRef<()=>Promise<void>>(async()=>{}),refresh=useCallback(()=>refreshReader.current(),[]);
 useEffect(()=>{if(!enabled){setState(null);return;}const abort=new AbortController();let busy=false,epoch=0;
  const read=async(force=false)=>{if(force){epoch++;busy=false;}if(busy)return;busy=true;const current=epoch;const valid=()=>!abort.signal.aborted&&current===epoch;try{
   if(window.bigfishDesktop){const v=await window.bigfishDesktop.state();if(!v.host)throw Error('Host 已断开');if(valid()){setState({...v.host,...(v.clientId?{localClient:v.clientId}:{})});setError('');}return;}
   const r=await fetch('/api/bigfish-companion',{signal:abort.signal});if(!r.ok)throw Error('Host 尚未提供智能宠物接口');const v=await r.json();if(valid()){setState(v);setError('');}
  }catch(e){if(valid()){setError((e as Error).message);setState(null);}}finally{if(current===epoch)busy=false;}};
  const forceRead=()=>read(true);refreshReader.current=forceRead;
  const off=window.bigfishDesktop?.onHostChanged?.(()=>{setState(null);setError('正在切换 Host');void forceRead();});
  void read();const timer=setInterval(()=>void read(),5000);return()=>{epoch++;abort.abort();clearInterval(timer);off?.();if(refreshReader.current===forceRead)refreshReader.current=async()=>{};};
 },[enabled]);return {state,error,refresh};
}
