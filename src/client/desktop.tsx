import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DesktopCompanion} from './desktop-controller.js';
import {Widget,SettingsPanel} from './ui.js';
import {zh,type Translate} from './locales.js';
import {petLibrary} from '../pet/library.js';
import css from './styles.css';
import './desktop-bridge.js';
import {DesktopSettingsPanel} from './desktop-settings-panel.js';
const bridge=window.bigfishDesktop!;
const style=document.createElement('style');style.textContent=css+'html,body,#root{margin:0;background:transparent!important}body{overflow:hidden}.bf-widget{bottom:12px!important;right:12px!important;}.bf-desktop-settings{height:100vh;overflow:auto;box-sizing:border-box;background:var(--bf-bg,#fafbff);padding:24px;color:var(--bf-text,#253550)}.bf-desktop-settings input{max-width:300px}';document.head.append(style);
const petTransport=async(query:string,bytes?:Uint8Array)=>{const r=await bridge.petRequest!(query,bytes);return new Response(r.bytes.slice(),{status:r.status,headers:{'content-type':r.contentType}});};
void petLibrary.init(true,petTransport);
bridge.onHostChanged?.(()=>{petLibrary.dispose();void petLibrary.init(true,petTransport);});
const controller=new DesktopCompanion(bridge),t:Translate=k=>zh[k];
function App(){
 const query=new URLSearchParams(location.search),isSettings=query.has('settings');
 const [areaRequested,setAreaRequested]=useState(isSettings&&query.get('page')==='activity-area');
 const [url,setURL]=useState('http://127.0.0.1:3080'),[token,setToken]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [hostGeneration,setHostGeneration]=useState(0);
 useEffect(()=>{const query=matchMedia('(prefers-color-scheme: dark)'),previous=document.body.getAttribute('data-ds-dark-theme');const apply=()=>{if(query.matches)document.body.setAttribute('data-ds-dark-theme','');else document.body.removeAttribute('data-ds-dark-theme');};apply();query.addEventListener('change',apply);return()=>{query.removeEventListener('change',apply);if(previous===null)document.body.removeAttribute('data-ds-dark-theme');else document.body.setAttribute('data-ds-dark-theme',previous);};},[]);
 useEffect(()=>bridge.onHostChanged?.(()=>{setHostGeneration(g=>g+1);setToken('');setMessage('Host 已切换，已清空旧设置草稿。');}),[]);
 useEffect(()=>{if(!isSettings)return;let frame=0;const off=bridge.onSettingsNavigate?.(page=>{if(page!=='activity-area')return;setAreaRequested(false);cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setAreaRequested(true));});return()=>{cancelAnimationFrame(frame);off?.();};},[isSettings]);
 useEffect(()=>{if(isSettings){void bridge.state().then(s=>{if(s.url)setURL(s.url);});return;}
  const offVoice=bridge.onVoiceDisplay?.(state=>window.dispatchEvent(new CustomEvent('bigfish:voice-display',{detail:{state}})));
  const sample=document.createElement('canvas');sample.width=48;sample.height=36;const ctx=sample.getContext('2d',{willReadFrequently:true})!;
  const update=()=>{
   const regions:{x:number;y:number;width:number;height:number}[]=[];
   document.querySelectorAll<HTMLElement>('.bf-card,.bf-resize-corner,.bf-popover,.bf-restore').forEach(el=>{const r=el.getBoundingClientRect();regions.push({x:r.x,y:r.y,width:r.width,height:r.height});});
   for(const canvas of document.querySelectorAll<HTMLCanvasElement>('.bf-stage canvas')){
    const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,48,36);ctx.drawImage(canvas,0,0,48,36);const pixels=ctx.getImageData(0,0,48,36).data;
    for(let y=0;y<36;y++){let min=48,max=-1;for(let x=0;x<48;x++)if(pixels[(y*48+x)*4+3]!>24){min=Math.min(min,x);max=x;}
     if(max>=0)regions.push({x:r.x+min*r.width/48,y:r.y+y*r.height/36,width:(max-min+1)*r.width/48,height:r.height/36});
    }
   }
   bridge.regions(regions);
  };const timer=setInterval(update,200);return()=>{clearInterval(timer);offVoice?.();};
 },[isSettings]);
 if(!isSettings)return <div className="bf-surface"><Widget key={hostGeneration} controller={controller} t={t}/></div>;
 return <main className="bf-surface bf-desktop-settings"><h1>大肥鱼 · 桌面开发版</h1><p>关闭浏览器也能陪伴。Host 断开后保留本地互动。</p><label className="bf-field"><span>DSH Host 地址或启动登录链接</span><input value={url} onChange={e=>setURL(e.target.value)}/></label><label className="bf-field"><span>启动 token（粘贴完整登录链接时留空）</span><input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/></label><button disabled={busy} onClick={async()=>{setBusy(true);try{await bridge.connect(url,token);setURL((await bridge.state()).url);setToken('');setMessage('已连接，共享配置和角色库将同步。');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>连接 Host</button><p role="status">{message}</p><button onClick={()=>bridge.recall()}>叫回来</button><p>角色库、外观偏好、智能授权、记忆和预算与所连 Host 共用。离线保留最近显示，不会悄悄另存一套外观。Windows 实机、签名和公证仍需验收。</p><DesktopSettingsPanel key={`desktop-${hostGeneration}`} bridge={bridge}/><SettingsPanel key={`settings-${hostGeneration}`} controller={controller} t={t} initialPage="companionship" initialAreaOpen={areaRequested}/></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
addEventListener('pagehide',()=>controller.dispose());
