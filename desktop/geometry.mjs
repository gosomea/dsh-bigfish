/** Electron screen coordinates are DIPs; never multiply them by display.scaleFactor. */
export function reconcileBounds(bounds,displays){
 if(!displays.length)throw Error('没有可用显示器');
 const overlap=a=>Math.max(0,Math.min(bounds.x+bounds.width,a.x+a.width)-Math.max(bounds.x,a.x))*Math.max(0,Math.min(bounds.y+bounds.height,a.y+a.height)-Math.max(bounds.y,a.y));
 const distance=a=>(bounds.x+bounds.width/2-a.x-a.width/2)**2+(bounds.y+bounds.height/2-a.y-a.height/2)**2;
 const selected=[...displays].sort((a,b)=>overlap(b.workArea)-overlap(a.workArea)||distance(a.workArea)-distance(b.workArea))[0],area=selected.workArea;
 const width=Math.min(bounds.width,area.width),height=Math.min(bounds.height,area.height);
 return {x:Math.round(Math.max(area.x,Math.min(bounds.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))),width:Math.round(width),height:Math.round(height)};
}
/** Preserve a settled right/bottom edge while appearance changes; all values remain DIPs. */
export function appearanceBounds(bounds,area,size){
 const width=Math.min(area.width,Math.ceil(340*size/180)+32),height=Math.min(area.height,Math.ceil(250*size/180)+260);
 return reconcileBounds({x:bounds.x+bounds.width-width,y:bounds.y+bounds.height-height,width,height},[{workArea:area}]);
}
export function recallBounds(size,area){return reconcileBounds({x:area.x+area.width-size.width,y:area.y+area.height-size.height,width:size.width,height:size.height},[{workArea:area}]);}
/** Seed locomotion from the intended placement, not a possibly transitional native read after setBounds. */
export function placeWindowBounds(window,walker,requested,displays,now){
 const bounds=reconcileBounds(requested,displays);
 const area=displays.find(display=>{const a=display.workArea;return bounds.x>=a.x&&bounds.y>=a.y&&bounds.x+bounds.width<=a.x+a.width&&bounds.y+bounds.height<=a.y+a.height;})?.workArea;
 if(!area)throw Error('宠物窗口无法放入显示器工作区');
 window.setBounds(bounds,false);walker?.place({x:bounds.x,y:bounds.y},area,bounds,now);return bounds;
}
export function nearWindowEdge(pet,windows){const foot={x:pet.x+pet.width/2,y:pet.y+pet.height-75};return windows.some(w=>foot.x>w.x&&foot.x<w.x+w.width&&Math.abs(foot.y-w.y)<35);}
export function motionChanged(before,after){return !before||['phase','clip','serial','mirror','holdMs'].some(key=>before[key]!==after[key]);}
/** Explicitly enabled cross-screen walking keeps its authored walk pose and bounded frame delta after wake. */
export class CrossScreenTravel {
 active=false;position=null;target=null;motion='rest';last=0;clip=null;elapsed=0;serial=0;mirror=false;available=null;
 start(bounds,display,now,available){this.available=available??null;if(this.available&&!this.available.includes('walk')){this.cancel();return;}const a=display.workArea;this.position={x:bounds.x,y:bounds.y};this.target={x:a.x+Math.max(0,a.width-bounds.width)*.6,y:a.y+Math.max(0,a.height-bounds.height)};this.active=true;this.last=now;this.mirror=this.target.x>=bounds.x;this.begin(this.has('turn')?'turn':this.has('start-step')?'start-step':'walk');}
 has(clip){return !this.available||this.available.includes(clip);}
 begin(clip){this.clip=clip;this.elapsed=0;this.serial++;this.motion=clip==='walk'?(this.mirror?'walk-right':'walk-left'):'stop';}
 snapshot(){return {phase:this.active?this.motion:'rest',clip:this.active?this.clip:null,serial:'travel-'+this.serial,mirror:this.mirror,holdMs:this.clip==='stop'?3000:0,moving:this.clip==='walk'};}
 tick(now,speed,ready=true){if(!this.active)return this.position;const dt=Math.max(0,Math.min(64,now-this.last));this.last=now;if(!ready)return this.position;this.elapsed+=dt;
  if(this.clip==='walk'){const dx=this.target.x-this.position.x,dy=this.target.y-this.position.y,distance=Math.hypot(dx,dy),step=Math.min(distance,speed*dt/1000);if(distance<1){this.position={...this.target};if(this.has('stop'))this.begin('stop');else this.cancel();return this.position;}this.position={x:this.position.x+dx/distance*step,y:this.position.y+dy/distance*step};}
  else if(this.elapsed>=2240+(this.clip==='stop'?3000:0)){if(this.clip==='turn')this.begin(this.has('start-step')?'start-step':'walk');else if(this.clip==='start-step')this.begin('walk');else{this.active=false;this.clip=null;this.motion='rest';}}
  return this.position;}
 cancel(){this.active=false;this.clip=null;this.motion='rest';this.serial++;}
}
