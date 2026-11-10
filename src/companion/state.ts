import type {ModelLimitKind} from './model-errors.js';
import {lifeDefaults,type LifeState} from './life.js';
export interface ToolSource {callId:string;callSeq:number;resultSeq?:number}
export interface Source {workspace:string; session:string; seq:number; statusRevision?:number;tools?:ToolSource[]}
export interface ToolFact extends ToolSource {
  name:string;state:'running'|'succeeded'|'failed'|'unknown';startedAt:number;finishedAt?:number;durationMs?:number;
  turn?:number;step?:number;excerpt:string;errorCode?:string;
}
export type TaskState = 'running'|'waiting'|'completed'|'failed'|'cancelled';
export interface Task extends Source {
  /** Real event consumption is distinct from a live recovery observation's sequence. */
  consumedSeq?:number;
  title:string; state:TaskState; updatedAt:number; parent:string|null; excerpt:string;
  executionState?:TaskState; pendingApprovals?:string[];
  pendingQuestions?:{callId:string;state:'open'|'continued'}[];
  pendingRemote?:{question:number;approval:number};
  relationship?:'subagent'|'fork'|'lineage'; runtimeStatus?:'running'|'idle';
  failureKind?:ModelLimitKind;
  tools?:ToolFact[];
}
export const validConsumedSeq=(task:Task)=>task.consumedSeq===undefined||Number.isSafeInteger(task.consumedSeq)&&task.consumedSeq>=-1&&task.consumedSeq<=task.seq;
/** Legacy records conservatively consumed their published sequence; only new recovery records start at -1. */
export const consumedTaskSeq=(task:Task)=>task.consumedSeq!==undefined&&validConsumedSeq(task)?task.consumedSeq:task.seq;
/** Excludes observation time, so repeated sampling is not a new task fact. */
export const taskStatusKey=(task:Task)=>JSON.stringify([task.seq,task.title,task.excerpt,task.state,
  task.executionState??task.state,task.parent,task.relationship??null,task.pendingApprovals??[],
  task.pendingQuestions??[],task.pendingRemote??{question:0,approval:0},task.runtimeStatus??null,task.failureKind??null,task.tools??[]]);
export interface Memory {id:string; workspace:string; kind:'summary'|'preference'|'experience'; text:string; sources:Source[]; expiresAt:number|null; confirmed:boolean;createdAt?:number}
export interface IntelligencePolicy {enabled:boolean; provider:string; model:string; workspaces:string[]; dailyTokens:number; automaticLimit:number; intervalSeconds:number; memoryDays:number}
export const defaultPolicy: IntelligencePolicy = {enabled:false,provider:'',model:'',workspaces:[],dailyTokens:30000,automaticLimit:20,intervalSeconds:120,memoryDays:7};
export function decodePolicy(raw:unknown):IntelligencePolicy {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('智能设置无效');
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).some(k=>!Object.hasOwn(defaultPolicy,k)))throw Error('未知智能设置');
  const p={...defaultPolicy,...v} as IntelligencePolicy;
  if(typeof p.enabled!=='boolean'||typeof p.provider!=='string'||typeof p.model!=='string'||p.provider.length>160||p.model.length>160)throw Error('模型配置无效');
  if(!Array.isArray(p.workspaces)||p.workspaces.length>100||p.workspaces.some(w=>typeof w!=='string'||!w||w.length>2000))throw Error('工作区授权无效');
  for(const [k,min,max] of [['dailyTokens',1000,1000000],['automaticLimit',0,100],['intervalSeconds',120,86400],['memoryDays',1,365]] as const)
    if(!Number.isInteger(p[k])||p[k]<min||p[k]>max)throw Error(`智能设置越界：${k}`);
  if(p.enabled&&(!p.model.trim()||!p.provider.trim()||!p.workspaces.length))throw Error('开启前请选择模型和允许理解的工作区');
  return {...p, workspaces:[...new Set(p.workspaces)]};
}
export interface Usage {used:number; reserved:number; automatic:number; estimated:boolean}
export interface Reservation {id:string; day:string; tokens:number; fingerprint:string; epoch:number; workspace:string; createdAt:number}
export interface Insight {id:string; text:string; intent:'notice'|'attention'|'celebrate'|'reflect'; sources:Source[]; createdAt:number; announcedAt?:number; system?:boolean; expiresAt?:number}
export interface Collection {id:string; title:string; text:string; kind:'postcard'|'diary'; createdAt:number; sources:Source[]}
export interface CompanionState {
  version:1; life:LifeState; revision:number; policyRevision:number; epoch:number; introducedAt:number|null; policy:IntelligencePolicy;
  forgotBefore:Record<string,number>; diagnostic:{at:number;message:string}|null; tasks:Task[]; memories:Memory[]; collections:Collection[]; insights:Insight[];
  usage:Record<string,Usage>; reservations:Reservation[]; fingerprints:Record<string,number>; lastAutomatic:number;
  display:{client:string; kind:'web'|'desktop'; expiresAt:number}|null;
}
export const emptyState=():CompanionState=>({version:1,life:lifeDefaults(),revision:0,policyRevision:0,epoch:0,introducedAt:null,policy:{...defaultPolicy,workspaces:[]},forgotBefore:{},diagnostic:null,tasks:[],memories:[],collections:[],insights:[],usage:{},reservations:[],fingerprints:{},lastAutomatic:0,display:null});
