import {SettingsSelect} from './settings-select.js';
import {outfits,actionUnlocks,type LifeOptions} from '../companion/life-options.js';
import React,{useEffect,useId,useRef,useState} from 'react';
import {readIntegerDraft} from './settings-drafts.js';
import type {Lifestyle} from '../companion/config.js';
import type {Collection,Source} from '../companion/state.js';
import {growthProgress,lifeCalendar,playLabels,sourcedCollections} from '../companion/life.js';
import type {HostSnapshot} from './companion-host.js';

import {SettingsSection,type SettingsVariant} from './settings-section.js';
const LazyPartnerSettings=React.lazy(()=>import('./partner-settings.js').then(module=>({default:module.PartnerSettings})));
type LifeActionArea='growth'|'story'|'diary'|'outfit'|'collection';

export interface LifeSettingsProps {
 config:Lifestyle;
 section?:'all'|'appearance'|'growth'|'collection';
 variant?:SettingsVariant;
 state:Pick<HostSnapshot,'life'|'collections'>|null;
 demo?:boolean;
 busy?:boolean;
 now?:number;
 richness?:number;
 onClearDiary:()=>void|Promise<unknown>;
 onRemoveCollection:(id:string)=>void|Promise<unknown>;
 onOpenSource?:(source:Source)=>void|Promise<unknown>;
 onOptionsChange?:(patch:Partial<LifeOptions>)=>void|Promise<unknown>;
}
/** A source-preserving shelf. It never invents cards or infers completion from a story. */
export function CollectionShelf({collections,busy=false,onRemove,onOpenSource}:{collections:readonly Collection[];busy?:boolean;onRemove:(id:string)=>void|Promise<unknown>;onOpenSource?:((source:Source)=>void)|undefined}){
 const cards=sourcedCollections(collections);
 return <section aria-label="项目收藏柜"><p className="bf-help">只展示你从真实任务收下的明信片；每张保留工作区、会话和事件来源。</p>
  {!cards.length&&<p>收藏柜还是空的。任务完成后，可以在任务本中选择“收下项目明信片”。</p>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>{cards.map(c=><article key={c.id} style={{border:'1px solid var(--bf-line)',borderRadius:12,padding:12,background:'var(--bf-soft)',minWidth:0}}>
   <strong>{c.title}</strong><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{c.text}</p><small>{new Date(c.createdAt).toLocaleString()}</small>
   <details><summary>查看真实来源</summary>{c.sources.map(s=><div key={JSON.stringify(s)}><p className="bf-help" style={{overflowWrap:'anywhere'}}>{s.workspace} · {s.session} · 事件 {s.seq}</p>{onOpenSource&&<button type="button" disabled={busy} onClick={()=>onOpenSource(s)}>打开来源会话</button>}</div>)}</details>
   <button type="button" disabled={busy} onClick={()=>void onRemove(c.id)}>移除明信片</button>
  </article>)}</div>
 </section>;
}

/** Configuration and source-preserving records. Deliberate performances live in LifeActions. */
export function LifeSettings({config,state,demo=false,busy=false,now=Date.now(),richness=2,onClearDiary,onRemoveCollection,onOpenSource,onOptionsChange,section='all',variant='disclosure'}:LifeSettingsProps){
 const [actionBusy,setActionBusy]=useState(false),[actionIssue,setActionIssue]=useState(''),[actionFailed,setActionFailed]=useState(false);
 const [actionArea,setActionArea]=useState<LifeActionArea>('growth');
 const [storyDraft,setStoryDraft]=useState(String(config.storyMinutes)),[storyDirty,setStoryDirty]=useState(false),[storyError,setStoryError]=useState('');
 const actionEpoch=useRef(0),inFlight=useRef(false),mounted=useRef(true),storyErrorId=useId();
 const saving=busy||actionBusy,showGrowth=section==='all'||section==='growth',showAppearance=section==='all'||section==='appearance',showCollection=section==='all'||section==='collection';
 useEffect(()=>{if(!storyDirty)setStoryDraft(String(config.storyMinutes));},[config.storyMinutes,storyDirty]);
 useEffect(()=>{mounted.current=true;const off=window.bigfishDesktop?.onHostChanged?.(()=>{actionEpoch.current++;inFlight.current=false;setActionBusy(false);setActionIssue('');setStoryDirty(false);setStoryError('');setConfirmDelete(false);});return()=>{mounted.current=false;actionEpoch.current++;off?.();};},[]);
 const act=async(action:()=>unknown|Promise<unknown>,message='',area:LifeActionArea='growth')=>{
  if(busy||inFlight.current)return false;
  const epoch=actionEpoch.current;inFlight.current=true;setActionBusy(true);setActionIssue('');setActionArea(area);setActionFailed(false);
  try{await action();if(!mounted.current||epoch!==actionEpoch.current)return false;setActionIssue(message);return true;}
  catch(e){if(mounted.current&&epoch===actionEpoch.current){setActionIssue((e as Error).message);setActionFailed(true);}return false;}
  finally{if(mounted.current&&epoch===actionEpoch.current){inFlight.current=false;setActionBusy(false);}}
 };
 const feedback=(area:LifeActionArea)=>actionIssue&&actionArea===area?<p role={actionFailed?'alert':'status'} className={actionFailed?'bf-error':'bf-help'}>{actionIssue}</p>:null;
 const change=(patch:Partial<LifeOptions>)=>{if(onOptionsChange)void act(()=>onOptionsChange(patch),'','outfit' in patch||'pairEnabled' in patch||'partnerRole' in patch?'outfit':'growth');};
 const saveStory=async()=>{if(!onOptionsChange)return;let value:number;try{value=readIntegerDraft(storyDraft,'故事冷却',15,1440);setStoryError('');}catch(e){setStoryError((e as Error).message);return;}if(await act(()=>onOptionsChange({storyMinutes:value}),'故事冷却已保存。','story'))setStoryDirty(false);};
 const [confirmDelete,setConfirmDelete]=useState(false);
 if(!config.groups.home&&!config.groups.growth&&!config.pairEnabled&&!onOptionsChange)return null;
 const progress=state?growthProgress(state.life):null,calendar=state?lifeCalendar(state.life,now):null;
 return <SettingsSection title={section==='appearance'?'装扮与小伙伴':section==='growth'?'成长与相处记录':section==='collection'?'项目收藏':'装扮、成长与收藏'} testId="life-settings" variant={variant}>
  <p className="bf-help">小窝家具在“外观与生活 → 小窝布置”中调整。这里管理装扮与真实相处记录；喂食、玩具和小剧场请到互动菜单。全部本地展示，不消耗模型 token。</p>
  {showGrowth&&!config.groups.growth&&<p className="bf-help">“成长与故事”已关闭，成长解锁与自动故事暂不生效；已保存的偏好会在重新开启后恢复。</p>}
  {showGrowth&&config.groups.growth&&<section aria-label="真实相处记录">
   <h3>相处纪念册</h3>
   {onOptionsChange&&<details className="bf-disclosure"><summary>成长规则</summary><label className="bf-field"><span>成长动作解锁</span><input aria-label="成长动作解锁" type="checkbox" disabled={saving} checked={config.growthUnlocks} onChange={e=>change({growthUnlocks:e.target.checked})}/></label><p className="bf-help">仅在“成长与故事”开启时限制新增的可选生活动作；关闭后立即全部可用，已有基础动作和任务状态反馈始终可用。</p>{config.growthUnlocks&&<ul>{Object.entries(actionUnlocks).filter(([,at])=>at>0).map(([id,at])=><li key={id}>{({"ball-catch":'接球',"fish-toy":'逗纸鱼',tiptoe:'踮脚',"edge-peek":'边缘探头',nest:'整理小床',postcard:'递明信片',"success-bow":'鞠躬',"pair-exchange":'双宠分享',"season-story":'季节演出',"stage-story":'成长演出'} as Record<string,string>)[id]??id}：{at} 次互动 · {(state?.life.interactions??0)>=at?'已解锁':'尚未解锁'}</li>)}</ul>}<label className="bf-field"><span>真实阶段变化时演出本地故事</span><input aria-label="成长故事自动演出" type="checkbox" disabled={saving} checked={config.storyAutomatic} onChange={e=>change({storyAutomatic:e.target.checked})}/></label>{config.storyAutomatic&&<details className="bf-disclosure"><summary>高级 · 故事冷却</summary>
    <label className="bf-field"><span>故事最短冷却 · 分钟</span><input aria-label="故事最短冷却 · 分钟" type="number" min={15} max={1440} disabled={saving} value={storyDraft} aria-invalid={!!storyError} aria-describedby={storyError?storyErrorId:undefined} onChange={e=>{setStoryDraft(e.target.value);setStoryDirty(true);setStoryError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void saveStory();}}}/></label>
    {storyError&&<p id={storyErrorId} role="alert" className="bf-error">{storyError}</p>}
    <button type="button" disabled={saving||!storyDirty} onClick={()=>void saveStory()}>保存故事冷却</button>
    <p className="bf-help">只在真实成长阶段或季节变化后安排故事；这是两次演出的最短冷却，不会按此间隔定时演出。</p>
    {feedback('story')}
   </details>}</details>}
   {feedback('growth')}
   {!state?<p>{demo?'演示不写入真实相处记录。':'连接 Host 后查看真实相处记录。'}</p>:<>
    <p><strong>{progress!.current.title}</strong> · 已记录 {progress!.count} 次主动互动</p>
    {progress!.next?<><progress aria-label="成长阶段进度" max={progress!.next.count-progress!.current.count} value={progress!.count-progress!.current.count}/><p className="bf-help">再相处 {progress!.next.count-progress!.count} 次，到达“{progress!.next.title}”。已有基础动作始终可用。</p></>:<p className="bf-help">已经是熟悉的伙伴；后续互动继续记在日记里。</p>}
    {calendar?<><p>首次互动：{new Date(calendar.firstSeen).toLocaleDateString()} · 相识第 {calendar.dayNumber} 天</p>{calendar.today&&<p>今天是“{calendar.today}”纪念日。</p>}<p className="bf-help">下一次：{calendar.next.title}，还有 {calendar.next.daysRemaining} 天（按首次互动后的完整 24 小时计算）。</p></>:<p>第一次主动互动后，开始记录相识日期。</p>}
    <p className="bf-help">不因离开扣除成长，也不会因纪念日主动催促你。</p>
    <details><summary>查看相处日记 · 最近 {Math.min(30,state.life.journal.length)} 条</summary>{!state.life.journal.length&&<p>还没有日记。摸头、喝茶或玩玩具后，会记下你实际发起的互动。</p>}{state.life.journal.slice(-30).reverse().map(j=><p key={j.id}>{new Date(j.at).toLocaleString()} · {playLabels[j.kind]??'主动互动'}</p>)}</details>
    <button type="button" disabled={saving||(!state.life.interactions&&!state.life.journal.length)} onClick={()=>setConfirmDelete(true)}>清空相处记录</button>
    {confirmDelete&&<div role="group" aria-label="确认清空相处记录"><p>清空日记、互动计数和首次相识日期。不会删除任务、模型记忆或项目明信片。</p><div className="bf-button-row"><button type="button" disabled={saving} onClick={async()=>{if(await act(onClearDiary,'相处记录已清空。','diary'))setConfirmDelete(false);}}>确认清空相处记录</button><button type="button" disabled={saving} onClick={()=>setConfirmDelete(false)}>保留记录</button></div></div>}
    {feedback('diary')}
   </>}
  </section>}
  {showAppearance&&onOptionsChange&&<section aria-label="装扮与本地小伙伴"><h3>装扮与本地小伙伴</h3><label className="bf-field"><span>角色装扮</span><SettingsSelect aria-label="角色装扮" disabled={saving} value={config.outfit} onChange={e=>change({outfit:e.target.value as LifeOptions['outfit']})}>{Object.entries(outfits).map(([id,label])=><option key={id} value={id}>{label}</option>)}</SettingsSelect></label><p className="bf-help">内置直立姿态佩戴；躺卧、睡觉和大幅互动时收起，保留尾巴与鲸鱼标志。外部角色需要提供装扮锚点。</p><label className="bf-field"><span>允许邀请小伙伴</span><input aria-label="允许邀请小伙伴" type="checkbox" disabled={saving||!config.groups.adventures} checked={config.pairEnabled} onChange={e=>change({pairEnabled:e.target.checked})}/></label>{!config.groups.adventures&&<p className="bf-help">“桌面奇遇”已关闭，双宠暂停；已保存的双宠偏好会在重新开启后恢复。</p>}<p className="bf-help">这只允许你在互动菜单发起邀请，不会自动启动双宠。两只宠物共用当前舞台、行为调度和预算，不额外调用模型。</p></section>}
  {showAppearance&&onOptionsChange&&<React.Suspense fallback={<p className="bf-help">正在准备已安装的伙伴角色…</p>}><LazyPartnerSettings config={config} count={state?.life.interactions??0} richness={richness} busy={saving} onChange={change}/></React.Suspense>}
  {feedback('outfit')}
  {showCollection&&config.groups.home&&<><h3>项目收藏柜</h3>{feedback('collection')}{state?<CollectionShelf collections={state.collections} busy={saving} onRemove={id=>act(()=>onRemoveCollection(id),'明信片已移除。','collection')} {...(onOpenSource?{onOpenSource:(source:Source)=>{void act(()=>onOpenSource(source),'','collection');}}:{})}/>:<p>{demo?'演示不生成虚构任务明信片。':'连接 Host 后查看已收藏的真实项目明信片。'}</p>}</>}
 </SettingsSection>;
}
