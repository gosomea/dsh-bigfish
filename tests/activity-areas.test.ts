import test from 'node:test';
import assert from 'node:assert/strict';
import {activityAreaDefaults,decodeActivityArea,decodeActivityAreaRecord,activityPointSafe,activityRoute,activityReturnRoute,activityCandidates,activitySegmentSafe,activityHomePoint,activityHomeTarget,activityDefaultHomeTarget,activityPositionStatus,activityAreaMessage} from '../src/companion/activity-area.js';
import {WanderDirector,Walker,type WanderOptions} from '../src/companion/movement.js';
const area={x:0,y:0,width:1000,height:500},size={width:80,height:100};
const constrained=()=>({...activityAreaDefaults(),enabled:true,forbidden:[{x:.4,y:.2,width:.2,height:.6}]});
const options:WanderOptions={mode:'screen',enabled:true,capable:true,radius:100,speed:120,restMin:1,restMax:1,ready:true};

test('device regions validate strictly, and existing malformed records fail closed until explicitly replaced',()=>{
 assert.deepEqual(decodeActivityArea(activityAreaDefaults()),activityAreaDefaults());
 assert.equal(decodeActivityAreaRecord(null).invalid,false);
 for(const raw of ['{','null','{}',JSON.stringify({revision:-1,config:activityAreaDefaults()}),JSON.stringify({revision:0,config:{...activityAreaDefaults(),home:{x:Infinity,y:0}}})]){
  const stored=decodeActivityAreaRecord(raw);assert.equal(stored.invalid,true);assert.equal(activityPositionStatus({x:100,y:100},area,size,stored.config),'no-space');
 }
 const valid=decodeActivityAreaRecord(JSON.stringify({revision:4,config:constrained()}));assert.equal(valid.invalid,false);assert.equal(valid.revision,4);
 for(const patch of [{forbidden:Array(9).fill({x:0,y:0,width:.1,height:.1})},{allowed:{x:.9,y:0,width:.2,height:1}},{forbidden:[{x:0,y:0,width:0,height:1}]},{home:{x:1.1,y:.5}},{consent:true}])assert.throws(()=>decodeActivityArea({...activityAreaDefaults(),...patch}));
});
test('visibility routes protect the entire pet footprint and route around obstacles rather than tunneling through',()=>{
 const config=constrained(),start={x:50,y:150},end={x:800,y:150};
 assert.equal(activitySegmentSafe(start,end,area,size,config),false);const path=activityRoute(start,end,area,size,config);assert.ok(path&&path.length>1);
 let previous=start;for(const p of path){assert.ok(activitySegmentSafe(previous,p,area,size,config));for(let t=0;t<=1;t+=.01)assert.ok(activityPointSafe({x:previous.x+(p.x-previous.x)*t,y:previous.y+(p.y-previous.y)*t},area,size,config));previous=p;}
 assert.deepEqual(previous,end);
 const wall={...config,forbidden:[{x:.4,y:0,width:.2,height:1}]};assert.equal(activityRoute(start,end,area,size,wall),null);
 assert.equal(activityRoute({x:390,y:150},end,area,size,config),null);
});
test('allowed areas account for actor size, screen changes use normalized DIPs, and the saved home is the actor center',()=>{
 const config={...activityAreaDefaults(),enabled:true,allowed:{x:.1,y:.1,width:.6,height:.7}};
 assert.equal(activityPointSafe({x:100,y:50},area,size,config),true);assert.equal(activityPointSafe({x:650,y:100},area,size,config),false);
 assert.equal(activityPositionStatus({x:100,y:50},area,{width:800,height:100},config),'no-space');
 const negative={x:-1920,y:25,width:1920,height:1055},position={x:-1200,y:400},home=activityHomePoint(position,negative,size);
 assert.deepEqual(activityHomeTarget({...config,home},negative,size),position);
 const grown={width:160,height:200},target=activityHomeTarget({...config,home},negative,grown)!;assert.equal(target.x+grown.width/2,position.x+size.width/2);assert.equal(target.y+grown.height/2,position.y+size.height/2);
 assert.deepEqual(activityHomeTarget({...config,home:{x:.2,y:.3}},area,size),{x:160,y:100});
});
test('the default home is the safe lower-right allowed point, with nearest-safe fallback and no silent custom-home change',()=>{
 const config={...activityAreaDefaults(),enabled:true,allowed:{x:.1,y:.1,width:.6,height:.7}};
 assert.deepEqual(activityDefaultHomeTarget(config,area,size),{x:620,y:299});
 const custom={...config,home:{x:.2,y:.3}};assert.deepEqual(activityDefaultHomeTarget(custom,area,size),activityHomeTarget(custom,area,size));
 const blocked={...activityAreaDefaults(),enabled:true,forbidden:[{x:.8,y:.7,width:.2,height:.3}]},corner={x:920,y:400};
 assert.equal(activityPointSafe(corner,area,size,blocked),false);
 const expected=activityCandidates(area,size,blocked).sort((a,b)=>Math.hypot(a.x-corner.x,a.y-corner.y)-Math.hypot(b.x-corner.x,b.y-corner.y))[0]!;
 assert.deepEqual(activityDefaultHomeTarget(blocked,area,size),expected);assert.ok(activityPointSafe(expected,area,size,blocked));
 assert.equal(activityDefaultHomeTarget({...activityAreaDefaults(),enabled:true,forbidden:[{x:0,y:0,width:1,height:1}]},area,size),null);
 assert.equal(activityAreaMessage('queued'),'已记下回家请求，关闭设置并等当前任务结束后走。');
});
test('an explicit home on the right or bottom edge uses the same fractional bounds as the viewport',()=>{
 const viewport={x:8,y:8,width:1497,height:765};
 const footprint={width:226.6,height:214.4};
 const start={x:1000,y:100};
 for(const home of [{x:.99,y:.5},{x:.65,y:1},{x:1,y:1}]){
  const config={...activityAreaDefaults(),home};
  const target=activityDefaultHomeTarget(config,viewport,footprint)!;
  assert.deepEqual(activityReturnRoute(start,target,viewport,footprint,config),[target]);
  assert.ok(target.x+footprint.width<=viewport.x+viewport.width+.001);
  assert.ok(target.y+footprint.height<=viewport.y+viewport.height+.001);
 }
 const wall={...activityAreaDefaults(),enabled:true,home:{x:1,y:1},forbidden:[{x:.7,y:0,width:.05,height:1}]};
 assert.equal(activityReturnRoute({x:80,y:200},activityDefaultHomeTarget(wall,viewport,footprint)!,viewport,footprint,wall),null);
});
test('a failed current movement clip releases the route without moving and an old failure cannot cancel a retry',()=>{
 const start={x:100,y:100},target={x:300,y:100};
 const director=new WanderDirector(start,()=>0);
 director.tick(0,area,size,options);
 director.requestRecall(target,100);
 const first=director.tick(100,area,size,options);
 const failure=director.tick(150,area,size,{...options,ready:false,failedSerial:first.serial});
 assert.equal(failure.phase,'rest');
 assert.equal(failure.areaStatus,'playback-failed');
 assert.deepEqual(director.position,start);
 director.requestRecall(target,200);
 const next=director.tick(200,area,size,{...options,failedSerial:first.serial});
 assert.notEqual(next.serial,first.serial);
 assert.equal(next.areaStatus,'returning');
});
test('both directors walk a requested safe route home and never move during authored preparation or through a forbidden rectangle',()=>{
 const config=constrained(),start={x:50,y:150},home={x:800,y:150};
 for(const kind of ['builtin','external'] as const){const d=kind==='builtin'?new WanderDirector(start,()=>0):new Walker(start,()=>0);d.tick(0,area,size,{...options,activityArea:config});d.requestRecall(home,40);let reached=false,before={...d.position};
  for(let now=40;now<=180000;now+=40){const previous=kind==='builtin'?(d as WanderDirector).snapshot().moving:(d as Walker).phase.startsWith('walk');d.tick(now,area,size,{...options,activityArea:config});if(kind==='builtin'&&!previous)assert.deepEqual(d.position,before);assert.ok(activityPointSafe(d.position,area,size,config));assert.ok(activitySegmentSafe(before,d.position,area,size,config));before={...d.position};if(Math.hypot(d.position.x-home.x,d.position.y-home.y)<1){reached=true;break;}}
  assert.ok(reached,kind);
 }
});
test('quick recall walks beyond the outing time limit and only stops after reaching home',()=>{
 const start={x:100,y:150},home={x:800,y:150},policy={...options,quickRecall:true,speed:60};
 const director=new WanderDirector(start,()=>0);
 director.tick(0,area,size,policy);
 director.requestRecall(home,40);
 let stoppedAt=0,arrived=false,xAtOneSecond=0;
 for(let now=40;now<20000;now+=40){
  const frame=director.tick(now,area,size,policy);
  if(now===1000||now===8000){assert.equal(frame.clip,'walk');assert.equal(frame.frameMs,135);}
  if(now===1000)xAtOneSecond=director.position.x;
  if(now===2000)assert.ok(Math.abs(director.position.x-xAtOneSecond-80)<.01);
  if(frame.clip==='stop'){
   assert.deepEqual(director.position,home);
   stoppedAt||=now;
  }
  if(stoppedAt&&frame.phase==='rest'){
   assert.equal(frame.arrivedHome,true);
   assert.equal(director.tick(now+40,area,size,policy).arrivedHome,undefined);
   arrived=true;
   break;
  }
  assert.ok(frame.clip==='start-step'||frame.clip==='walk'||frame.clip==='stop');
 }
 assert.ok(stoppedAt>6000);
 assert.ok(arrived);
});
test('cancelling a recall keeps both movement directors at their current position and permits a new recall',()=>{
 const start={x:100,y:150},home={x:800,y:150},policy={...options,quickRecall:true,speed:60};
 for(const director of [new WanderDirector(start,()=>0),new Walker(start,()=>0)]){
  director.requestRecall(home,40);
  for(let now=40;now<=1400;now+=40)director.tick(now,area,size,policy);
  const stopped={...director.position};
  assert.ok(stopped.x>start.x&&stopped.x<home.x);
  assert.equal(director.cancelRecall(1400),true);
  assert.equal(director.cancelRecall(1400),false);
  for(let now=1440;now<=2400;now+=40)director.tick(now,area,size,policy);
  assert.deepEqual(director.position,stopped);
  assert.equal(director.areaStatus,'');
  director.requestRecall(home,2440);
  for(let now=2440;now<=3600;now+=40)director.tick(now,area,size,policy);
  assert.ok(director.position.x>stopped.x);
 }
});
test('an unsafe widget top recovers through the nearest safe candidate before both directors walk home',()=>{
 const config={...activityAreaDefaults(),enabled:true,allowed:{x:.5888948367,y:.0747802734,width:.4111105163,height:.8892521973},forbidden:[],home:{x:.85,y:.8}},start={x:700,y:-60},target=activityHomeTarget(config,area,size)!;
 assert.equal(activityPointSafe(start,area,size,config),false);assert.equal(activityPointSafe(target,area,size,config),true);assert.equal(activityRoute(start,target,area,size,config),null);
 const route=activityReturnRoute(start,target,area,size,config);assert.ok(route&&route.length>1);const safeCandidate=activityCandidates(area,size,{...config,allowed:null}).sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)-Math.hypot(b.x-start.x,b.y-start.y))[0]!;
 assert.deepEqual(route[0],safeCandidate);assert.equal(activityPointSafe(safeCandidate,area,size,{...config,allowed:null}),true);assert.deepEqual(route,[safeCandidate,...activityRoute(safeCandidate,target,area,size,{...config,allowed:null})!]);
 const safeStart={x:700,y:100};assert.deepEqual(activityReturnRoute(safeStart,target,area,size,config),activityRoute(safeStart,target,area,size,{...config,allowed:null}));
 assert.equal(activityReturnRoute(start,target,area,size,{...config,forbidden:[{x:.7,y:.2,width:.1,height:.1}]}),null);
 assert.equal(activityReturnRoute(start,{x:-100,y:100},area,size,config),null);
 assert.equal(activityReturnRoute(safeStart,{x:800,y:300},area,size,{...config,forbidden:[{x:.75,y:.55,width:.2,height:.2}]}),null);
 for(const kind of ['builtin','external'] as const){const d=kind==='builtin'?new WanderDirector(start,()=>0):new Walker(start,()=>0);d.tick(0,area,size,{...options,activityArea:config});d.requestRecall(target,40);let reached=false,before={...d.position};
  for(let now=40;now<=30000;now+=40){d.tick(now,area,size,{...options,activityArea:config});assert.ok(Math.hypot(d.position.x-before.x,d.position.y-before.y)<=12.001,`${kind} teleported`);before={...d.position};if(Math.hypot(d.position.x-target.x,d.position.y-target.y)<1&&d.areaStatus===''){reached=true;break;}}
  assert.ok(reached,kind);
 }
});
test('explicit recall leaves a too-short allowed band and walks home, while wandering and forbidden routes stay blocked',()=>{
 const config={...activityAreaDefaults(),enabled:true,allowed:{x:.05,y:.5,width:.9,height:.05},home:{x:.15,y:.525}},homeConfig={...config,allowed:null},start={x:800,y:350},target=activityHomeTarget(config,area,size)!,homePixel={x:area.x+config.home.x*area.width,y:area.y+config.home.y*area.height};
 assert.ok(config.allowed.height*area.height<size.height);assert.ok(homePixel.x>=target.x&&homePixel.x<=target.x+size.width&&homePixel.y>=target.y&&homePixel.y<=target.y+size.height);assert.equal(activityPointSafe(target,area,size,config),false);assert.equal(activityPointSafe(target,area,size,homeConfig),true);assert.equal(activityRoute(start,target,area,size,config),null);assert.equal(activityPositionStatus(start,area,size,config),'no-space');
 const route=activityReturnRoute(start,target,area,size,config);assert.ok(route);let previous=start;for(const p of route){assert.ok(activitySegmentSafe(previous,p,area,size,homeConfig));previous=p;}assert.deepEqual(previous,target);
 assert.equal(activityReturnRoute(start,{x:-100,y:350},area,size,config),null);assert.equal(activityReturnRoute(start,target,area,size,{...config,forbidden:[{x:.4,y:0,width:.2,height:1}]}),null);
 for(const kind of ['builtin','external'] as const){const d=kind==='builtin'?new WanderDirector(start,()=>0):new Walker(start,()=>0);d.tick(0,area,size,{...options,activityArea:config});assert.equal(d.areaStatus,'no-space');assert.deepEqual(d.position,start);d.requestRecall(target,40);let reached=false,before={...d.position};
  for(let now=40;now<=30000;now+=40){d.tick(now,area,size,{...options,activityArea:config});assert.ok(activityPointSafe(d.position,area,size,homeConfig));assert.ok(activitySegmentSafe(before,d.position,area,size,homeConfig));before={...d.position};if(Math.hypot(d.position.x-target.x,d.position.y-target.y)<1){reached=true;break;}}
  assert.ok(reached,kind);
 }
});
test('unreachable recall, invalid starting placement, disabled movement and geometry edits never teleport or keep a stale route',()=>{
 const wall={...activityAreaDefaults(),enabled:true,forbidden:[{x:.4,y:0,width:.2,height:1}]},start={x:50,y:150};
 for(const d of [new WanderDirector(start,()=>0),new Walker(start,()=>0)]){
  d.tick(0,area,size,{...options,activityArea:wall});d.requestRecall({x:800,y:150},40);for(let now=40;now<1000;now+=40)d.tick(now,area,size,{...options,activityArea:wall});assert.deepEqual(d.position,start);assert.equal(d.areaStatus,'home-blocked');
  d.place({x:410,y:150},area,size,1200);for(let now=1240;now<5000;now+=40)d.tick(now,area,size,{...options,activityArea:wall});assert.deepEqual(d.position,{x:410,y:150});assert.equal(d.areaStatus,'outside');
  d.place(start,area,size,6000);d.requestRecall({x:200,y:150},6040);d.tick(6040,area,size,{...options,activityArea:wall,enabled:false});assert.deepEqual(d.position,start);
  d.tick(6080,area,size,{...options,activityArea:{...wall,allowed:{x:.8,y:0,width:.2,height:1}}});assert.deepEqual(d.position,start);assert.equal(d.areaStatus,'outside');
 }
});
test('recall survives a status-driven size change without losing its notice, while edited region policy cancels it',()=>{
 const config={...activityAreaDefaults(),home:{x:.75,y:.8}},start={x:400,y:180};
 for(const d of [new WanderDirector(start,()=>0),new Walker(start,()=>0)]){
  d.tick(0,area,size,{...options,activityArea:config});d.requestRecall(activityHomeTarget(config,area,size)!,40);d.tick(40,area,size,{...options,activityArea:config});
  const taller={...size,height:size.height+28};d.tick(80,area,taller,{...options,activityArea:config});assert.equal(d.areaStatus,'returning');
  let moved=false;for(let at=120;at<7000;at+=40){d.tick(at,area,taller,{...options,activityArea:config});if(Math.hypot(d.position.x-start.x,d.position.y-start.y)>2)moved=true;}assert.equal(moved,true);
  d.tick(7040,area,taller,{...options,activityArea:{...config,enabled:true,forbidden:[{x:0,y:0,width:1,height:1}]}});assert.notEqual(d.areaStatus,'returning');
 }
});
