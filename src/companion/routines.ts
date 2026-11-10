import type {Lifestyle} from './config.js';
import type {Source,Task} from './state.js';
import type {Preferences} from '../contract/preferences.js';
import {taskActivity} from './task-activity.js';
import {companionTiming} from './clip-timeline.js';
import {activityInterval,type ActivityGate} from './activity.js';

export interface RoutineInput {
 enabled:boolean;
 config:Lifestyle;
 sceneryVisible?:boolean;
 idleMode:Preferences['idleMode'];
 idleMinSeconds?:number;
 idleMaxSeconds?:number;
 state:string;
 tasks:readonly Task[];
 blocked:boolean;
 /** Ordinary idle or movement may defer a new chain without interrupting one already playing. */
 blockStart?:boolean;
 urgent:boolean;
 interacting:boolean;
 quiet:boolean;
 reducedMotion?:boolean;
 completionMode?:Preferences['completionMode'];
 availableClips?:readonly string[];
 /** Autonomous selection obeys amplitude; terminal facts still use the full capability list. */
 ambientClips?:readonly string[];
 activity?:ActivityGate;
 /** Optional UI handshake; headless callers omit it and use the shared clock directly. */
 playbackReady?:string;
}
export interface RoutineFrame {
 id:string;
 clip:string;
 motion:string;
 phase:'entry'|'hold'|'exit';
 serial:string;
 text:string;
 sources:Source[];
 startedAt:number;
 until:number;
 holdMs:number;
}
interface Step {clip:string;playMs:number;holdMs:number;exit?:boolean}
interface Chain {id:string;kind:'ambient'|'terminal'|'wake';steps:Step[];startedAt:number;text:string;sources:Source[];terminalState?:Pending['state']}
interface Pending {state:'completed'|'failed';tasks:Task[];at:number}
const authored=(clip:string,holdMs=3000,exit=false):Step=>({clip,playMs:companionTiming.oneShotMs,holdMs,...(exit?{exit:true}:{})});
const taskKey=(s:Source)=>JSON.stringify([s.workspace,s.session]);

/** One local chain with absolute deadlines. No task claims, memories, model calls or automatic collection writes. */
export class LifeRoutineDirector {
 private chain:Chain|null=null;
 private lastNow:number|null=null;
 private idleSince:number|null=null;
 private nextAmbient:number|null=null;
 private cadence='';
 private needsWake=false;
 private sequence=0;
 private ambientIndex=0;
 private taskStates=new Map<string,Task['state']>();
 private initializedTasks=false;
 private pending:Pending|null=null;
 private awaitingSerial:string|null=null;
 constructor(private random:()=>number=()=>.5){}

 private cooldown(input:RoutineInput){
  const [low,high]=activityInterval({idleMode:input.idleMode,idleMinSeconds:input.idleMinSeconds??5,idleMaxSeconds:input.idleMaxSeconds??10});
  if(!Number.isFinite(low))return Infinity;
  const r=Math.max(0,Math.min(1,this.random()));
  return (Math.max(1,low)+(Math.max(low,high)-Math.max(1,low))*r)*1000;
 }
 private can(input:RoutineInput,clip:string){return !input.availableClips||input.availableClips.includes(clip);}
 private observe(input:RoutineInput,now:number){
  const facts:Task[]=[];
  for(const task of input.tasks){
   const key=taskKey(task),previous=this.taskStates.get(key);
   // Restored terminal tasks establish a baseline; they are never a new completion event.
   if(this.initializedTasks&&previous!==undefined&&previous!==task.state&&(task.state==='completed'||task.state==='failed')&&now-task.updatedAt<=60000&&task.updatedAt<=now)facts.push(task);
   this.taskStates.set(key,task.state);
  }
  this.initializedTasks=true;
  if(this.taskStates.size>500){const keep=new Set(input.tasks.map(taskKey));for(const key of this.taskStates.keys())if(!keep.has(key))this.taskStates.delete(key);}
  if(facts.length){
   const state=facts.some(t=>t.state==='failed')?'failed':'completed';
   const combined=[...(this.pending?.state===state?this.pending.tasks:[]),...facts.filter(t=>t.state===state)];
   this.pending={state,tasks:[...new Map(combined.map(t=>[taskKey(t),t])).values()].slice(-8),at:now};
  }
  if(this.pending){
   this.pending.tasks=this.pending.tasks.flatMap(old=>{const latest=input.tasks.find(t=>taskKey(t)===taskKey(old));return latest?.state===this.pending!.state?[latest]:[];});
   if(!this.pending.tasks.length||now-this.pending.at>60000)this.pending=null;
  }
 }
 private begin(kind:Chain['kind'],steps:Step[],now:number,text='',sources:Source[]=[],terminalState?:Pending['state']){
  this.chain={id:`life-${++this.sequence}`,kind,steps,startedAt:now,text,sources,...(terminalState?{terminalState}:{})};
  this.awaitingSerial=null;
 }
 private cancel(now:number,input:RoutineInput){
  if(!this.chain)return;
  input.activity?.finished('life',now);
  this.chain=null;
  this.awaitingSerial=null;
  this.nextAmbient=now+this.cooldown(input);
 }
 private frame(now:number):RoutineFrame|null{
  if(!this.chain)return null;
  const chain=this.chain;let at=chain.startedAt;
  for(let index=0;index<chain.steps.length;index++){
   const step=chain.steps[index]!,end=at+step.playMs+step.holdMs;
   if(now<end){
    if(step.clip==='sleep'||step.clip==='lie-down')this.needsWake=true;
    if(step.clip==='wake-up')this.needsWake=false;
    const serial=`${chain.id}-${index}`;this.awaitingSerial=serial;
    return {id:chain.id,clip:step.clip,motion:`companion:${step.clip}`,phase:step.exit?'exit':now<at+step.playMs?'entry':'hold',serial,text:chain.text,sources:chain.sources,startedAt:at,until:now<at+step.playMs?at+step.playMs:end,holdMs:step.holdMs};
   }
   at=end;
  }
  this.chain=null;return null;
 }
 private ambient(input:RoutineInput,now:number){
  const {config}=input,home=input.sceneryVisible!==false&&config.groups.home&&config.homeVisible;
  const choices:Step[][]=[];
  if(config.groups.body)choices.push([authored('sit-down',10000),authored('stretch',3000,true)]);
  if(home&&config.desk)choices.push([authored('desk-tidy',5000),authored('book-close',3000,true)]);
  if(home&&config.lamp)choices.push([authored('lamp',6000),authored('stretch',3000,true)]);
  if(home&&config.bed)choices.push([authored('nest',4000),authored('sit-down',10000),authored('stretch',3000,true)]);
  const watchingWork=config.groups.steward&&input.tasks.some(task=>taskActivity(task)!==null);
  if(config.groups.body&&!watchingWork&&(now-(this.idleSince??now)>=120000)&&(home?config.bed:true))choices.push([...(home?[authored('nest',3000)]:[]),authored('lie-down',4000),authored('sleep',30000),authored('wake-up',3000,true)]);
  const allowed=(clip:string)=>this.can(input,clip)&&(!input.ambientClips||input.ambientClips.includes(clip));
  const available=choices.map(steps=>steps.filter(s=>allowed(s.clip))).filter(steps=>steps.length>0);
  if(!available.length)return;
  this.begin('ambient',available[this.ambientIndex++%available.length]!,now);input.activity?.started('life',now);
 }
 tick(input:RoutineInput,now:number):RoutineFrame|null{
  if(!Number.isFinite(now))return null;
  // A background window cannot fast-forward through a new series of performances on return.
  const delta=this.lastNow===null?0:Math.max(0,now-this.lastNow);
  const jumped=this.lastNow!==null&&(now<this.lastNow||now-this.lastNow>60000);this.lastNow=now;
  this.observe(input,now);
  const idle=input.state==='idle';
  // Starting real work takes the actor immediately; do not play a wake story over output.
  if(!idle)this.needsWake=false;
  if(idle){this.idleSince??=now;}else this.idleSince=null;
  const cadence=JSON.stringify([input.idleMode,input.idleMinSeconds,input.idleMaxSeconds]);
  if(this.nextAmbient===null||cadence!==this.cadence){this.cadence=cadence;this.nextAmbient=now+this.cooldown(input);}
  if(jumped){this.cancel(now,input);this.nextAmbient=now+this.cooldown(input);}
  // Runtime statusRevision also changes for projection metadata. Revalidate the actual terminal
  // state instead of cancelling a still-true completion on every same-state revision.
  if(this.chain?.kind==='terminal'&&this.chain.sources.some(source=>input.tasks.find(t=>taskKey(t)===taskKey(source))?.state!==this.chain!.terminalState))this.cancel(now,input);
  if(!input.enabled){this.cancel(now,input);this.pending=null;this.needsWake=false;return null;}
  const hardBlock=!input.enabled||input.blocked||input.urgent||input.interacting;
  if(hardBlock){this.cancel(now,input);return null;}
  if(input.quiet||input.config.importantOnly){this.cancel(now,input);return null;}
  const home=input.sceneryVisible!==false&&input.config.groups.home&&input.config.homeVisible;
  const furnitureUnavailable=this.chain?.kind==='ambient'&&this.chain.steps.some(s=>(s.clip==='nest'&&(!home||!input.config.bed))||(s.clip==='desk-tidy'&&(!home||!input.config.desk))||(s.clip==='lamp'&&(!home||!input.config.lamp)));
  if(this.chain?.kind==='ambient'&&(!idle||input.idleMode==='quiet'||input.reducedMotion||(!input.config.groups.body&&!home)||furnitureUnavailable||this.chain.steps.some(s=>input.ambientClips&&!input.ambientClips.includes(s.clip))))this.cancel(now,input);
  if(this.chain?.kind==='ambient'&&input.config.groups.steward&&input.tasks.some(task=>taskActivity(task)!==null)&&this.chain.steps.some(step=>step.clip==='sleep'))this.cancel(now,input);
  if(this.chain?.kind==='terminal'&&!idle)this.cancel(now,input);
  // A real wake clip bridges sleeping into work or user activity instead of abruptly replacing the pose.
  if(this.needsWake&&!this.chain){
   if(this.can(input,'wake-up'))this.begin('wake',[authored('wake-up',idle?2000:300,true)],now);
   else this.needsWake=false;
  }
  if(this.chain){
   if(input.playbackReady!==undefined&&this.awaitingSerial&&input.playbackReady!==this.awaitingSerial)this.chain.startedAt+=delta;
   const frame=this.frame(now);if(frame)return frame;input.activity?.finished('life',now);this.nextAmbient=now+this.cooldown(input);return null;
  }
  if(!idle)return null;
  if(input.blockStart)return null;
  if(this.pending){
   const fact=this.pending;this.pending=null;
   if(input.config.groups.steward&&(fact.state==='failed'||(input.completionMode??'celebrate')==='celebrate')){
    const sources=fact.tasks.map(({workspace,session,seq,statusRevision})=>({workspace,session,seq,...(statusRevision===undefined?{}:{statusRevision})}));
    const label=fact.tasks.length>1?`${fact.tasks.length} 个会话`:`「${fact.tasks[0]!.title.slice(0,80)}」`;
    const text=fact.state==='failed'?`${label}执行失败，可以查看对应会话。`:`${label}已完成。${input.config.groups.home?'可以在任务本收下项目明信片。':''}`;
    const steps=(fact.state==='failed'?[authored('failure-check',6000),authored('book-close',3000,true)]:[authored('book-close',3000),authored('success-bow',4000),...(input.config.groups.home?[authored('postcard',5000,true)]:[])]).filter(s=>this.can(input,s.clip));
    if(steps.length){this.begin('terminal',input.reducedMotion?[{...steps[0]!,playMs:0,holdMs:4000}]:steps,now,text,sources,fact.state);return this.frame(now);}
   }
  }
  const canLive=input.idleMode!=='quiet'&&!input.reducedMotion&&(input.config.groups.body||input.config.groups.home);
  if(canLive&&(input.activity?input.activity.canStart('life',now):now>=this.nextAmbient)){this.nextAmbient=now+this.cooldown(input);this.ambient(input,now);return this.frame(now);}
  return null;
 }
}
