import React from 'react';
import type {Task,Source} from '../companion/state.js';
import {knownSourceTask} from '../companion/provenance.js';
export function taskLabel(task:Task):string {
 const state={running:'进行中',waiting:'等待处理',completed:'已完成',failed:'执行失败',cancelled:'已取消'}[task.state];
 if(task.state==='running'&&task.runtimeStatus==='idle')return '最近记录：进行中；Agent 当前空闲';
 if((task.state==='running'||task.state==='waiting')&&(task.runtimeStatus as string)==='detached')return `上次状态：${state}；当前未恢复此会话`;
 return state;
}
export function relationLabel(task:Task,tasks:readonly Task[]):string {
 if(!task.relationship&&!task.parent)return '';
 const kind=task.relationship==='subagent'?'子代理':task.relationship==='fork'?'分支会话':'来源会话';
 const parent=tasks.find(t=>t.workspace===task.workspace&&t.session===task.parent);
 return `${kind}${parent?` · ${parent.title}`:task.parent?` · ${task.parent}`:' · 源会话未记录'}`;
}
/** Every card keeps its own source. Remote and question projections may describe the same wait, so they are never added. */
export function TaskLedger({tasks,busy,onOpen,onCollect}:{tasks:readonly Task[];busy:boolean;onOpen?:((session:string)=>void)|undefined;onCollect:(source:Source)=>void}){
 const ordered=[...tasks].sort((a,b)=>Number(b.state==='waiting')-Number(a.state==='waiting')||b.updatedAt-a.updatedAt);
 return <details className="bf-disclosure" data-testid="task-ledger"><summary>任务本 · {tasks.length} 个会话</summary>
  {!tasks.length&&<p>还没有可显示的会话事件。正在运行的会话会从 Host 的真实状态恢复，冷历史不会被猜成已完成。</p>}
  {ordered.map(t=><article key={JSON.stringify([t.workspace,t.session])} style={{padding:'10px 0',borderBottom:'1px solid var(--bf-line)'}}>
   <strong>{t.title}</strong><p>{taskLabel(t)}</p>
   {relationLabel(t,tasks)&&<p className="bf-help">{relationLabel(t,tasks)}{t.parent&&onOpen&&knownSourceTask(tasks,{workspace:t.workspace,session:t.parent,seq:0})&&<button type="button" onClick={()=>{const parent=knownSourceTask(tasks,{workspace:t.workspace,session:t.parent!,seq:0});if(parent)onOpen(parent.session);}}>打开来源会话</button>}</p>}
   {!!t.pendingQuestions?.length&&<p>{t.pendingQuestions.some(q=>q.state==='open')?'有待回答的问题':'问题已转后台继续等待，仍可回答'}</p>}
   {!!t.pendingRemote?.question&&!t.pendingQuestions?.length&&<p>有远程待回答的问题</p>}
   {!!t.pendingApprovals?.length&&<p>有待审批的操作</p>}
   {!!t.pendingRemote?.approval&&!t.pendingApprovals?.length&&<p>有远程待审批的操作</p>}
   <small style={{overflowWrap:'anywhere'}}>{t.workspace} · {t.session} · 事件 {t.seq}</small>
   <div className="bf-button-row">{onOpen&&<button type="button" onClick={()=>onOpen(t.session)}>打开会话</button>}{t.state==='completed'&&<button type="button" disabled={busy} onClick={()=>onCollect({workspace:t.workspace,session:t.session,seq:t.seq})}>收下项目明信片</button>}</div>
  </article>)}
 </details>;
}
