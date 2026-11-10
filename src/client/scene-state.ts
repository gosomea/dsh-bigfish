import type {Snapshot} from '../contract/types.js';
export interface ScenePresentation {motion?:string;state?:Snapshot['state'];quiet?:boolean;reduced?:boolean;paused?:boolean}
export type HomeContext='rest'|'sleep'|'work'|'tea'|'play'|'welcome';
export function sceneContext({motion='',state='idle'}:ScenePresentation):HomeContext {
 const clip=motion.replace(/^(?:companion|classic|bigfish):/u,'');
 if(state==='waiting-user'||state==='completed')return 'welcome';
 if(state!=='idle')return 'work';
 if(['sleep','lie-down','nest','wake-up','pillow-nest'].includes(clip))return 'sleep';
 if(['tea','biscuit','biscuit-share'].includes(clip))return 'tea';
 if(['ball-catch','fish-toy','tail-comb','head-pat'].includes(clip))return 'play';
 if(['wave','recall','confirm-card','task-cards','success-bow','postcard','point'].includes(clip))return 'welcome';
 if(['desk-tidy','book-close','lamp','read-bookmark','read-books-sort'].includes(clip))return 'work';
 return 'rest';
}
export function sceneMotionAllowed({quiet=false,reduced=false,paused=false}:ScenePresentation,visible=true){return !quiet&&!reduced&&!paused&&visible;}
/** Furniture occupies the same ground plane as the actor, rather than a tiny icon in the corner. */
export const homeFurniture={
 bed:{x:4,y:142,width:132,height:103},
 desk:{x:6,y:126,width:126,height:117},
 lamp:{x:94,y:108,width:33,height:50},
 shelf:{x:6,y:154,width:125,height:90},
} as const;
export const workFurniture={
 bed:homeFurniture.bed,
 desk:homeFurniture.desk,
 shelf:homeFurniture.shelf,
} as const;

export const protectedActorRegions={face:{x:144,y:20,width:190,height:96},sign:{x:144,y:104,width:186,height:75}} as const;
/** One main furnishing per activity keeps the character silhouette and held signs unobstructed. */
export function homeSceneFurniture(context:HomeContext,options:{bed:boolean;desk:boolean;lamp:boolean;cards:number;night:boolean}){
 const primary: 'bed'|'desk'|'shelf'|null=(context==='rest'||context==='sleep')&&options.bed?'bed':(context==='work'||context==='tea')&&options.desk?'desk':context==='welcome'&&options.cards>0?'shelf':null;
 return {primary,lamp:options.lamp&&(primary==='desk'||options.night)};
}
