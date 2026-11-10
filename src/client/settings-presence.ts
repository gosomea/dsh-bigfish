import {useEffect,useSyncExternalStore,type RefObject} from 'react';

const visiblePanels=new Set<HTMLElement>(),listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
const snapshot=()=>visiblePanels.size>0;
/** Settings may be opened outside Widget, or kept mounted in a hidden Host tab. */
export function useSettingsPresence(ref:RefObject<HTMLElement>){
 useEffect(()=>{
  const element=ref.current;if(!element)return;
  const set=(visible:boolean)=>{
   const before=snapshot();if(visible)visiblePanels.add(element);else visiblePanels.delete(element);
   if(before!==snapshot())for(const listener of listeners)listener();
  };
  const measurable=()=>{const r=element.getBoundingClientRect();return element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden'&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;};
  set(measurable());
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.target===element)set(entry.isIntersecting&&measurable());});
  observer.observe(element);
  return()=>{observer.disconnect();set(false);};
 },[ref]);
}
export function useVisibleSettings(){return useSyncExternalStore(subscribe,snapshot,()=>false);}
