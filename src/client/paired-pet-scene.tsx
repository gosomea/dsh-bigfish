import React from 'react';
import {CompanionCanvas} from './companion-canvas.js';
import {OutfitLayer} from './outfit-layer.js';
import {pairedBall,type LifeProgramFrame} from '../companion/life-programs.js';
import type {Outfit} from '../companion/life-options.js';
import {PetCanvas} from '../pet/canvas.js';
import {partnerMotion} from '../pet/partner.js';
import type {PartnerPet} from './partner-pet.js';
import {preferenceDefaults,type Preferences} from '../contract/preferences.js';
/** A second local actor in the SAME stage and program. It owns no Host connection or model scheduler. */
export function PairedPetScene({enabled,frame,reduced=false,outfit='none',renderPet,onReady,onFailed,partner,prefs=preferenceDefaults}:{enabled:boolean;frame:LifeProgramFrame|null;reduced?:boolean;outfit?:Outfit;renderPet?:((clip:string,serial:string)=>React.ReactNode)|undefined;onReady?:((serial:string)=>void)|undefined;onFailed?:((serial:string)=>void)|undefined;partner?:PartnerPet|undefined;prefs?:Preferences|undefined}){
 if(!enabled||frame?.kind!=='paired'||!frame.pairedClip||partner&&!partner.ready)return null;
 const loaded=partner?.loaded,mapped=loaded?partnerMotion(loaded.pet,frame.pairedClip,frame.phase==='exit'):null;
 if(loaded&&!mapped)return null;
 const ball=pairedBall(reduced ? .5 : frame.progress);
 return <div className="bf-paired-pet" data-program={frame.id} data-partner={partner?.key??'legacy'} data-partner-identity={partner?.identity??''} aria-label={`同舞台的本地小伙伴${partner?` · ${partner.name}`:''}`} style={{position:'absolute',inset:0,pointerEvents:'none'}}>
  <div data-collision-box="28,120,86,93" style={{position:'absolute',left:'-4.7%',bottom:'9.5%',width:'38.2%',aspectRatio:'340/250'}}>
   {loaded&&mapped?<PetCanvas key={partner!.identity} loaded={loaded} input={{state:'idle',richness:prefs.richness,reduced,activity:0,pressure:0,preview:mapped,previewSerial:frame.serial,outfit}} prefs={{...prefs,whipEnabled:false,sceneryVisible:false}} scenery={false} onReady={()=>onReady?.(frame.serial)}/>:!partner&&renderPet?renderPet(frame.pairedClip,frame.serial):<CompanionCanvas key={partner?.identity??'builtin'} id={frame.pairedClip} serial={frame.serial} reduced={reduced} holdMs={frame.holdMs} onReady={()=>onReady?.(frame.serial)} {...(onFailed?{onFailed}:{})}/>}
   {!loaded&&(!renderPet||partner)&&<OutfitLayer outfit={outfit} clip={frame.pairedClip}/>}
  </div>
  <svg viewBox="0 0 340 250" role="img" aria-label={frame.pairProp==='ball'?'在两只宠物边界之间来回传递的小球':frame.pairProp==='tea'?'一起分享的茶与饼干':'小伙伴互相招手'} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
   {frame.pairProp==='ball'&&<g data-contact={ball.contact??'none'} transform={`translate(${ball.x} ${ball.y})`}><circle r="6" fill="#e8bd68" stroke="#916b40"/><path d="M-4-4L4 4" stroke="#fff3d8" strokeWidth="2"/>{ball.contact&&<path d="M-9-6L-12-9M9-6L12-9" stroke="#f1d682" strokeWidth="1.5"/>}</g>}
   {frame.pairProp==='tea'&&<g transform="translate(119 192)"><ellipse cy="7" rx="23" ry="5" fill="#abc2d9" opacity=".3"/><path d="M-12-7H0V4H-12ZM0-5Q8-5 6 0H0" fill="#f0f6fc" stroke="#7b9cb9"/><circle cx="15" cy="1" r="5" fill="#d8b16d"/><circle cx="14" cy="0" r="1" fill="#946b40"/></g>}
  </svg>
 </div>;
}
