import {useCallback,useEffect,useRef,useState} from 'react';
import type {ConfigurationOptions} from '../companion/configuration-options.js';
import {companionRequest} from './companion-host.js';

function validOptions(value:unknown):value is ConfigurationOptions {
 if(!value||typeof value!=='object')return false;
 const v=value as ConfigurationOptions;
 return typeof v.catalogAvailable==='boolean'&&Array.isArray(v.groups)&&v.groups.every(g=>g&&typeof g.id==='string'&&typeof g.name==='string'&&Array.isArray(g.models)&&g.models.every(m=>m&&typeof m.id==='string'&&typeof m.name==='string'))
  &&Array.isArray(v.workspaces)&&v.workspaces.every(w=>w&&typeof w.path==='string'&&typeof w.title==='string')&&Array.isArray(v.failures)
  &&(v.default===null||!!v.default&&typeof v.default.provider==='string'&&typeof v.default.model==='string');
}

/** Read directory metadata on opening or explicit refresh, independently of the five-second task poll. */
export function useConfigurationOptions(enabled:boolean){
 const [options,setOptions]=useState<ConfigurationOptions|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const epoch=useRef(0),reader=useRef<()=>Promise<void>>(async()=>{});
 const refresh=useCallback(()=>reader.current(),[]);
 useEffect(()=>{
  if(!enabled){setOptions(null);setLoading(false);return;}
  let disposed=false;
  const read=async()=>{
   const generation=++epoch.current;setLoading(true);setError('');
   try{const value:unknown=await companionRequest('configuration-options');if(!validOptions(value))throw Error('Host directory is unavailable');if(!disposed&&generation===epoch.current)setOptions(value);}
   catch{if(!disposed&&generation===epoch.current)setError('无法读取 DSH 模型和工作区，请重试。');}
   finally{if(!disposed&&generation===epoch.current)setLoading(false);}
  };
  reader.current=read;
  const off=window.bigfishDesktop?.onHostChanged?.(()=>{epoch.current++;setOptions(null);void read();});
  void read();return()=>{disposed=true;epoch.current++;off?.();if(reader.current===read)reader.current=async()=>{};};
 },[enabled]);
 return {options,loading,error,refresh};
}
