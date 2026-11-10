import type {LifeProgramRequest} from '../companion/life-programs.js';
export interface LocalProgramRequest {request:LifeProgramRequest;accepted:boolean}
const eventName='bigfish:life-program';
/** A synchronous, same-window invitation. It cannot send messages or run tasks. */
export function playLifeProgram(request:LifeProgramRequest):boolean {
 const detail:LocalProgramRequest={request,accepted:false};
 window.dispatchEvent(new CustomEvent(eventName,{detail}));return detail.accepted;
}
export function listenLifePrograms(fn:(detail:LocalProgramRequest)=>void){
 const listener=(event:Event)=>fn((event as CustomEvent<LocalProgramRequest>).detail);
 window.addEventListener(eventName,listener);return()=>window.removeEventListener(eventName,listener);
}
