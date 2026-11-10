import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {decodeLifestyle} from '../companion/config.js';
import {capabilityStatuses} from '../companion/capability-status.js';
import type {Preferences} from '../contract/preferences.js';
import {petLibrary} from '../pet/library.js';
import {useCompanionHost} from './companion-host.js';
import {recognitionFactory,localVoices} from './voice-session.js';

export function CapabilityReadiness({prefs,demo}:{prefs:Preferences;demo:boolean}){
 useSyncExternalStore(petLibrary.subscribe,petLibrary.getSnapshot);
 const {state}=useCompanionHost(!demo),pet=petLibrary.active?.pet,policy=state?.policy;
 const [opened,setOpened]=useState(false),[desktopVoice,setDesktopVoice]=useState(false),[voices,setVoices]=useState(false);
 useEffect(()=>{const synth=window.speechSynthesis;if(!synth)return;const read=()=>setVoices(localVoices(synth.getVoices()).length>0);read();synth.addEventListener('voiceschanged',read);return()=>synth.removeEventListener('voiceschanged',read);},[]);
 useEffect(()=>{const bridge=window.bigfishDesktop;if(!opened||!bridge?.environment)return;let disposed=false,epoch=0;const read=()=>{const current=++epoch;void bridge.environment!().then(s=>{if(!disposed&&epoch===current)setDesktopVoice(s.voice.configured);}).catch(()=>{if(!disposed&&epoch===current)setDesktopVoice(false);});};read();const off=bridge.onHostChanged?.(()=>{setDesktopVoice(false);read();});return()=>{disposed=true;off?.();};},[opened]);
 const rows=capabilityStatuses(decodeLifestyle(JSON.parse(prefs.lifestyleJson)),{
  demo,desktop:!!window.bigfishDesktop,host:!!state,modelAvailable:!!state?.modelAvailable,modelConfigured:!!policy?.model.trim()&&!!policy.provider.trim(),authorizedWorkspaces:!!policy?.workspaces.length,intelligenceEnabled:!!policy?.enabled,budgetRemaining:!!state&&state.today.used+state.today.reserved<state.policy.dailyTokens,
  role:{builtin:!pet,movement:!!pet?.manifest.behaviors?.movement,touch:!!Object.keys(pet?.manifest.behaviors?.interactions??{}).length,home:!!pet?.manifest.home,paired:!!pet?.manifest.behaviors?.paired,life:!!Object.keys(pet?.manifest.behaviors?.life??{}).length},
  perception:{input:!window.bigfishDesktop&&recognitionFactory(window)!==null,output:voices,screenshot:!!state?.screenshotAvailable,desktopVoice},
 });
 return <details className="bf-disclosure" data-testid="capability-readiness" onToggle={e=>setOpened(e.currentTarget.open)}><summary>功能状态 · 按当前角色与环境</summary>
  <p className="bf-help">全能型选择全部能力；模型、麦克风、截图与桌面权限仍需单独启用。预览版不代表正式双平台发行已验收。</p>
  <ul style={{listStyle:'none',padding:0,margin:0}}>{rows.map(row=><li key={row.id} data-capability={row.id} data-status={row.state} style={{padding:'12px 0',borderBottom:'1px solid var(--bf-line)'}}>
   <div style={{display:'flex',gap:12,justifyContent:'space-between',alignItems:'center'}}><strong>{row.name}</strong><span style={{fontSize:12,lineHeight:'18px',padding:'2px 8px',borderRadius:6,background:'var(--bf-soft)',whiteSpace:'nowrap'}}>{row.label}</span></div>
   <p className="bf-help">{row.detail}</p>
  </li>)}</ul>
 </details>;
}
