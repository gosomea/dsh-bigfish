import React,{useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {IntelligenceSettings} from '../../src/client/intelligence-settings.js';
import {LifeActions} from '../../src/client/life-actions.js';
import {DesktopSettingsPanel} from '../../src/client/desktop-settings-panel.js';
import {PreferenceStore} from '../../src/client/preferences-store.js';
import {presetConfig} from '../../src/companion/config.js';
import {emptyState,decodePolicy} from '../../src/companion/state.js';
import {lifeDefaults} from '../../src/companion/life.js';
import type {Companion} from '../../src/client/controller.js';
import type {DesktopBridge,DesktopEnvironment} from '../../src/client/desktop-bridge.js';
import type {HostSnapshot} from '../../src/client/companion-host.js';
import css from '../../src/client/styles.css';

// This fixture exercises real settings/events. It has no Host, provider, microphone or animation player.
const changed=new Set<()=>void>(),calls:{op:string;body:Record<string,unknown>}[]=[],localActions:unknown[]=[];
const preferences=new PreferenceStore(null,null),base=emptyState();
const query=new URLSearchParams(location.search),modelsMode=query.get('mode')==='models',storedPolicy=modelsMode?localStorage.getItem('bigfish.fixture.model-policy'):null;
let host:HostSnapshot={...base,life:{...lifeDefaults(),interactions:1,firstSeen:1700000000000},policy:{...base.policy,workspaces:['/fixture']},today:{used:0,reserved:0,automatic:0,estimated:false},modelAvailable:true,collections:[{id:'fixture-card',kind:'postcard',title:'测试来源明信片',text:'受控测试数据',createdAt:1700000000000,sources:[{workspace:'/fixture',session:'fixture-session',seq:1}]}]};
if(modelsMode){host={...host,policy:storedPolicy?decodePolicy(JSON.parse(storedPolicy)):query.get('saved')==='custom'?{...base.policy,provider:'second',model:'craft',workspaces:['/beta']}:query.get('saved')==='all'?{...base.policy,provider:'first',model:'fast',workspaces:['/alpha','/beta']}:query.get('saved')==='missing'?{...base.policy,provider:'retired',model:'old-model',workspaces:['/beta']}:{...base.policy,workspaces:[]},policyRevision:storedPolicy||query.has('saved')?1:0};}
let options={groups:[{id:'first',name:'First Provider',models:[{id:'fast',name:'Fast Model'},{id:'thought',name:'Thought Model'}]},{id:'second',name:'Second Provider',models:[{id:'craft',name:'Craft Model'}]}],default:{provider:'first',model:'fast'},workspaces:modelsMode?[{path:'/alpha',title:'Alpha'},{path:'/beta',title:'Beta'}]:[{path:'/fixture',title:'Fixture'}],failures:[] as {id:string;name:string}[],catalogAvailable:true};
let rejectOptions=query.get('catalogError')==='1',holdOptions=false;
const heldOptions:(()=>void)[]=[];
const mainSelection=query.get('current')==='second'?{provider:'second',model:'craft'}:{provider:'first',model:'fast'};
let environment:DesktopEnvironment={revision:0,packaged:false,settings:{crossScreen:false,windowGeometry:false,alwaysOnTop:true,launchAtLogin:false},displays:[{id:1,label:'fixture',scaleFactor:1,workArea:{x:0,y:0,width:1200,height:800}}],geometry:{state:'off',windows:0,localGranted:false},voice:{configured:true,endpoint:'https://old.invalid/transcribe',model:'custom-model'}};
let rejectClear=true,holdEnvironment=false;
const held:(()=>void)[]=[];
const bridge={
 state:async()=>({url:'https://fixture.invalid',connected:true,host,platform:'fixture'}),
 onHostChanged:(fn:()=>void)=>{changed.add(fn);return()=>changed.delete(fn);},
 request:async(op:string,body:Record<string,unknown>)=>{calls.push({op,body});if(op==='configuration-options'){const value=structuredClone(options);if(rejectOptions)throw Error('测试：模型目录暂不可用');if(holdOptions){holdOptions=false;return new Promise<{result:typeof options}>(resolve=>heldOptions.push(()=>resolve({result:value})));}return {result:value};}if(op==='clear-diary'){if(rejectClear)throw Error('测试：清空失败，请重试。');host={...host,life:lifeDefaults()};}else if(op==='remove-collection')throw Error('测试：明信片移除失败。');else if(op==='configure'){host={...host,policy:decodePolicy(body.policy),policyRevision:host.policyRevision+1};if(modelsMode)localStorage.setItem('bigfish.fixture.model-policy',JSON.stringify(host.policy));}else throw Error('fixture operation absent');return {result:true};},
 environment:async()=>{const snapshot=structuredClone(environment);if(holdEnvironment)return new Promise<DesktopEnvironment>(resolve=>held.push(()=>resolve(snapshot)));return snapshot;},
 configureVoice:async(value:{endpoint:string;model:string;key:string})=>{calls.push({op:'voice',body:value});environment={...environment,voice:{configured:!!value.endpoint,endpoint:value.endpoint,model:value.model}};return true;},
 configureDesktop:async()=>true,
} as unknown as DesktopBridge;
window.bigfishDesktop=bridge;
(window as any).settingsFixture={
 calls,localActions,retryClear:()=>{rejectClear=false;},holdEnvironment:()=>{holdEnvironment=true;},
 switchHost:()=>{holdEnvironment=false;environment={...environment,voice:{configured:true,endpoint:'https://new-host.invalid/transcribe',model:'new-model'}};for(const fn of changed)fn();},
 releaseOld:()=>{for(const resolve of held.splice(0))resolve();},
 modelState:()=>({policy:host.policy,used:host.today.used,mainSelection,calls:structuredClone(calls)}),
 addWorkspace:()=>{options={...options,workspaces:[...options.workspaces,{path:'/gamma',title:'Gamma'}]};},
 rejectOptions:(value:boolean)=>{rejectOptions=value;},holdOptions:()=>{holdOptions=true;},heldOptions:()=>heldOptions.length,releaseOptions:()=>{for(const done of heldOptions.splice(0))done();},
 switchModelHost:()=>{options={groups:[{id:'new-provider',name:'New Provider',models:[{id:'new-default',name:'New Host Model'}]}],default:{provider:'new-provider',model:'new-default'},workspaces:[{path:'/new-host',title:'New Host Workspace'}],failures:[],catalogAvailable:true};host={...base,policy:{...base.policy,workspaces:[]},today:{used:0,reserved:0,automatic:0,estimated:false},modelAvailable:true};for(const fn of changed)fn();},
};
const controller={preferences,canOpenSession:()=>false,currentModel:()=>mainSelection} as Companion;
function App(){useSyncExternalStore(preferences.subscribe,preferences.getSnapshot);return <main className="bf-surface" style={{padding:20,maxWidth:520}}><style>{css}</style>{query.get('mode')==='desktop'?<DesktopSettingsPanel bridge={bridge}/>:query.get('mode')==='actions'?<LifeActions config={presetConfig('all')} state={host} onInteract={kind=>{localActions.push({kind});return true;}} onPlayProgram={request=>{localActions.push(request);return false;}}/>:<IntelligenceSettings controller={controller} demo={false} {...(modelsMode?{section:'intelligence',variant:'section'} as const:{})}/>}</main>;}
void preferences.update({lifestyleJson:JSON.stringify({...presetConfig('all'),groups:{...presetConfig('all').groups,perception:false}})}).then(()=>createRoot(document.getElementById('root')!).render(<App/>));
