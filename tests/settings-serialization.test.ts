import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PreferenceStore} from '../src/client/preferences-store.js';
import {lifestylePreferencePatch} from '../src/client/lifestyle-preferences.js';
import {decodeLifestyle} from '../src/companion/config.js';
import {saveNamedScheme} from '../src/companion/schemes.js';
import {schemeDisplayDefaults} from '../src/contract/scheme-display.js';
import {preferenceDefaults} from '../src/contract/preferences.js';
import {DialogueBubble} from '../src/client/dialogue-view.js';
import {fixture} from './helpers.js';

test('queued nested edits and reset preserve each other, named schemes and private content',async()=>{
 const store=new PreferenceStore(null,null);
 try{
  await Promise.all([
   store.update(lifestylePreferencePatch({groups:{body:false}})),
   store.update(lifestylePreferencePatch({groups:{play:false}})),
   store.update({dialogueJson:'{"idle":["my private words"]}'}),
   store.update(current=>saveNamedScheme(current,'周末',null)),
   store.update(schemeDisplayDefaults),
  ]);
  const p=store.getSnapshot().value,config=decodeLifestyle(JSON.parse(p.lifestyleJson));
  assert.equal(config.groups.body,false);assert.equal(config.groups.play,false);
  assert.equal(p.dialogueJson,'{"idle":["my private words"]}');
  const saved=JSON.parse(p.schemesJson);assert.equal(saved.length,1);assert.equal(saved[0].name,'周末');
  assert.equal(saved[0].config.groups.body,false);assert.equal(saved[0].config.groups.play,false);
  assert.equal(saved[0].display.dialogueJson,undefined);
 }finally{store.dispose();}
});

test('a queued functional update reads the last confirmed state after a failed write',async()=>{
 let value:Record<string,unknown>={...preferenceDefaults},reject=true;
 const store=new PreferenceStore({getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:1,value}),subscribe:()=>()=>{},mutate:async ops=>{if(reject){reject=false;throw Error('write rejected');}for(const op of ops)value={...value,[op.path[0]!]:op.value};}},null);
 try{
  const first=store.update({size:240});
  const second=store.update(current=>({size:current.size+10}));
  await assert.rejects(first,/rejected/);await second;
  assert.equal(store.getSnapshot().value.size,190);assert.equal(store.getSnapshot().error,null);
 }finally{store.dispose();}
});

test('autonomous dialogue honors speech-off while direct interaction and token notices remain visible',()=>{
 const snapshot=fixture().engine.snapshot(),prefs={...preferenceDefaults,bubbleText:false};
 const render=(overridePriority:'ordinary'|'interaction'|'notice')=>renderToStaticMarkup(React.createElement(DialogueBubble,{snapshot,prefs,status:'休息',actions:null,children:null,overrideText:'test-pet-message',overridePriority}));
 assert.doesNotMatch(render('ordinary'),/test-pet-message/);
 assert.match(render('interaction'),/test-pet-message/);assert.match(render('notice'),/test-pet-message/);
});
