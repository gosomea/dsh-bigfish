import type {Insight} from './state.js';
import type {Preferences} from '../contract/preferences.js';
export function notificationPolicy(insight:Insight,prefs:Pick<Preferences,'completionMode'|'completionSeconds'>){
 if(insight.intent!=='celebrate')return {animate:true,durationMs:10000};
 if(prefs.completionMode==='quiet')return null;
 return {animate:prefs.completionMode==='celebrate',durationMs:prefs.completionSeconds*1000};
}
export function ownsDisplay(display:{client:string}|null|undefined,client:string|null){return !display||client!==null&&display.client===client;}
