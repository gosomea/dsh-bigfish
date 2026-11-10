import React from 'react';
import {outfits,type Outfit} from '../companion/life-options.js';
import type {AccessoryAnchors} from '../pet/capabilities.js';
export const builtinAccessoryAnchors:AccessoryAnchors={head:{x:206,y:57},neck:{x:236,y:119},chest:{x:213,y:145}};
/** Built-in upright anchors preserve the whale emblem and tail; bent/sleeping poses put props away. */
export function OutfitLayer({outfit,clip='',anchors=builtinAccessoryAnchors}:{outfit:Outfit;clip?:string;anchors?:AccessoryAnchors}){
 if(outfit==='none'||['lie-down','sleep','wake-up','nest','ball-catch','head-pat'].includes(clip.replace(/^companion:/,'')))return null;
 const p=outfit==='sailor-bow'?anchors.head:outfit==='winter-scarf'?anchors.neck:anchors.chest;if(!p)return null;
 return <svg className="bf-outfit-layer" viewBox="0 0 340 250" role="img" aria-label={`佩戴${outfits[outfit]}`} style={{position:'absolute',width:'100%',height:'100%',inset:0,pointerEvents:'none'}}><g transform={`translate(${p.x} ${p.y})`} strokeLinejoin="round">
  {outfit==='sailor-bow'?<><path d="M0 0L-12-7Q-17 0-12 8ZM0 0L12-7Q17 0 12 8Z" fill="#86c9df" stroke="#385b81" strokeWidth="1.4"/><rect x="-3" y="-3" width="6" height="6" rx="1" fill="#edf9fb"/></>:outfit==='star-pin'?<path d="M0-7L2-3 6.7-2.2 3.3 1 4.1 5.7 0 3.5-4.1 5.7-3.3 1-6.7-2.2-2-3Z" fill="#ffdd80" stroke="#9b7640" strokeWidth="1.4"/>:<><rect x="-17" y="-4" width="34" height="9" rx="4" fill="#b8dcef" stroke="#42688c" strokeWidth="1.4"/><path d="M9 3L14 25H5L1 3" fill="#b8dcef" stroke="#42688c" strokeWidth="1.4"/></>}
 </g></svg>;
}
