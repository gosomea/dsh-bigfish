import test from 'node:test';
import assert from 'node:assert/strict';
import {appearanceBounds,recallBounds,placeWindowBounds,reconcileBounds} from '../desktop/geometry.mjs';
import {WanderDirector} from '../src/companion/movement.js';
const display={id:1,scaleFactor:2,workArea:{x:0,y:25,width:1920,height:1002}},displays=[display];
const policy={enabled:true,capable:true,radius:120,speed:35,restMin:5,restMax:5,ready:true};
const bottom=(b:{y:number;height:number})=>b.y+b.height;

test('a transitional native read reproduces the top-edge jump; intended placement keeps the actual walking baseline',()=>{
 const stale={x:0,y:0,width:372,height:510},target=recallBounds(stale,display.workArea);
 assert.equal(bottom(target),1027);
 const old=new WanderDirector({x:target.x,y:target.y},()=>0);
 // The former code read getBounds immediately after native setBounds and seeded that transient origin.
 old.place({x:stale.x,y:stale.y},display.workArea,stale,0);old.tick(32,display.workArea,stale,policy);
 assert.equal(old.position.y+stale.height,535);
 let reads=0;const writes:unknown[]=[];
 const window={getBounds(){reads++;return stale;},setBounds(bounds:unknown){writes.push(bounds);}};
 const fixed=new WanderDirector({x:0,y:0},()=>0),placed=placeWindowBounds(window,fixed,target,displays,0);
 assert.equal(reads,0,'setBounds must not be followed by a transitional native read');assert.deepEqual(writes,[target]);
 const motions=new Set<string>();for(let now=32;now<35000;now+=32){const frame=fixed.tick(now,display.workArea,placed,policy);if(frame.clip)motions.add(frame.clip);assert.equal(fixed.position.y+placed.height,1027);}
 assert.ok(motions.has('walk'));assert.ok(motions.has('stop'));
});

test('first appearance before or after recall converges to identical bounds while preserving right and bottom',()=>{
 const initial={x:750,y:250,width:420,height:540};
 const recalled=recallBounds(initial,display.workArea),afterRecall=appearanceBounds(recalled,display.workArea,180);
 const beforeRecall=recallBounds(appearanceBounds(initial,display.workArea,180),display.workArea);
 assert.deepEqual(afterRecall,beforeRecall);assert.deepEqual(afterRecall,{x:1548,y:517,width:372,height:510});
 for(const size of [120,180,260,300]){const resized=appearanceBounds(afterRecall,display.workArea,size);assert.equal(resized.x+resized.width,1920);assert.equal(bottom(resized),1027);}
});

test('appearance, display removal and resume replace a pending route with a bounded DIP placement',()=>{
 const secondary={id:2,scaleFactor:1.25,workArea:{x:-1920,y:25,width:1920,height:1055}};
 let intended=recallBounds({width:372,height:510},secondary.workArea);
 const walker=new WanderDirector({x:intended.x,y:intended.y},()=>0),writes:unknown[]=[];
 const window={setBounds(bounds:unknown){writes.push(bounds);}};
 intended=placeWindowBounds(window,walker,intended,[display,secondary],0);for(let now=32;now<21000;now+=32)walker.tick(now,secondary.workArea,intended,policy);
 intended=placeWindowBounds(window,walker,appearanceBounds(intended,secondary.workArea,260),[display,secondary],21000);
 assert.equal(walker.snapshot().phase,'rest');assert.equal(bottom(intended),1080);assert.ok(intended.x<0);
 const unplugged=placeWindowBounds(window,walker,intended,displays,22000);assert.equal(walker.snapshot().clip,null);assert.deepEqual(walker.position,{x:unplugged.x,y:unplugged.y});assert.deepEqual(reconcileBounds(unplugged,displays),unplugged);
 const resumed=placeWindowBounds(window,walker,{...unplugged,x:100000,y:100000},displays,23000);assert.deepEqual(reconcileBounds(resumed,displays),resumed);assert.equal(bottom(resumed),1027);
 assert.equal(writes.length,4);assert.equal(resumed.width,Math.ceil(340*260/180)+32,'scaleFactor does not multiply DIPs');
});

test('a smaller work area bounds the entire pet and preserves one real ground anchor during later resize',()=>{
 const small={id:3,scaleFactor:1.5,workArea:{x:10,y:30,width:300,height:420}},large={x:-100,y:-100,width:599,height:677};
 const recalled=recallBounds(large,small.workArea);assert.deepEqual(recalled,{x:10,y:30,width:300,height:420});
 assert.deepEqual(appearanceBounds(recalled,small.workArea,300),recalled);
});
