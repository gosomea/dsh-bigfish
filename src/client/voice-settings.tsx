import {SettingsSelect} from './settings-select.js';
import React,{useEffect,useRef,useState} from 'react';
import {PushToTalkSession,localVoices,recognitionFactory} from './voice-session.js';
import {companionRequest,type HostSnapshot} from './companion-host.js';
import {DesktopVoiceSession} from './desktop-voice.js';
const voiceDisplay=(state:'listen'|'speak'|'idle')=>{window.dispatchEvent(new CustomEvent('bigfish:voice-display',{detail:{state}}));window.bigfishDesktop?.voiceDisplay?.(state);};
/** Device permission and per-conversation reading consent never enter portable pet schemes. */
export function VoiceSettings({enabled,host,demo}:{enabled:boolean;host:HostSnapshot|null;demo:boolean}){
 const [consent,setConsent]=useState(false),[listening,setListening]=useState(false),[text,setText]=useState(''),[workspace,setWorkspace]=useState(''),[issue,setIssue]=useState(''),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[readReply,setReadReply]=useState(false),[voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[voiceId,setVoiceId]=useState('');
 const capture=useRef<PushToTalkSession|DesktopVoiceSession|null>(null),mounted=useRef(true),requestEpoch=useRef(0),speechEpoch=useRef(0),enabledNow=useRef(enabled);enabledNow.current=enabled;
 const desktop=window.bigfishDesktop;const [desktopVoice,setDesktopVoice]=useState(false);
 const supported=desktop?desktopVoice:typeof window!=='undefined'&&recognitionFactory(window)!==null;
 useEffect(()=>{if(!desktop?.environment)return;let gone=false;const read=()=>void desktop.environment!().then(s=>{if(!gone)setDesktopVoice(s.voice.configured);}).catch(()=>{if(!gone)setDesktopVoice(false);});read();const timer=setInterval(read,5000);return()=>{gone=true;clearInterval(timer);};},[desktop]);
 const stopSpeech=()=>{speechEpoch.current++;window.speechSynthesis?.cancel();voiceDisplay('idle');};
 useEffect(()=>desktop?.onVoiceReset?.(()=>{capture.current?.cancel();stopSpeech();setConsent(false);}),[desktop]);
 useEffect(()=>desktop?.onHostChanged?.(()=>{requestEpoch.current++;capture.current?.cancel();stopSpeech();setConsent(false);setText('');setWorkspace('');setIssue('');setAnswer('');setReadReply(false);setBusy(false);}),[desktop]);
 useEffect(()=>{if(!supported){capture.current?.cancel();setConsent(false);}},[supported]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;capture.current?.cancel();speechEpoch.current++;window.speechSynthesis?.cancel();voiceDisplay('idle');};},[]);
 useEffect(()=>{const synth=window.speechSynthesis;if(!synth)return;const update=()=>setVoices(localVoices(synth.getVoices()));update();synth.addEventListener('voiceschanged',update);return()=>synth.removeEventListener('voiceschanged',update);},[]);
 useEffect(()=>{if(!consent||!enabled)capture.current?.cancel();if(!enabled){requestEpoch.current++;stopSpeech();setReadReply(false);setConsent(false);setBusy(false);}},[consent,enabled]);
 useEffect(()=>{const cancel=()=>{if(document.visibilityState!=='visible')capture.current?.cancel();};const blur=()=>capture.current?.cancel();document.addEventListener('visibilitychange',cancel);window.addEventListener('blur',blur);return()=>{document.removeEventListener('visibilitychange',cancel);window.removeEventListener('blur',blur);};},[]);
 const chosen=voices.find(v=>v.voiceURI===voiceId)??voices[0];
 const speak=(value:string)=>{if(!mounted.current||!enabledNow.current||!chosen||!window.speechSynthesis)return;try{capture.current?.cancel();stopSpeech();const epoch=speechEpoch.current,u=new SpeechSynthesisUtterance(value.slice(0,3000));u.voice=chosen;u.lang=chosen.lang;u.rate=1;u.onstart=()=>{if(epoch===speechEpoch.current)voiceDisplay('speak');};u.onend=u.onerror=()=>{if(epoch===speechEpoch.current)voiceDisplay('idle');};window.speechSynthesis.speak(u);}catch{voiceDisplay('idle');setIssue('当前设备未能开始朗读，可以继续阅读文字。');}};
 const press=()=>{if(!consent||!enabled||busy||!supported)return;setIssue('');stopSpeech();const changed=(value:boolean)=>{setListening(value);voiceDisplay(value?'listen':'idle');};capture.current??=desktop?new DesktopVoiceSession(desktop,changed,setText,setIssue):new PushToTalkSession(recognitionFactory(window)!,changed,setText,setIssue);void capture.current.press();};
 const ask=async()=>{if(busy||!enabledNow.current||!host?.policy.enabled||!host.policy.workspaces.includes(workspace)||!text.trim()||demo)return;const epoch=++requestEpoch.current;capture.current?.cancel();setBusy(true);setIssue('');setAnswer('');try{const r=await companionRequest('understand',{workspace,question:text.trim()}) as {text?:unknown}|null;if(!mounted.current||!enabledNow.current||requestEpoch.current!==epoch)return;const value=typeof r?.text==='string'?r.text:'理解结果将显示在大肥鱼的气泡中。';setAnswer(value);if(readReply)speak(value);}catch(e){if(mounted.current&&enabledNow.current&&requestEpoch.current===epoch)setIssue((e as Error).message);}finally{if(mounted.current&&requestEpoch.current===epoch)setBusy(false);}};
 if(!enabled)return null;
 return <details className="bf-disclosure" data-testid="voice-settings"><summary>语音交流 · 按住说话</summary>
  <p className="bf-help">{desktop?'桌面录音会发送到你在“桌面、显示器与语音服务”中配置的端点，语音可能独立收费，不属于模型 token 预算。':'语音识别由浏览器提供，可能把声音发送给浏览器的服务，费用与可用性不属于模型 token 预算。'}录音只在按住按钮时开始，松开、离开窗口或 25 秒后停止；识别结果先填入文字，不自动发送。</p>
  {!supported&&<p role="status">{desktop?'先配置本机或远程转写端点，再明确允许本次录音。没有配置时不会录音或发送音频。':'当前浏览器没有可用的语音识别接口，可以继续使用文字。'}</p>}
  <label className="bf-field"><span>{desktop?'允许本次录音并发送到已配置转写端点':'允许本次使用浏览器语音识别'}</span><input aria-label={desktop?'允许本次桌面录音':'允许本次使用浏览器语音识别'} type="checkbox" disabled={!supported} checked={consent} onChange={e=>setConsent(e.target.checked)}/></label>
  <button type="button" disabled={!consent||!supported||busy} aria-pressed={listening} onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);press();}} onPointerUp={()=>capture.current?.release()} onPointerCancel={()=>capture.current?.cancel()} onLostPointerCapture={()=>capture.current?.release()} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();press();}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();capture.current?.release();}}} onBlur={()=>capture.current?.cancel()}>{listening?'正在听，松开结束':'按住说话'}</button>
  <label className="bf-field bf-field-stack"><span>确认要问的内容</span><textarea aria-label="语音识别后的文字" maxLength={1000} value={text} onChange={e=>setText(e.target.value)}/></label>
  <label className="bf-field"><span>本次讨论的工作区</span><SettingsSelect aria-label="语音工作区" value={workspace} onChange={e=>setWorkspace(e.target.value)}><option value="">选择已授权工作区</option>{host?.policy.workspaces.map(w=><option key={w} value={w}>{w}</option>)}</SettingsSelect></label>
  <button type="button" disabled={demo||busy||!host?.policy.enabled||!host.policy.workspaces.includes(workspace)||!text.trim()} onClick={()=>void ask()}>确认发送 · 消耗模型 token</button>
  {!host?.policy.enabled&&<p className="bf-help">先在智能设置明确开启模型调用，再发送问题；仅录入文字和朗读不会调用宠物模型。</p>}
  <label className="bf-field"><span>设备本地声音</span><SettingsSelect aria-label="设备本地声音" disabled={!voices.length} value={chosen?.voiceURI??''} onChange={e=>setVoiceId(e.target.value)}>{!voices.length&&<option value="">没有可用的本地声音</option>}{voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</SettingsSelect></label>
  <p className="bf-help">朗读只使用浏览器标记为本地的声音；不自动朗读后台进度。</p>
  <label className="bf-field"><span>朗读本次手动问题的回复</span><input type="checkbox" disabled={!chosen} checked={readReply} onChange={e=>setReadReply(e.target.checked)}/></label>
  <div className="bf-button-row"><button type="button" disabled={!chosen} onClick={()=>speak('你好，我是大肥鱼，今天也陪你一起完成任务。')}>试听声音</button><button type="button" disabled={!chosen||!host?.tasks.length} onClick={()=>speak((host?.tasks??[]).slice(0,8).map(t=>`${t.title}，${{running:'进行中',waiting:'等待你处理',completed:'已完成',failed:'失败',cancelled:'已取消'}[t.state]}`).join('。'))}>读任务摘要 · 不调用模型</button><button type="button" onClick={stopSpeech}>停止朗读</button></div>
  {answer&&<p aria-live="polite">{answer}</p>}{issue&&<p role="status">{issue}</p>}
 </details>;
}
