import type {Preferences} from '../contract/preferences.js';
export const motionReduced=(p:Preferences,system:boolean)=>p.motionPolicy==='reduced'||(p.motionPolicy==='system'&&(p.reducedMotion||system));
const gentle=new Set(['breathe','confirm','sleep','read','type','repair','wait-sign','sigh','bow']);
const energetic=new Set(['run','panic','stumble','shuffle','peek','sign-bounce']);
export function motionAllowed(motion:string,richness:number,reduced:boolean){return reduced||richness===0?gentle.has(motion):richness===1?!energetic.has(motion):true;}
