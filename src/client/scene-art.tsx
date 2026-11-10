import React,{useEffect,useId,useState} from 'react';
import sea from '../../assets/intelligent-pet/scenes/sea.webp';
import night from '../../assets/intelligent-pet/scenes/night.webp';
import garden from '../../assets/intelligent-pet/scenes/garden.webp';
import props from '../../assets/intelligent-pet/scenes/props.webp';

export const sceneBackgrounds={sea,night,garden} as const;
// Generated objects have unequal margins. These reviewed rectangles keep every silhouette intact.
export const scenePropRects={
 bed:[0,60,502,425],desk:[505,60,455,420],lamp:[967,20,338,460],box:[1309,65,465,430],
 boat:[0,490,446,390],pond:[455,490,510,390],rod:[966,480,340,400],shelf:[1312,515,462,350],
} as const;
export type SceneProp=keyof typeof scenePropRects;
export function ScenePropImage({kind,x,y,width,height,opacity=1}:{kind:SceneProp;x:number;y:number;width:number;height:number;opacity?:number}){
 const [sx,sy,sw,sh]=scenePropRects[kind];
 const clip=useId().replaceAll(':','');
 return <svg x={x} y={y} width={width} height={height} viewBox={`${sx} ${sy} ${sw} ${sh}`} preserveAspectRatio="xMidYMax meet" overflow="hidden" opacity={opacity} data-scene-prop={kind}>
  <defs><clipPath id={clip}><rect x={sx} y={sy} width={sw} height={sh}/></clipPath></defs>
  <image href={props} width="1774" height="887" clipPath={`url(#${clip})`}/>
 </svg>;
}
let atlas:HTMLImageElement|undefined;
/** Lazy decode only when a classic work scene needs a prop. The canvas loop paints it once ready. */
export function drawSceneArt(c:CanvasRenderingContext2D,kind:SceneProp,x:number,y:number,width:number,height:number):boolean{
 if(!atlas){atlas=new Image();atlas.src=props;}
 if(!atlas.complete||!atlas.naturalWidth)return false;
 const [sx,sy,sw,sh]=scenePropRects[kind],scale=Math.min(width/sw,height/sh),w=sw*scale,h=sh*scale;
 c.drawImage(atlas,sx,sy,sw,sh,x+(width-w)/2,y+height-h,w,h);return true;
}

/** Hidden tabs stop independent scene animation as well as the actor render loop. */
export function useSceneVisibility(){
 const [visible,setVisible]=useState(()=>typeof document==='undefined'||document.visibilityState==='visible');
 useEffect(()=>{const change=()=>setVisible(document.visibilityState==='visible');document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 return visible;
}
