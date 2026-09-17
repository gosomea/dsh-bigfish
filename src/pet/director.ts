import type {PetBundle, PetAnimation, Role} from './contract.js';
import type {Snapshot} from '../contract/types.js';
import type {IdlePresentation} from '../domain/idle.js';
export interface PetInput {state:Snapshot['state'];tag?:string;richness:number;reduced:boolean;idle?:IdlePresentation|undefined;activity:number;preview?:string;pressure:number;whipHz?:number;reactionActive?:boolean}
export function roleFor(state:Snapshot['state']):Role {
 if(state==='idle'||state==='cancelled'||state==='interrupted')return 'idle';if(state==='completed')return 'success';if(state==='waiting-user')return 'attention';
 if(['failed','blocked','retrying','disconnected','limited','unknown-end'].includes(state))return 'error';return 'working';
}
export const animationDuration = (animation:PetAnimation) => animation.frames.reduce((n,f)=>n+f.durationMs,0);
export const playbackSpeed = (animation:PetAnimation, activity:number) => animation.speed[0]+Math.max(0,Math.min(1,activity))*(animation.speed[1]-animation.speed[0]);

/** Integrates playback speed and switches ordinary motions at cycle boundaries. */
export class PetDirector {
 private current:PetAnimation|undefined;
 private since=0; private last:number|undefined; private playhead=0; private key=''; private policy=''; private role:Role|undefined;
 private completedAt:number|undefined; private pending=''; private pendingAt=0; private recent:string[]=[]; private played=new Map<string,number>();
 constructor(readonly pet:PetBundle,private random=()=>Math.random()){}
 resume(){this.last=undefined;}
 choose(input:PetInput,now:number):{animation:PetAnimation;time:number;still:boolean}{
  const current=this.current, previousTime=this.playhead;
  if(current&&this.last!==undefined&&!input.reactionActive)this.playhead+=Math.max(0,now-this.last)*playbackSpeed(current,input.activity);
  this.last=now;
  const role=roleFor(input.state);
  // near-miss is a synchronized reaction, never a random work animation.
  const normal=this.pet.animations.filter(a=>!a.tags.includes('near-miss'));
  const declared=this.pet.animations.find(a=>a.id===this.pet.manifest.fallbacks[role])!;
  const fallback=normal.find(a=>a.id===declared.id)??normal.find(a=>a.tags.includes(role))??normal.find(a=>a.id===this.pet.manifest.fallbacks.idle)??normal[0]??declared;
  const idleBurst=input.state==='idle'&&input.idle?.active;
  const tag=role==='working'?(input.tag??(input.state==='reasoning'?'thinking':role)):role, quiet=role==='idle'&&!idleBurst, still=input.reduced||normal.length===0;
  let pool=normal.filter(a=>a.intensity<=input.richness&&a.tags.includes(idleBurst?'greeting':tag));
  if(!pool.length)pool=normal.filter(a=>a.intensity<=input.richness&&a.tags.includes(role));
  if(!pool.length||quiet||still)pool=[fallback];
  const explicit=input.preview&&this.pet.animations.find(a=>a.id===input.preview);if(explicit)pool=[explicit];
  const policy=[input.richness,still,input.preview??''].join(':');
  const key=[role,tag,quiet,policy,idleBurst?input.idle?.serial:0].join(':');
  const duration=current?animationDuration(current):1;
  if(current&&!current.loop&&this.playhead>=duration&&this.completedAt===undefined)this.completedAt=now;
  const settled=!current||current.loop||now-(this.completedAt??now)>=2500;
  const boundary=settled&&(!current||(current.loop?Math.floor(previousTime/duration)!==Math.floor(this.playhead/duration):this.playhead>=duration));
  const changed=key!==this.key;
  const immediate=!current||role!==this.role||policy!==this.policy||quiet||Boolean(explicit)||Boolean(idleBurst);
  const rotate=role==='working'&&!quiet&&!still&&!explicit&&now-this.since>=(input.richness===2?12000:18000);
  if(!changed)this.pending='';
  if(changed&&key!==this.pending){this.pending=key;this.pendingAt=now;}
  // A very long author-defined sequence must not hide a new tool indefinitely.
  const overdue=changed&&now-this.pendingAt>=(current?.loop?6000:10000);
  if((changed&&(immediate||(!input.reactionActive&&now-this.since>=4000&&(boundary||overdue))))||(rotate&&boundary&&!input.reactionActive)){
   const available=pool.filter(a=>a.id!==current?.id&&now-(this.played.get(a.id)??-Infinity)>=a.cooldownMs);
   const fresh=available.filter(a=>!this.recent.includes(a.id));
   const candidates=fresh.length?fresh:available;
   let next:PetAnimation;
   if(candidates.length){let r=this.random()*candidates.reduce((n,a)=>n+a.weight,0);next=candidates.find(a=>(r-=a.weight)<=0)??candidates[0]!;}
   else next=pool.find(a=>a.id===current?.id)??pool[0]!;
   // Staying on the same animation never rewinds a gesture or restarts a one-shot.
   if(next.id!==current?.id||(idleBurst&&changed)){this.current=next;this.playhead=0;this.completedAt=undefined;this.since=now;this.played.set(next.id,now);this.recent=[...this.recent.filter(id=>id!==next.id),next.id].slice(-3);}
   this.key=key;this.policy=policy;this.role=role;this.pending='';
  }
  return {animation:this.current!,time:this.playhead,still};
 }
}
export function frameAt(animation:PetAnimation,time:number,activity=0,still=false){
 if(still)return animation.frames[0]!;const total=animationDuration(animation);
 let t=animation.loop?(time*playbackSpeed(animation,activity))%total:Math.min(time*playbackSpeed(animation,activity),total-1);
 for(const f of animation.frames){if(t<f.durationMs)return f;t-=f.durationMs;}return animation.frames.at(-1)!;
}
