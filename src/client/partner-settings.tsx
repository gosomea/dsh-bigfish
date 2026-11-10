import React,{useEffect,useState} from 'react';
import type {Lifestyle} from '../companion/config.js';
import type {LifeOptions} from '../companion/life-options.js';
import {petLibrary} from '../pet/library.js';
import {pairedRoleIssue,partnerMotion} from '../pet/partner.js';
import {PetCanvas} from '../pet/canvas.js';
import {preferenceDefaults} from '../contract/preferences.js';
import builtinThumbnail from '../../examples/bigfish-playful/thumbnail.png';
import {usePartnerPet} from './partner-pet.js';
import {CompanionCanvas} from './companion-canvas.js';
import {SettingsSelect} from './settings-select.js';

/** Selecting a buddy reads only installed material. It does not change the primary role. */
export function PartnerSettings({config,count,richness,busy,onChange}:{config:Lifestyle;count:number;richness:number;busy:boolean;onChange:(patch:Partial<LifeOptions>)=>void}){
 const partner=usePartnerPet(config.partnerRole),[preview,setPreview]=useState(false);
 useEffect(()=>setPreview(false),[partner.identity]);
 const roleIssue=partner.ready?pairedRoleIssue(petLibrary.active?.pet??null,partner.loaded?.pet??null,{interactions:count,growthUnlocks:config.groups.growth&&config.growthUnlocks,richness}):partner.issue;
 const currentMissing=partner.status==='missing',reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const previewMotion=partner.loaded?(partnerMotion(partner.loaded.pet,'wave',false)??partner.loaded.pet.manifest.fallbacks.idle):'wave';
 return <section aria-label="小伙伴角色" data-testid="partner-settings">
  <label className="bf-field"><span>小伙伴角色</span><SettingsSelect aria-label="小伙伴角色" disabled={busy} value={config.partnerRole} onChange={e=>onChange({partnerRole:e.target.value})}>
   <option value="follow-main">跟随主角色</option><option value="builtin">大肥鱼 · 内置</option>
   {petLibrary.catalog.entries.map(entry=><option key={entry.key} value={entry.key}>{entry.name} · {entry.version}</option>)}
   {currentMissing&&<option value={config.partnerRole}>未安装 · {config.partnerRole}</option>}
  </SettingsSelect></label>
  <p className="bf-help">一次邀请一名伙伴，只读取本 Host 已安装的角色，不更换主角色、不自动下载。两只共用当前舞台、行为调度和预算；选择全能型也不会增加模型调用。</p>
  <div className="bf-partner-card" data-partner-state={partner.status} style={{border:'1px solid var(--bf-line)',borderRadius:12,padding:12,background:'var(--bf-soft)'}}>
   {partner.ready&&<img className="bf-role-thumb" src={partner.loaded?.thumbnail??builtinThumbnail} alt={`${partner.name} · 伙伴预览`}/>}
   <strong>{partner.name}</strong>
   <p className="bf-help" role="status">{roleIssue||'双方招呼、互动和告别素材已就绪。实际邀请还受当前动作表现、成长解锁和任务状态控制。'}</p>
   {partner.ready&&<button type="button" disabled={busy} onClick={()=>setPreview(value=>!value)}>{preview?'收起伙伴预览':'预览伙伴动作'}</button>}
  </div>
  {preview&&partner.ready&&<div aria-label="伙伴动作预览" style={{maxWidth:340,background:'var(--bf-soft)',borderRadius:12}}>
   {partner.loaded?<PetCanvas key={partner.identity} loaded={partner.loaded} input={{state:'idle',richness:2,reduced,activity:0,pressure:0,preview:previewMotion,previewSerial:partner.identity}} prefs={{...preferenceDefaults,whipEnabled:false,sceneryVisible:false}} scenery={false}/>:<CompanionCanvas id="wave" serial={partner.identity} reduced={reduced}/>}
   <p className="bf-help">只预览所选角色的真实素材；没有双宠动作时仅预览其待机，不会用站立图平移模拟互动。</p>
  </div>}
 </section>;
}
