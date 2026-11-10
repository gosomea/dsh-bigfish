import {SettingsSelect} from './settings-select.js';
import {TaskLedger} from './task-ledger.js';
import {ProvenanceTimeline} from './task-timeline.js';
import {LifeSettings,type LifeSettingsProps} from './life-settings.js';
import {VoiceSettings} from './voice-settings.js';
import {ScreenshotSettings} from './screenshot-settings.js';
import {decodeLifestyle} from '../companion/config.js';
import type {Companion} from './controller.js';
import React,{useEffect,useRef,useState} from 'react';
import {useCompanionHost,companionRequest} from './companion-host.js';
import {defaultPolicy,type IntelligencePolicy} from '../companion/state.js';
import {readIntegerDraft} from './settings-drafts.js';
import {SettingsSection,type SettingsVariant} from './settings-section.js';
import {intelligenceStatus} from './intelligence-status.js';
import {lifestylePreferencePatch} from './lifestyle-preferences.js';
import {useConfigurationOptions} from './use-configuration-options.js';
import {initialIntelligencePolicy,modelInOptions,modelSelectionKey} from './intelligence-defaults.js';
import {useDirtyDraft} from './settings-draft-guard.js';
const numericPolicyFields={dailyTokens:{label:'每日 token 上限',min:1000,max:1000000},automaticLimit:{label:'每日自动理解次数',min:0,max:100},intervalSeconds:{label:'自动理解间隔 · 秒',min:120,max:86400},memoryDays:{label:'摘要保留 · 天',min:1,max:365}} as const;
type NumericPolicyField=keyof typeof numericPolicyFields;
type Confirmation={kind:'forget';workspace:string;id?:string}|{kind:'revoke';policy:IntelligencePolicy;workspaces:string[]};
export interface IntelligenceSettingsProps {
 demo:boolean;controller:Companion;section?:'all'|'intelligence'|'life'|'perception';variant?:SettingsVariant;lifeSection?:LifeSettingsProps['section'];
}
export function IntelligenceSettings({demo,controller,section='all',variant='disclosure',lifeSection='all'}:IntelligenceSettingsProps){
 const {state,error,refresh}=useCompanionHost(!demo),[draft,setDraft]=useState<IntelligencePolicy|null>(null),[revision,setRevision]=useState<number|null>(null),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[question,setQuestion]=useState(''),[workspace,setWorkspace]=useState('');
 const [numbers,setNumbers]=useState<Partial<Record<NumericPolicyField,string>>>({}),[scopeChoice,setScopeChoice]=useState<'all'|'custom'|null>(null),[confirmation,setConfirmation]=useState<Confirmation|null>(null);
 const [showTasks,setShowTasks]=useState(false);
 const epoch=useRef(0),revokeNotice=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(confirmation?.kind==='revoke')revokeNotice.current?.focus();},[confirmation]);
 useEffect(()=>{const off=window.bigfishDesktop?.onHostChanged?.(()=>{epoch.current++;setDraft(null);setNumbers({});setRevision(null);setScopeChoice(null);setWorkspace('');setQuestion('');setText('');setShowTasks(false);setConfirmation(null);setIssue('已切换 Host，请重新选择授权范围。');setBusy(false);});return()=>{epoch.current++;off?.();};},[]);
 const showIntelligence=section==='all'||section==='intelligence';
 useDirtyDraft({id:'intelligence',label:'智能管家设置',domain:'host-policy'},showIntelligence&&(draft!==null||Object.keys(numbers).length>0||!!text.trim()||!!question.trim()));
 const directory=useConfigurationOptions(showIntelligence&&!demo&&!!state);
 const config=decodeLifestyle(JSON.parse(controller.preferences.getSnapshot().value.lifestyleJson)),saved=state?.policy??defaultPolicy,p=draft??initialIntelligencePolicy(saved,directory.options,controller.currentModel?.()??null),status=intelligenceStatus(state,demo);
 const known=new Map((directory.options?.workspaces??[]).map(w=>[w.path,w]));
 for(const path of [...(state?.tasks.map(t=>t.workspace)??[]),...p.workspaces])if(!known.has(path))known.set(path,{path,title:path});
 const workspaces=[...known.values()],allSelected=workspaces.length>0&&workspaces.every(w=>p.workspaces.includes(w.path)),scope=scopeChoice??(allSelected?'all':'custom');
 const modelSelected=modelInOptions(directory.options,p),selectedKey=p.provider&&p.model?modelSelectionKey(p):'';
 const suggested=p.provider!==saved.provider||p.model!==saved.model||JSON.stringify(p.workspaces)!==JSON.stringify(saved.workspaces);
 const canEnable=!!state?.modelAvailable&&!directory.loading&&modelSelected&&p.workspaces.length>0&&p.workspaces.length<=100;
 const canSave=!busy&&!!(draft||suggested)&&p.workspaces.length<=100;
 const discardDraft=()=>{setDraft(null);setNumbers({});setRevision(null);setScopeChoice(null);setConfirmation(null);setIssue('');};
 const edit=(patch:Partial<IntelligencePolicy>)=>{if(revision===null)setRevision(state?.policyRevision??0);setConfirmation(null);setDraft({...p,...patch});};
 const run=async(op:string,body:Record<string,unknown>)=>{const current=epoch.current;setBusy(true);setIssue('');try{await companionRequest(op,body);if(current!==epoch.current)return false;if(op==='forget'||op==='configure'){await refresh();if(current!==epoch.current)return false;}setIssue(op==='forget'?'已删除所选记忆及相关摘要、提醒和来源记录。':'已保存。');return true;}catch(e){if(current===epoch.current)setIssue((e as Error).message);return false;}finally{if(current===epoch.current)setBusy(false);}};
 const openSession=controller.canOpenSession?.()?(session:string)=>{const current=epoch.current;void Promise.resolve().then(()=>{if(current===epoch.current)return controller.openSession?.(session);}).catch(e=>{if(current===epoch.current)setIssue((e as Error).message);});}:undefined;
 const commitPolicy=async(policy:IntelligencePolicy)=>{if(state&&await run('configure',{policy,revision:revision??state.policyRevision})){setDraft(null);setNumbers({});setRevision(null);setScopeChoice(null);}};
 const savePolicy=async(enabled:boolean)=>{let policy={...p,enabled};try{for(const [key,value]of Object.entries(numbers)){const field=key as NumericPolicyField,limits=numericPolicyFields[field];policy={...policy,[field]:readIntegerDraft(value,limits.label,limits.min,limits.max)};}}catch(e){setIssue((e as Error).message);return;}const removed=saved.workspaces.filter(path=>!policy.workspaces.includes(path));if(removed.length){setConfirmation({kind:'revoke',policy,workspaces:removed});return;}await commitPolicy(policy);};
 const requestForget=(workspace:string,id?:string)=>setConfirmation({kind:'forget',workspace,...id===undefined?{}:{id}});
 const forgetConfirmation=(workspace:string,id?:string)=>confirmation?.kind==='forget'&&confirmation.workspace===workspace&&confirmation.id===id&&<div data-testid="forget-confirmation" role="alert"><p>{id===undefined?'删除此工作区全部记忆与摘要':'删除这条记忆及派生摘要'}还会清空工作区 {workspace} 的任务本、工具事实、提醒和来源时间线，且无法撤销。</p><div className="bf-button-row"><button type="button" disabled={busy} onClick={()=>{setConfirmation(null);void run('forget',{workspace,...id===undefined?{}:{id}});}}>确认删除</button><button type="button" disabled={busy} onClick={()=>setConfirmation(null)}>取消</button></div></div>;
 const numberField=(field:NumericPolicyField)=>{const limits=numericPolicyFields[field];return <label className="bf-field" key={field}><span>{limits.label}</span><input type="number" aria-label={limits.label} disabled={busy} min={limits.min} max={limits.max} value={numbers[field]??String(p[field])} onChange={e=>{edit({});setNumbers(old=>({...old,[field]:e.target.value}));setIssue('');}}/></label>;};
 const perception=<>
  {!config.groups.perception&&<p className="bf-help" role="status">“语音与感知”已关闭。在“高级与数据 → 自定义能力”开启后，可以按住说话或主动分享图片；开启功能组不会授予录音或模型权限。</p>}
  <VoiceSettings enabled={config.groups.perception} host={state} demo={demo}/>
  <ScreenshotSettings enabled={config.groups.perception} host={state} demo={demo}/>
 </>;
 return <>
 {showIntelligence&&<SettingsSection title="智能模式" testId="intelligence-settings" variant={variant}>
  {!demo&&state&&<div className="bf-button-row"><button type="button" className="bf-text-button" onClick={()=>{setShowTasks(!showTasks);setIssue('');}}>{showTasks?'返回智能设置':'打开任务本'}</button></div>}
  <div hidden={showTasks}>
   <section className="bf-intelligence-overview" aria-label="智能模式状态">
   <div className="bf-intelligence-status"><strong>{status.label}</strong>{state&&<span>今日 {state.today.used.toLocaleString()} / {state.policy.dailyTokens.toLocaleString()} token{state.today.estimated?'（含估算）':''}</span>}</div>
   {state?.policy.enabled&&status.missing.length>0&&<p className="bf-help" role="status">{status.missing.join('；')}</p>}
   {state?.diagnostic&&<p role="status">{state.diagnostic.message}</p>}
   {error&&<p role="status">{error}；普通陪伴仍可用。</p>}
   <p className="bf-help">启用后会将所选工作区的任务摘要发送给所选模型，并额外消耗 token。普通陪伴免费。</p>
  </section>
  {!demo&&state&&<>
   <section data-testid="intelligence-configuration" aria-label="智能模式配置">
    <label className="bf-field"><span>模型</span><div className="bf-model-picker"><SettingsSelect aria-label="智能管家模型" disabled={busy||directory.loading} value={selectedKey} onChange={e=>{const [provider,model]=JSON.parse(e.target.value) as [string,string];edit({provider,model});setIssue('');}}>
     <option value="" disabled>{directory.loading?'正在读取模型…':'选择 DSH 模型'}</option>
     {selectedKey&&!modelSelected&&<option value={selectedKey} disabled>{p.model} · {p.provider}（暂不可用）</option>}
     {directory.options?.groups.map(group=><optgroup key={group.id} label={group.name}>{group.models.map(model=><option key={model.id} value={modelSelectionKey({provider:group.id,model:model.id})}>{model.name} · {group.name}</option>)}</optgroup>)}
    </SettingsSelect><button type="button" className="bf-text-button" aria-label="刷新模型和工作区" disabled={busy||directory.loading} onClick={()=>void directory.refresh()}>刷新</button></div></label>
    <p className="bf-help">读取 DSH 已配置的模型。默认带出当前会话的选择，保存后固定使用所选模型。</p>
    {directory.error&&<p className="bf-error" role="status">{directory.error}</p>}
    {!directory.loading&&directory.options&&!directory.options.groups.length&&<p className="bf-help" role="status">没有可选模型，请先在 DSH「设置 → 模型」配置提供商。</p>}
    {!!directory.options?.failures.length&&<p className="bf-help" role="status">有 {directory.options.failures.length} 个提供商暂时不可用，可刷新重试。</p>}
    <label className="bf-field"><span>工作范围</span><SettingsSelect aria-label="工作范围" disabled={busy||directory.loading} value={scope} onChange={e=>{const mode=e.target.value as 'all'|'custom';setScopeChoice(mode);if(mode==='all')edit({workspaces:workspaces.map(w=>w.path)});}}><option value="all" disabled={workspaces.length>100}>全部当前工作区（{workspaces.length}）</option><option value="custom">指定工作区</option></SettingsSelect></label>
    <p className="bf-help">已选 {p.workspaces.length} 个工作区；以后新增的工作区不会自动加入。</p>
    {!workspaces.length&&<p className="bf-help">在 DSH 添加工作区后，点击“刷新”。</p>}
    {p.workspaces.length>100&&<p className="bf-error" role="alert">最多选择 100 个工作区，请切到指定工作区缩小范围。</p>}
    {scope==='custom'&&<fieldset className="bf-workspace-choices"><legend>选择工作区</legend>{workspaces.map(w=><label className="bf-field" key={w.path}><span title={w.path}>{w.title}<small>{w.title!==w.path?w.path:''}</small></span><input aria-label={`允许理解 ${w.path}`} type="checkbox" disabled={busy||!p.workspaces.includes(w.path)&&p.workspaces.length>=100} checked={p.workspaces.includes(w.path)} onChange={e=>{setScopeChoice('custom');edit({workspaces:e.target.checked?[...p.workspaces,w.path]:p.workspaces.filter(x=>x!==w.path)});}}/></label>)}</fieldset>}
    <div className="bf-button-row">
     {saved.enabled?<><button type="button" className="bf-primary-button" disabled={!canSave} onClick={()=>void savePolicy(true)}>保存智能设置</button><button type="button" disabled={busy||!!draft} onClick={()=>void commitPolicy({...saved,enabled:false})}>关闭智能模式</button></>:<button type="button" className="bf-primary-button" disabled={busy||!canEnable} onClick={()=>void savePolicy(true)}>确认并启用</button>}
     {draft&&<button type="button" disabled={busy} onClick={discardDraft}>取消修改</button>}
    </div>
    {confirmation?.kind==='revoke'&&<div ref={revokeNotice} tabIndex={-1} data-testid="revoke-workspaces-confirmation" role="alert"><p>撤销授权还会删除这些工作区已有记忆与摘要：</p><ul>{confirmation.workspaces.map(path=><li key={path}>{path}</li>)}</ul><div className="bf-button-row"><button type="button" disabled={busy} onClick={()=>{const policy=confirmation.policy;setConfirmation(null);void commitPolicy(policy);}}>{confirmation.policy.enabled&&!saved.enabled?'确认撤销并启用':'确认撤销并保存'}</button><button type="button" disabled={busy} onClick={()=>setConfirmation(null)}>取消</button></div></div>}
    {draft&&<p className="bf-help">有尚未保存的修改；上方状态仍显示 Host 当前生效设置。</p>}
   </section>
   <details className="bf-disclosure" data-testid="intelligence-budget"><summary>高级设置 · 每日 {p.dailyTokens.toLocaleString()} token</summary>
    {(['dailyTokens','automaticLimit','intervalSeconds','memoryDays'] as const).map(numberField)}
    <p className="bf-help">所有宠物与窗口共用预算，无新事件不自动调用。今日按 UTC 统计，已预留 {state.today.reserved.toLocaleString()} token，自动理解 {state.today.automatic}/{state.policy.automaticLimit} 次。用量缺失时按预留量估算；语音服务可能独立计费。</p>
    <p className="bf-help">关闭后取消待处理请求；已经发送的请求仍可能计费。</p>
    {!saved.enabled&&<button type="button" disabled={!canSave} onClick={()=>void savePolicy(false)}>仅保存配置</button>}
   </details>
   <details className="bf-disclosure" data-testid="intelligence-memory"><summary>记忆与长期偏好 · 按工作区管理</summary>
    <label className="bf-field"><span>记忆工作区</span><SettingsSelect aria-label="记忆工作区" disabled={busy} value={workspace} onChange={e=>setWorkspace(e.target.value)}><option value="">选择工作区</option>{state.policy.workspaces.map(w=><option key={w} value={w}>{w}</option>)}</SettingsSelect></label>
    {!state.policy.workspaces.length&&<p className="bf-help">先保存允许理解的工作范围，才能管理对应记忆。</p>}
    <textarea aria-label="确认长期偏好" disabled={busy} maxLength={2000} value={text} placeholder="明确希望大肥鱼记住的偏好" onChange={e=>setText(e.target.value)}/>
    <div className="bf-button-row"><button type="button" disabled={busy||!workspace||!text.trim()} onClick={()=>void run('preference',{workspace,text,confirmed:true})}>确认并记住</button><button type="button" disabled={busy||!workspace} onClick={()=>requestForget(workspace)}>删除此工作区全部记忆与摘要</button></div>
    {forgetConfirmation(workspace)}
    {state.memories.filter(m=>m.workspace===workspace).map(m=><div key={m.id}><p>{m.text}</p><button type="button" disabled={busy} onClick={()=>requestForget(workspace,m.id)}>删除这条记忆及派生摘要</button>{forgetConfirmation(workspace,m.id)}</div>)}
   </details>
  </>}
  </div>
  {!demo&&state&&showTasks&&<>
   <section data-testid="intelligence-tasks" aria-label="任务本与手动提问">
    <label className="bf-field"><span>本次提问的工作区</span><SettingsSelect aria-label="提问工作区" disabled={busy} value={workspace} onChange={e=>setWorkspace(e.target.value)}><option value="">选择已授权工作区</option>{state.policy.workspaces.map(w=><option key={w} value={w}>{w}</option>)}</SettingsSelect></label>
    <label className="bf-field"><span>问问大肥鱼</span><input aria-label="问问大肥鱼" disabled={busy} value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)}/></label><button type="button" disabled={busy||!workspace||!state.policy.enabled||!state.policy.workspaces.includes(workspace)} onClick={()=>void run('understand',{workspace,question})}>理解任务 · 消耗 token</button>
    {!state.policy.enabled&&<p className="bf-help">任务本可免费查看；手动理解需要先明确启用智能模式。</p>}
    <TaskLedger tasks={state.tasks} busy={busy} onCollect={source=>{void run('collect',{source});}} {...(openSession?{onOpen:openSession}:{})}/>
   </section>
   <ProvenanceTimeline state={state} {...(openSession?{onOpen:openSession}:{})}/>
  </>}
  {demo&&<p className="bf-help" data-testid="provenance-demo-note">当前是模拟演示；连接真实 DSH Host 后，可免费查看任务与记忆来源时间线。这里不会编造会话记录。</p>}
  {issue&&<p role="status" data-testid="intelligence-feedback">{issue}</p>}
  {section==='all'&&perception}
 </SettingsSection>}
 {section==='perception'&&<SettingsSection title="语音与主动分享" testId="perception-settings" variant={variant}>{perception}</SettingsSection>}
 {(section==='all'||section==='life')&&<LifeSettings config={config} richness={controller.preferences.getSnapshot().value.richness} section={lifeSection} variant={variant} state={state} demo={demo} busy={busy} onClearDiary={()=>companionRequest('clear-diary')} onRemoveCollection={id=>companionRequest('remove-collection',{id})} onOptionsChange={async patch=>{await controller.preferences.update(lifestylePreferencePatch(patch));}} {...(controller.canOpenSession?.()?{onOpenSource:(source)=>Promise.resolve(controller.openSession?.(source.session))}:{})}/>}
 </>;
}
