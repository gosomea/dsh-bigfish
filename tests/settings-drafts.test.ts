import test from 'node:test';
import assert from 'node:assert/strict';
import {readIntegerDraft,VoiceServiceDraft} from '../src/client/settings-drafts.js';
import {effectiveLifeOptions,actionUnlocked} from '../src/companion/life-options.js';
import {presetConfig} from '../src/companion/config.js';
import {LifeProgramDirector,lifeProgramClips} from '../src/companion/life-programs.js';
import {lifeDefaults} from '../src/companion/life.js';

test('numeric drafts allow editing intermediate text but reject invalid values before committing',()=>{
 for(const value of ['', ' ', '2', '14', '1441', '20.5', 'Infinity', 'invalid'])assert.throws(()=>readIntegerDraft(value,'故事间隔',15,1440),/故事间隔/);
 assert.equal(readIntegerDraft('20','故事间隔',15,1440),20);
 assert.equal(readIntegerDraft(' 1440 ','故事间隔',15,1440),1440);
 assert.equal(readIntegerDraft('0','每日自动理解次数',0,100),0);
});
test('group switches suspend growth locks and paired programs without erasing saved choices',()=>{
 const original={...presetConfig('all'),growthUnlocks:true,storyAutomatic:true},off={...original,groups:{...original.groups,growth:false,adventures:false}},options=effectiveLifeOptions(off);
 assert.equal(options.growthUnlocks,false);assert.equal(options.pairEnabled,false);assert.equal(options.storyAutomatic,false);
 assert.equal(off.growthUnlocks,true);assert.equal(off.pairEnabled,true);assert.equal(off.storyAutomatic,true);
 assert.equal(actionUnlocked('ball-catch',0,options.growthUnlocks),true);
 assert.equal(effectiveLifeOptions(original).growthUnlocks,true);
 const director=new LifeProgramDirector(),environment={enabled:true,growth:true,life:{...lifeDefaults(),interactions:20},options:effectiveLifeOptions(original),availableClips:lifeProgramClips,blocked:false,quiet:false,working:false};
 assert.equal(director.start({kind:'paired'},environment,0),true);
 assert.equal(director.tick({...environment,options},100),null);
 assert.equal(director.start({kind:'paired'},{...environment,options},200),false);
});
test('voice polling preserves explicit empty/default drafts and never fills a draft API key',()=>{
 const draft=new VoiceServiceDraft(),epoch=draft.epoch;
 draft.load({endpoint:'https://old.invalid/transcribe',model:'local-model'},epoch);
 draft.edit('endpoint','');draft.edit('model','whisper-1');draft.edit('key','user-secret');
 draft.load({endpoint:'https://updated.invalid/transcribe',model:'new-model'},epoch);
 assert.deepEqual(draft.snapshot(),{endpoint:'',model:'whisper-1',key:'user-secret'});
 const clean=new VoiceServiceDraft();clean.load({endpoint:'https://updated.invalid/transcribe',model:'new-model'},clean.epoch);
 assert.deepEqual(clean.snapshot(),{endpoint:'https://updated.invalid/transcribe',model:'new-model',key:''});
});
test('saving acknowledges only the submitted draft and Host changes reject stale voice snapshots',()=>{
 const draft=new VoiceServiceDraft(),epoch=draft.epoch;
 draft.edit('endpoint','https://sent.invalid/transcribe');draft.edit('model','whisper-1');draft.edit('key','first-secret');const sent=draft.snapshot();
 draft.edit('endpoint','https://newer.invalid/transcribe');draft.edit('key','second-secret');
 assert.equal(draft.saved(sent,{endpoint:sent.endpoint,model:'canonical-model'},epoch),true);
 assert.deepEqual(draft.snapshot(),{endpoint:'https://newer.invalid/transcribe',model:'canonical-model',key:'second-secret'});
 draft.reset();assert.deepEqual(draft.snapshot(),{endpoint:'',model:'whisper-1',key:''});
 assert.equal(draft.load({endpoint:'https://old-host.invalid',model:'old'},epoch),false);
 assert.equal(draft.saved(sent,{endpoint:sent.endpoint,model:'old'},epoch),false);
 draft.load({endpoint:'https://new-host.invalid/transcribe',model:'new'},draft.epoch);
 assert.deepEqual(draft.snapshot(),{endpoint:'https://new-host.invalid/transcribe',model:'new',key:''});
});
