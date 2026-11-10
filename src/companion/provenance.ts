import type {CompanionState,Source,Task,Memory,Insight} from './state.js';
import {normalizeToolFacts,safeToolText} from './tool-context.js';

export type ProvenanceKind='task'|'tool'|'event'|'model'|'preference'|'memory';
export interface ProvenanceRow {
 id:string;workspace:string|null;at:number|null;kind:ProvenanceKind;label:string;title:string;text:string;
 sources:Source[];current:boolean;reason:string;
}
export type ProvenanceState=Pick<CompanionState,'tasks'|'memories'|'insights'>;
const stamp=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=8640000000000000;
const identity=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=2000;
const sourceShape=(source:Source)=>!!source&&identity(source.workspace)&&identity(source.session)&&stamp(source.seq)
 &&(source.statusRevision===undefined||stamp(source.statusRevision))&&(source.tools===undefined||Array.isArray(source.tools)&&source.tools.length<=6&&source.tools.every(ref=>!!ref&&identity(ref.callId)&&stamp(ref.callSeq)&&(ref.resultSeq===undefined||stamp(ref.resultSeq)&&ref.resultSeq>ref.callSeq)));
/** A saved reference never supplies a navigation target that the current Host has not admitted. */
export function knownSourceTask(tasks:readonly Task[],source:Source):Task|undefined {
 return sourceShape(source)?tasks.find(t=>t.workspace===source.workspace&&t.session===source.session):undefined;
}
export function sourceStatus(source:Source,tasks:readonly Task[]):{current:boolean;reason:string} {
 const task=knownSourceTask(tasks,source);
 if(!task)return {current:false,reason:'来源会话未保留或未恢复，无法核对当前状态'};
 if(source.seq!==task.seq||source.statusRevision!==undefined&&source.statusRevision!==task.statusRevision)return {current:false,reason:'来源会话已有新进展，这条解读不代表当前状态'};
 if((source.tools??[]).some(ref=>!normalizeToolFacts(task.tools).some(f=>f.callId===ref.callId&&f.callSeq===ref.callSeq&&f.resultSeq===ref.resultSeq)))return {current:false,reason:'引用的工具记录已变化或不再保留'};
 return {current:true,reason:source.statusRevision===undefined?'事件序号匹配；未记录状态观察版本':'事件与状态观察版本匹配'};
}
const taskText=(task:Task)=>{
 const labels={running:'进行中',waiting:'等待处理',completed:'已完成',failed:'执行失败',cancelled:'已取消'};
 const status=task.state==='running'&&task.runtimeStatus==='idle'?'最近记录：进行中；Agent 当前空闲':(task.state==='running'||task.state==='waiting')&&(task.runtimeStatus as string)==='detached'?`上次状态：${labels[task.state]}；当前未恢复此会话`:labels[task.state];
 const detail=task.failureKind==='credit'?'模型服务明确返回额度或余额不足':task.failureKind==='context'?'超出模型上下文容量':task.failureKind==='output-limit'?'达到本次输出 token 上限':'';
 return [status,detail,safeToolText(task.excerpt,500)].filter(Boolean).join(' · ');
};
function derivedRow(item:Memory|Insight,tasks:readonly Task[],kind:ProvenanceKind,label:string,at:number|null):ProvenanceRow {
 const sources=item.sources.filter(sourceShape),workspace='workspace' in item?item.workspace:sources[0]?.workspace??null;
 const checked=sources.map(source=>sourceStatus(source,tasks));
 const sameWorkspace=sources.every(source=>source.workspace===workspace);
 const current=sources.length>0&&checked.every(s=>s.current)&&sources.length===item.sources.length&&sameWorkspace;
 const userPreference='kind' in item&&item.kind==='preference'&&item.confirmed;
 const localSystem='system' in item&&item.system===true&&sources.length===0;
 const text=current||userPreference||localSystem||kind==='event'?safeToolText(item.text,2000):'来源无法与当前记录核对，暂不把这段内容作为当前进展展示。';
 return {id:`${kind}:${item.id}`,workspace,at,kind,label,title:label,text,sources:sources.filter(source=>source.workspace===workspace),current:current||userPreference||localSystem,
  reason:userPreference?'由用户明确确认的长期偏好；不会从会话自动推断':sources.length?checked.find(s=>!s.current)?.reason??'基于下列真实会话与工具记录':localSystem?'Host 直接生成的系统提示；没有引用会话内容':'没有保留可核对的会话来源'};
}
/** This is a bounded view of retained facts, not a reconstruction of complete chat history. */
export function provenanceRows(state:ProvenanceState,now:number,filter:{workspace?:string;session?:string}={}):ProvenanceRow[] {
 const rows:ProvenanceRow[]=[];
 for(const task of state.tasks){
  const source:Source={workspace:task.workspace,session:task.session,seq:task.seq,...(task.statusRevision===undefined?{}:{statusRevision:task.statusRevision})};
  rows.push({id:`task:${JSON.stringify([task.workspace,task.session,task.seq,task.statusRevision])}`,workspace:task.workspace,at:stamp(task.updatedAt)?task.updatedAt:null,
   kind:'task',label:'任务事件',title:safeToolText(task.title,120),text:taskText(task),sources:[source],current:true,reason:'来自 Host 当前保留的会话状态；不是模型猜测'});
  for(const tool of normalizeToolFacts(task.tools)){
   if(tool.callSeq>task.seq||tool.resultSeq!==undefined&&tool.resultSeq>task.seq)continue;
   const reference={callId:tool.callId,callSeq:tool.callSeq,...(tool.resultSeq===undefined?{}:{resultSeq:tool.resultSeq})};
   const toolSource:Source={...source,tools:[reference]};
   rows.push({id:`tool:${JSON.stringify([task.workspace,task.session,tool.callId,tool.callSeq])}`,workspace:task.workspace,at:tool.startedAt,
    kind:'tool',label:'工具调用',title:tool.name,text:'开始执行；未展示调用参数或私有元数据。',sources:[{...toolSource,seq:tool.callSeq}],current:true,reason:'真实工具调用事件，结果与调用通过 call ID 配对'});
   if(tool.resultSeq!==undefined){
    const result={succeeded:'执行成功',failed:'执行失败',unknown:'执行结果未确认',running:'仍在执行'}[tool.state];
    rows.push({id:`tool-result:${JSON.stringify([task.workspace,task.session,tool.callId,tool.resultSeq])}`,workspace:task.workspace,at:stamp(tool.finishedAt)?tool.finishedAt:null,
     kind:'tool',label:'工具结果',title:`${tool.name} · ${result}`,text:[tool.errorCode?`错误代码：${tool.errorCode}`:'',tool.excerpt||'没有保留公开结果摘要。'].filter(Boolean).join(' · '),
     sources:[{...toolSource,seq:tool.resultSeq}],current:true,reason:'真实工具结果；仅显示已裁剪的公开摘要，不是完整原始输出'});
   }
  }
 }
 for(const insight of state.insights){
  if(insight.expiresAt!==undefined&&insight.expiresAt<=now)continue;
  const fact=insight.system||insight.id.startsWith('fact-');
  rows.push(derivedRow(insight,state.tasks,fact?'event':'model',fact?'事件提醒':'模型解读',stamp(insight.createdAt)?insight.createdAt:null));
 }
 for(const memory of state.memories){
  if(memory.expiresAt!==null&&memory.expiresAt<=now)continue;
  const kind=memory.kind==='preference'?'preference':'memory',label=memory.kind==='preference'?(memory.confirmed?'用户确认偏好':'未确认偏好'):memory.kind==='summary'?'模型记忆摘要':'近期经历记录';
  rows.push(derivedRow(memory,state.tasks,kind,label,stamp(memory.createdAt)?memory.createdAt:null));
 }
 return rows.filter(row=>(!filter.workspace||row.workspace===filter.workspace)&&(!filter.session||row.sources.some(s=>s.workspace===(filter.workspace??s.workspace)&&s.session===filter.session)))
  .sort((a,b)=>(b.at??-Infinity)-(a.at??-Infinity)||a.id.localeCompare(b.id)).slice(0,150);
}
