import {useEffect,useState,useSyncExternalStore} from 'react';
import {petLibrary,type LoadedPet} from '../pet/library.js';
import {loadPartnerAsset,resolvePartnerSelection} from '../pet/partner.js';

export interface PartnerPet {
 identity:string;key:string;name:string;loaded:LoadedPet|null;ready:boolean;
 status:'ready'|'loading'|'missing'|'error';issue:string;
}
/** The secondary actor borrows the active role or owns its own URLs. It owns no Host client. */
export function usePartnerPet(role:string):PartnerPet {
 useSyncExternalStore(petLibrary.subscribe,petLibrary.getSnapshot);
 const scope=petLibrary.scope,selection=resolvePartnerSelection(role,petLibrary.catalog,petLibrary.active);
 const borrowed=selection.kind==='pack'&&petLibrary.active?.key===selection.key?petLibrary.active:null;
 const identity=`${scope}:${role}:${selection.key}`;
 const [result,setResult]=useState<{identity:string;loaded:LoadedPet|null;error:string;lease:{active:boolean}}|null>(null);
 const needsLoad=selection.kind==='pack'&&!borrowed;
 useEffect(()=>{
  if(!needsLoad)return;
  let disposed=false,owned:LoadedPet|null=null;const lease={active:true};
  setResult(null);
  void loadPartnerAsset(petLibrary,selection.key,scope,()=>!disposed).then(loaded=>{
   if(disposed){loaded.release();return;}owned=loaded;setResult({identity,loaded,error:'',lease});
  }).catch(error=>{if(!disposed)setResult({identity,loaded:null,error:error instanceof Error?error.message:'伙伴素材加载失败',lease});});
  return()=>{disposed=true;lease.active=false;owned?.release();};
 },[identity,needsLoad,selection.kind]);
 if(selection.kind==='missing')return {identity,key:selection.key,name:selection.name,loaded:null,ready:false,status:'missing',issue:'这个伙伴角色尚未安装或已移除。选择会保留，但邀请已暂停；请先在本 Host 安装角色，或改选内置大肥鱼。'};
 if(selection.kind==='builtin')return {identity,key:'builtin',name:selection.name,loaded:null,ready:true,status:'ready',issue:''};
 if(borrowed)return {identity,key:selection.key,name:selection.name,loaded:borrowed,ready:true,status:'ready',issue:''};
 if(result?.identity===identity&&result.lease.active&&result.loaded)return {identity,key:selection.key,name:selection.name,loaded:result.loaded,ready:true,status:'ready',issue:''};
 if(result?.identity===identity&&result.lease.active&&result.error)return {identity,key:selection.key,name:selection.name,loaded:null,ready:false,status:'error',issue:`伙伴素材不可用，邀请已暂停：${result.error}`};
 return {identity,key:selection.key,name:selection.name,loaded:null,ready:false,status:'loading',issue:'正在读取本 Host 的伙伴素材；准备好后才允许邀请。'};
}
