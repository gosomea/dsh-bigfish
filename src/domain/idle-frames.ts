/** Stretch the held middle pose, preserving the authored entrance AND exit. */
export function idleSignFrame(elapsedSeconds:number,fps:number,count:number,displaySeconds:number):number {
  const holdIndex=Math.min(count-1,Math.floor(count/3));
  const holdAt=holdIndex/fps,extra=Math.max(0,displaySeconds-count/fps);
  const sourceTime=elapsedSeconds<holdAt?elapsedSeconds:elapsedSeconds<holdAt+extra?holdAt:elapsedSeconds-extra;
  return Math.max(0,Math.min(count-1,Math.floor((sourceTime+1e-8)*fps)));
}
