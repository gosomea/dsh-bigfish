import React,{useEffect,useState} from 'react';
import {knownSourceTask,provenanceRows,sourceStatus,type ProvenanceState} from '../companion/provenance.js';
import type {Source,Task} from '../companion/state.js';
import {SettingsSelect} from './settings-select.js';

export function ProvenanceSources({sources,tasks,onOpen,historical=false}:{sources:readonly Source[];tasks:readonly Task[];onOpen?:((session:string)=>void)|undefined;historical?:boolean}){
 return <ul className="bf-provenance-sources">{sources.map((source,index)=>{
  const task=knownSourceTask(tasks,source),status=sourceStatus(source,tasks);
  return <li key={JSON.stringify([source.workspace,source.session,source.seq,index])}>
   <span>{task?.title??'来源会话未保留'} · 事件 {source.seq}</span>
   {!historical&&!status.current&&<span className="bf-help">{status.reason}</span>}
   {!!source.tools?.length&&<span className="bf-help">工具引用：{source.tools.map(ref=>`${ref.callId.slice(0,28)} · 调用 ${ref.callSeq}${ref.resultSeq===undefined?'':` → 结果 ${ref.resultSeq}`}`).join('；')}</span>}
   <span className="bf-help bf-provenance-identity">{source.workspace} · {source.session}</span>
   {onOpen&&<button type="button" disabled={!task} onClick={()=>{const admitted=knownSourceTask(tasks,source);if(admitted)onOpen(admitted.session);}}>打开来源会话</button>}
  </li>;
 })}</ul>;
}
export function ProvenanceTimeline({state,onOpen,now=Date.now()}:{state:ProvenanceState;onOpen?:((session:string)=>void)|undefined;now?:number}){
 const [workspace,setWorkspace]=useState(''),[session,setSession]=useState('');
 useEffect(()=>window.bigfishDesktop?.onHostChanged?.(()=>{setWorkspace('');setSession('');}),[]);
 const workspaces=[...new Set([...state.tasks.map(t=>t.workspace),...state.memories.map(m=>m.workspace),...state.insights.flatMap(i=>i.sources.map(s=>s.workspace))])].sort();
 const sessions=state.tasks.filter(t=>!workspace||t.workspace===workspace);
 useEffect(()=>{if(workspace&&!workspaces.includes(workspace)){setWorkspace('');setSession('');}},[workspace,JSON.stringify(workspaces)]);
 const sessionKey=(task:Task)=>JSON.stringify([task.workspace,task.session]);
 useEffect(()=>{if(session&&!sessions.some(t=>sessionKey(t)===session))setSession('');},[workspace,session,JSON.stringify(sessions.map(sessionKey))]);
 const selected=sessions.find(t=>sessionKey(t)===session),scope=workspace||selected?.workspace;
 const rows=provenanceRows(state,now,{...(scope?{workspace:scope}:{}),...(selected?{session:selected.session}:{})});
 return <details className="bf-disclosure" data-testid="provenance-timeline"><summary>任务与记忆来源时间线</summary>
  <p className="bf-help">免费查看 Host 保留的近期事件、工具结果、提醒与记忆。这里只展示已有记录，最多 150 条，不重建完整聊天历史。宠物虚构剧情不作为任务事实或会话记忆。</p>
  <div className="bf-provenance-filters">
   <label className="bf-field"><span>来源工作区</span><SettingsSelect aria-label="来源工作区" value={workspace} onChange={e=>{setWorkspace(e.target.value);setSession('');}}><option value="">全部工作区</option>{workspaces.map(w=><option key={w} value={w}>{w}</option>)}</SettingsSelect></label>
   <label className="bf-field"><span>来源会话</span><SettingsSelect aria-label="来源会话" value={session} onChange={e=>setSession(e.target.value)}><option value="">全部会话</option>{sessions.map(t=><option key={sessionKey(t)} value={sessionKey(t)}>{t.title}{workspace?'':` · ${t.workspace}`}</option>)}</SettingsSelect></label>
  </div>
  {!rows.length&&<p role="status">当前范围还没有可核对的来源记录。普通陪伴不会为了填满时间线调用模型。</p>}
  <ol className="bf-provenance-list">{rows.map(row=><li key={row.id} data-kind={row.kind} data-current={row.current} className="bf-provenance-item">
   <div className="bf-provenance-meta"><span>{row.label}</span>{row.at===null?<span>记录时间未提供</span>:<time dateTime={new Date(row.at).toISOString()}>{new Date(row.at).toLocaleString()}</time>}</div>
   <strong>{row.title}</strong><p className="bf-provenance-text">{row.text}</p>
   {!row.current&&<p className="bf-help" role="status">来源已变化或无法核对</p>}
   <details className="bf-provenance-reason"><summary>为什么这样提醒／记录？</summary><p className="bf-help">{row.reason}</p>
    <ProvenanceSources sources={row.sources} tasks={state.tasks} onOpen={onOpen} historical={row.kind==='task'||row.kind==='tool'}/>
   </details>
  </li>)}</ol>
 </details>;
}
