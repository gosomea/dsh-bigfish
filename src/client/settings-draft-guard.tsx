import React,{createContext,forwardRef,useCallback,useContext,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState,type ReactNode} from 'react';

export type DraftDomain='preferences'|'activity-area'|'host-policy';
export type DraftTransition='close'|'quick'|'reload';
export interface SettingsPanelHandle{confirmTransition(action:'close'|'quick'):Promise<boolean>}
interface DraftMeta{id:string;label:string;domain:DraftDomain}
interface PendingConfirmation{action:DraftTransition;ids:string[];labels:string[];resolve:(accepted:boolean)=>void}
interface DraftGuard{
 epoch:number;
 setDirty(meta:DraftMeta,dirty:boolean):void;
 confirm(action:DraftTransition,onlyId?:string):Promise<boolean>;
 resetPreferences():void;
}
const standalone:DraftGuard={epoch:0,setDirty:()=>{},confirm:async()=>true,resetPreferences:()=>{}};
const DraftContext=createContext<DraftGuard>(standalone);
const actionText=(action:DraftTransition)=>action==='close'?'关闭':action==='quick'?'返回':'重新读取';

export const SettingsDraftProvider=forwardRef<SettingsPanelHandle,{children:ReactNode}>(function SettingsDraftProvider({children},ref){
 const records=useRef(new Map<string,DraftMeta>()),pendingRef=useRef<PendingConfirmation|null>(null);
 const [epoch,setEpoch]=useState(0),[pending,setPending]=useState<PendingConfirmation|null>(null);
 const setDirty=useCallback((meta:DraftMeta,dirty:boolean)=>{if(dirty)records.current.set(meta.id,meta);else records.current.delete(meta.id);},[]);
 const confirm=useCallback((action:DraftTransition,onlyId?:string)=>{
  const selected=[...records.current.values()].filter(meta=>!onlyId||meta.id===onlyId);
  if(!selected.length)return Promise.resolve(true);
  if(pendingRef.current)return Promise.resolve(false);
  return new Promise<boolean>(resolve=>{const next={action,ids:selected.map(meta=>meta.id),labels:selected.map(meta=>meta.label),resolve};pendingRef.current=next;setPending(next);});
 },[]);
 const settle=useCallback((accepted:boolean)=>{const current=pendingRef.current;pendingRef.current=null;setPending(null);if(accepted)for(const id of current?.ids??[])records.current.delete(id);current?.resolve(accepted);},[]);
 const resetPreferences=useCallback(()=>{for(const [id,meta] of records.current)if(meta.domain==='preferences')records.current.delete(id);setEpoch(value=>value+1);},[]);
 useImperativeHandle(ref,()=>({confirmTransition:confirm}),[confirm]);
 useEffect(()=>()=>{pendingRef.current?.resolve(false);pendingRef.current=null;},[]);
 return <DraftContext.Provider value={{epoch,setDirty,confirm,resetPreferences}}>{children}{pending&&<div className="bf-draft-backdrop"><section className="bf-draft-confirm" role="alertdialog" aria-modal="true" aria-label="放弃未保存修改？" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();settle(false);}}}><h3>放弃未保存修改？</h3><p>将丢弃：{pending.labels.join('、')}。已保存的设置不受影响。</p><div className="bf-button-row"><button type="button" autoFocus onClick={()=>settle(false)}>继续编辑</button><button type="button" className="bf-primary-button" onClick={()=>settle(true)}>丢弃修改并{actionText(pending.action)}</button></div></section></div>}</DraftContext.Provider>;
});

export function useDirtyDraft(meta:DraftMeta,dirty:boolean){
 const guard=useContext(DraftContext);
 useLayoutEffect(()=>{guard.setDirty(meta,dirty);return()=>guard.setDirty(meta,false);},[guard,meta.id,meta.label,meta.domain,dirty]);
 return {epoch:guard.epoch,confirmDiscard:(action:DraftTransition)=>guard.confirm(action,meta.id)};
}
export function useSettingsDraftGuard(){return useContext(DraftContext);}
