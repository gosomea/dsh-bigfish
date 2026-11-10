import type {Preferences} from '../contract/preferences.js';

export type ActivitySettings=Pick<Preferences,'idleMode'|'idleMinSeconds'|'idleMaxSeconds'>;
export type DailyActivity='idle'|'life'|'wander';
export interface ActivityGate {
 canStart(channel:DailyActivity,now:number):boolean;
 started(channel:DailyActivity,now:number):void;
 finished(channel:DailyActivity,now:number):void;
 declined?(channel:DailyActivity,now:number):void;
}
/** Rest after a complete autonomous performance. User gestures and task facts have no such gate. */
export function activityInterval(p:ActivitySettings):[number,number] {
 switch(p.idleMode){
  case 'quiet':return [Infinity,Infinity];
  case 'occasional':return [60,120];
  case 'natural':return [15,30];
  case 'continuous':return [1,3];
  case 'custom':return [p.idleMinSeconds,p.idleMaxSeconds];
  default:return [5,10];
 }
}
export function movementInterval(p:ActivitySettings,config:{activityOverrides?:boolean;restMin:number;restMax:number}):[number,number] {
 return config.activityOverrides?[config.restMin,config.restMax]:activityInterval(p);
}
/** Rare prop scenes retain a fifteen-minute floor; stories keep their separate, event-based policy. */
export function adventureInterval(p:ActivitySettings,config:{activityOverrides?:boolean;adventureMinutes:number}):number {
 if(config.activityOverrides)return config.adventureMinutes*60000;
 const minutes={quiet:Infinity,occasional:90,natural:45,frequent:30,continuous:15,custom:Math.max(15,Math.min(120,p.idleMinSeconds))};
 return minutes[p.idleMode]*60000;
}
const channels:readonly DailyActivity[]=['idle','life','wander'];
/** Poll order never selects the winner. Each enabled channel gets its turn after a shared rest. */
export class DailyActivityRotation implements ActivityGate {
 private enabled=new Set<DailyActivity>();
 private owner:DailyActivity|null=null;
 private previous:DailyActivity='wander';
 private next=0;private key='';private interval:[number,number]=[5,10];
 private movement:[number,number]|undefined;
 private offered:DailyActivity|null=null;private offeredAt=0;
 private notBefore=new Map<DailyActivity,number>();
 constructor(private random:()=>number=Math.random){}
 configure(p:ActivitySettings,enabled:readonly DailyActivity[],now:number,movement?:readonly [number,number]) {
  const key=JSON.stringify([p.idleMode,p.idleMinSeconds,p.idleMaxSeconds,movement]);
  this.enabled=new Set(enabled);this.interval=activityInterval(p);this.movement=movement?[...movement]:undefined;
  if(key!==this.key){this.key=key;this.next=now+this.delay(this.interval);this.notBefore.clear();if(this.movement)this.notBefore.set('wander',now+this.delay(this.movement));this.offered=null;}
  if(this.owner&&!this.enabled.has(this.owner)){const old=this.owner;this.finished(old,now);}
 }
 canStart(channel:DailyActivity,now:number) {
  if(this.owner)return false;
  if(!this.enabled.has(channel)||!Number.isFinite(this.interval[0]))return false;
  // Missing geometry or a renderer that cannot start must not reserve the actor forever.
  if(this.offered&&now-this.offeredAt>=2000){this.previous=this.offered;this.offered=null;}
  const start=channels.indexOf(this.previous);
  for(let offset=1;offset<=channels.length;offset++){
   const candidate=channels[(start+offset)%channels.length]!;
   const due=candidate==='wander'&&this.movement?(this.notBefore.get(candidate)??0):this.next;
   if(this.enabled.has(candidate)&&now>=due){
    if(this.offered!==candidate){this.offered=candidate;this.offeredAt=now;}
    return candidate===channel;
   }
  }
  return false;
 }
 started(channel:DailyActivity,_now:number) {if(!this.owner&&this.enabled.has(channel)){this.owner=channel;this.offered=null;}}
 finished(channel:DailyActivity,now:number) {
  if(this.owner!==channel)return;
  this.owner=null;this.previous=channel;this.offered=null;
  // An explicit walk cadence has its own deadline. It neither inherits a slower
  // idle floor nor postpones already-due ordinary activities by walking again.
  if(channel==='wander'&&this.movement)this.notBefore.set(channel,now+this.delay(this.movement));
  else this.next=now+this.delay(this.interval);
 }
 declined(channel:DailyActivity,now:number){if(this.canStart(channel,now)){this.previous=channel;this.offered=null;}}
 private delay([min,max]:readonly [number,number]) {return (min+Math.max(0,Math.min(1,this.random()))*(max-min||0))*1000;}
}

/** Authored sequence intensity: selection metadata, never a claim that raster poses are redrawn. */
export const authoredMotionIntensity:Readonly<Record<string,0|1|2>>={
 walk:0,stop:0,'start-step':0,turn:0,tiptoe:2,'edge-peek':1,'tail-avoid':1,recall:2,
 'head-pat':0,'ball-catch':2,'fish-toy':2,tea:0,biscuit:0,'tail-comb':1,wave:1,point:0,
 'sit-down':0,'wake-up':0,sleep:0,stretch:1,'lie-down':0,nest:1,'desk-tidy':1,lamp:0,
 'task-cards':0,'confirm-card':0,'book-close':0,postcard:1,'screen-read':0,think:0,'success-bow':1,'failure-check':0,
};
export function autonomousClipAllowed(clip:string,richness:number) {
 return (authoredMotionIntensity[clip.replace(/^companion:/,'')]??1)<=richness;
}
/** One cooldown across autonomous sources. A held bubble keeps its decision; manual/factual speech bypasses it. */
export class LocalSpeechGate {
 private last=-Infinity;private decisions=new Map<string,boolean>();
 allow(key:string,now:number,level:number,direct=false) {
  if(this.decisions.has(key))return this.decisions.get(key)!;
  const allowed=direct||(level>0&&now-this.last>=(level===1?30000:10000));
  if(allowed)this.last=now;
  this.decisions.set(key,allowed);
  if(this.decisions.size>100)this.decisions.delete(this.decisions.keys().next().value!);
  return allowed;
 }
}
