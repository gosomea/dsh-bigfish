import React,{useEffect,useRef,useState} from 'react';
import type {DesktopBridge,DesktopEnvironment} from './desktop-bridge.js';
import {VoiceServiceDraft,type VoiceServiceValues} from './settings-drafts.js';
export function DesktopSettingsPanel({bridge}:{bridge:DesktopBridge}){
 const draft=useRef(new VoiceServiceDraft()),mounted=useRef(true),busyNow=useRef(false),request=useRef(0);
 const [state,setState]=useState<DesktopEnvironment|null>(null),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false),[voice,setVoice]=useState(()=>draft.current.snapshot());
 const {endpoint,model,key}=voice;
 const current=(epoch:number,id:number)=>mounted.current&&draft.current.epoch===epoch&&request.current===id;
 const receive=(next:DesktopEnvironment,epoch:number,id:number)=>{if(!current(epoch,id))return false;setState(next);draft.current.load(next.voice,epoch);setVoice(draft.current.snapshot());return true;};
 const editVoice=(field:keyof VoiceServiceValues,value:string)=>{draft.current.edit(field,value);setVoice(draft.current.snapshot());};
 useEffect(()=>{
  mounted.current=true;
  const read=async()=>{if(busyNow.current||!bridge.environment)return;const epoch=draft.current.epoch,id=++request.current;try{receive(await bridge.environment(),epoch,id);}catch(e){if(current(epoch,id))setIssue((e as Error).message);}};
  const off=bridge.onHostChanged?.(()=>{draft.current.reset();request.current++;busyNow.current=false;setBusy(false);setState(null);setVoice(draft.current.snapshot());setIssue('Host 已切换，语音服务草稿已清空。');void read();});
  void read();const timer=setInterval(()=>void read(),10000);
  return()=>{mounted.current=false;request.current++;clearInterval(timer);off?.();};
 },[bridge]);
 const change=async(field:keyof DesktopEnvironment['settings'],value:boolean)=>{
  if(!state||busyNow.current)return;
  const epoch=draft.current.epoch,id=++request.current;busyNow.current=true;setBusy(true);setIssue('');
  try{if(!bridge.configureDesktop||!bridge.environment)throw Error('当前桌面缺少配置接口，请升级应用。');await bridge.configureDesktop({...state.settings,[field]:value},state.revision,field==='windowGeometry'?value:undefined,field==='launchAtLogin'?value:undefined);receive(await bridge.environment(),epoch,id);}
  catch(e){if(current(epoch,id))setIssue((e as Error).message);}
  finally{if(current(epoch,id)){busyNow.current=false;setBusy(false);}}
 };
 const saveVoice=async(clear=false)=>{
  if(busyNow.current)return;
  const epoch=draft.current.epoch,id=++request.current,sent=clear?{endpoint:'',model:'whisper-1',key:''}:draft.current.snapshot();busyNow.current=true;setBusy(true);setIssue('');
  try{
   if(!bridge.configureVoice||!bridge.environment)throw Error('当前桌面缺少语音服务配置接口，请升级应用。');
   await bridge.configureVoice(sent);const next=await bridge.environment();if(!current(epoch,id))return;
   if(clear)for(const field of ['endpoint','model','key'] as const)draft.current.edit(field,sent[field]);
   draft.current.saved(sent,next.voice,epoch);setVoice(draft.current.snapshot());setState(next);setIssue(clear?'语音服务和密钥已清除。':'语音端点已保存；请在“语音交流”明确允许并按住说话。');
  }catch(e){if(current(epoch,id))setIssue((e as Error).message);}
  finally{if(current(epoch,id)){busyNow.current=false;setBusy(false);}}
 };
 return <details className="bf-disclosure" data-testid="desktop-settings"><summary>桌面、显示器与语音服务</summary>
 <p className="bf-help">桌面授权独立保存在所连 Host，不属于角色包或类型预设；切换类型不会开启感知、跨屏、麦克风或修改模型预算。</p>
 {state?<><label className="bf-field"><span>允许主动跨屏散步 · 约五分钟一次，仅空闲且有行走素材时</span><input type="checkbox" checked={state.settings.crossScreen} disabled={busy||state.displays.length<2} onChange={e=>void change('crossScreen',e.target.checked)}/></label>
 <label className="bf-field"><span>允许本设备读取窗口位置和大小以在边缘探头 · 不读取标题、截图或内容</span><input aria-label="授权窗口几何感知" type="checkbox" checked={state.settings.windowGeometry&&state.geometry.localGranted===true} disabled={busy} onChange={e=>void change('windowGeometry',e.target.checked)}/></label><p role="status">窗口感知：{state.geometry.state} · {state.geometry.message||'关闭时不会查询其他窗口。'}</p>
 <label className="bf-field"><span>宠物窗口置顶</span><input type="checkbox" checked={state.settings.alwaysOnTop} disabled={busy} onChange={e=>void change('alwaysOnTop',e.target.checked)}/></label>
 <label className="bf-field"><span>登录系统后启动 · 安装版中明确设置才修改系统启动项</span><input type="checkbox" checked={state.settings.launchAtLogin} disabled={busy||!state.packaged} onChange={e=>void change('launchAtLogin',e.target.checked)}/></label>
 <p className="bf-help">显示器：{state.displays.map(d=>`${d.label||d.id}（${Math.round(d.scaleFactor*100)}%）`).join('、')}。拔插、缩放或睡醒后会校正位置并停止旧步态。</p></>:<p role="status">连接兼容 Host 后配置桌面授权；本地宠物仍可陪伴。</p>}
 <h3>桌面按住录音 · 可选转写服务</h3><p className="bf-help">配置兼容 OpenAI Audio Transcriptions 的完整端点；可使用本机服务。仅按住时录音，松开后把本次音频发到此端点，识别文字先预览，不自动问模型。语音服务可能独立收费，不计入宠物 token 预算。密钥只在此设备的系统安全存储中保存，不进入 Host、角色包或预设。</p>
 <label className="bf-field bf-field-stack"><span>转写端点完整 URL</span><input aria-label="桌面转写端点" disabled={busy} placeholder="http://127.0.0.1:8000/v1/audio/transcriptions" value={endpoint} onChange={e=>editVoice('endpoint',e.target.value)}/></label>
 <label className="bf-field"><span>语音模型</span><input aria-label="语音模型" disabled={busy} value={model} onChange={e=>editVoice('model',e.target.value)}/></label><label className="bf-field bf-field-stack"><span>语音 API Key · 留空保留同地址已有密钥，更换地址不继承</span><input type="password" autoComplete="off" disabled={busy} value={key} onChange={e=>editVoice('key',e.target.value)}/></label>
 <div className="bf-button-row"><button disabled={busy||!endpoint} onClick={()=>void saveVoice()}>保存本机语音服务</button><button disabled={busy} onClick={()=>void saveVoice(true)}>清除语音服务和密钥</button></div>
 {issue&&<p role="status">{issue}</p>}
 </details>;
}
