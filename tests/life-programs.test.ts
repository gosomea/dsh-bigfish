import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LifeProgramDirector,lifeProgramClips,pairedBall,pairLayout,overlaps,type LifeProgramEnvironment} from '../src/companion/life-programs.js';
import {actionUnlocked,unlockedClips,lifeOptionDefaults} from '../src/companion/life-options.js';
import {lifeDefaults} from '../src/companion/life.js';
import {OutfitLayer} from '../src/client/outfit-layer.js';
import {decodeLifestyle,presetConfig,exportScheme} from '../src/companion/config.js';
const environment=():LifeProgramEnvironment=>({enabled:true,growth:true,life:{...lifeDefaults(),interactions:20},options:{...lifeOptionDefaults,pairEnabled:true},availableClips:lifeProgramClips,blocked:false,quiet:false,working:false});
test('automatic stories use the amplitude pool while explicit performances retain their declared source',()=>{
 const env={...environment(),automaticClips:[],options:{...environment().options,storyAutomatic:true}};
 const d=new LifeProgramDirector();assert.equal(d.start({kind:'stage'},env,0,'automatic'),false);
 assert.equal(d.start({kind:'stage'},env,1,'manual'),true);assert.equal(d.tick(env,1)?.source,'manual');
});

test('new optional actions actually filter by recorded interactions and disabling locks restores them',()=>{
 assert.equal(actionUnlocked('ball-catch',0,true),false);assert.equal(actionUnlocked('ball-catch',5,true),true);
 assert.equal(actionUnlocked('companion:fish-toy',9,true),false);assert.equal(actionUnlocked('tea',0,true),true);
 assert.deepEqual(unlockedClips(['wave','ball-catch','fish-toy'],0,true),['wave']);assert.equal(unlockedClips(['wave','ball-catch','fish-toy'],0,false).length,3);
 const d=new LifeProgramDirector(),locked={...environment(),life:lifeDefaults(),options:{...environment().options,growthUnlocks:true}};
 assert.equal(d.start({kind:'paired'},locked,0),false);assert.equal(d.start({kind:'paired'},{...locked,options:{...locked.options,growthUnlocks:false}},0),true);
});
test('season and stage programs play entry, long hold and exit while all narrative is explicitly fictional',()=>{
 const env=environment(),d=new LifeProgramDirector();assert.equal(d.start({kind:'season',season:'winter'},env,0),true);
 const entry=d.tick(env,0)!;assert.equal(entry.clip,'point');assert.equal(entry.phase,'entry');assert.equal(entry.fictional,true);assert.match(entry.text,/虚构/);
 assert.equal(d.tick(env,2240)?.serial,entry.serial);assert.equal(d.tick(env,2240)?.phase,'hold');
 const tea=d.tick(env,5240)!;assert.equal(tea.clip,'tea');assert.equal(tea.holdMs,7000);assert.equal(d.tick(env,12000)?.clip,'tea');
 assert.equal(d.tick(env,14480)?.phase,'exit');assert.equal(d.tick(env,19720),null);
 assert.equal(d.start({kind:'stage'},env,20000),true);assert.match(d.tick(env,20000)!.text,/真实 20 次互动/);assert.match(d.tick(env,20000)!.text,/虚构/);
});
test('paired programs share one clock, have a real secondary sequence and do not overlap bodies',()=>{
 const env=environment(),d=new LifeProgramDirector();assert.equal(overlaps(pairLayout.primary,pairLayout.secondary),false);
 assert.equal(d.start({kind:'paired'},env,0),true);assert.equal(d.start({kind:'paired'},env,1),false);
 assert.equal(d.tick(env,0)?.pairedClip,'wave');const exchange=d.tick(env,5240)!;
 assert.equal(exchange.clip,'ball-catch');assert.equal(exchange.pairedClip,'fish-toy');assert.equal(exchange.pairProp,'ball');
 for(let i=0;i<=100;i++){const p=pairedBall(i/100);assert.ok(p.x>=pairLayout.secondary.x+pairLayout.secondary.width&&p.x<=pairLayout.primary.x);assert.ok(Number.isFinite(p.y));}
 assert.equal(pairedBall(0).contact,'secondary');assert.equal(pairedBall(.25).contact,'primary');
 assert.equal(d.tick({...env,options:{...env.options,pairEnabled:false}},6000),null);
});
test('working, important interruption and missing artwork cancel local programs without retries',()=>{
 for(const patch of [{working:true},{blocked:true},{enabled:false}]){const d=new LifeProgramDirector(),env=environment();d.start({kind:'paired'},env,0);assert.equal(d.tick({...env,...patch},100),null);assert.equal(d.tick(env,200),null);}
 const d=new LifeProgramDirector(),env=environment();assert.equal(d.start({kind:'paired'},{...env,availableClips:['wave']},0),false);
 assert.equal(d.start({kind:'stage'},{...env,growth:false},0),false);
 assert.equal(d.start({kind:'paired'},{...env,pairedClips:[]},0),false);
 assert.equal(d.start({kind:'paired'},{...env,pairedClips:lifeProgramClips},0),true);
 assert.equal(d.tick({...env,pairedClips:['wave']},100),null);
 assert.equal(d.start({kind:'paired'},{...env,availableClips:[],pairedClips:lifeProgramClips},200),true);
});
test('automatic stories need a new real milestone and obey quiet/cooldown; reopening does not replay old stages',()=>{
 const d=new LifeProgramDirector(),env={...environment(),options:{...environment().options,storyAutomatic:true}};
 assert.equal(d.maybeStart(env,1000),false);assert.equal(d.maybeStart(env,1100),false);
 const changed={...env,life:{...env.life,interactions:100}};
 assert.equal(d.maybeStart({...changed,quiet:true},1200),false);assert.equal(d.maybeStart(changed,1300),true);
 assert.equal(d.tick(changed,1300)?.kind,'stage');assert.equal(d.tick({...changed,options:{...changed.options,storyAutomatic:false}},1400),null);
 assert.equal(d.maybeStart(changed,1500),false);
 assert.equal(new LifeProgramDirector().maybeStart(changed,1500),false);
});
test('decode readiness freezes the current program entry and matching readiness resumes it',()=>{
 const d=new LifeProgramDirector(),env={...environment(),playbackReady:''};assert.equal(d.start({kind:'paired'},env,0),true);
 const first=d.tick(env,0)!;assert.equal(d.tick(env,20000)?.serial,first.serial);assert.equal(d.tick(env,20000)?.phase,'entry');
 const ready={...env,playbackReady:first.serial};assert.equal(d.tick(ready,22240)?.phase,'hold');assert.equal(d.tick(ready,25240)?.pairedClip,'fish-toy');
});
test('outfits render actual local props with body anchors and hide while the character lies down',()=>{
 const none=renderToStaticMarkup(React.createElement(OutfitLayer,{outfit:'none'}));assert.equal(none,'');
 for(const outfit of ['sailor-bow','star-pin','winter-scarf'] as const){const svg=renderToStaticMarkup(React.createElement(OutfitLayer,{outfit,clip:'wave'}));assert.match(svg,/佩戴/);assert.match(svg,/<path|<rect/);assert.equal(renderToStaticMarkup(React.createElement(OutfitLayer,{outfit,clip:'sleep'})),'');}
});
test('portable life choices cannot import permissions, model activation or unsupported dress-up data',()=>{
 const all=presetConfig('all');assert.equal(all.pairEnabled,true);assert.equal(presetConfig('balanced').pairEnabled,false);
 assert.equal(decodeLifestyle({...all,outfit:'star-pin'}).outfit,'star-pin');assert.throws(()=>decodeLifestyle({...all,outfit:'remote-script'}));
 assert.throws(()=>decodeLifestyle({...all,microphone:true}));assert.throws(()=>decodeLifestyle({...all,modelToken:'secret'}));assert.throws(()=>decodeLifestyle({...all,storyMinutes:0}));
 const exported=exportScheme({...all,quietUntil:1234});assert.equal(exported.quietUntil,0);assert.equal(Object.hasOwn(exported,'model'),false);
});
