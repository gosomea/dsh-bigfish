import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ClipTimeline,sequenceClip,clipPlayDuration,companionTiming,atlasSequenceScale} from '../src/companion/clip-timeline.js';
const root=new URL('../assets/intelligent-pet/',import.meta.url);
test('generated sequence catalog, production provenance and source bounds agree with actual PNG files',async()=>{
 const read=async(name:string)=>JSON.parse(await readFile(new URL(name,root),'utf8'));
 const catalog=await read('catalog.json') as {id:string;file:string;frames:number;rows:number}[];
 const production=await read('production.json') as {sequenceCount:number;frameCount:number;sequences:{id:string;sourceSha256:string;frames:number;source:string}[]};
 const bounds=await read('frame-bounds.json') as Record<string,{x:number;y:number;width:number;height:number;exclude?:{x:number;y:number;width:number;height:number}[]}[]>;
 assert.equal(new Set(catalog.map(c=>c.id)).size,catalog.length);assert.equal(production.sequenceCount,catalog.length);assert.equal(production.frameCount,catalog.reduce((n,c)=>n+c.frames,0));
 for(const clip of catalog){
  const source=await readFile(new URL(clip.file,root)),row=production.sequences.find(r=>r.id===clip.id)!;assert.ok(row,clip.id);assert.equal(row.source,clip.file);assert.equal(row.frames,clip.frames);assert.equal(createHash('sha256').update(source).digest('hex'),row.sourceSha256,clip.id+' source changed');
  const width=source.readUInt32BE(16),height=source.readUInt32BE(20),rects=bounds[clip.id]!;assert.equal(rects.length,clip.frames,clip.id+' bounds missing');
  const scale=atlasSequenceScale(height/clip.rows,rects,416,400);
  for(const r of rects){
   assert.ok([r.x,r.y,r.width,r.height].every(Number.isInteger));assert.ok(r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=width&&r.y+r.height<=height,clip.id+' bounds out of image');
   assert.ok(472-r.width*scale/2>=0&&472+r.width*scale/2<=680+1e-8&&426-r.height*scale>=0,clip.id+' head or tail clipped by stage');
   for(const cut of r.exclude??[]){assert.ok([cut.x,cut.y,cut.width,cut.height].every(Number.isInteger));assert.ok(cut.width>0&&cut.height>0&&cut.x>=r.x&&cut.y>=r.y&&cut.x+cut.width<=r.x+r.width&&cut.y+cut.height<=r.y+r.height,clip.id+' cutout escapes its frame');}
   const cutouts=r.exclude??[];for(let a=0;a<cutouts.length;a++)for(let b=a+1;b<cutouts.length;b++){const one=cutouts[a]!,two=cutouts[b]!;assert.ok(one.x+one.width<=two.x||two.x+two.width<=one.x||one.y+one.height<=two.y||two.y+two.height<=one.y,clip.id+' overlapping evenodd cuts would restore neighboring pixels');}
  }
 }
});
test('all 32 authored sequences retain their actual cadence and final pose instead of cycling one-shots',async()=>{
 const catalog=JSON.parse(await readFile(new URL('catalog.json',root),'utf8')) as {id:string;frames:number;frameMs:number;holdMs:number;loop:boolean;artAccepted:boolean}[];
 assert.equal(catalog.length,32);
 for(const clip of catalog){
  const definition=sequenceClip(clip),duration=clipPlayDuration(definition),player=new ClipTimeline(definition);
  assert.equal(duration,clip.loop?companionTiming.walkLoopMs:companionTiming.oneShotMs,clip.id+' director/player timing differs');
  if(clip.loop){assert.equal(player.advance(duration).frame,0);assert.equal(player.snapshot().finished,false);}
  else{
   const pose=player.advance(duration);assert.equal(pose.frame,clip.frames-1,clip.id);assert.equal(pose.phase,'hold',clip.id);
   assert.equal(player.advance(clip.holdMs-1).finished,false,clip.id);assert.equal(player.advance(1).finished,true,clip.id);
  }
 }
});
test('runtime art acceptance is backed by every authored frame, immutable sources and reviewed contact evidence',async()=>{
 const catalog=JSON.parse(await readFile(new URL('catalog.json',root),'utf8')) as {id:string;artAccepted:boolean}[];
 const production=JSON.parse(await readFile(new URL('production.json',root),'utf8')) as {artReview:{manifest:string;scope:string;frameCount:number};sequences:{id:string;artAccepted:boolean;sourceSha256:string;artReview:{scope:string;frames:number;evidence:string;authorFinalApproval:string}}[]};
 const review=JSON.parse(await readFile(new URL(production.artReview.manifest,root),'utf8')) as {frameBoundsSha256:string;scope:string;frameCount:number;sheets:{file:string;sha256:string;sequences:string[];frames:number[]}[];sources:{id:string;sourceSha256:string;runtime:string;runtimeSha256:string}[]};
 const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(review.scope,'runtime-usability');assert.equal(review.frameCount,256);assert.equal(production.artReview.frameCount,256);
 assert.equal(review.frameBoundsSha256,hash(await readFile(new URL('frame-bounds.json',root))),'review must be refreshed when crop metadata changes');
 const covered:string[]=[];
 for(const sheet of review.sheets){assert.deepEqual(sheet.frames,[0,1,2,3,4,5,6,7]);assert.equal(hash(await readFile(new URL(sheet.file,root))),sheet.sha256);covered.push(...sheet.sequences);}
 assert.deepEqual([...covered].sort(),catalog.map(c=>c.id).sort());
 for(const clip of catalog){
  const record=production.sequences.find(r=>r.id===clip.id)!,source=review.sources.find(s=>s.id===clip.id)!;
  assert.equal(clip.artAccepted,true);assert.equal(record.artAccepted,true);assert.equal(record.artReview.scope,'runtime-usability');assert.equal(record.artReview.frames,8);assert.equal(record.artReview.authorFinalApproval,'pending');
  assert.ok(review.sheets.some(s=>s.file===record.artReview.evidence&&s.sequences.includes(clip.id)));
  assert.equal(record.sourceSha256,source.sourceSha256);assert.equal(hash(await readFile(new URL(source.runtime,root))),source.runtimeSha256);
 }
});
