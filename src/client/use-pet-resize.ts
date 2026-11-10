import {useCallback,useEffect,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {maxPetSize,minPetSize} from './actor-layout.js';

type ResizeGesture = {
  id: number;
  x: number;
  y: number;
  size: number;
  pixelsPerUnit: number;
  aspect: number;
  preview: number | null;
};

const clampSize=(size:number)=>Math.max(minPetSize,Math.min(maxPetSize,Math.round(size)));
const dragThreshold=4;

function coordinates(event:PointerEvent<HTMLDivElement>) {
  return window.bigfishDesktop
    ? {x:event.screenX,y:event.screenY}
    : {x:event.clientX,y:event.clientY};
}

export function usePetResize(size:number,onCommit:(size:number)=>Promise<void>) {
  const stageRef=useRef<HTMLDivElement>(null);
  const gesture=useRef<ResizeGesture|null>(null);
  const writeId=useRef(0);
  const [draft,setDraft]=useState<number|null>(null);
  const [pending,setPending]=useState<number|null>(null);
  const [error,setError]=useState(false);
  const committedSize=pending??size;
  const displaySize=draft??committedSize;

  function commit(next:number) {
    if(next===committedSize)return;
    const id=++writeId.current;
    setError(false);
    setPending(next);
    void onCommit(next).catch(()=>{
      if(writeId.current===id)setError(true);
    }).finally(()=>{
      if(writeId.current===id)setPending(null);
    });
  }

  const clearGesture=useCallback(()=>{
    const current=gesture.current;
    if(!current)return;
    gesture.current=null;
    if(current.preview!==null)window.bigfishDesktop?.dragState(false);
    setDraft(null);
  },[]);
  const dismiss=useCallback(()=>{
    clearGesture();
    setError(false);
  },[clearGesture]);
  useEffect(()=>()=>{if(gesture.current?.preview!=null)window.bigfishDesktop?.dragState(false);},[]);

  return {
    stageRef,displaySize,error,dismiss,
    dragging:draft!==null,provisional:draft!==null||pending!==null,
    handlers:{
      onPointerDown(event:PointerEvent<HTMLDivElement>){
        if(gesture.current||!event.isPrimary||event.button!==0)return;
        const bounds=stageRef.current?.getBoundingClientRect();
        if(!bounds?.width)return;
        event.stopPropagation();
        gesture.current={
          id:event.pointerId,...coordinates(event),size:displaySize,
          pixelsPerUnit:bounds.width/displaySize,aspect:bounds.height/bounds.width,preview:null,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event:PointerEvent<HTMLDivElement>){
        const current=gesture.current;
        if(!current||current.id!==event.pointerId)return;
        const {x,y}=coordinates(event);
        const dx=x-current.x,dy=y-current.y;
        if(current.preview===null){
          if(Math.hypot(dx,dy)<dragThreshold)return;
          window.bigfishDesktop?.dragState(true);
        }
        // Project onto the outward diagonal of the upper-right resize control.
        const {aspect,pixelsPerUnit}=current;
        const widthChange=(dx-aspect*dy)/(1+aspect*aspect);
        current.preview=clampSize(current.size+widthChange/pixelsPerUnit);
        setDraft(current.preview);
      },
      onPointerUp(event:PointerEvent<HTMLDivElement>){
        const current=gesture.current;
        if(!current||current.id!==event.pointerId)return;
        clearGesture();
        if(current.preview!==null)commit(current.preview);
      },
      onLostPointerCapture(event:PointerEvent<HTMLDivElement>){
        if(gesture.current?.id===event.pointerId)clearGesture();
      },
      onPointerCancel(event:PointerEvent<HTMLDivElement>){
        if(gesture.current?.id===event.pointerId)clearGesture();
      },
      onKeyDown(event:KeyboardEvent<HTMLDivElement>){
        if(gesture.current){
          if(event.key==='Escape'){
            event.preventDefault();
            event.stopPropagation();
            dismiss();
          }
          return;
        }
        const direction=event.key==='ArrowRight'||event.key==='ArrowUp'?1:event.key==='ArrowLeft'||event.key==='ArrowDown'?-1:0;
        const next=event.key==='Home'?minPetSize:event.key==='End'?maxPetSize:
          direction?clampSize(committedSize+direction*(event.shiftKey?10:5)):null;
        if(next===null)return;
        event.preventDefault();
        commit(next);
      },
    },
  };
}
