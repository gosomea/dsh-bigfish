import {actorFoot} from '../client/actor-layout.js';
import type {PetManifest} from './contract.js';
/** A fixed compartment and foot anchor, independent of props, air-swing settings and animation policy. */
export function petLayout(manifest:Pick<PetManifest,'canvas'|'body'>){
 const {canvas,body}=manifest,b=body?.bounds??{x:0,y:0,width:canvas.width,height:canvas.height},foot=body?.foot??{x:canvas.width/2,y:canvas.height};
 const left=124,right=330,top=10,bottom=240;
 const fit=(room:number,extent:number)=>extent>0?room/extent:Infinity;
 const scale=Math.min(fit(actorFoot.x-left,foot.x-b.x),fit(right-actorFoot.x,b.x+b.width-foot.x),fit(actorFoot.y-top,foot.y-b.y),fit(bottom-actorFoot.y,b.y+b.height-foot.y));
 return {x:actorFoot.x-foot.x*scale,y:actorFoot.y-foot.y*scale,width:canvas.width*scale,height:canvas.height*scale,scale,left,right,top,bottom,foot};
}
