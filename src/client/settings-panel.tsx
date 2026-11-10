import {CapabilityReadiness} from './capability-readiness.js';
import {SettingsSelect} from './settings-select.js';
import {CompanionClipPreview} from './companion-canvas.js';
import {AdventurePreview} from './adventure-scene.js';
import {companionClips} from './companion-clips.js';
import {SettingsNavigation,settingsPages,type SettingsPage} from './settings-navigation.js';
import {IntelligenceSettings} from './intelligence-settings.js';
import {LifestyleSettings} from './lifestyle-settings.js';
import {ActivityAreaSettings} from './activity-area-settings.js';
import {useSettingsPresence} from './settings-presence.js';
import {CompanionHostProvider,useCompanionHost} from './companion-host.js';
import {intelligenceStatus} from './intelligence-status.js';
import {decodeLifestyle} from '../companion/config.js';
import {schemeDisplayDefaults} from '../contract/scheme-display.js';
import {lifestylePreferencePatch,type LifestyleEdit} from './lifestyle-preferences.js';
import type {PreferenceUpdate} from './preferences-store.js';
import type {IdlePresentation} from '../domain/idle.js';
import {petLibrary} from '../pet/library.js';
import {RoleSettings} from '../pet/settings.js';
import {motionReduced} from '../domain/motion-policy.js';
import {PackSettings} from './pack-settings.js';
import {DialogueSettings} from './dialogue-settings.js';
import {categoryMotions} from '../contract/dialogue.js';
import React,{forwardRef,useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {preferenceRanges,type Preferences} from '../contract/preferences.js';
import type {Key} from './locales.js';
import {FishCanvas} from './fish-canvas.js';
import {PreviewDisclosure} from './behavior-preview.js';
import {BackupSettings} from './backup-settings.js';
import {SettingsDraftProvider,type SettingsPanelHandle} from './settings-draft-guard.js';
import type {UIProps} from './ui.js';
import builtinThumbnail from '../../examples/bigfish-playful/thumbnail.png';
const sceneNames=['auto','desk','library','workshop','treadmill','rest','delivery'] as const;
type Props=UIProps&{compact?:boolean;embedded?:boolean;idle?:IdlePresentation;initialPage?:SettingsPage;initialAreaOpen?:boolean;interactionPanel?:React.ReactNode;companionTools?:React.ReactNode};

export type {SettingsPanelHandle} from './settings-draft-guard.js';
export const SettingsPanel=forwardRef<SettingsPanelHandle,Props>(function SettingsPanel(props,ref){
 const live=useSyncExternalStore(props.controller.subscribe,props.controller.getSnapshot);
 return <SettingsDraftProvider ref={ref}><CompanionHostProvider enabled={!live.demo&&!props.compact}><SettingsBody {...props}/></CompanionHostProvider></SettingsDraftProvider>;
});
function SettingsBody({controller,t,compact=false,embedded=false,idle,initialPage='companionship',initialAreaOpen=false,interactionPanel,companionTools}:Props){
 const root=useRef<HTMLDivElement>(null),id=useId();
 useSettingsPresence(root);
 const [page,setPage]=useState<SettingsPage>(initialPage),[reset,setReset]=useState(false);
 const [areaOpen,setAreaOpen]=useState(initialAreaOpen);
 useEffect(()=>{
  if(!initialAreaOpen)return;
  setAreaOpen(true);setPage('companionship');
  const frame=requestAnimationFrame(()=>{
   const editor=root.current?.querySelector<HTMLElement>('[data-testid="activity-area-disclosure"]'),scroll=root.current?.closest<HTMLElement>('.bf-modal,.bf-popover');
   if(!editor||!scroll)return;
   const nav=root.current?.querySelector<HTMLElement>('.bf-settings-nav'),horizontal=nav&&getComputedStyle(nav).flexDirection==='row';
   const offset=64+(horizontal?nav.getBoundingClientRect().height:0);
   scroll.scrollTop+=editor.getBoundingClientRect().top-scroll.getBoundingClientRect().top-offset;
  });
  return()=>cancelAnimationFrame(frame);
 },[initialAreaOpen]);
 useSyncExternalStore(petLibrary.subscribe,petLibrary.getSnapshot);
 const live=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
 const store=useSyncExternalStore(controller.preferences.subscribe,controller.preferences.getSnapshot),p=store.value;
 const config=decodeLifestyle(JSON.parse(p.lifestyleJson)),role=petLibrary.active?.pet;
 const update=(patch:PreferenceUpdate,expected?:string)=>controller.preferences.update(patch,expected);
 const change=(patch:PreferenceUpdate)=>{void update(patch).catch(()=>{});};
 const editLife=(patch:LifestyleEdit)=>change(lifestylePreferencePatch(patch));
 const selectPage=(next:SettingsPage)=>{setPage(next);requestAnimationFrame(()=>{
  const scroll=root.current?.closest<HTMLElement>('.bf-modal,.bf-popover');if(scroll)scroll.scrollTop=0;
  root.current?.querySelector<HTMLElement>(`[data-settings-page="${next}"] > h3`)?.focus({preventScroll:true});
 });};
 const openRole=()=>{selectPage('appearance');requestAnimationFrame(()=>{const details=root.current?.querySelector<HTMLDetailsElement>('[data-testid="character-details"]');if(details)details.open=true;});};
 const reduced=motionReduced(p,matchMedia('(prefers-reduced-motion: reduce)').matches);
 const swingAvailable=!role||(role.manifest.capabilities.includes('air-swing')&&role.animations.some(a=>a.tags.includes('near-miss')&&a.intensity<=p.richness));
 const display=!p.bubbleEnabled||(!p.bubbleText&&!p.bubbleStatus)?'buttons':p.bubbleText?p.bubbleStatus?'both':'text':'status';
 const toggle=(key:keyof Preferences,label:string)=><label className="bf-field"><span>{label}</span><input aria-label={label} type="checkbox" checked={Boolean(p[key])} onChange={e=>change({[key]:e.target.checked})}/></label>;
 const slider=(key:keyof Preferences,label:string,step:number)=>{const range=preferenceRanges[key]!;return <label className="bf-field bf-range"><span>{label}<output>{key==='size'?`${Math.round(p.size/180*100)}%`:String(p[key])}</output></span><input aria-label={label} type="range" min={range[0]} max={range[1]} step={step} value={Number(p[key])} onChange={e=>change({[key]:+e.target.value})}/></label>;};
 const select=(label:string,value:string|number,options:readonly(readonly[string|number,string])[],onChange:(value:string)=>void,disabled=false)=><label className="bf-field"><span>{label}</span><SettingsSelect aria-label={label} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>{options.map(([v,label])=><option key={v} value={v}>{label}</option>)}</SettingsSelect></label>;
 const activity=<>
  {select('活跃程度',p.idleMode,[['quiet','安静陪着'],['occasional',compact?'偶尔 · 60–120 秒':'偶尔活动 · 休息 60–120 秒'],['natural',compact?'自然 · 15–30 秒':'自然陪伴 · 休息 15–30 秒'],['frequent',compact?'活泼 · 5–10 秒':'活泼陪伴 · 休息 5–10 秒'],['continuous',compact?'持续 · 1–3 秒':'持续活动 · 休息 1–3 秒'],['custom','自定义休息时间']],v=>change({idleMode:v as Preferences['idleMode']}))}
  {p.idleMode==='custom'&&<>{slider('idleMinSeconds','最短休息时间 · 秒',1)}{slider('idleMaxSeconds','最长休息时间 · 秒',1)}</>}
  {(!compact||config.activityOverrides)&&<p className="bf-help">{!compact&&(p.idleMode==='quiet'?'保留眨眼与轻微生命感，不主动散步或轮换；仍回应你的互动。':'举牌、生活动作与散步轮流安排，完整播放后再休息；提高活跃度不会加速动画。')}{config.activityOverrides&&' 散步与彩蛋正使用高级精确间隔。'}</p>}
 </>;
 const dialogueVisible=display==='both'||display==='text';
 const movementPause=config.groups.body&&config.movement!=='fixed'&&(
  reduced||p.reducedMotion?'减弱动态期间暂停散步。':
  config.quietUntil>Date.now()||config.importantOnly||p.idleMode==='quiet'?'安静模式期间暂停散步。':'');
 const movement=<>
  {select('活动范围',config.groups.body?config.movement:'fixed',[['fixed','固定位置'],['nearby','附近散步'],['wide','较大范围'],['screen','全屏自由活动']],v=>editLife({movement:v as typeof config.movement,...(v==='fixed'?{}:{groups:{body:true}})}))}
  {!compact&&<p className="bf-help">全屏自由活动在网页可见区域或桌面当前屏幕内散步；工作、拖动和直接互动优先，不会自动跨屏。</p>}
  {role&&!role.manifest.capabilities.includes('movement')&&<p className="bf-help" role="status">当前角色缺少行走素材，会原地活动；不会平移站立图冒充行走。</p>}
  {movementPause&&<p className="bf-help" role="status">{movementPause}活动范围已保留。</p>}
  {!compact&&<details className="bf-disclosure" data-testid="activity-area-disclosure" open={areaOpen} onToggle={e=>setAreaOpen(e.currentTarget.open)}><summary>活动区域与回家点</summary><ActivityAreaSettings/></details>}
 </>;
 const scenery=<>{toggle('sceneryVisible','显示场景')}{!compact&&<p className="bf-help">隐藏背景与环境布景，保留人物、牌子和手持动作道具；小窝与家具选择会保存。</p>}</>;
 const whip=<>{toggle('whipEnabled','启用鞭策动作')}{!compact&&<p className="bf-help">{p.whipEnabled?'只在身旁空挥，不接触角色。':'已关闭空挥、躲闪与鞭声音效，任务反馈照常。'}</p>}</>;
 const whipPace=p.whipEnabled&&<>
  {select('鞭策节奏',p.mode,[['urge','慢了催一催'],['rhythm','跟着速度动']],v=>change({mode:v as Preferences['mode']}),!swingAvailable||reduced)}
  {(!swingAvailable||reduced)&&<p className="bf-help">{reduced?'减弱动态已暂停空挥。':'当前角色或动作幅度没有空挥反应，偏好保留；调高动作幅度或换角色后恢复。'}</p>}
 </>;
 const pageProps=(name:SettingsPage)=>({id:`${id}-${name}`,'data-settings-page':name,hidden:page!==name,'aria-label':settingsPages[name],className:'bf-settings-page'});
 return <div ref={root} className={`bf-settings ${compact?'bf-compact':''} ${embedded?'bf-settings-embedded':''}`}>
  {!compact&&!embedded&&<header><h2>{t('title')}</h2><p>按你的节奏陪伴，也照看手头的任务。</p></header>}
  {!compact&&!live.compatibility.supported&&<section className="bf-compatibility-card" role="status" data-testid="compatibility-card"><strong>{t('compatibilityTitle')}</strong><p>{t('compatibilityUnsupported')}</p><p>{t('compatibilityAdvice')}</p><code>{live.compatibility.missing.join('; ')}</code></section>}
  {compact?<>{activity}{movement}{scenery}{whip}</>:<div className="bf-settings-layout">
   <SettingsNavigation current={page} onChange={selectPage} idPrefix={id}/>
   <div className="bf-settings-content">
    <section {...pageProps('companionship')}>
     <h3 tabIndex={-1}>日常陪伴</h3>
     <section className="bf-character-summary" aria-label="当前角色">
      <img className="bf-character-preview" src={petLibrary.active?.thumbnail??builtinThumbnail} alt="当前角色预览"/>
      <div><small>我的大肥鱼</small><strong>{role?.manifest.name??'大肥鱼'}</strong><span>{config.preset==='custom'?'自定义陪伴':'按所选类型陪伴'} · 本地动画免费</span></div>
      <button type="button" onClick={openRole}>更换角色</button>
     </section>
     {companionTools}
     {interactionPanel&&<div className="bf-interaction-panel">{interactionPanel}</div>}
     <LifestyleSettings prefs={p} update={update}/>
     {activity}{movement}{scenery}{whip}
     <SmartSummary demo={live.demo} onOpen={()=>selectPage('intelligence')}/><CapabilityReadiness prefs={p} demo={live.demo}/>
     <details className="bf-disclosure"><summary>更多陪伴偏好</summary>
      {select('动作幅度',p.richness,[[0,'轻柔'],[1,'自然'],[2,'活泼']],v=>change({richness:+v}))}
      <p className="bf-help">选择幅度合适的动作；不会改变绘制帧本身。实际可用动作取决于角色素材，频率由活跃程度控制。</p>
      {reduced&&<p className="bf-help">当前减弱动态：暂停主动轮换与位移；偏好在恢复正常播放后生效。</p>}
      {toggle('greetOnOpen','每个标签页首次空闲时打招呼')}
      {select('举牌偏好',p.idleSignPreference,[['prefer','多举牌'],['balanced','均衡轮换'],['none','不举牌']],v=>change({idleSignPreference:v as Preferences['idleSignPreference']}))}
      <p className="bf-help">有牌面素材时，多举牌优先保留举牌机会；外部角色需要牌面锚点。没有台词时仍可播放其他动作。</p>
      {p.idleMode!=='quiet'&&slider('idleHoldSeconds','每次空闲动作展示 · 秒',1)}
      {toggle('idleHideMessage','安静休息时隐藏消息文字')}
      {select('空闲文字',p.idleRandomText?'random':'fixed',[['random','随机轮换'],['fixed','固定第一句']],v=>change({idleRandomText:v==='random'}))}
      {whipPace}
      {p.whipEnabled&&swingAvailable&&!reduced&&<>
       {select('空挥力度',p.intensity===.5&&p.maxWhipHz===.6?'light':p.intensity===1&&p.maxWhipHz===1.2?'medium':p.intensity===1.4&&p.maxWhipHz===1.8?'strong':'custom',[['light','轻'],['medium','中'],['strong','强'],['custom','自定义参数']],v=>{if(v!=='custom')change(v==='light'?{intensity:.5,maxWhipHz:.6}:v==='medium'?{intensity:1,maxWhipHz:1.2}:{intensity:1.4,maxWhipHz:1.8});})}
       {!role&&toggle('sound','空挥音效')}{!role&&p.sound&&slider('volume','音量',.05)}
      </>}
      {idle&&<p className="bf-help" data-testid="idle-status">{idle.reason==='work'?(live.snapshot.state==='idle'?'当前让出空闲动作，设置或互动结束后继续轮转。':'当前跟随任务状态。'):idle.active?'当前正在播放空闲动作。':idle.reason==='quiet'?'当前安静陪伴。':'空闲动作、生活与散步按统一节奏轮流安排。'}</p>}
     </details>
    </section>
    <section {...pageProps('intelligence')}>
     <h3 tabIndex={-1}>智能管家</h3>
     <IntelligenceSettings controller={controller} demo={live.demo} section="intelligence" variant="section"/>
     <details className="bf-disclosure"><summary>语音与主动分享</summary><IntelligenceSettings controller={controller} demo={live.demo} section="perception" variant="section"/></details>
    </section>
    <section {...pageProps('appearance')}>
     <h3 tabIndex={-1}>外观与生活</h3>
     {toggle('enabled','显示宠物')}{slider('size','角色大小',10)}
     <details className="bf-disclosure" data-testid="character-details"><summary>角色库与动作预览</summary><RoleSettings/><CompanionClipPreview/>{!p.sceneryVisible&&<p className="bf-help">实际宠物已隐藏场景；这里可单独预览素材，不改变显示设置。</p>}<AdventurePreview availableClips={role?[]:companionClips.map(c=>c.id)} reducedMotion={reduced}/></details>
     <details className="bf-disclosure" data-settings-section="appearance"><summary>外观与动画</summary>
      {select('动画',p.motionPolicy==='system'&&p.reducedMotion?'reduced':p.motionPolicy,[['system','跟随系统'],['normal','正常播放'],['reduced','减弱动态']],v=>change({motionPolicy:v as Preferences['motionPolicy'],reducedMotion:false}))}
      {reduced&&<p className="bf-help" role="status">减弱动态已生效：停止非必要轮播、位移、粒子和空挥，保留状态更新。</p>}
      {!role?<>{select('工作布景',p.scene,sceneNames.map(v=>[v,t(v)] as const),v=>change({scene:v}))}<p className="bf-help">选择固定工作布景，动作仍跟随任务。小窝在下方单独布置。</p></>:<p className="bf-help">工作布景由当前角色包提供。</p>}
      {slider('opacity','角色与消息透明度',.05)}
      {select('消息显示',display,[['both','台词和状态'],['text','仅台词'],['status','仅状态'],['buttons','仅按钮']],v=>change({bubbleEnabled:v!=='buttons',bubbleText:v==='both'||v==='text',bubbleStatus:v==='both'||v==='status'}))}
      {select('说话频率',p.talkLevel,[[0,'只在事件变化时'],[1,'偶尔说一句 · 至少 30 秒'],[2,'经常说一句 · 至少 10 秒']],v=>change({talkLevel:+v}),!dialogueVisible)}
      {!dialogueVisible&&<p className="bf-help" role="status">当前隐藏台词；恢复显示台词后，继续使用已选的说话频率。</p>}
      {display!=='buttons'&&<>{slider('bubbleWidth','气泡宽度',10)}{slider('bubbleFont','文字大小',1)}</>}
     </details>
     <details className="bf-disclosure"><summary>小窝布置</summary><LifestyleSettings part="home" prefs={p} update={update}/></details>
     <details className="bf-disclosure"><summary>装扮、成长与收藏</summary><IntelligenceSettings controller={controller} demo={live.demo} section="life" variant="section"/></details>
     <PreviewDisclosure controller={controller} t={t} prefs={p}/>
    </section>
    <section {...pageProps('advanced')}>
     <h3 tabIndex={-1}>高级与数据</h3><p className="bf-help">不需要调参也能使用；这里保留自定义能力、台词、方案与精确参数。</p>
     <details className="bf-disclosure"><summary>自定义能力</summary><LifestyleSettings part="customize" prefs={p} update={update}/></details>
     <details className="bf-disclosure"><summary>方案管理</summary><LifestyleSettings part="schemes" prefs={p} update={update}/></details>
     <details className="bf-disclosure" data-settings-section="dialogue"><summary>自定义台词与工具</summary>
      <DialogueSettings recentTools={live.recentTools??[]} prefs={p} save={update} preview={(category,text)=><><div className="bf-preview-speech">{text||'（此类台词已关闭）'}</div><FishCanvas snapshot={{...live.snapshot,state:category==='idle'?'idle':category==='complete'?'completed':category==='waiting'?'waiting-user':category==='writing'?'generating':'tool-running',pressure:0,activity:0,whipHz:0}} prefs={{...p,sound:false}} t={t} previewMotion={categoryMotions[category]}/></>}/>
     </details>
     <details className="bf-disclosure"><summary>任务消息与完成反馈</summary>
      {toggle('showTask','显示本轮任务提示（用户消息短摘）')}{toggle('showTool','显示工具名称')}{toggle('showFile','显示文件短名')}{toggle('showStats','显示速度与用时')}
      <p className="bf-help">这些内容来自本地任务事件；气泡显示关闭时，保留偏好但不展示。</p>
      {slider('speechSeconds','工作台词最短停留 · 秒',.5)}
      {select('成功完成后',p.completionMode,[['celebrate','简短庆祝'],['message','只显示完成提示'],['quiet','直接休息']],v=>change({completionMode:v as Preferences['completionMode']}))}
      {p.completionMode!=='quiet'&&slider('completionSeconds','完成提示时长 · 秒',1)}
      <p className="bf-help">取消或中断先提示再休息；错误与等待确认保留明确状态。</p>
     </details>
     <details className="bf-disclosure" data-settings-section="advanced"><summary>专家参数</summary>
      <details className="bf-disclosure"><summary>活动精确参数</summary><LifestyleSettings part="advanced" prefs={p} update={update}/></details>
      <details className="bf-disclosure"><summary>速度与空挥参数</summary>
       {toggle('autoSpeed','按模型自动校准')}{!p.autoSpeed&&slider('targetRate','手动基准速度 · tok/s',1)}
       {toggle('includeReasoning','计入可见推理输出')}{p.autoSpeed&&toggle('learnHistory','跨会话记住模型速度')}
       {slider('windowSeconds','速度估算窗口 · 秒',.5)}
       {p.whipEnabled&&swingAvailable&&!reduced&&<>{slider('intensity','空挥驱动力',.05)}{slider('maxWhipHz','空挥调度频率上限',.1)}{toggle('timePressure','工作较久时加强催促')}{p.timePressure&&slider('referenceSeconds','开始加强催促的工作时长 · 秒',10)}<p className="bf-help">完整空挥限制实际频率，不截短动作追赶数值。</p></>}
       {!role&&slider('fatigueSeconds','疲惫积累周期 · 秒',30)}
       <div className="bf-button-row"><button type="button" disabled={!live.snapshot.modelKey} onClick={()=>controller.resetLearning()}>{t('resetLearning')}</button><button type="button" onClick={()=>controller.resetLearning(true)}>{t('resetAll')}</button></div>
      </details>
      {!role&&<details className="bf-disclosure"><summary>内置大肥鱼动作编排（JSON）</summary><PackSettings t={t}/></details>}
     </details>
     <details className="bf-disclosure"><summary>备份与恢复</summary><BackupSettings controller={controller}/></details>
     <details className="bf-disclosure"><summary>恢复显示与行为默认</summary><p className="bf-help">恢复活跃程度、说话、外观、空挥和速度偏好；保留角色、生活能力、命名方案、私人台词、规则、记忆、智能授权与预算。</p>
      {!reset?<button type="button" onClick={()=>setReset(true)}>恢复显示与行为默认</button>:<div className="bf-button-row" role="group" aria-label="确认恢复显示与行为"><button type="button" onClick={async()=>{try{await update(schemeDisplayDefaults);setReset(false);}catch{/* The preference store renders the persistence error. */}}}>确认恢复显示与行为</button><button type="button" onClick={()=>setReset(false)}>取消恢复</button></div>}
     </details>
    </section>
   </div>
  </div>}
  <p className="bf-save" role="status">{store.saving?t('saving'):t(store.persistence)}</p>
  {store.error&&<p className="bf-error" role="alert">{t(store.error as Key)}</p>}
 </div>;
}
function SmartSummary({demo,onOpen}:{demo:boolean;onOpen:()=>void}){
 const {state}=useCompanionHost(!demo),status=intelligenceStatus(state,demo);
 return <section className="bf-smart-summary" aria-label="智能模式概览" data-testid="smart-summary">
  <div><strong>智能管家</strong><span>{status.label}{state?` · 今日 ${state.today.used.toLocaleString()} / ${state.policy.dailyTokens.toLocaleString()} token`:''}</span><p>理解任务与记忆会额外消耗 token，配置并明确允许后才调用模型。</p></div>
  <button type="button" onClick={onOpen}>了解并设置</button>
 </section>;
}
