import test from 'node:test';
import assert from 'node:assert/strict';
import {initialIntelligencePolicy} from '../src/client/intelligence-defaults.js';
import {defaultPolicy} from '../src/companion/state.js';
import type {ConfigurationOptions} from '../src/companion/configuration-options.js';

const options:ConfigurationOptions={groups:[{id:'first',name:'First',models:[{id:'base',name:'Base'}]},{id:'current',name:'Current',models:[{id:'chosen',name:'Chosen'}]}],default:{provider:'first',model:'base'},workspaces:[{path:'/a',title:'A'},{path:'/empty',title:'No sessions'}],failures:[],catalogAvailable:true};
test('first-use defaults include the current session model and every known workspace without granting permission',()=>{
 const saved=structuredClone(defaultPolicy),before=structuredClone(saved);
 const draft=initialIntelligencePolicy(saved,options,{provider:'current',model:'chosen'});
 assert.equal(draft.enabled,false);assert.equal(draft.provider,'current');assert.equal(draft.model,'chosen');assert.deepEqual(draft.workspaces,['/a','/empty']);assert.deepEqual(saved,before);
});
test('a saved model and deliberate subset survive changed defaults and a missing catalog entry',()=>{
 const saved={...defaultPolicy,provider:'removed',model:'keep-me',workspaces:['/a']};
 assert.deepEqual(initialIntelligencePolicy(saved,options,{provider:'current',model:'chosen'}),saved);
 assert.deepEqual(initialIntelligencePolicy({...saved,workspaces:[]},options,null).workspaces,[]);
});
test('an unavailable current route falls back to an advertised default and a failed read preserves saved settings',()=>{
 assert.equal(initialIntelligencePolicy(defaultPolicy,options,{provider:'gone',model:'gone'}).provider,'first');
 assert.deepEqual(initialIntelligencePolicy(defaultPolicy,null,null),defaultPolicy);
 assert.equal(initialIntelligencePolicy(defaultPolicy,{...options,default:{provider:'gone',model:'gone'}},null).provider,'');
});
test('defaults never silently truncate a scope larger than the policy limit',()=>{
 const large={...options,workspaces:Array.from({length:101},(_,i)=>({path:`/${i}`,title:String(i)}))};
 assert.equal(initialIntelligencePolicy(defaultPolicy,large,null).workspaces.length,101);
});
