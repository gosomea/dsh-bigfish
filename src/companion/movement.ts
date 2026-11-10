import {companionTiming} from './clip-timeline.js';
import {activityCandidates,activityRoute,activityReturnRoute,activityPositionStatus,activityHomeTarget,type ActivityAreaConfig,type ActivityAreaStatus} from './activity-area.js';
export interface Area {x:number; y:number; width:number; height:number}
export interface Point {x:number;y:number}
export const clampPoint = (p: Point, area: Area, size: {width:number;height:number}): Point => ({
  x: Math.max(area.x,Math.min(p.x,area.x+Math.max(0,area.width-size.width))),
  y: Math.max(area.y,Math.min(p.y,area.y+Math.max(0,area.height-size.height))),
});
export type WanderClip='tail-avoid'|'turn'|'start-step'|'walk'|'stop'|'tiptoe'|'edge-peek'|'sit-down'|'wake-up';
export interface WanderFrame {
  phase:Walker['phase'];clip:WanderClip|null;serial:string;mirror:boolean;holdMs:number;moving:boolean;areaStatus?:ActivityAreaStatus;frameMs?:number;arrivedHome?:true;
}
export type WanderMode='horizontal'|'screen';
export interface WanderOptions {
  mode?:WanderMode;
  activityArea?:ActivityAreaConfig;
  enabled:boolean;capable:boolean;radius:number;speed:number;restMin:number;restMax:number;
  /** Defer a fresh outing, but let an already visible ordinary chain finish. */
  blockStart?:boolean;
  /** The visible atlas has decoded. An unpainted walk must never move its window. */
  ready?:boolean;
  failedSerial?:string;
  availableClips?:readonly string[];
  quickRecall?:boolean;
}
/** Screen travel reuses authored left/right walking along a 2D route; it does not claim up/down artwork. */
export function wanderTarget(position:Point,anchor:Point,area:Area,size:{width:number;height:number},o:Pick<WanderOptions,'mode'|'radius'>,random:()=>number):Point {
 if(o.mode!=='screen'){
  const direction=random()<.5?-1:1;let target=clampPoint({x:anchor.x+direction*o.radius,y:position.y},area,size);
  if(Math.abs(target.x-position.x)<1)target=clampPoint({x:anchor.x-direction*o.radius,y:position.y},area,size);return target;
 }
 const width=Math.max(0,area.width-size.width),height=Math.max(0,area.height-size.height),unit=()=>Math.max(0,Math.min(1,random()));
 let target={x:area.x+width*unit(),y:area.y+height*unit()};
 if(width>=16&&Math.abs(target.x-position.x)<width*.1)target.x=position.x<area.x+width/2?area.x+width:area.x;
 if(height>=16&&Math.abs(target.y-position.y)<height*.1)target.y=position.y<area.y+height/2?area.y+height:area.y;
 if(Math.hypot(target.x-position.x,target.y-position.y)<16)target={x:position.x<area.x+width/2?area.x+width:area.x,y:position.y<area.y+height/2?area.y+height:area.y};
 return target;
}
const routeGeometry=(area:Area,size:{width:number;height:number},mode:WanderMode='horizontal',activityArea?:ActivityAreaConfig)=>[area.x,area.y,area.width,area.height,size.width,size.height,mode,JSON.stringify(activityArea??null)].join(':');
function safeWanderRoute(position:Point,anchor:Point,area:Area,size:{width:number;height:number},o:Pick<WanderOptions,'mode'|'radius'|'activityArea'>,random:()=>number):Point[]|null {
 const target=wanderTarget(position,anchor,area,size,o,random),direct=activityRoute(position,target,area,size,o.activityArea);if(direct)return direct;
 const candidates=activityCandidates(area,size,o.activityArea).filter(p=>Math.hypot(p.x-position.x,p.y-position.y)>=16&&(o.mode==='screen'||Math.abs(p.x-anchor.x)<=o.radius+.01));
 candidates.sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y));
 for(const p of candidates){const route=activityRoute(position,p,area,size,o.activityArea);if(route)return route;}return null;
}
function stepToward(position:Point,target:Point,speed:number,dt:number):boolean {
 const dx=target.x-position.x,dy=target.y-position.y,distance=Math.hypot(dx,dy);
 if(distance<.5){position.x=target.x;position.y=target.y;return true;}
 const step=Math.min(distance,Math.max(4,speed*Math.min(1,distance/30))*dt/1000);position.x+=dx/distance*step;position.y+=dy/distance*step;
 if(distance-step<.5){position.x=target.x;position.y=target.y;return true;}return false;
}
const recallSpeedFactor=companionTiming.walkLoopMs/companionTiming.recallWalkMs;
const recallPauseMs=3000;
/** Locomotion is an authored chain. Only its walk loop translates the actor. */
export class WanderDirector {
  position:Point;anchor:Point;
  private clip:WanderClip|null=null;
  private direction:-1|1=-1;
  private facing:-1|1=-1;
  private serial=0;
  private elapsed=0;
  private last:number|undefined;
  private next:number|undefined;
  private target:Point={x:0,y:0};
  private geometry:string|undefined;private areaPolicy:string|undefined;
  private edge=false;
  private path:Point[]=[];private recallTarget:Point|null=null;areaStatus:ActivityAreaStatus='';
  private route:WanderClip[]=[];
  private frameMs:number|undefined;
  constructor(start:Point,private random=Math.random){this.position={...start};this.anchor={...start};}
  place(p:Point,area:Area,size:{width:number;height:number},now:number):void {
    this.position=clampPoint(p,area,size);this.anchor={...this.position};this.recallTarget=null;this.areaStatus='';this.cancel(now,15000);
  }
  requestRecall(target:Point,now:number):void {this.cancel(now,0);this.recallTarget={...target};this.areaStatus='returning';}
  cancelRecall(now:number):boolean {
    if(!this.recallTarget)return false;
    this.recallTarget=null;this.areaStatus='';
    this.cancel(now,recallPauseMs);return true;
  }
  snapshot():WanderFrame {
    const holdMs=this.clip==='sit-down'?6000:this.clip==='edge-peek'||this.clip==='stop'&&this.frameMs===undefined?3000:0;
    return {phase:this.clip==='walk'?(this.direction<0?'walk-left':'walk-right'):this.clip?'stop':'rest',
      clip:this.clip,serial:`wander-${this.serial}`,mirror:this.direction>0,
      holdMs,moving:this.clip==='walk',areaStatus:this.areaStatus,
      ...(this.frameMs===undefined?{}:{frameMs:this.frameMs})};
  }
  tick(now:number,area:Area,size:{width:number;height:number},o:WanderOptions):WanderFrame {
    const dt=this.last===undefined?0:Math.max(0,Math.min(100,now-this.last));this.last=now;
    const geometry=routeGeometry(area,size,o.mode,o.activityArea),changed=this.geometry!==undefined&&this.geometry!==geometry;this.geometry=geometry;const policy=JSON.stringify([o.mode,o.activityArea??null]),policyChanged=this.areaPolicy!==undefined&&this.areaPolicy!==policy;this.areaPolicy=policy;
    if(this.clip&&o.failedSerial===this.snapshot().serial){
      this.cancel(now,15000);
      this.recallTarget=null;
      this.areaStatus='playback-failed';
      return this.snapshot();
    }
    const before=this.position;this.position=clampPoint(this.position,area,size);this.anchor=clampPoint(this.anchor,area,size);
    if(changed){const returning=!policyChanged?this.recallTarget:null;this.place(this.position,area,size,now);this.areaStatus=activityPositionStatus(this.position,area,size,o.activityArea);if(returning){const target=(o.activityArea?activityHomeTarget(o.activityArea,area,size):null)??clampPoint(returning,area,size);if(!this.areaStatus||activityReturnRoute(this.position,target,area,size,o.activityArea))this.requestRecall(target,now);}return this.snapshot();}
    const blocked=activityPositionStatus(this.position,area,size,o.activityArea);if(blocked&&(!this.recallTarget||!activityReturnRoute(this.position,this.recallTarget,area,size,o.activityArea))){this.cancel(now,o.restMin*1000);this.recallTarget=null;this.areaStatus=blocked;return this.snapshot();}
    if(!o.enabled||!o.capable||!this.can('walk',o)){this.cancel(now,o.restMin*1000);this.recallTarget=null;if(this.areaStatus==='returning')this.areaStatus='';return this.snapshot();}
    if(this.clip&&!this.can(this.clip,o)){this.cancel(now,o.restMin*1000);return this.snapshot();}
    if(before.x!==this.position.x||before.y!==this.position.y){this.cancel(now,o.restMin*1000);return this.snapshot();}
    if(this.next===undefined)this.next=now+this.rest(o);
    const quickReturn=o.quickRecall&&this.recallTarget!==null;
    if(!this.clip){
      if(now<this.next||o.blockStart)return this.snapshot();
      const path=this.recallTarget?activityReturnRoute(this.position,this.recallTarget,area,size,o.activityArea):safeWanderRoute(this.position,this.anchor,area,size,o,this.random);
      if(!path){this.areaStatus=this.recallTarget?'home-blocked':'unreachable';this.recallTarget=null;this.next=now+this.rest(o);return this.snapshot();}
      this.path=path;this.target=this.path.shift()!;this.areaStatus=this.recallTarget?'returning':'';
      if(Math.hypot(this.target.x-this.position.x,this.target.y-this.position.y)<1){
        if(quickReturn)return this.finishRecall(now,this.rest(o));
        this.recallTarget=null;this.areaStatus='';this.next=now+this.rest(o);return this.snapshot();
      }
      this.direction=this.target.x===this.position.x?this.facing:this.target.x<this.position.x?-1:1;
      const maxX=area.x+Math.max(0,area.width-size.width),maxY=area.y+Math.max(0,area.height-size.height);
      this.edge=Math.abs(this.target.x-area.x)<1||Math.abs(this.target.x-maxX)<1||o.mode==='screen'&&(Math.abs(this.target.y-area.y)<1||Math.abs(this.target.y-maxY)<1);
      // A tail near the outward edge gets tucked before changing direction.
      const tailAtEdge=this.facing<0?this.position.x+size.width>=area.x+area.width-18:this.position.x<=area.x+18;
      const approach:WanderClip[]=quickReturn?['start-step','walk']:
        [...(tailAtEdge?['tail-avoid' as const]:[]),...(this.direction!==this.facing?['turn' as const]:[]),'start-step','walk'];
      this.route=approach.filter(id=>this.can(id,o));
      const first=this.route.shift()!;
      this.begin(first,quickReturn?(first==='walk'?companionTiming.recallWalkMs/8:companionTiming.recallFrameMs):undefined);return this.snapshot();
    }
    if(o.ready===false)return this.snapshot();
    this.elapsed+=dt;
    if(this.clip==='walk'){
      const loopMs=quickReturn?companionTiming.recallWalkMs:companionTiming.walkLoopMs;
      const arrived=stepToward(this.position,this.target,o.speed*(quickReturn?recallSpeedFactor:1),dt);
      // Finish at a planted-foot boundary. Only autonomous outings use the route cap.
      if(arrived&&this.path.length&&this.elapsed%loopMs<dt){
        this.target=this.path.shift()!;const nextDirection=this.target.x===this.position.x?this.direction:this.target.x<this.position.x?-1:1;
        if(nextDirection!==this.direction){this.direction=nextDirection;if(quickReturn)this.begin('walk',loopMs/8);else{this.route=(['turn','start-step','walk'] as WanderClip[]).filter(id=>this.can(id,o));this.begin(this.route.shift()!);}}return this.snapshot();
      }
      if((arrived||!quickReturn&&this.elapsed>=(o.mode==='screen'?Math.floor(6000/loopMs)*loopMs:6000))&&this.elapsed%loopMs<dt){
        this.path=[];
        if(arrived&&!quickReturn){this.recallTarget=null;this.areaStatus='';}
        this.facing=this.direction;
        const finish:WanderClip[]=quickReturn?['stop']:['stop',...(this.edge&&arrived?['tiptoe' as const,'edge-peek' as const,'tail-avoid' as const]:[]),'sit-down','wake-up'];
        this.route=finish.filter(id=>this.can(id,o));
        const next=this.route.shift();
        if(next)this.begin(next,quickReturn?companionTiming.recallFrameMs:undefined);
        else if(quickReturn)return this.finishRecall(now,this.rest(o));
        else this.cancel(now,this.rest(o));
      }
    }else if(this.elapsed>=(this.frameMs===undefined?companionTiming.oneShotMs:8*this.frameMs)+this.snapshot().holdMs){
      const next=this.route.shift();if(next)this.begin(next,quickReturn&&next==='walk'?companionTiming.recallWalkMs/8:undefined);else{
        if(quickReturn)return this.finishRecall(now,this.rest(o));
        this.clip=null;this.frameMs=undefined;this.next=this.recallTarget?now:now+this.rest(o);this.elapsed=0;
      }
    }
    return this.snapshot();
  }
  private begin(clip:WanderClip,frameMs?:number):void {this.clip=clip;this.frameMs=frameMs;this.elapsed=0;this.serial++;}
  private finishRecall(now:number,restMs:number):WanderFrame {
    this.recallTarget=null;this.areaStatus='';this.cancel(now,restMs);
    return {...this.snapshot(),arrivedHome:true};
  }
  private can(clip:WanderClip,o:WanderOptions):boolean{return !o.availableClips||o.availableClips.includes(clip);}
  private rest(o:Pick<WanderOptions,'restMin'|'restMax'>):number{return (o.restMin+this.random()*(o.restMax-o.restMin))*1000;}
  private cancel(now:number,delay:number):void{if(this.clip)this.serial++;this.clip=null;this.frameMs=undefined;this.route=[];this.path=[];this.elapsed=0;this.last=now;this.next=now+delay;}
}
/** DIP coordinates shared by browser and Electron. Animation capability is a precondition to motion. */
export class Walker {
  position: Point; anchor: Point; phase: 'rest'|'walk-left'|'walk-right'|'stop' = 'rest';
  arrivedHome=false;
  private next = 0; private last = 0; private target:Point={x:0,y:0}; private until = 0; private geometry:string|undefined;private areaPolicy:string|undefined;private path:Point[]=[];private recallTarget:Point|null=null;areaStatus:ActivityAreaStatus='';
  constructor(start: Point, private random = Math.random) { this.position={...start}; this.anchor={...start}; }
  recall(area: Area, size: {width:number;height:number}, now: number) { this.requestRecall(clampPoint(this.anchor,area,size),now); }
  requestRecall(target:Point,now:number){this.phase='rest';this.path=[];this.recallTarget={...target};this.next=now;this.last=now;this.areaStatus='returning';}
  cancelRecall(now:number):boolean {
    if(!this.recallTarget)return false;
    this.phase='rest';this.path=[];this.recallTarget=null;this.areaStatus='';
    this.next=now+recallPauseMs;this.last=now;return true;
  }
  place(p:Point, area:Area, size:{width:number;height:number}, now:number) {
    this.position=clampPoint(p,area,size); this.anchor={...this.position}; this.phase='rest'; this.next=now+15000; this.last=now;this.path=[];this.recallTarget=null;this.areaStatus='';
  }
  tick(now:number, area:Area, size:{width:number;height:number}, options:Pick<WanderOptions,'enabled'|'capable'|'radius'|'speed'|'restMin'|'restMax'|'mode'|'activityArea'|'quickRecall'>):Point {
    this.arrivedHome=false;
    const geometry=routeGeometry(area,size,options.mode,options.activityArea),changed=this.geometry!==undefined&&this.geometry!==geometry;this.geometry=geometry;const policy=JSON.stringify([options.mode,options.activityArea??null]),policyChanged=this.areaPolicy!==undefined&&this.areaPolicy!==policy;this.areaPolicy=policy;
    this.position=clampPoint(this.position,area,size); this.anchor=clampPoint(this.anchor,area,size);
    if(changed){const returning=!policyChanged?this.recallTarget:null;this.place(this.position,area,size,now);this.areaStatus=activityPositionStatus(this.position,area,size,options.activityArea);if(returning){const target=(options.activityArea?activityHomeTarget(options.activityArea,area,size):null)??clampPoint(returning,area,size);if(!this.areaStatus||activityReturnRoute(this.position,target,area,size,options.activityArea))this.requestRecall(target,now);}return {...this.position};}
    const blocked=activityPositionStatus(this.position,area,size,options.activityArea);if(blocked&&(!this.recallTarget||!activityReturnRoute(this.position,this.recallTarget,area,size,options.activityArea))){this.phase='rest';this.path=[];this.recallTarget=null;this.areaStatus=blocked;return {...this.position};}
    const dt=Math.max(0,Math.min(64,now-this.last))/1000; this.last=now;
    if (!options.enabled || !options.capable) { this.phase='rest';this.path=[];this.recallTarget=null;if(this.areaStatus==='returning')this.areaStatus=''; this.next=now+options.restMin*1000; return this.position; }
    if (!this.next) this.next=now+(options.restMin+this.random()*(options.restMax-options.restMin))*1000;
    const quickReturn=options.quickRecall&&this.recallTarget!==null;
    if(this.phase==='rest' && now>=this.next){
      const path=this.recallTarget?activityReturnRoute(this.position,this.recallTarget,area,size,options.activityArea):safeWanderRoute(this.position,this.anchor,area,size,options,this.random);if(!path){this.areaStatus=this.recallTarget?'home-blocked':'unreachable';this.recallTarget=null;this.next=now+options.restMin*1000;return {...this.position};}this.path=path;this.target=this.path.shift()!;this.areaStatus=this.recallTarget?'returning':'';
      if(Math.hypot(this.target.x-this.position.x,this.target.y-this.position.y)<1){this.arrivedHome=!!quickReturn;this.recallTarget=null;this.areaStatus='';this.next=now+options.restMin*1000;return {...this.position};}
      this.phase=this.target.x<this.position.x?'walk-left':'walk-right'; this.until=now+3000+this.random()*3000;
    }
    if(this.phase==='walk-left'||this.phase==='walk-right'){
      const arrived=stepToward(this.position,this.target,options.speed*(quickReturn?recallSpeedFactor:1),dt*1000);
      if(arrived&&this.path.length){this.target=this.path.shift()!;this.phase=this.target.x<this.position.x?'walk-left':'walk-right';}
      else if(arrived||(!quickReturn&&now>=this.until)){this.path=[];if(arrived&&!quickReturn){this.recallTarget=null;this.areaStatus='';}this.phase='stop';this.until=now+5600+this.random()*800;}
    } else if(this.phase==='stop'&&now>=this.until){
      if(quickReturn){this.arrivedHome=true;this.recallTarget=null;this.areaStatus='';}
      this.phase='rest';this.next=this.recallTarget?now:now+(options.restMin+this.random()*(options.restMax-options.restMin))*1000;
    }
    return {...this.position};
  }
}
