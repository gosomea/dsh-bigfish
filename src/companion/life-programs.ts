import {growthProgress,currentSeason,seasonalStory,type LifeState,type Season} from './life.js';
import {actionUnlocked,type LifeOptions} from './life-options.js';
export const lifeProgramClips=['wave','point','book-close','nest','tea','fish-toy','ball-catch','biscuit'] as const;
export type LifeProgramRequest={kind:'season';season:Season;index?:number}|{kind:'stage'}|{kind:'paired'};
export interface LifeProgramEnvironment {enabled:boolean;growth:boolean;life:LifeState;options:LifeOptions;availableClips:readonly string[];automaticClips?:readonly string[];pairedClips?:readonly string[];pairedIdentity?:string;blocked:boolean;quiet:boolean;working:boolean;reduced?:boolean;playbackReady?:string}
interface ProgramStep {clip:string;pairedClip?:string;holdMs:number;text:string;pairProp?:'ball'|'tea'}
export interface LifeProgramFrame {id:string;kind:LifeProgramRequest['kind'];source:'manual'|'automatic';clip:string;serial:string;text:string;phase:'entry'|'hold'|'exit';startedAt:number;until:number;pairedClip?:string;pairProp?:'ball'|'tea';progress:number;holdMs:number;fictional:true}
export const pairLayout={primary:{x:136,y:13,width:194,height:200},secondary:{x:28,y:120,width:86,height:93}} as const;
export function overlaps(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number}){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
/** The shared prop bounces at both actors' facing boundaries. Bodies never slide through each other. */
export function pairedBall(progress:number){const t=Math.max(0,Math.min(1,progress)),cycle=t*4,half=Math.floor(cycle),fraction=cycle-half;const p=half%2===0?fraction:1-fraction;return {x:114+p*22,y:166-Math.sin(fraction*Math.PI)*18,contact:fraction<.04?(half%2===0?'secondary':'primary'):null};}
const step=(clip:string,text:string,holdMs=3000,pairedClip?:string,pairProp?:ProgramStep['pairProp']):ProgramStep=>({clip,text,holdMs,...(pairedClip?{pairedClip}:{}),...(pairProp?{pairProp}:{})});
/** A local performance shares the caller's scheduler, facts and budget; it never invokes any service. */
export class LifeProgramDirector {
 private active:{id:string;kind:LifeProgramRequest['kind'];source:'manual'|'automatic';startedAt:number;steps:ProgramStep[];pairedIdentity:string|undefined}|null=null;
 private lastTick:number|null=null;private lastSerial='';private sequence=0;private nextAutomatic=0;private previousStage:string|null=null;private previousSeason:Season|null=null;private pending:LifeProgramRequest|null=null;
 private valid(request:LifeProgramRequest,env:LifeProgramEnvironment,source:'manual'|'automatic'){
  return env.enabled&&(source==='manual'||env.options.storyAutomatic)&&!env.blocked&&!env.working&&(source==='manual'||!env.quiet)&&
   (request.kind==='paired'?env.options.pairEnabled&&actionUnlocked('pair-exchange',env.life.interactions,env.options.growthUnlocks):env.growth&&actionUnlocked(request.kind==='stage'?'stage-story':'season-story',env.life.interactions,env.options.growthUnlocks));
 }
 start(request:LifeProgramRequest,env:LifeProgramEnvironment,now:number,source:'manual'|'automatic'='manual'){
  if(!Number.isFinite(now)||this.active||!this.valid(request,env,source))return false;
  const label='宠物剧情（虚构）：';let steps:ProgramStep[];
  if(request.kind==='paired')steps=[step('wave',label+'和本地小伙伴打个招呼。',3000,'wave'),step('ball-catch',label+'把小球轻轻递给彼此，碰到边界就传回来。',6000,'fish-toy','ball'),step('tea',label+'分一杯茶，再留半块饼干。',5000,'biscuit','tea'),step('wave',label+'小伙伴先回小窝，下次再玩。',3000,'wave')];
  else if(request.kind==='stage'){
   const stage=growthProgress(env.life),story=stage.count>=100?'小纸鱼把熟悉的尾巴画成一座小桥，大家从桥下慢慢游过。':stage.count>=20?'她把两张贝壳椅并排摆好，小纸鱼终于不用隔着茶杯打招呼了。':'大肥鱼在故事书里夹下一片蓝色纸叶，写着：今天认识了新朋友。';
   steps=[step('book-close',`${label}称号“${stage.current.title}”依据真实 ${stage.count} 次互动；接下来是虚构小故事。`),step('point',label+story,6000),step('wave',label+'故事合上了，真实的日记仍只记录实际发生的互动。')];
  }else{
   const story=seasonalStory(request.season,request.index??0);
   steps=[step('point',`${label}${story.title}开场。`),step(request.season==='winter'?'tea':request.season==='summer'?'fish-toy':'nest',label+story.text,7000),step('wave',label+'小剧场谢幕，回到日常陪伴。')];
  }
  const required=steps.flatMap(s=>[s.clip,...(s.pairedClip?[s.pairedClip]:[])]);
  const available=request.kind==='paired'&&env.pairedClips?env.pairedClips:env.availableClips;
  if(required.some(id=>!available.includes(id)||source==='automatic'&&env.automaticClips&&!env.automaticClips.includes(id)||!actionUnlocked(id,env.life.interactions,env.options.growthUnlocks)))return false;
  this.lastTick=now;this.lastSerial='';this.active={id:`life-program-${++this.sequence}`,kind:request.kind,source,startedAt:now,steps,pairedIdentity:env.pairedIdentity};
  this.nextAutomatic=now+steps.reduce((sum,s)=>sum+(env.reduced?0:2240)+s.holdMs,0)+env.options.storyMinutes*60000;return true;
 }
 maybeStart(env:LifeProgramEnvironment,now:number){
  const stage=growthProgress(env.life).current.title,season=currentSeason(new Date(now));
  if(this.previousStage!==null&&stage!==this.previousStage)this.pending={kind:'stage'};
  else if(this.previousSeason!==null&&season!==this.previousSeason)this.pending={kind:'season',season};
  this.previousStage=stage;this.previousSeason=season;
  if(!env.options.storyAutomatic||!env.growth){this.pending=null;return false;}
  if(!this.pending||this.active||now<this.nextAutomatic)return false;
  const request=this.pending;if(!this.start(request,env,now,'automatic'))return false;this.pending=null;return true;
 }
 cancel(now:number,env:LifeProgramEnvironment){this.active=null;this.nextAutomatic=now+env.options.storyMinutes*60000;}
 tick(env:LifeProgramEnvironment,now:number):LifeProgramFrame|null {
  const active=this.active;if(!active)return null;
  if(active.kind==='paired'&&active.pairedIdentity!==env.pairedIdentity){this.cancel(now,env);return null;}
  const delta=this.lastTick===null?0:Math.max(0,now-this.lastTick);this.lastTick=now;
  if(env.playbackReady!==undefined&&this.lastSerial&&env.playbackReady!==this.lastSerial)active.startedAt+=delta;
  const request:LifeProgramRequest=active.kind==='paired'?{kind:'paired'}:active.kind==='stage'?{kind:'stage'}:{kind:'season',season:currentSeason(new Date(now))};
  const available=active.kind==='paired'&&env.pairedClips?env.pairedClips:env.availableClips;
  if(!this.valid(request,env,active.source)||active.steps.some(s=>!available.includes(s.clip)||active.source==='automatic'&&env.automaticClips&&!env.automaticClips.includes(s.clip)||!actionUnlocked(s.clip,env.life.interactions,env.options.growthUnlocks)||s.pairedClip&&(!available.includes(s.pairedClip)||!actionUnlocked(s.pairedClip,env.life.interactions,env.options.growthUnlocks)))){this.cancel(now,env);return null;}
  let at=active.startedAt;
  for(let i=0;i<active.steps.length;i++){
   const s=active.steps[i]!,play=env.reduced?0:2240,end=at+play+s.holdMs;
   if(now<end){const serial=`${active.id}-${i}`;if(env.playbackReady!==undefined&&this.lastSerial!==serial&&env.playbackReady!==serial){active.startedAt+=Math.max(0,now-at);at=now;}this.lastSerial=serial;return {id:active.id,kind:active.kind,source:active.source,clip:s.clip,serial:`${active.id}-${i}`,text:s.text,phase:i===active.steps.length-1?'exit':now<at+play?'entry':'hold',startedAt:at,until:at+play+s.holdMs,progress:Math.max(0,Math.min(1,(now-at)/(play+s.holdMs))),holdMs:s.holdMs,fictional:true,...(s.pairedClip?{pairedClip:s.pairedClip}:{}),...(s.pairProp?{pairProp:s.pairProp}:{})};}
   at=end;
  }
  this.active=null;return null;
 }
}
