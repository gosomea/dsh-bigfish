import test from 'node:test';
import assert from 'node:assert/strict';
import {WanderDirector,Walker,wanderTarget,type WanderOptions} from '../src/companion/movement.js';
import {decodeLifestyle,presetConfig} from '../src/companion/config.js';
const area={x:0,y:0,width:500,height:400},size={width:100,height:150},options:WanderOptions={enabled:true,capable:true,mode:'screen',radius:100,speed:100,restMin:1,restMax:1,ready:true};

test('screen is an additive portable choice; old schemes keep their horizontal movement default',()=>{
 assert.equal(presetConfig('balanced').movement,'nearby');assert.equal(decodeLifestyle({version:1,movement:'screen'}).movement,'screen');
 for(const movement of ['fixed','nearby','wide'])assert.equal(decodeLifestyle({version:1,movement}).movement,movement);
 assert.throws(()=>decodeLifestyle({version:1,movement:'anywhere'}));
});
test('full-screen targets include both axes and edges, avoid zero-length routes, and never double-scale negative DIPs',()=>{
 const p={x:200,y:100};assert.deepEqual(wanderTarget(p,p,area,size,options,()=>0),{x:0,y:0});assert.deepEqual(wanderTarget(p,p,area,size,options,()=>1),{x:400,y:250});
 assert.notDeepEqual(wanderTarget({x:200,y:125},p,area,size,options,()=>.5),{x:200,y:125});
 const left={x:-1920,y:25,width:1920,height:1055};assert.deepEqual(wanderTarget({x:-100,y:400},p,left,size,options,()=>1),{x:-1920,y:930});
 const tiny={x:8,y:8,width:50,height:40};assert.deepEqual(wanderTarget({x:8,y:8},p,tiny,size,options,()=>1),{x:8,y:8});
});
test('only the real walk loop moves both coordinates, then a bounded outing plants its feet through the exit',()=>{
 for(const random of [()=>0,()=>1]){
  const d=new WanderDirector({x:200,y:100},random);let before=d.snapshot(),point={...d.position},walkAt:number|undefined,stopAt:number|undefined;const seen=new Set<string>();
  for(let now=0;now<=45000;now+=40){const frame=d.tick(now,area,size,options);if(frame.clip)seen.add(frame.clip);if(frame.clip==='walk'&&walkAt===undefined)walkAt=now;if(walkAt&&frame.clip==='stop'&&stopAt===undefined)stopAt=now;
   if(!before.moving)assert.deepEqual(d.position,point);assert.ok(d.position.x>=0&&d.position.x<=400&&d.position.y>=0&&d.position.y<=250);point={...d.position};before=frame;
  }
  assert.ok(walkAt!==undefined&&stopAt!==undefined&&stopAt-walkAt<=6000);assert.notEqual(d.position.y,100);assert.notEqual(d.position.x,200);
  for(const clip of ['walk','stop','sit-down','wake-up'])assert.ok(seen.has(clip));
 }
});
test('arrival slows down before either screen edge; hidden time cannot jump an entire route',()=>{
 const d=new WanderDirector({x:40,y:30},()=>0),o={...options,availableClips:['walk','stop']};d.tick(0,area,size,o);d.tick(1000,area,size,o);
 const speeds:number[]=[];let previous={...d.position};for(let now=1040;now<5000;now+=40){const before=d.snapshot();d.tick(now,area,size,o);if(before.moving)speeds.push(Math.hypot(d.position.x-previous.x,d.position.y-previous.y));previous={...d.position};}
 assert.ok(Math.max(...speeds)>speeds.filter(n=>n>0).at(-1)!);assert.deepEqual(d.position,{x:0,y:0});
 const suspended=new WanderDirector({x:200,y:100},()=>0);suspended.tick(0,area,size,o);suspended.tick(1000,area,size,o);const before={...suspended.position};suspended.tick(100000,area,size,o);assert.ok(Math.hypot(suspended.position.x-before.x,suspended.position.y-before.y)<=o.speed*.1+.0001);
});
test('work/quiet gates, missing movement, drag placement and geometry/mode changes cancel the stale 2D route',()=>{
 const d=new WanderDirector({x:200,y:100},()=>1);for(let now=0;now<5000;now+=40)d.tick(now,area,size,options);
 const held={...d.position};assert.equal(d.tick(5040,area,size,{...options,enabled:false}).moving,false);assert.deepEqual(d.position,held);
 d.place({x:125,y:65},area,size,6000);assert.deepEqual(d.anchor,{x:125,y:65});assert.equal(d.tick(6040,area,size,options).moving,false);
 for(let now=6080;now<25000;now+=40)d.tick(now,area,size,options);assert.equal(d.tick(25040,area,size,{...options,mode:'horizontal'}).phase,'rest');
 assert.equal(d.tick(25080,{x:10,y:20,width:200,height:200},{width:190,height:180},options).phase,'rest');assert.ok(d.position.x>=10&&d.position.x<=20&&d.position.y>=20&&d.position.y<=40);
 assert.equal(d.tick(25120,area,size,{...options,capable:false}).moving,false);assert.equal(d.tick(25160,area,size,{...options,availableClips:['stop']}).moving,false);
});
test('external left/right walking can follow a 2D path while nearby/wide stay horizontal and direct placement wins',()=>{
 const legacy=new Walker({x:200,y:100},()=>0),twoD=new Walker({x:200,y:100},()=>0),horizontal=new WanderDirector({x:200,y:100},()=>0);
 for(let now=0;now<10000;now+=40){legacy.tick(now,area,size,{...options,mode:'horizontal'});twoD.tick(now,area,size,options);horizontal.tick(now,area,size,{...options,mode:'horizontal'});}
 assert.equal(legacy.position.y,100);assert.equal(horizontal.position.y,100);assert.ok(twoD.position.y<100);twoD.place({x:150,y:50},area,size,11000);twoD.tick(11040,area,size,options);assert.deepEqual(twoD.position,{x:150,y:50});
 twoD.tick(11080,{x:0,y:0,width:50,height:40},size,options);assert.deepEqual(twoD.position,{x:0,y:0});assert.equal(twoD.phase,'rest');
});
