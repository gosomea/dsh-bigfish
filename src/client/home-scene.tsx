import React,{useId} from 'react';
import type {Lifestyle} from '../companion/config.js';
import type {Collection} from '../companion/state.js';
import {sourcedCollections} from '../companion/life.js';
import {sceneBackgrounds,ScenePropImage,useSceneVisibility} from './scene-art.js';
import {homeFurniture,homeSceneFurniture,sceneContext,sceneMotionAllowed,type ScenePresentation} from './scene-state.js';
/** The painted room and independent props share the actor's ground plane; only local details move. */
export function HomeScene({config,collections=[],...presentation}:{config:Lifestyle;collections?:readonly Collection[]}&ScenePresentation){
 const visible=useSceneVisibility(),id=useId().replaceAll(':',''),context=sceneContext(presentation),moving=sceneMotionAllowed(presentation,visible);
 if(!config.groups.home||!config.homeVisible)return null;
 const cards=sourcedCollections(collections).slice(-3),night=config.theme==='night',warm=context==='work'||context==='tea',sleep=context==='sleep';
 const bed=homeFurniture.bed,desk=homeFurniture.desk,lamp=homeFurniture.lamp,shelf=homeFurniture.shelf,furniture=homeSceneFurniture(context,{bed:config.bed,desk:config.desk,lamp:config.lamp,cards:cards.length,night});
 return <svg className="bf-home" viewBox="0 0 340 250" aria-label={`大肥鱼的小窝${cards.length?` · 陈列 ${cards.length} 张真实项目明信片`:''}`} role="img" data-theme={config.theme} data-context={context} data-ambient={moving?'playing':'still'} data-art="painted" data-primary-furniture={furniture.primary??'none'} data-actor-foot="236,213" style={{position:'absolute',width:'100%',height:'100%',inset:0,pointerEvents:'none',overflow:'hidden'}}>
  <defs>
   <radialGradient id={`${id}-lamp`}><stop stopColor="#fff1bb" stopOpacity={warm?'.6':'.36'}/><stop offset="1" stopColor="#ffe4a4" stopOpacity="0"/></radialGradient>
   <radialGradient id={`${id}-nest`}><stop stopColor={night?'#a5c7ff':'#fff3cf'} stopOpacity=".42"/><stop offset="1" stopColor="#c8dfff" stopOpacity="0"/></radialGradient>
  </defs>
  <image href={sceneBackgrounds[config.theme]} x="0" y="3" width="340" height="240" preserveAspectRatio="none"/>
  <g data-scene-detail="atmosphere" opacity={night?'.72':'.45'}>
   {config.theme==='garden'?[0,1,2].map(i=><g key={i} transform={`translate(${29+i*21} ${67+i*14})`}><path d="M0 0q4-5 7 0q-2 6-7 0" fill={i%2?'#d9b9d6':'#b9d1b0'}>{moving&&<animateTransform attributeName="transform" type="translate" values="0 0;5 13;-2 24" dur={`${7+i*2}s`} begin={`${-i*2}s`} repeatCount="indefinite"/>}</path></g>):[0,1,2,3].map(i=><path key={i} d={`M${31+i*13} ${118+i*14}q8-3 16 0t16 0`} fill="none" stroke={night?'#c7dcff':'#b2e4ed'} strokeWidth="1.1" strokeLinecap="round">{moving&&<animate attributeName="opacity" values=".18;.7;.18" dur={`${4+i}s`} begin={`${-i}s`} repeatCount="indefinite"/>}</path>)}
  </g>
  {furniture.primary==='bed'&&<g data-furniture="bed" data-engaged={sleep}>
   {sleep&&<ellipse cx="68" cy="222" rx="63" ry="22" fill={`url(#${id}-nest)`}/>}
   <ScenePropImage kind="bed" {...bed}/>
   {sleep&&moving&&<g fill="#9fb8d6" fontSize="10" fontFamily="sans-serif"><text x="109" y="166">z<animate attributeName="opacity" values="0;.65;0" dur="5s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 5;3 -6" dur="5s" repeatCount="indefinite"/></text></g>}
  </g>}
  {furniture.primary==='desk'&&<g data-furniture="desk" data-engaged={context==='work'||context==='tea'}><ScenePropImage kind="desk" {...desk}/></g>}
  {furniture.lamp&&<g data-furniture="lamp" data-engaged={warm}>
   <ellipse data-scene-detail="lamplight" cx="111" cy="152" rx={warm?29:21} ry="21" fill={`url(#${id}-lamp)`}>{moving&&<animate attributeName="opacity" values=".66;1;.66" dur="6s" repeatCount="indefinite"/>}</ellipse>
   <g>{moving&&<animateTransform attributeName="transform" type="rotate" values="-.6 111 157;.6 111 157;-.6 111 157" dur="7s" repeatCount="indefinite"/>}<ScenePropImage kind="lamp" {...lamp}/></g>
  </g>}
  {context==='tea'&&furniture.primary==='desk'&&<g data-scene-detail="tea-steam" fill="none" stroke="#e9e4d8" strokeWidth="1.4" strokeLinecap="round">{[0,1].map(i=><path key={i} d={`M${91+i*7} 142q-5-5 0-10t0-10`} opacity=".7">{moving&&<animate attributeName="opacity" values=".15;.8;.15" dur={`${3+i}s`} repeatCount="indefinite"/>}</path>)}</g>}
  {furniture.primary==='shelf'&&<g aria-label="收藏展示架"><ScenePropImage kind="shelf" {...shelf}/>{cards.map((card,i)=><g key={card.id} transform={`translate(${38+i*25} 213)`}><title>{card.title}</title><path d="M-7 4L0-4L5 1L9-3L12 4Z" fill="#6799ba"/><circle cx="-4" cy="-4" r="2" fill="#d7b778"/></g>)}</g>}
 </svg>;
}
