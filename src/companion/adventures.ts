/** Local prop scenes reuse existing character clips; they do not add character art or model calls. */
export const adventureKinds=['box','paper-boat','fishing'] as const;
export type AdventureKind=typeof adventureKinds[number];
export type AdventureSource='manual'|'automatic';
export interface AdventureStep {phase:string;clip:string;text:string;durationMs:number}
const poseMs=8*280+3000;
export const adventurePlans:Record<AdventureKind,{label:string;steps:readonly AdventureStep[]}>= {
 box:{label:'纸箱躲猫猫',steps:[
  {phase:'discover',clip:'point',text:'发现一个刚刚好的纸箱～',durationMs:poseMs},
  {phase:'hide',clip:'lie-down',text:'尾巴也要收好，藏进去啦。',durationMs:poseMs},
  {phase:'peek',clip:'edge-peek',text:'你找到我了吗？',durationMs:poseMs},
  {phase:'return',clip:'wake-up',text:'出来透透气，纸箱留到下次玩。',durationMs:poseMs},
 ]},
 'paper-boat':{label:'小纸鱼船',steps:[
  {phase:'launch',clip:'point',text:'小纸鱼坐好了，准备出航～',durationMs:poseMs},
  {phase:'sail',clip:'fish-toy',text:'我在岸边看着你，慢慢游。',durationMs:poseMs},
  {phase:'return',clip:'wave',text:'靠岸啦，今天的小旅行完成。',durationMs:poseMs},
 ]},
 fishing:{label:'浅海钓纸鱼',steps:[
  {phase:'prepare',clip:'sit-down',text:'坐稳了，看看水里有什么。',durationMs:poseMs},
  {phase:'wait',clip:'fish-toy',text:'小纸鱼轻轻碰了一下浮漂。',durationMs:poseMs},
  {phase:'release',clip:'wave',text:'原来是老朋友，送你回水里～',durationMs:poseMs},
 ]},
};
export interface AdventureEnvironment {
 enabled:boolean;quiet:boolean;important:boolean;working:boolean;dragging:boolean;
 /** Only pass real clips the selected character can render. Missing art never becomes a translated still. */
 availableClips:readonly string[];
 /** A smaller amplitude pool only constrains automatic scenes, never a deliberate preview. */
 automaticClips?:readonly string[];
 visible?:boolean;
 displayOwner?:boolean;
 autoIntervalMs?:number;
 allowedKinds?:readonly AdventureKind[];
 reducedMotion?:boolean;
}
export interface AdventurePolicy {automatic:boolean;cooldownSeconds:number;kinds:readonly AdventureKind[]}
export const defaultAdventurePolicy:AdventurePolicy={automatic:true,cooldownSeconds:900,kinds:adventureKinds};
export interface AdventureSnapshot {
 id:string;kind:AdventureKind;label:string;source:AdventureSource;
 phase:string;phaseIndex:number;phaseProgress:number;progress:number;
 clip:string;clipSerial:string;text:string;fictional:true;reducedMotion:boolean;
}
export const adventureDuration=(kind:AdventureKind)=>adventurePlans[kind].steps.reduce((sum,step)=>sum+step.durationMs,0);
export function adventureMissingClips(kind:AdventureKind,available:readonly string[]){return [...new Set(adventurePlans[kind].steps.map(step=>step.clip))].filter(clip=>!available.includes(clip));}
function policy(raw:AdventurePolicy):AdventurePolicy {
 if(typeof raw.automatic!=='boolean'||!Number.isInteger(raw.cooldownSeconds)||raw.cooldownSeconds<60||raw.cooldownSeconds>86400||!Array.isArray(raw.kinds)||raw.kinds.some(k=>!adventureKinds.includes(k)))throw Error('彩蛋配置无效：冷却为 60–86400 秒，种类必须来自已实现的小剧场');
 return {...raw,kinds:[...new Set(raw.kinds)]};
}
/** A single local chain. Callers arbitrate this low-priority intent with their main behavior scheduler. */
export class AdventureDirector {
 private policy:AdventurePolicy;
 private active:{id:string;kind:AdventureKind;source:AdventureSource;startedAt:number}|null=null;
 private nextAutomatic:number|null=null;
 private sequence=0;
 private clock=0;
 private lastKind:AdventureKind|null=null;
 private intervalMs:number;
 constructor(value:AdventurePolicy=defaultAdventurePolicy,private random= Math.random){this.policy=policy(value);this.intervalMs=this.policy.cooldownSeconds*1000;}
 get readyAt(){return this.nextAutomatic;}
 configure(value:AdventurePolicy,now:number){
  const next=policy(value),at=this.time(now);
  if(JSON.stringify(next)===JSON.stringify(this.policy))return;
  this.policy=next;this.intervalMs=next.cooldownSeconds*1000;this.nextAutomatic=at+this.intervalMs;
  if(this.active?.source==='automatic'&&(!next.automatic||!next.kinds.includes(this.active.kind)))this.active=null;
 }
 private time(now:number){if(!Number.isFinite(now)||now<0)throw Error('彩蛋时间无效');return this.clock=Math.max(this.clock,now);}
 private syncEnvironment(at:number,env:AdventureEnvironment){
  const interval=Number.isInteger(env.autoIntervalMs)&&env.autoIntervalMs!>=900000&&env.autoIntervalMs!<=7200000?env.autoIntervalMs!:this.policy.cooldownSeconds*1000;
  if(interval!==this.intervalMs){this.intervalMs=interval;this.nextAutomatic=at+interval;}
 }
 private permitted(source:AdventureSource,env:AdventureEnvironment){return env.enabled&&env.displayOwner!==false&&!env.important&&!env.dragging&&env.visible!==false&&(source==='manual'||(!env.quiet&&!env.working));}
 start(kind:AdventureKind,now:number,env:AdventureEnvironment,source:AdventureSource='manual'){
  const at=this.time(now);this.syncEnvironment(at,env);
  if(this.active||!adventureKinds.includes(kind)||(env.allowedKinds!==undefined&&!env.allowedKinds.includes(kind))||!this.permitted(source,env)||adventureMissingClips(kind,env.availableClips).length||(source==='automatic'&&env.automaticClips&&adventureMissingClips(kind,env.automaticClips).length))return false;
  if(source==='automatic'&&(!this.policy.automatic||!this.policy.kinds.includes(kind)||(this.nextAutomatic===null||at<this.nextAutomatic)))return false;
  this.active={id:`adventure-${++this.sequence}`,kind,source,startedAt:at};this.lastKind=kind;
  this.nextAutomatic=at+adventureDuration(kind)+this.intervalMs;return true;
 }
 maybeStart(now:number,env:AdventureEnvironment){
  const at=this.time(now);this.syncEnvironment(at,env);
  // Arm once. Repeated idle ticks must not continually postpone or immediately replay a scene.
  this.nextAutomatic??=at+this.intervalMs;
  if(this.active||!this.policy.automatic||!this.permitted('automatic',env)||at<this.nextAutomatic)return false;
  const eligible=this.policy.kinds.filter(kind=>(env.allowedKinds===undefined||env.allowedKinds.includes(kind))&&adventureMissingClips(kind,env.availableClips).length===0&&(!env.automaticClips||adventureMissingClips(kind,env.automaticClips).length===0));
  const pool=eligible.length>1?eligible.filter(kind=>kind!==this.lastKind):eligible;
  if(!pool.length){this.nextAutomatic=at+this.intervalMs;return false;}
  const random=this.random(),index=Math.min(pool.length-1,Math.max(0,Math.floor((Number.isFinite(random)?random:0)*pool.length)));
  return this.start(pool[index]!,at,env,'automatic');
 }
 cancel(now:number){const at=this.time(now);this.active=null;this.nextAutomatic=at+this.intervalMs;}
 tick(now:number,env:AdventureEnvironment):AdventureSnapshot|null {
  const at=this.time(now);this.syncEnvironment(at,env);const active=this.active;if(!active)return null;
  if((env.allowedKinds!==undefined&&!env.allowedKinds.includes(active.kind))||!this.permitted(active.source,env)||(active.source==='automatic'&&(!this.policy.automatic||env.automaticClips&&adventureMissingClips(active.kind,env.automaticClips).length>0))||adventureMissingClips(active.kind,env.availableClips).length){this.cancel(at);return null;}
  const elapsed=at-active.startedAt,total=adventureDuration(active.kind);
  if(elapsed>=total){this.active=null;return null;}
  const plan=adventurePlans[active.kind];let phaseAt=elapsed;
  for(const [phaseIndex,step] of plan.steps.entries()){
   if(phaseAt<step.durationMs)return {...active,label:plan.label,phase:step.phase,phaseIndex,phaseProgress:phaseAt/step.durationMs,progress:elapsed/total,clip:step.clip,clipSerial:`${active.id}-${phaseIndex}`,text:step.text,fictional:true,reducedMotion:env.reducedMotion??false};
   phaseAt-=step.durationMs;
  }
  return null;
 }
}
export const pendingAdventures='这三种小剧场在宠物舞台内播放；本地双宠在“小窝、收藏与成长”中选择，跨屏与经授权的窗口边缘互动在桌面设置中开启。';
