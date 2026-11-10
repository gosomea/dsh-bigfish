import {useRef} from 'react';
import {IdleDirector} from '../domain/idle.js';
import type {Preferences} from '../contract/preferences.js';
import {motionReduced} from '../domain/motion-policy.js';
import type {ActivityGate,LocalSpeechGate} from '../companion/activity.js';
const key='bigfish.idle.v2';
export function useIdle(idle:boolean,visible:boolean,prefs:Preferences,roleLines?:string[],activity?:ActivityGate,speech?:LocalSpeechGate){
 const director=useRef<IdleDirector>();const saved=useRef('');
 if(!director.current){let memory;try{memory=JSON.parse(sessionStorage.getItem(key)??'null');}catch{/* Optional local cooldown. */}director.current=new IdleDirector(memory??undefined);}
 const greeting=!director.current.memory.greeted&&prefs.greetOnOpen;
 const now=Date.now(),result=director.current.tick(now,idle,visible&&!document.hidden,prefs,motionReduced(prefs,matchMedia('(prefers-reduced-motion: reduce)').matches),roleLines,activity?{canStart:activity.canStart('idle',now)}:undefined);
 if(result.active)activity?.started('idle',now);else activity?.finished('idle',now);
 const data=JSON.stringify(director.current.memory);if(data!==saved.current){saved.current=data;try{sessionStorage.setItem(key,data);}catch{/* Still enforced for this mount. */}}
 return result.showText&&speech?{...result,showText:speech.allow(`idle-${result.serial}`,now,prefs.talkLevel,greeting)}:result;
}
