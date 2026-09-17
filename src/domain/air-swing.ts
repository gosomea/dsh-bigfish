/** A complete air swing followed by a readable, rope-free recovery pose. */
export class AirSwing {
 private phase=0; private cycle=0; private running=false; private eligibleFor=0; private sinceStart=Infinity; private retreat=0; private duration=1.1; private hold=0;
 reset(){this.phase=0;this.cycle=0;this.running=false;this.eligibleFor=0;this.sinceStart=Infinity;this.retreat=0;this.hold=0;}
 tick(dt:number,hz:number,mayStart:boolean,working:boolean,hardStop=false){
  dt=Math.max(0,Math.min(.1,dt));if(hardStop){this.reset();return this.result();}
  this.sinceStart+=dt;this.eligibleFor=mayStart?this.eligibleFor+dt:0;
  if(this.hold>0){
   if(!working){this.hold=0;this.phase=0;this.cycle++;}
   else {this.hold=Math.max(0,this.hold-dt);if(this.hold===0){this.phase=0;this.cycle++;}if(this.hold>0)return this.result();}
  }
  if(this.running&&!working){this.retreat+=dt;this.phase=Math.min(1,this.phase+dt*3);if(this.retreat>=.24){this.running=false;this.cycle++;this.phase=0;}}
  else if(this.running){this.retreat=0;this.phase+=dt/this.duration;if(this.phase>=1){this.running=false;this.phase=.999999;this.hold=2.5;}}
  if(!this.running&&this.hold===0&&working&&this.eligibleFor>=.2&&hz>.01&&this.sinceStart>=1/hz){this.running=true;this.phase=0;this.retreat=0;this.sinceStart=0;this.duration=Math.max(.95,Math.min(1.35,1/hz));}
  return this.result();
 }
 private result(){return {cycles:this.cycle+Math.min(.999999,this.phase),visible:this.running,responding:(this.running&&this.retreat===0)||this.hold>0,holding:this.hold>0,opacity:this.running?1-this.retreat/.24:0};}
}
