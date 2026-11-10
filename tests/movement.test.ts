import test from 'node:test';
import assert from 'node:assert/strict';
import {WanderDirector,type WanderOptions} from '../src/companion/movement.js';
const area={x:0,y:0,width:500,height:400},size={width:100,height:150};
const options:WanderOptions={enabled:true,capable:true,radius:100,speed:60,restMin:1,restMax:1};
function run(d:WanderDirector,from:number,to:number,opts=options){for(let at=from;at<=to;at+=40)d.tick(at,area,size,opts);return d.snapshot();}

test('an outing plays the actual start, walk, stop and sit/rise chain without sliding its preparation',()=>{
 const d=new WanderDirector({x:200,y:100},()=>0);d.tick(0,area,size,options);
 assert.equal(d.tick(1000,area,size,options).clip,'start-step');
 const x=d.position.x;assert.equal(run(d,1040,3200).clip,'start-step');assert.equal(d.position.x,x);
 assert.equal(d.tick(3240,area,size,options).clip,'walk');assert.equal(d.position.x,x);
 const seen=new Set<string>();let previous=d.snapshot(),before=d.position.x;
 for(let at=3280;at<=26000;at+=40){const frame=d.tick(at,area,size,options);if(frame.clip)seen.add(frame.clip);if(previous.clip!=='walk')assert.equal(d.position.x,before);before=d.position.x;previous=frame;}
 for(const clip of ['walk','stop','sit-down','wake-up'])assert.ok(seen.has(clip),clip);
 assert.ok(d.position.x<x);
});

test('edge arrival brakes at a loop boundary, peeks and protects the tail; all coordinates remain inside',()=>{
 const d=new WanderDirector({x:200,y:100},()=>0),o={...options,radius:400,speed:200};d.tick(0,area,size,o);
 const seen=new Set<string>();let stoppedAt:number|undefined;
 for(let at=40;at<=29000;at+=40){const frame=d.tick(at,area,size,o);if(frame.clip)seen.add(frame.clip);assert.ok(d.position.x>=0&&d.position.x<=400);if(frame.clip==='stop'&&stoppedAt===undefined){stoppedAt=at;assert.equal(d.position.x,0);}if(stoppedAt&&at<stoppedAt+5200)assert.equal(frame.clip,'stop');}
 assert.ok(seen.has('edge-peek'));assert.ok(seen.has('tail-avoid'));assert.ok(seen.has('sit-down'));
});

test('an outward request at the boundary tucks the tail; a changed heading uses the real turn sequence',()=>{
 const d=new WanderDirector({x:400,y:0},()=>.9);d.tick(0,area,size,options);
 assert.equal(d.tick(1000,area,size,options).clip,'tail-avoid');
 assert.equal(run(d,1040,3240).clip,'start-step');assert.equal(d.position.x,400);
 assert.equal(run(d,3280,5480).clip,'walk');assert.equal(d.position.x,400);
 assert.ok(run(d,5520,5720).moving);assert.ok(d.position.x<400);
 const right=new WanderDirector({x:200,y:100},()=>.9);right.tick(0,area,size,options);
 assert.equal(right.tick(1000,area,size,options).clip,'turn');assert.equal(right.snapshot().mirror,true);
 assert.equal(run(right,1040,3240).clip,'start-step');assert.equal(right.position.x,200);
});

test('decode readiness gates both authored time and visible walking movement',()=>{
 const d=new WanderDirector({x:200,y:100},()=>0);d.tick(0,area,size,options);const first=d.tick(1000,area,size,options);
 assert.equal(run(d,1040,10000,{...options,ready:false}).serial,first.serial);assert.equal(d.position.x,200);
 assert.equal(run(d,10040,12240).clip,'walk');
 const x=d.position.x;assert.equal(run(d,12280,15000,{...options,ready:false}).clip,'walk');assert.equal(d.position.x,x);
 run(d,15040,15200);assert.ok(d.position.x<x);
});

test('ordinary gestures defer a new outing; work, missing art and placement cancel a visible chain immediately',()=>{
 const d=new WanderDirector({x:200,y:100},()=>0);d.tick(0,area,size,options);
 assert.equal(run(d,40,2000,{...options,blockStart:true}).clip,null);
 const first=d.tick(2040,area,size,options);assert.equal(first.clip,'start-step');
 assert.equal(run(d,2080,4280,{...options,blockStart:true}).clip,'walk');
 const x=d.position.x;assert.equal(d.tick(4320,area,size,{...options,enabled:false}).clip,null);assert.equal(d.position.x,x);
 assert.equal(run(d,4360,20000,{...options,capable:false}).clip,null);assert.equal(d.position.x,x);
 d.place({x:150,y:90},area,size,21000);assert.equal(d.tick(21040,area,size,options).clip,null);assert.deepEqual(d.position,{x:150,y:90});
});
test('edge extras respect real unlocked capability and losing walk artwork stops motion',()=>{
 const all=['start-step','walk','stop','tiptoe','edge-peek','tail-avoid','sit-down','wake-up'];
 const d=new WanderDirector({x:200,y:100},()=>0),o={...options,radius:400,speed:200,availableClips:all.filter(id=>id!=='tiptoe'&&id!=='edge-peek')};
 d.tick(0,area,size,o);const seen=new Set<string>();
 for(let now=40;now<=30000;now+=40){const f=d.tick(now,area,size,o);if(f.clip)seen.add(f.clip);}
 assert.ok(!seen.has('tiptoe')&&!seen.has('edge-peek'));assert.ok(seen.has('tail-avoid'));
 const before={...d.position};assert.equal(d.tick(30040,area,size,{...o,availableClips:['stop']}).clip,null);assert.deepEqual(d.position,before);
});
