/** Ordinary tool poses are readable; urgent/non-tool states interrupt immediately. */
export class WorkMotion {
 private current='';private since=0;private pending='';private pendingAt=0;
 choose(toolRunning:boolean,target:string,now:number,cycleReady:boolean){
  if(!toolRunning){this.current=this.pending='';return '';}
  if(!this.current){this.current=target;this.since=now;}
  if(target===this.current){this.pending='';return this.current;}
  if(target!==this.pending){this.pending=target;this.pendingAt=now;}
  if(now-this.since>=4000&&(cycleReady||now-this.pendingAt>=6000)){this.current=target;this.since=now;this.pending='';}
  return this.current;
 }
}
