import {SettingsSelect} from './settings-select.js';
import React,{useEffect,useState} from 'react';
import {effectiveLifeOptions,actionUnlocked} from '../companion/life-options.js';
import {currentSeason,lifeDefaults,seasonalStory,seasons,type PlayKind,type Season} from '../companion/life.js';
import {lifeProgramClips,type LifeProgramRequest} from '../companion/life-programs.js';
import type {Lifestyle} from '../companion/config.js';
import type {HostSnapshot} from './companion-host.js';
import {PetPlayground} from './pet-playground.js';
import {SettingsSection,type SettingsVariant} from './settings-section.js';
const LazyLifeProgramPreview=React.lazy(()=>import('./life-program-preview.js').then(module=>({default:module.LifeProgramPreview})));
export interface LifeActionsProps {
 config:Lifestyle;state?:Pick<HostSnapshot,'life'>|null;demo?:boolean;disabled?:boolean;reducedMotion?:boolean;
 onInteract?:(kind:PlayKind)=>boolean|void;
 onPlayProgram?:(request:LifeProgramRequest)=>boolean|void;
 variant?:SettingsVariant;
 pairAvailable?:boolean;pairIssue?:string;
}
/** Actions are deliberate local gestures. Opening this menu never starts a performance or model request. */
export function LifeActions({config,state=null,demo=false,disabled=false,reducedMotion=false,onInteract,onPlayProgram,variant='section',pairAvailable=true,pairIssue=''}:LifeActionsProps){
 const [issue,setIssue]=useState(''),[localRequest,setLocalRequest]=useState<{serial:number;request:LifeProgramRequest}|null>(null);
 const [season,setSeason]=useState<Season>(currentSeason()),[storyIndex,setStoryIndex]=useState(0),[showStory,setShowStory]=useState(false);
 const options=effectiveLifeOptions(config),count=state?.life.interactions??0,story=seasonalStory(season,storyIndex);
 useEffect(()=>window.bigfishDesktop?.onHostChanged?.(()=>{setIssue('');setLocalRequest(null);setShowStory(false);}),[]);
 const interact=(kind:PlayKind)=>{
  if(disabled||!config.groups.play||!onInteract)return false;
  try{if(onInteract(kind)===false){setIssue('她正在处理眼前的事、互动还在冷却，或当前动作尚未解锁，请稍后再试。');return false;}setIssue('');return true;}
  catch(e){setIssue((e as Error).message);return false;}
 };
 const perform=(request:LifeProgramRequest)=>{
  if(disabled)return;
  try{if(onPlayProgram){if(onPlayProgram(request)===false){setIssue('眼前还有重要的事，或当前角色缺少已解锁的演出动作，请稍后再试。');return;}}else setLocalRequest(old=>({serial:(old?.serial??0)+1,request}));setIssue('');}
  catch(e){setIssue((e as Error).message);}
 };
 return <SettingsSection title="一起玩" testId="life-actions" variant={variant}>
  <p className="bf-help">摸头、茶点和玩具都在这里，不消耗模型 token。</p>
  <p className="bf-help bf-touch-help">也可以轻点角色的头部或尾巴；按住拖动。</p>
  {config.groups.play?<>
   <div className="bf-button-row" role="group" aria-label="日常互动">
    {([['wave','招招手'],['head','摸摸头'],['tea','递茶'],['biscuit','分享饼干'],['tail','梳理尾巴']] as const).map(([kind,label])=><button type="button" key={kind} disabled={disabled||!onInteract} onClick={()=>interact(kind)}>{label}</button>)}
   </div>
   <PetPlayground enabled cooldownSeconds={config.interactionCooldown} disabled={disabled||!onInteract} reducedMotion={reducedMotion} onInteract={interact}/>
  </>:<p className="bf-help">“触摸与玩耍”已关闭；在“高级与数据 → 自定义能力”开启后，可以摸头、递茶和玩玩具。</p>}
  {config.groups.growth&&<details className="bf-disclosure"><summary>宠物小剧场 · 虚构</summary>
   <p className="bf-help">故事属于宠物剧情，不代表真实会话经历。预览文字和本地演出均由你主动发起。</p>
   <button type="button" disabled={disabled||!actionUnlocked('stage-story',count,options.growthUnlocks)} onClick={()=>perform({kind:'stage'})}>演出当前成长小故事 · 虚构</button>
   <label className="bf-field"><span>故事季节</span><SettingsSelect aria-label="故事季节" value={season} onChange={e=>{setSeason(e.target.value as Season);setShowStory(false);setStoryIndex(0);}}>{Object.entries(seasons).map(([key,label])=><option key={key} value={key}>{label}</option>)}</SettingsSelect></label>
   <div className="bf-button-row"><button type="button" onClick={()=>{if(showStory)setStoryIndex(i=>i+1);setShowStory(true);}}>{showStory?'再看一段虚构故事':'预览本地小剧场'}</button><button type="button" disabled={disabled||!actionUnlocked('season-story',count,options.growthUnlocks)} onClick={()=>perform({kind:'season',season,index:storyIndex})}>表演这一季 · 本地动作链</button></div>
   {showStory&&<article aria-label="虚构季节故事"><strong>{story.title} · 虚构</strong><p>{story.text}</p><button type="button" onClick={()=>setShowStory(false)}>收起故事</button></article>}
  </details>}
  <button type="button" disabled={disabled||!options.pairEnabled||!pairAvailable||!actionUnlocked('pair-exchange',count,options.growthUnlocks)} onClick={()=>perform({kind:'paired'})}>邀请小伙伴 · 本地双宠链</button>
  {options.pairEnabled&&!pairAvailable&&<p className="bf-help" role="status">{pairIssue||'所选伙伴尚未准备好，或双方没有兼容的双宠动作；邀请已暂停。'}</p>}
  {!options.pairEnabled?<p className="bf-help">先开启“桌面奇遇”和“允许邀请小伙伴”；允许后也不会自动启动双宠演出。</p>:!actionUnlocked('pair-exchange',count,options.growthUnlocks)?<p className="bf-help">双宠分享在 20 次真实互动后解锁，也可关闭成长动作解锁后直接体验。</p>:pairAvailable?<p className="bf-help">同一舞台的小伙伴共用当前行为调度与预算；只在你邀请时登场。</p>:null}
  {issue&&<p role="status">{issue}</p>}
  {!onPlayProgram&&localRequest&&<React.Suspense fallback={<p>准备本地演出…</p>}><LazyLifeProgramPreview request={localRequest} environment={{enabled:true,growth:config.groups.growth,life:state?.life??lifeDefaults(),options,availableClips:lifeProgramClips,blocked:false,quiet:false,working:false,reduced:reducedMotion}}/></React.Suspense>}
  {demo&&<p className="bf-help">演示互动不写入真实成长记录。</p>}
 </SettingsSection>;
}
