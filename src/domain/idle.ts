import type {Preferences} from '../contract/preferences.js';
import {defaultLines,parseLines} from '../contract/dialogue.js';
export interface IdleMemory { greeted: boolean; nextAt: number; lastMotion: number; lastLine: number }
export interface IdlePresentation { active: boolean; showText: boolean; motion: string; text: string; serial: number }
const resting: IdlePresentation = {active:false,showText:false,motion:'breathe',text:'',serial:0};
/** A single budget for idle speech and signs; no queued interactions after hidden time. */
export class IdleDirector {
 private until=0; private textUntil=0; private serial=0; private motion='breathe'; private text=''; private previousMode=''; private wasIdle=false; private wasVisible=true;
 readonly memory: IdleMemory;
 constructor(memory?: Partial<IdleMemory>, private random=()=>Math.random()) {
  this.memory={greeted:memory?.greeted===true,nextAt:Number.isFinite(memory?.nextAt)?memory!.nextAt!:0,lastMotion:Number.isInteger(memory?.lastMotion)?memory!.lastMotion!:-1,lastLine:Number.isInteger(memory?.lastLine)?memory!.lastLine!:-1};
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
   const choices=motions.map((_,i)=>i).filter(i=>i!==this.memory.lastMotion);const index=first?0:(choices[Math.floor(this.random()*choices.length)]??0);
   this.memory.lastMotion=index;this.motion=this.text?motions[index]!:'breathe';
   this.until=now+(first?5000:6000);this.textUntil=now+(first?8000:6000);this.serial++;this.schedule(now,p);
  }
  if(p.idleMode==='quiet'&&!first&&now>=this.textUntil)this.until=0;
  return {active:now<this.until&&!reduced,showText:now<this.textUntil,motion:now<this.until&&!reduced?this.motion:'breathe',text:this.text,serial:this.serial};
 }
}
