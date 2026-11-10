import {useCallback,useEffect,useRef,useState} from 'react';
import {LifeRoutineDirector,type RoutineInput,type RoutineFrame} from '../companion/routines.js';
import {AdventureDirector,type AdventureEnvironment,type AdventureSnapshot} from '../companion/adventures.js';
import {LifeProgramDirector,type LifeProgramEnvironment,type LifeProgramFrame,type LifeProgramRequest} from '../companion/life-programs.js';
/** All local performances share one timer and one actor. Ordinary chains are never started on top of each other. */
export function useLocalLife(input:{routine:RoutineInput;adventure:AdventureEnvironment;blockAdventureStart:boolean;program?:LifeProgramEnvironment;programRequest?:{serial:number;request:LifeProgramRequest}|null}){
 const latest=useRef(input);latest.current=input;
 const routines=useRef(new LifeRoutineDirector()),adventures=useRef(new AdventureDirector()),programs=useRef(new LifeProgramDirector());
 const ready=useRef(''),onReady=useCallback((serial:string)=>{ready.current=serial;},[]);
 const failed=useRef(''),onFailed=useCallback((serial:string)=>{failed.current=serial;},[]);
 const [value,setValue]=useState<{routine:RoutineFrame|null;adventure:AdventureSnapshot|null;program:LifeProgramFrame|null}>({routine:null,adventure:null,program:null});
 useEffect(()=>{
  let adventure:AdventureSnapshot|null=null,routine:RoutineFrame|null=null,program:LifeProgramFrame|null=null,requestSerial:number|undefined;
  const update=()=>{
   const now=Date.now(),i=latest.current,hidden=document.visibilityState!=='visible';
   const activity=i.routine.activity;
   const playbackFailed=!!failed.current&&[program?.serial,routine?.serial,adventure?.clipSerial].includes(failed.current);
   failed.current='';
   const canStart=!playbackFailed&&!i.blockAdventureStart&&(!activity||activity.canStart('life',now));
   if(i.program){
    const env={...i.program,blocked:i.program.blocked||hidden||playbackFailed,playbackReady:ready.current};
    if(i.programRequest&&i.programRequest.serial!==requestSerial){
     requestSerial=i.programRequest.serial;
     // A direct user performance may replace ordinary routines, but never an important fact or work.
     if(!env.blocked&&!env.working){programs.current.start(i.programRequest.request,env,now);}
    }
    program=programs.current.tick(env,now);
    if(!program&&!routine&&!adventure&&canStart){programs.current.maybeStart(env,now);program=programs.current.tick(env,now);}
   }else program=null;
   // A due rare scene gets this life turn before starting another routine, rather than
   // losing to the routine on every polling tick. Existing chains still finish first.
   const candidateEnv={...i.adventure,visible:!hidden,important:i.adventure.important||!!routine||!!program};
   if(!routine&&!adventure&&!program&&canStart){adventures.current.maybeStart(now,candidateEnv);adventure=adventures.current.tick(now,candidateEnv);}
   routine=routines.current.tick({...i.routine,playbackReady:ready.current,blocked:i.routine.blocked||hidden||playbackFailed||!!adventure||!!program},now);
   const env={...i.adventure,visible:!hidden,important:i.adventure.important||playbackFailed||!!routine||!!program};
   adventure=adventures.current.tick(now,env);
   if(routine||adventure||program)activity?.started('life',now);else{activity?.finished('life',now);if(canStart)activity?.declined?.('life',now);}
   setValue(old=>old.routine?.serial===routine?.serial&&old.routine?.phase===routine?.phase&&old.adventure?.clipSerial===adventure?.clipSerial&&old.adventure?.phaseProgress===adventure?.phaseProgress&&old.program?.serial===program?.serial&&old.program?.progress===program?.progress?old:{routine,adventure,program});
  };
  update();const timer=setInterval(update,100);document.addEventListener('visibilitychange',update);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};
 },[]);
 return {...value,onReady,onFailed};
}
