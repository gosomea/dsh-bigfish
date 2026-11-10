import {PetBudgetError,type ModelLimitKind} from './model-errors.js';
import {lifeDefaults,playKinds,type PlayKind} from './life.js';
import {taskActivity} from './task-activity.js';
import {normalizeToolFacts,workspaceContextKey} from './tool-context.js';
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {withStoreLock} from '../pet/store-lock.js';
import {decodePolicy,emptyState,taskStatusKey,validConsumedSeq,consumedTaskSeq,type CompanionState,type Task,type Memory,type Source,type Insight,type Reservation} from './state.js';
const dayKey=(now:number)=>new Date(now).toISOString().slice(0,10);
const id=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=2000;
function storedTask(task:Task):Task {
 const clean=task.tools?{...task,tools:normalizeToolFacts(task.tools).filter(f=>f.callSeq<=task.seq&&(f.resultSeq===undefined||f.resultSeq<=task.seq))}:{...task};
 if(!validConsumedSeq(clean))delete clean.consumedSeq;
 return clean;
}
export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Host-owned durable coordination, shared by all clients and plugin instances in this DSH_HOME. */
export class CompanionHostStore {
  constructor(readonly directory=join(process.env.DSH_HOME??join(homedir(),'.dsh'),'pets','dsh-bigfish','companion'),private now=Date.now){}
  private async load():Promise<CompanionState>{
    try {const s=JSON.parse(await readFile(join(this.directory,'state.json'),'utf8')) as CompanionState;if(s.version!==1)throw Error('不支持的宠物状态版本');s.life??=lifeDefaults();s.policyRevision??=0;s.diagnostic??=null;s.forgotBefore??={};s.tasks=s.tasks.map(storedTask);s.memories=s.memories.map(m=>{if(m.createdAt===undefined||Number.isSafeInteger(m.createdAt)&&m.createdAt>=0&&m.createdAt<=8640000000000000)return m;const {createdAt:_invalid,...rest}=m;return rest;});return s;}
    catch(e:any){if(e.code==='ENOENT')return emptyState();throw e;}
  }
  private async change<T>(fn:(s:CompanionState,now:number)=>T):Promise<T>{
    return withStoreLock(this.directory,async check=>{
      const s=await this.load(),now=this.now();
      s.memories=s.memories.filter(m=>m.expiresAt===null||m.expiresAt>now);
      // A crashed in-flight call may have been billed. Charge its reservation, never refund blindly.
      for(const r of s.reservations.filter(r=>now-r.createdAt>120000)) this.settleState(s,r.id,undefined);
      s.tasks=s.tasks.filter(t=>now-t.updatedAt<7*86400000).slice(-500);
      for(const [key,at] of Object.entries(s.fingerprints))if(now-at>7*86400000)delete s.fingerprints[key];
      const result=fn(s,now);s.revision++;
      const temp=join(this.directory,`${randomUUID()}.tmp`);
      try{await writeFile(temp,JSON.stringify(s),{mode:0o600});check();await rename(temp,join(this.directory,'state.json'));}
      finally{await unlink(temp).catch(()=>{});}return result;
    });
  }
  async snapshot(){const s=await this.load(),now=this.now();return {...s,tasks:s.tasks.filter(t=>now-t.updatedAt<7*86400000),memories:s.memories.filter(m=>m.expiresAt===null||m.expiresAt>now),reservations:undefined,fingerprints:undefined,today:s.usage[dayKey(now)]??{used:0,reserved:0,automatic:0,estimated:false},display:s.display&&s.display.expiresAt>now?s.display:null};}
  private alertState(s:CompanionState,now:number,kind:'budget-warning'|'budget'|ModelLimitKind,text:string){
    const key=`alert-${kind}-${fingerprint([dayKey(now),s.policyRevision])}`;
    if(Object.hasOwn(s.fingerprints,key))return false;
    s.fingerprints[key]=now;
    if(kind==='budget')s.insights=s.insights.filter(i=>!i.id.startsWith('alert-budget-warning-')||i.announcedAt!==undefined);
    s.insights.push({id:key,text,intent:kind==='budget-warning'?'notice':'attention',system:true,sources:[],createdAt:now,expiresAt:Date.parse(`${dayKey(now)}T00:00:00Z`)+86400000});s.insights=s.insights.slice(-20);
    s.diagnostic={at:now,message:text};return true;
  }
  alert(kind:'budget'|ModelLimitKind,text:string,epoch?:number){return this.change((s,now)=>{
    if(epoch!==undefined&&(!s.policy.enabled||s.epoch!==epoch))return false;
    return this.alertState(s,now,kind,text);
  });}
  /** Even with task tracking disabled, a typed limit can be surfaced without storing message content. */
  taskLimit(source:Source,kind:ModelLimitKind,occurredAt=this.now()){return this.change((s,now)=>{
    if(occurredAt<=(s.forgotBefore[source.workspace]??-Infinity))return false;
    if(!id(source.workspace)||!id(source.session)||!Number.isSafeInteger(source.seq)||source.seq<0)throw Error('提醒来源无效');
    const key=`limit-${fingerprint([source,kind])}`;if(Object.hasOwn(s.fingerprints,key))return false;
    s.fingerprints[key]=now;
    s.insights=s.insights.filter(i=>!i.id.startsWith('limit-')||!i.sources.some(x=>x.workspace===source.workspace&&x.session===source.session&&x.seq<source.seq));
    const text=kind==='credit'?'有个会话因模型额度或余额不足停止了，请检查 DSH 模型账户。':kind==='context'?'有个会话超出模型上下文容量了，可以精简上下文或换用更大窗口的模型；这不表示账户余额不足。':'有个会话达到本次输出 token 上限了；这不表示账户余额不足。';
    s.insights.push({id:key,text,intent:'attention',system:true,sources:[source],createdAt:now,expiresAt:now+86400000});s.insights=s.insights.slice(-20);return true;
  });}
  clearTaskLimits(source:Source){return this.change(s=>{
    s.insights=s.insights.filter(i=>!i.id.startsWith('limit-')||!i.sources.some(x=>x.workspace===source.workspace&&x.session===source.session&&x.seq<source.seq));
  });}
  diagnose(message:string|null){return this.change((s,now)=>{s.diagnostic=message?{at:now,message:message.slice(0,300)}:null;});}
  /** Confirm an explicit response to the introduction, never a request to display it. */
  introduce(client:string){
    if(!id(client)||!client.trim())throw Error('介绍确认无效');
    return this.change((s,now)=>{
      if(s.introducedAt!==null||s.display?.client!==client||s.display.expiresAt<=now)return false;
      s.introducedAt=now;return true;
    });
  }
  configure(value:unknown,expected:number){const p=decodePolicy(value);return this.change(s=>{
    if(s.policyRevision!==expected)throw Error('设置已在另一窗口更新，请刷新后重试');
    s.policy=p;s.policyRevision++;s.epoch++;s.insights=[];
    // Removing a workspace revokes future context and removes its derived data.
    s.memories=s.memories.filter(m=>p.workspaces.includes(m.workspace));return p;
  });}
  observe(task:Task,options:{runtime?:boolean;notify?:boolean;cursorOnly?:boolean;eventTime?:number}={}){
    if(!id(task.workspace)||!id(task.session)||!Number.isSafeInteger(task.seq)||task.seq<0||!validConsumedSeq(task)||!['running','waiting','completed','failed','cancelled'].includes(task.state))throw Error('任务事件无效');
    if(options.eventTime!==undefined&&(!Number.isSafeInteger(options.eventTime)||options.eventTime<0))throw Error('任务事件时间无效');
    task={...task,...(task.tools?{tools:normalizeToolFacts(task.tools).filter(f=>f.callSeq<=task.seq&&(f.resultSeq===undefined||f.resultSeq<=task.seq))}:{})};
    return this.change(s=>{
      if((options.eventTime??task.updatedAt)<=(s.forgotBefore[task.workspace]??-Infinity))return false;
      const previous=s.tasks.find(t=>t.workspace===task.workspace&&t.session===task.session);
      if(options.cursorOnly){
        if(previous&&task.seq<=previous.seq&&consumedTaskSeq(task)>consumedTaskSeq(previous))
          s.tasks=s.tasks.map(t=>t.workspace===task.workspace&&t.session===task.session?{...t,consumedSeq:consumedTaskSeq(task)}:t);
        return false;
      }
      const pendingNotice=s.insights.some(i=>i.id.startsWith('fact-')&&i.announcedAt===undefined&&i.sources.some(x=>x.workspace===task.workspace&&x.session===task.session));
      if(previous){
        if(options.runtime&&task.statusRevision!==previous.statusRevision)return false;
        const advancing=consumedTaskSeq(task)>consumedTaskSeq(previous);
        if(previous.seq>task.seq||consumedTaskSeq(task)<consumedTaskSeq(previous)||(previous.seq===task.seq&&!advancing&&(!options.runtime||taskStatusKey(previous)===taskStatusKey(task))))return false;
        if(advancing&&taskStatusKey(previous)===taskStatusKey(task)){
          // Only durable observer bookkeeping advanced. It must not invalidate a
          // summary, create a notification or change an automatic model fingerprint.
          s.tasks=s.tasks.map(t=>t.workspace===task.workspace&&t.session===task.session?{...t,consumedSeq:consumedTaskSeq(task)}:t);return false;
        }
      }
      s.tasks=s.tasks.filter(t=>!(t.workspace===task.workspace&&t.session===task.session));
      s.tasks.push({...task,statusRevision:(previous?.statusRevision??0)+1,title:task.title.slice(0,120),excerpt:task.excerpt.slice(0,1200)});
      // A workspace summary can mention the whole task roster, including sessions that did not exist yet.
      s.memories=s.memories.filter(m=>m.kind!=='summary'||m.workspace!==task.workspace);
      s.insights=s.insights.filter(i=>!i.sources.some(x=>x.workspace===task.workspace&&x.session===task.session));
      if(options.notify!==false&&['waiting','failed','completed'].includes(task.state)&&(previous?.state!==task.state||previous.failureKind!==task.failureKind||pendingNotice)){
        const source={workspace:task.workspace,session:task.session,seq:task.seq};
        const label=task.failureKind==='credit'?'因模型额度或余额不足而停止，请检查 DSH 模型账户':task.failureKind==='context'?'超出模型上下文容量，需要精简上下文或换用更大窗口的模型':task.failureKind==='output-limit'?'达到本次输出 token 上限，并不表示账户余额不足':task.state==='waiting'?(taskActivity(task)==='waiting'?'需要你确认':'等待处理'):task.state==='failed'?'执行失败':'已完成';
        const running=s.tasks.filter(t=>taskActivity(t)==='running').length,waiting=s.tasks.filter(t=>taskActivity(t)==='waiting').length;
        s.insights.push({id:`fact-${fingerprint([source,(previous?.statusRevision??0)+1])}`,text:`「${task.title.slice(0,80)}」${label}。当前还有 ${running} 个会话运行，${waiting} 个等待确认。`,intent:task.state==='completed'?'celebrate':'attention',system:!!task.failureKind,sources:[source],createdAt:task.updatedAt,...(task.failureKind?{expiresAt:task.updatedAt+86400000}:{})});s.insights=s.insights.slice(-20);
      }return true;
    });
  }
  memory(input:Omit<Memory,'id'>){return this.change((s,now)=>{
    if(!s.policy.workspaces.includes(input.workspace)||!input.text.trim()||input.text.length>2000)throw Error('记忆内容或工作区无效');
    if(input.kind==='preference'&&!input.confirmed)throw Error('长期偏好需要用户确认');
    const m={...input,id:randomUUID(),createdAt:now,expiresAt:input.kind==='preference'?null:Math.min(input.expiresAt??Infinity,now+s.policy.memoryDays*86400000)};
    s.memories.push(m);s.memories=s.memories.slice(-500);return m;
  });}
  forget(workspace:string,memoryId?:string){return this.change((s,now)=>{
    s.forgotBefore[workspace]=now;
    // Delete derived context as well; epoch invalidates every response prepared before deletion.
    s.memories=s.memories.filter(m=>m.workspace!==workspace||(!!memoryId&&m.id!==memoryId&&m.kind==='preference'));
    s.insights=s.insights.filter(i=>!i.sources.some(x=>x.workspace===workspace));
    s.tasks=s.tasks.filter(t=>t.workspace!==workspace);s.epoch++;return true;
  });}
  lease(client:string,kind:'web'|'desktop'){if(!id(client)||!['web','desktop'].includes(kind))throw Error('显示端无效');return this.change((s,now)=>{
    if(!s.display||s.display.expiresAt<=now||s.display.client===client||(kind==='desktop'&&s.display.kind==='web'))s.display={client,kind,expiresAt:now+15000};
    return s.display;
  });}
  release(client:string){return this.change(s=>{if(s.display?.client===client)s.display=null;});}
  reserve(workspace:string,automatic:boolean,inputTokens:number,outputTokens:number,context:unknown){return this.change((s,now)=>{
    if(!s.policy.enabled||!s.policy.workspaces.includes(workspace))throw Error('智能模式未启用或工作区未授权');
    const tokens=inputTokens+outputTokens;
    if(!Number.isSafeInteger(tokens)||!Number.isSafeInteger(inputTokens)||!Number.isSafeInteger(outputTokens)||inputTokens<1||outputTokens<1||tokens>1000000)throw Error('预算预估无效');
    const hash=fingerprint([workspace,context,s.epoch]);
    if(Object.hasOwn(s.fingerprints,hash))throw Error('没有新的待理解内容');
    const day=dayKey(now),u=s.usage[day]??={used:0,reserved:0,automatic:0,estimated:false};
    if(automatic&&(now-s.lastAutomatic<s.policy.intervalSeconds*1000||u.automatic>=s.policy.automaticLimit))throw Error('自动理解冷却中或今日次数已满');
    if(u.used+u.reserved+tokens>s.policy.dailyTokens)throw new PetBudgetError();
    const r:Reservation={id:randomUUID(),day,tokens,fingerprint:hash,epoch:s.epoch,workspace,createdAt:now};
    u.reserved+=tokens;if(automatic){u.automatic++;s.lastAutomatic=now;}
    s.fingerprints[hash]=now;s.reservations.push(r);return r;
  });}
  private settleState(s:CompanionState,id:string,actual:number|undefined){
    const r=s.reservations.find(r=>r.id===id);if(!r)return;
    const u=s.usage[r.day]!;u.reserved=Math.max(0,u.reserved-r.tokens);
    const known=actual!==undefined&&Number.isSafeInteger(actual)&&actual>=0;
    u.used+=known?actual:r.tokens;u.estimated ||= !known;s.reservations=s.reservations.filter(r=>r.id!==id);
    const now=this.now();
    if(s.policy.enabled&&r.day===dayKey(now)&&u.used>=s.policy.dailyTokens*.8){
      if(u.used>=s.policy.dailyTokens)this.alertState(s,now,'budget',`我的今日 token 预算${u.estimated?'按估算':''}已用完，智能理解先暂停啦，普通陪伴继续～可以到智能设置查看用量。`);
      else this.alertState(s,now,'budget-warning',`我的今日 token 预算${u.estimated?'按估算':''}已使用至少 80% 啦。普通陪伴不受影响，可以到智能设置查看用量～`);
    }return r;
  }
  settle(id:string,actual?:number){return this.change(s=>this.settleState(s,id,actual));}
  accept(reservation:Reservation,text:string,intent:Insight['intent'],sources:Source[],remember=true,guard?:{signal?:AbortSignal;contextKey?:string}){return this.change((s,now)=>{
    if(guard?.signal?.aborted||(guard?.contextKey!==undefined&&workspaceContextKey(s.tasks,reservation.workspace)!==guard.contextKey))return null;
    if(!s.policy.enabled||s.epoch!==reservation.epoch||!s.policy.workspaces.includes(reservation.workspace))return null;
    if(!text.trim()||text.length>400||!['notice','attention','celebrate','reflect'].includes(intent)||!sources.length)return null;
    if(sources.some(x=>x.workspace!==reservation.workspace||!s.tasks.some(t=>t.workspace===x.workspace&&t.session===x.session&&t.seq===x.seq&&(x.statusRevision===undefined||t.statusRevision===x.statusRevision)
      &&(x.tools??[]).every(ref=>(t.tools??[]).some(f=>f.callId===ref.callId&&f.callSeq===ref.callSeq&&f.resultSeq===ref.resultSeq)))))return null;
    const item:Insight={id:reservation.id,text,intent,sources,createdAt:now};s.insights=[...s.insights.filter(i=>i.id!==item.id),item].slice(-20);
    if(remember){s.memories=s.memories.filter(m=>!(m.workspace===reservation.workspace&&m.kind==='summary'));
    s.memories.push({id:randomUUID(),workspace:reservation.workspace,kind:'summary',text,sources,createdAt:now,expiresAt:now+s.policy.memoryDays*86400000,confirmed:false});
    s.memories=s.memories.slice(-500);}return item;
  });}
  announce(insightId:string,client:string){return this.change((s,now)=>{
    if(s.display?.client!==client||s.display.expiresAt<=now)return false;
    const item=s.insights.find(i=>i.id===insightId);if(!item||item.announcedAt!==undefined||(item.expiresAt!==undefined&&item.expiresAt<=now))return false;
    item.announcedAt=now;return true;
  });}
  collect(source:Source){return this.change((s,now)=>{
    const t=s.tasks.find(t=>t.workspace===source.workspace&&t.session===source.session&&t.seq===source.seq&&t.state==='completed');
    if(!t)throw Error('只有真实完成的任务可制作明信片');
    const key=fingerprint(source);if(s.collections.some(c=>c.id===key))return;
    s.collections.push({id:key,title:t.title,text:t.excerpt,kind:'postcard',createdAt:now,sources:[source]});s.collections=s.collections.slice(-200);
  });}
  recordInteraction(kind:PlayKind){if(!(playKinds as readonly string[]).includes(kind))throw Error('未知互动');return this.change((s,now)=>{
    if(now-s.life.lastInteraction<1000)return false;
    s.life.firstSeen ||= now;s.life.lastInteraction=now;s.life.interactions++;
    s.life.journal.push({id:randomUUID(),at:now,kind});s.life.journal=s.life.journal.slice(-200);return true;
  });}
  clearDiary(){return this.change(s=>{s.life=lifeDefaults();});}
  removeCollection(id:string){return this.change(s=>{s.collections=s.collections.filter(c=>c.id!==id);});}
}
