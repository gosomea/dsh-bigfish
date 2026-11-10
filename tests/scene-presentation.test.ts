import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutSignText,drawSignText} from '../src/client/sign-text.js';
import {homeFurniture,workFurniture,protectedActorRegions,homeSceneFurniture,sceneContext,sceneMotionAllowed} from '../src/client/scene-state.js';
import {actorFoot} from '../src/client/actor-layout.js';
const measure=(value:string,size:number)=>Array.from(value).reduce((sum,char)=>sum+(char.charCodeAt(0)>255?size:size*.55),0);
test('board lettering wraps without horizontal glyph compression and preserves the original phrase',()=>{
 const original='小鱼在这里，慢慢来呀～',layout=layoutSignText(original,88,33,measure,{minFontSize:10.5,maxFontSize:12.5});
 assert.equal(layout.original,original);assert.equal(layout.lines.length,2);assert.equal(layout.truncated,false);
 assert.ok(layout.fontSize>=10.5);for(const line of layout.lines)assert.ok(measure(line,layout.fontSize)<=88);
 const calls:unknown[][]=[];const ctx={font:'',fillStyle:'',textAlign:'',textBaseline:'',save(){},restore(){},measureText(text:string){return {width:measure(text,parseFloat(this.font.match(/[0-9.]+px/u)?.[0]??'12'))};},fillText(...args:unknown[]){calls.push(args);}};
 drawSignText(ctx as unknown as CanvasRenderingContext2D,original,0,0,88,33);assert.equal(calls.length,2);assert.ok(calls.every(call=>call.length===3),'no fillText(maxWidth) that squeezes the sentence');
});
test('small boards use readable ellipsis, do not mutate the configured dialogue or overflow bounds',()=>{
 const original='我在等你慢慢输入新的任务，无论是写代码还是读文件都可以哦～',layout=layoutSignText(original,58,25,measure);
 assert.ok(layout.truncated);assert.equal(layout.original,original);assert.ok(layout.lines.at(-1)?.endsWith('…'));
 assert.ok(layout.lines.length*layout.lineHeight<=25);for(const line of layout.lines)assert.ok(measure(line,layout.fontSize)<=58);
});
test('the living stage follows authored activity without changing the actor foot or selected theme',()=>{
 for(const motion of ['sleep','lie-down','nest','wake-up'])assert.equal(sceneContext({motion}),'sleep');
 assert.equal(sceneContext({motion:'companion:tea'}),'tea');assert.equal(sceneContext({motion:'classic:tea'}),'tea');assert.equal(sceneContext({motion:'sleep',state:'tool-running'}),'work');assert.equal(sceneContext({motion:'ball-catch'}),'play');
 assert.equal(sceneContext({state:'tool-running'}),'work');assert.equal(sceneContext({motion:'desk-tidy'}),'work');assert.equal(sceneContext({motion:'breathe'}),'rest');
 assert.deepEqual(actorFoot,{x:236,y:213});
 // Aspect-fit bounds now give each real bitmap furniture-scale room, not an icon-size sliver.
 assert.ok(homeFurniture.bed.height>=100);assert.ok(homeFurniture.desk.width>=120);assert.ok(workFurniture.bed.height>=100);assert.ok(workFurniture.desk.height>=100);
});
test('quiet, reduced motion, paused overlays and hidden tabs all stop ambient motion',()=>{
 assert.equal(sceneMotionAllowed({}),true);
 for(const flag of ['quiet','reduced','paused'] as const)assert.equal(sceneMotionAllowed({[flag]:true}),false,flag);
 assert.equal(sceneMotionAllowed({},false),false);
});

test('each context admits at most one primary furnishing and respects its explicit switch',()=>{
 const all={bed:true,desk:true,lamp:true,cards:3,night:false};
 for(const context of ['rest','sleep','work','tea','play','welcome'] as const){
  const visible=homeSceneFurniture(context,all),primary=visible.primary;
  if(primary==='bed')assert.ok(context==='rest'||context==='sleep');
  if(primary==='desk')assert.ok(context==='work'||context==='tea');
  if(primary==='shelf')assert.equal(context,'welcome');
  if(primary==='bed'||primary==='desk')assert.equal(homeSceneFurniture(context,{...all,[primary]:false}).primary,null);
 }
 assert.equal(homeSceneFurniture('work',{...all,lamp:false}).lamp,false);
 assert.equal(homeSceneFurniture('work',all).lamp,true);assert.equal(homeSceneFurniture('rest',all).lamp,false);
});
test('every home furnishing stays out of the face and readable sign compartments',()=>{
 const overlap=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
 for(const [name,bounds] of Object.entries({...homeFurniture,...Object.fromEntries(Object.entries(workFurniture).map(([key,value])=>[`work-${key}`,value]))})){
  for(const [area,protectedBounds] of Object.entries(protectedActorRegions))assert.equal(overlap(bounds,protectedBounds),0,`${name} must leave ${area} clear`);
  assert.ok(bounds.y+bounds.height<=250,`${name} rests on the stage ground`);
 }
});

test('Chinese closing punctuation stays with the preceding phrase without squeezing or overflowing the board',()=>{
 for(const mark of ['，','。','！','？','、','；','：','）','》','】','”']){
  const original=`工具箱收好啦${mark}等你发话～`,layout=layoutSignText(original,83,33,measure,{minFontSize:10.5,maxFontSize:12.5});
  assert.equal(layout.original,original);assert.equal(layout.truncated,false);assert.equal(layout.lines.join(''),original);
  assert.ok(layout.lines.every(line=>!line.startsWith(mark)),`${mark} must not start a line`);
  assert.ok(layout.lines.every(line=>measure(line,layout.fontSize)<=83));assert.ok(layout.lines.length*layout.lineHeight<=33);
 }
});
