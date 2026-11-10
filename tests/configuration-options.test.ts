import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readConfigurationOptions} from '../src/companion/configuration-options.js';
import {CompanionHostStore} from '../src/companion/host-store.js';
import {installCompanion} from '../src/companion/host.js';

test('configuration options reuse the session catalog and whitelist model and zero-session workspace metadata',async()=>{
 let fallbackCalls=0;
 const options=await readConfigurationOptions({
  catalog:async()=>({default:{provider:'deepseek',model:'chat',reasoningEffort:'high'},groups:[
   {id:'deepseek',name:'DeepSeek',apiKey:'DO_NOT_RETURN',models:[{id:'chat',name:'DeepSeek Chat',description:'PRIVATE_DESCRIPTION',credential:'DO_NOT_RETURN'},{id:'chat',name:'duplicate'},null,{id:'',name:'invalid'}]},
   {id:'deepseek',name:'duplicate',models:[{id:'other'}]},
  ],failures:[{id:'offline',name:'Offline',message:'token=DO_NOT_RETURN'}]}),
  providers:()=>{fallbackCalls++;return [];},models:async()=>[],
  workspaces:()=>[{id:'empty',path:'/empty',title:'No sessions yet',sessionIds:[],secrets:'DO_NOT_RETURN'},{path:'/empty',title:'duplicate'},{path:7},null],
  knownWorkspaces:['/task','/saved','/empty','/task'],
 });
 assert.equal(fallbackCalls,0);
 assert.deepEqual(options,{groups:[{id:'deepseek',name:'DeepSeek',models:[{id:'chat',name:'DeepSeek Chat'}]}],default:{provider:'deepseek',model:'chat'},workspaces:[{path:'/empty',title:'No sessions yet'},{path:'/task',title:'/task'},{path:'/saved',title:'/saved'}],failures:[{id:'offline',name:'Offline'}],catalogAvailable:true});
 assert.doesNotMatch(JSON.stringify(options),/DO_NOT_RETURN|PRIVATE_DESCRIPTION|reasoningEffort|sessionIds|apiKey/);
});

test('live registry fallback isolates provider failures and keeps model identifiers exact',async()=>{
 const calls:string[]=[];
 const result=await readConfigurationOptions({
  catalog:async()=>{throw Error('incompatible catalog token=DO_NOT_RETURN');},
  providers:()=>[{id:'good',name:'Good',key:'DO_NOT_RETURN'},{id:'broken',name:'Broken'},{id:'good',name:'duplicate'},{id:' ',name:'invalid'}],
  models:async provider=>{calls.push(provider);if(provider==='broken')throw Error('secret=DO_NOT_RETURN');return [{id:'precise/model:1',name:'Readable model',apiKey:'DO_NOT_RETURN'},{id:' too-long '.repeat(30)},false];},
  defaultSelection:()=>({provider:'good',model:'precise/model:1',secret:'DO_NOT_RETURN'}),knownWorkspaces:[],
 });
 assert.deepEqual(calls,['good','broken']);assert.equal(result.catalogAvailable,true);
 assert.deepEqual(result.groups,[{id:'good',name:'Good',models:[{id:'precise/model:1',name:'Readable model'}]}]);
 assert.deepEqual(result.default,{provider:'good',model:'precise/model:1'});assert.deepEqual(result.failures,[{id:'broken',name:'Broken'}]);
 assert.doesNotMatch(JSON.stringify(result),/DO_NOT_RETURN/);
});

test('missing or malformed optional services preserve known workspaces without inventing a catalog',async()=>{
 const expected={groups:[],default:null,workspaces:[{path:'/saved',title:'/saved'}],failures:[],catalogAvailable:false};
 assert.deepEqual(await readConfigurationOptions({knownWorkspaces:['/saved','/saved','', 'x'.repeat(2001)]}),expected);
 assert.deepEqual(await readConfigurationOptions({catalog:async()=>({groups:'invalid'}),providers:()=>{throw Error('secret');},models:async()=>[],defaultSelection:()=>({provider:7,model:'invalid'}),workspaces:()=>{throw Error('private failure');},knownWorkspaces:['/saved']}),expected);
 assert.equal((await readConfigurationOptions({catalog:async()=>({groups:[],default:null}),knownWorkspaces:[]})).catalogAvailable,true);
});

async function fixture(fn:(store:CompanionHostStore)=>Promise<void>){
 const directory=await mkdtemp(join(tmpdir(),'bigfish-configuration-options-'));
 try{await fn(new CompanionHostStore(directory));}finally{await rm(directory,{recursive:true,force:true});}
}

test('the Host options operation is read-only, independent of polling, and keeps HTTP admission rules',()=>fixture(async store=>{
 let handle:((request:Request)=>Promise<Response>)|undefined,prepared=0,catalogReads=0,workspaceReads=0;
 const effects:(()=>void)[]=[];
 const services:Record<string,unknown>={
  llm:{prepareCall:async()=>{prepared++;throw Error('A model must never be prepared here');},listProviders:()=>{throw Error('The session catalog should be used');},listModels:async()=>[]},
  sessionController:{modelCatalog:async()=>{catalogReads++;return {default:{provider:'good',model:'model'},groups:[{id:'good',name:'Good',models:[{id:'model',name:'Model',apiKey:'DO_NOT_RETURN'}]}]};}},
  workspaceRegistry:{list:()=>{workspaceReads++;return [{path:'/no-session',title:'Empty workspace',sessionIds:[]}];}},
  agentDefaultModel:{currentSelection:()=>({provider:'good',model:'model'})},
  connection:{fetch:{register(route:{path:string;fetch:(request:Request)=>Promise<Response>}){if(route.path==='/api/bigfish-companion')handle=route.fetch;return()=>{};}}},
 };
 const before=await store.snapshot();
 installCompanion({inject(keys,callback){if(keys.length===1&&services[keys[0]!]!==undefined)callback({[keys[0]!]:services[keys[0]!],effect(fn:()=>unknown){const dispose=fn();if(typeof dispose==='function')effects.push(dispose as ()=>void);}});}},store);
 const request=(body:unknown,origin='http://host',type='application/json')=>handle!(new Request('http://host/api/bigfish-companion',{method:'POST',headers:{'content-type':type,origin},body:JSON.stringify(body)}));
 try{
  for(let i=0;i<3;i++)assert.equal((await handle!(new Request('http://host/api/bigfish-companion'))).status,200);
  assert.equal(catalogReads,0);assert.equal(workspaceReads,0);
  assert.equal((await request({op:'configuration-options'},'http://other')).status,403);
  assert.equal((await request({op:'configuration-options'},'http://host','text/plain')).status,415);
  assert.equal((await handle!(new Request('http://host/api/bigfish-companion',{method:'PUT'}))).status,405);
  const response=await request({op:'configuration-options'});assert.equal(response.status,200);
  const value=(await response.json()).result;
  assert.deepEqual(value.groups,[{id:'good',name:'Good',models:[{id:'model',name:'Model'}]}]);
  assert.deepEqual(value.workspaces,[{path:'/no-session',title:'Empty workspace'}]);
  assert.equal(prepared,0);assert.equal(catalogReads,1);assert.equal(workspaceReads,1);
  assert.deepEqual(await store.snapshot(),before);
  assert.doesNotMatch(JSON.stringify(value),/DO_NOT_RETURN/);
 }finally{for(const dispose of effects.reverse())dispose();}
}));
