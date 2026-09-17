import type {Preferences} from '../contract/preferences.js';
import {defaultLines,parseLines} from '../contract/dialogue.js';
export interface IdleMemory { greeted: boolean; nextAt: number; lastMotion: number; lastLine: number; nonSignStreak?:number; lastMotionId?:string }
export interface IdlePresentation { active: boolean; showText: boolean; motion: string; text: string; serial: number }
const resting: IdlePresentation = {active:false,showText:false,motion:'breathe',text:'',serial:0};
const isSign=(motion:string)=>motion==='wait-sign'||motion.startsWith('sign-');
/** Movement has time to finish even when the short speech bubble has disappeared. */
export class IdleDirector {
 private until=0; private textUntil=0; private serial=0; private motion='breathe'; private text=''; private previousMode=''; private wasIdle=false; private wasVisible=true;
 readonly memory: IdleMemory;
 constructor(memory?: Partial<IdleMemory>, private random=()=>Math.random()) {
  this.memory={greeted:memory?.greeted===true,nextAt:Number.isFinite(memory?.nextAt)?memory!.nextAt!:0,lastMotion:Number.isInteger(memory?.lastMotion)?memory!.lastMotion!:-1,lastLine:Number.isInteger(memory?.lastLine)?memory!.lastLine!:-1,nonSignStreak:memory?.nonSignStreak===1?1:0,lastMotionId:typeof memory?.lastMotionId==='string'?memory.lastMotionId:''};
 }
 private schedule(now:number,p:Preferences){this.memory.nextAt=now+(p.idleMode==='occasional'?120000+this.random()*180000:20000+this.random()*20000);}
 tick(now:number,idle:boolean,visible:boolean,p:Preferences,reduced=false,roleLines?:string[]):IdlePresentation {
  if(!idle||!visible){if(this.wasIdle||this.wasVisible!==visible||!this.memory.greeted)this.schedule(now,p);this.until=this.textUntil=0;this.wasIdle=false;this.wasVisible=visible;this.memory.greeted=true;return resting;}
  if(!this.wasVisible||this.previousMode!==p.idleMode||!this.wasIdle){this.until=this.textUntil=0;this.schedule(now,p);}
  this.wasVisible=true;this.wasIdle=true;this.previousMode=p.idleMode;
  const first=!this.memory.greeted;this.memory.greeted=true;
  if((first&&p.greetOnOpen)||(p.idleMode!=='quiet'&&now>=this.memory.nextAt)){
   const lines=parseLines(p.dialogueJson).idle??roleLines??defaultLines.idle;
   const lineChoices=lines.map((_,i)=>i).filter(i=>i!==this.memory.lastLine);
   const line=p.idleRandomText?(lineChoices[Math.floor(this.random()*lineChoices.length)]??0):0;
   this.text=lines[line]??'';this.memory.lastLine=line;
   const motions=p.richness===0?['wait-sign']:p.richness===1?['wait-sign','tea','stretch','tail-wag','sign-tail']:['wait-sign','sign-overhead','sign-peek','sign-tail','sign-bounce','wave','peek','stretch','tea'];
   // An empty dialogue disables speech, not animation; don't show an empty sign.
   const pool=this.text?motions:motions.filter(m=>!isSign(m));
   const required=(this.memory.nonSignStreak??0)>=1&&this.text?pool.filter(isSign):pool;
   const choices=required.filter(m=>m!==this.memory.lastMotionId);
   this.motion=first&&this.text?'wait-sign':(choices[Math.floor(this.random()*choices.length)]??required[0]??'breathe');
   this.memory.lastMotionId=this.motion;this.memory.lastMotion=motions.indexOf(this.motion);this.memory.nonSignStreak=isSign(this.motion)?0:1;
   this.until=now+(p.idleMode==='quiet'?5000:12000);this.textUntil=now+6000;this.serial++;this.schedule(now,p);
  }
  return {active:now<this.until&&!reduced,showText:now<this.textUntil&&Boolean(this.text),motion:now<this.until&&!reduced?this.motion:'breathe',text:this.text,serial:this.serial};
 }
}
