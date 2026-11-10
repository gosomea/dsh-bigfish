import {schemeDisplayDefaults,schemeDisplayRanges} from '../contract/scheme-display.js';

/** Shared logical 340×250 stage: changing animation systems must preserve the feet. */
export const actorFoot={x:236,y:213} as const;
export const defaultPetSize=schemeDisplayDefaults.size;
export const [minPetSize,maxPetSize]=schemeDisplayRanges.size;

/** Scale the responsive baseline so even the largest setting fits the Web viewport. */
export function petStageWidth(size:number,desktop:boolean):string {
 const scale=size/defaultPetSize;
 const desired=340*scale;
 if(desktop)return `${desired}px`;
 return `min(${desired}px, max(${size}px, ${25*scale}vw), calc((100vw - 16px) * ${size/maxPetSize}))`;
}
