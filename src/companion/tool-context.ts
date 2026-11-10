import type {Source,Task,ToolFact,ToolSource} from './state.js';
import {taskActivity} from './task-activity.js';

export const toolFactLimit=6;
const textLimit=360,scanLimit=8192;
const identity=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200;
const sequence=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const timestamp=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const toolName=(v:unknown):v is string=>typeof v==='string'&&/^[\w./:@-]{1,100}$/.test(v);
const code=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z][\w.-]{0,63}$/.test(v);
const publicKeys=new Set(['message','summary','text','output','stdout','stderr','status','exitCode','count','total','result']);

/** Public output is data. Drop private blocks and common credential/environment encodings before retention. */
export function safeToolText(value:string,limit=textLimit):string {
  return value.slice(0,scanLimit)
    .replace(/<(think|analysis|reasoning)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'[private reasoning omitted]')
    .replace(/-----BEGIN [^-\r\n]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*/gi,'[private material omitted]')
    .replace(/\b(?:data:[\w/+.-]+(?:;[\w=.-]+)*;base64,)?[A-Za-z0-9+/_=-]{80,}\b/g,'[encoded data omitted]')
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g,'[credential omitted]')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi,raw=>{try{const url=new URL(raw);url.username='';url.password='';url.search='';url.hash='';return url.toString();}catch{return '[URL omitted]';}})
    .split(/\r?\n/).filter(line=>!/^\s*(?:export\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*=|["']?[A-Z_][A-Z0-9_]*["']?\s*:)/.test(line))
    .map(line=>line.replace(/\b(?:authorization|proxy-authorization|cookie|set-cookie|[\w.-]*(?:api[ _-]?key|password|passwd|secret|credential|token)[\w.-]*)\b["']?\s*[:=]\s*.*/gi,'[credential omitted]')
      .replace(/\b(?:Bearer|Basic)\s+\S+/gi,'[authorization omitted]'))
    .join('\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,limit);
}

function publicValue(value:unknown,depth=0):string {
  if(typeof value==='string'){
    const raw=value.trim();if(/^[\[{]/.test(raw)){
      if(raw.length>scanLimit||depth>2)return '';
      try{return publicValue(JSON.parse(raw),depth+1);}catch{return '';}
    }return safeToolText(value);
  }
  if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean')return String(value);
  if(!value||typeof value!=='object'||depth>2)return '';
  if(Array.isArray(value))return value.slice(0,3).map(v=>publicValue(v,depth+1)).filter(Boolean).join('; ').slice(0,textLimit);
  return Object.entries(value).filter(([key])=>publicKeys.has(key)).slice(0,8)
    .map(([key,v])=>{const text=publicValue(v,depth+1);return text?`${key}: ${text}`:'';}).filter(Boolean).join('\n').slice(0,textLimit);
}

export function toolResultExcerpt(content:unknown):string {
  if(!Array.isArray(content))return '';
  let scanned=0;const texts:string[]=[];
  for(const block of content.slice(0,16)){
    if(block?.type!=='text'||typeof block.text!=='string')continue;
    const raw=block.text.trim();if(!raw||scanned>=scanLimit)continue;
    const remaining=scanLimit-scanned;scanned+=Math.min(raw.length,remaining);
    // A truncated JSON document cannot safely be interpreted as ordinary prose.
    if(/^[\[{]/.test(raw)){
      if(raw.length>remaining)continue;
      try{texts.push(publicValue(JSON.parse(raw)));}catch{/* Unknown structured payloads are omitted. */}
    }else texts.push(safeToolText(raw.slice(0,remaining)));
  }
  return texts.filter(Boolean).join('\n').slice(0,textLimit);
}

/** Reconstruct only known fields, including on disk reload; arbitrary extensions never enter model context. */
export function normalizeToolFacts(raw:unknown):ToolFact[] {
  if(!Array.isArray(raw))return [];
  const facts:ToolFact[]=[];
  for(const v of raw.slice(-toolFactLimit)){
    if(!v||!identity(v.callId)||!toolName(v.name)||!sequence(v.callSeq)||!timestamp(v.startedAt)||!['running','succeeded','failed','unknown'].includes(v.state))continue;
    const fact:ToolFact={callId:v.callId,name:v.name,callSeq:v.callSeq,startedAt:v.startedAt,state:v.state,excerpt:typeof v.excerpt==='string'?safeToolText(v.excerpt):''};
    if(sequence(v.turn))fact.turn=v.turn;if(sequence(v.step))fact.step=v.step;
    if(sequence(v.resultSeq)&&v.resultSeq>v.callSeq)fact.resultSeq=v.resultSeq;
    if(timestamp(v.finishedAt)&&v.finishedAt>=v.startedAt){fact.finishedAt=v.finishedAt;fact.durationMs=v.finishedAt-v.startedAt;}
    if(code(v.errorCode))fact.errorCode=v.errorCode;
    facts.push(fact);
  }return facts;
}

export function projectToolCall(raw:unknown,seq:number,time:number,previous:unknown):ToolFact[]|null {
  const data=raw as Record<string,unknown>|null;
  if(!data||!identity(data.callId)||!toolName(data.name)||!sequence(seq)||!timestamp(time))return null;
  if(data.turn!==undefined&&!sequence(data.turn)||data.step!==undefined&&!sequence(data.step))return null;
  const tools=normalizeToolFacts(previous);
  // Reusing a provider id cannot make a late result replace an earlier turn's fact.
  if(tools.some(t=>t.callId===data.callId&&t.turn===data.turn&&t.step===data.step))return null;
  const fact:ToolFact={callId:data.callId,name:data.name,callSeq:seq,startedAt:time,state:'running',excerpt:''};
  if(sequence(data.turn))fact.turn=data.turn;if(sequence(data.step))fact.step=data.step;
  return [...tools,fact].slice(-toolFactLimit);
}

export function projectToolResult(raw:unknown,seq:number,time:number,previous:unknown):ToolFact[]|null {
  const data=raw as Record<string,any>|null,tools=normalizeToolFacts(previous),message=data?.message;
  if(!data||!identity(message?.toolCallId)||!sequence(seq)||!timestamp(time))return null;
  if(data.turn!==undefined&&!sequence(data.turn)||data.step!==undefined&&!sequence(data.step))return null;
  if(message.role!==undefined&&message.role!=='tool'||message.isError!==undefined&&typeof message.isError!=='boolean')return null;
  if(message.source!==undefined&&(message.source?.kind!=='tool'||message.source.callId!==message.toolCallId))return null;
  const candidates=tools.filter(t=>t.callId===message.toolCallId
    &&(!sequence(data.turn)||t.turn===data.turn)&&(!sequence(data.step)||t.step===data.step));
  // Without a unique observed call, neither identity nor execution outcome is known.
  if(candidates.length!==1||candidates[0]!.resultSeq!==undefined||candidates[0]!.callSeq>=seq)return null;
  const old=candidates[0]!,errorCode=message.isError===true&&code(data.error?.code)?data.error.code:undefined;
  const fact:ToolFact={...old,resultSeq:seq,...(time>=old.startedAt?{finishedAt:time,durationMs:time-old.startedAt}:{}),
    state:errorCode==='TOOL_OUTCOME_UNKNOWN'?'unknown':message.isError===true?'failed':'succeeded',excerpt:toolResultExcerpt(message.content)};
  if(errorCode)fact.errorCode=errorCode;
  // The structured public reason is a fallback, never an error object/meta dump.
  if(!fact.excerpt&&message.isError===true&&typeof data.error?.reason==='string')fact.excerpt=safeToolText(data.error.reason);
  return tools.map(t=>t===old?fact:t);
}

export const toolSources=(tools:readonly ToolFact[]):ToolSource[]=>tools.map(({callId,callSeq,resultSeq})=>({callId,callSeq,...(resultSeq===undefined?{}:{resultSeq})}));
/** Workspace membership is a fact too: a new or removed session invalidates a multi-session interpretation. */
export const workspaceContextKey=(tasks:readonly Task[],workspace:string)=>JSON.stringify(tasks.filter(t=>t.workspace===workspace)
  .map(t=>[t.session,t.seq,t.statusRevision??null] as const).sort((a,b)=>a[0].localeCompare(b[0])));
export function taskSource(task:Task):Source {
  const tools=normalizeToolFacts(task.tools).slice(-3);
  return {workspace:task.workspace,session:task.session,seq:task.seq,...(task.statusRevision===undefined?{}:{statusRevision:task.statusRevision}),...(tools.length?{tools:toolSources(tools)}:{})};
}
/** Latest public task facts plus bounded tool excerpts, without internal bookkeeping or opaque tool metadata. */
export function taskContext(task:Task){
  const tools=normalizeToolFacts(task.tools).slice(-3);
  return {...taskSource(task),title:task.title.slice(0,120),state:task.state,activity:taskActivity(task),...(task.runtimeStatus?{runtimeStatus:task.runtimeStatus}:{}),updatedAt:task.updatedAt,parent:task.parent,
    ...(task.relationship?{relationship:task.relationship}:{}),excerpt:task.excerpt.slice(0,600),
    tools:tools.map(({callId,name,state,callSeq,resultSeq,durationMs,excerpt,errorCode})=>({callId,name,state,callSeq,...(resultSeq===undefined?{}:{resultSeq}),...(durationMs===undefined?{}:{durationMs}),excerpt,...(errorCode?{errorCode}:{})}))};
}
