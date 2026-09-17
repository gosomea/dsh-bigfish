import {useRef} from 'react';
import {IdleDirector} from '../domain/idle.js';
import type {Preferences} from '../contract/preferences.js';
import {motionReduced} from '../domain/motion-policy.js';
const key='bigfish.idle.v2';
export function useIdle(idle:boolean,visible:boolean,prefs:Preferences,roleLines?:string[]){
 const director=useRef<IdleDirector>();const saved=useRef('');
 if(!director.current){let memory;try{memory=JSON.parse(sessionStorage.getItem(key)??'null');}catch{/* Optional local cooldown. */}director.current=new IdleDirector(memory??undefined);}
 const result=director.current.tick(Date.now(),idle,visible&&!document.hidden,prefs,motionReduced(prefs,matchMedia('(prefers-reduced-motion: reduce)').matches),roleLines);
 const data=JSON.stringify(director.current.memory);if(data!==saved.current){saved.current=data;try{sessionStorage.setItem(key,data);}catch{/* Still enforced for this mount. */}}
 return result;
}
