import React,{useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {useIntroduction} from '../../src/client/use-introduction.js';
import {DialogueBubble} from '../../src/client/dialogue-view.js';
import {preferenceDefaults} from '../../src/contract/preferences.js';
import type {Snapshot} from '../../src/contract/types.js';
import type {HostSnapshot} from '../../src/client/companion-host.js';
import type {DesktopBridge} from '../../src/client/desktop-bridge.js';
import css from '../../src/client/styles.css';

type IntroductionHost=Pick<HostSnapshot,'introducedAt'|'modelAvailable'|'display'>;
const persistedKey='bigfish-introduction-fixture-acknowledged';
let host:IntroductionHost={introducedAt:localStorage.getItem(persistedKey)?Number(localStorage.getItem(persistedKey)):null,modelAvailable:true,display:{client:'owner',kind:'web',expiresAt:Date.now()+600000}};
let eligible=true,visible:DocumentVisibilityState=new URLSearchParams(location.search).has('hidden')?'hidden':'visible',reject=false,settingsPage='closed',version=0;
const listeners=new Set<()=>void>(),hostChanged=new Set<()=>void>(),calls:{op:string;body:Record<string,unknown>}[]=[];
let holdConfirm=false;const held:((success:boolean)=>void)[]=[];
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
const snapshot=()=>version;
const publish=()=>{version++;for(const fn of listeners)fn();};
const refresh=async()=>{host={...host};publish();};
Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible});
// No DSH, model, permissions or token charging exists in this fixture. Only the acknowledgement carrier is controlled.
window.bigfishDesktop={onHostChanged:(fn:()=>void)=>{hostChanged.add(fn);return()=>{hostChanged.delete(fn);};},request:async(op:string,body:Record<string,unknown>)=>{
 calls.push({op,body});
 if(op!=='introduce')throw Error('Unexpected fixture operation');
 if(holdConfirm){holdConfirm=false;return new Promise<{result:boolean}>((resolve,reject)=>{held.push(success=>success?resolve({result:true}):reject(Error('旧 Host 的确认失败')));});}
 if(reject)throw Error('测试：确认失败，请重试。');
 if(host.introducedAt!==null||host.display?.client!==body.client||host.display.expiresAt<=Date.now())return {result:false};
 host={...host,introducedAt:Date.now()};localStorage.setItem(persistedKey,String(host.introducedAt));
 return {result:true};
}} as unknown as DesktopBridge;
(window as any).introductionFixture={
 calls,
 holdConfirm(){holdConfirm=true;},
 heldCount(){return held.length;},
 settleOld(success:boolean){for(const finish of held.splice(0))finish(success);},
 switchHost(){host={introducedAt:null,modelAvailable:true,display:{client:'owner',kind:'web',expiresAt:Date.now()+600000}};settingsPage='closed';for(const changed of hostChanged)changed();publish();},
 visibility(value:DocumentVisibilityState){visible=value;document.dispatchEvent(new Event('visibilitychange'));},
 eligible(value:boolean){eligible=value;publish();},
 owner(client:string){host={...host,display:{client,kind:'web',expiresAt:Date.now()+600000}};publish();},
 expire(){host={...host,display:{client:host.display!.client,kind:'web',expiresAt:Date.now()-1}};publish();},
 expireAfter(ms:number){host={...host,display:{client:host.display!.client,kind:'web',expiresAt:Date.now()+ms}};publish();},
 reject(value:boolean){reject=value;},
 state(){return {introducedAt:host.introducedAt,settingsPage,policyEnabled:false,usedTokens:0,calls};},
};
const view:Snapshot={sessionId:'fixture',turn:0,sequence:0,state:'idle',modelKey:null,rate:null,quality:'unavailable',baseline:null,relativeRate:null,pressure:0,activity:0,fatigue:0,whipHz:0,wallElapsed:0,workElapsed:0,generationElapsed:0,tools:0,tokens:0,completionSerial:0};
const text='我学会当小管家啦！智能模式会额外消耗模型 token，并将所选会话摘要发送给你选择的模型。';
function Client({client}:{client:string}){
 useSyncExternalStore(subscribe,snapshot);
 const intro=useIntroduction({host,client,eligible,refresh});
 const act=async(settings:boolean)=>{if(await intro.dismiss()){if(settings)settingsPage='intelligence';publish();}};
 return <section data-testid={`client-${client}`}>
  <h2>{client}</h2>
  <DialogueBubble snapshot={view} prefs={{...preferenceDefaults,bubbleEnabled:false,bubbleText:false,bubbleStatus:false}} status="休息一下" actions={<span>操作栏</span>} overrideText={intro.invite?text:undefined} overridePriority="notice">
   {intro.invite&&<div className="bf-button-row"><button disabled={intro.pending} onClick={()=>void act(true)}>了解并设置</button><button disabled={intro.pending} onClick={()=>void act(false)}>保持普通模式</button></div>}
   {intro.error&&<p role="alert">{intro.error}</p>}
  </DialogueBubble>
 </section>;
}
function App(){return <main className="bf-surface" style={{padding:20,display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}><style>{css}</style><Client client="owner"/><Client client="other"/></main>;}
createRoot(document.getElementById('root')!).render(<App/>);
