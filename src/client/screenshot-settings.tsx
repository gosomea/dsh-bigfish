import {SettingsSelect} from './settings-select.js';
import React,{useEffect,useRef,useState} from 'react';
import {companionRequest,type HostSnapshot} from './companion-host.js';
import {CompanionCanvas} from './companion-canvas.js';
interface SharedImage {mediaType:'image/jpeg';data:string;preview:string;width:number;height:number}
/** Re-encode only the explicitly selected file; no capture, clipboard or other application API is used. */
export async function prepareSharedImage(file:File):Promise<SharedImage>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>16*1024*1024)throw Error('请选择不超过 16 MiB 的 PNG、JPEG 或 WebP 图片');
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width*bitmap.height>64000000)throw Error('图片像素过多，请先裁剪需要分享的部分');
  const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d');if(!c)throw Error('当前环境无法准备图片');c.fillStyle='#fff';c.fillRect(0,0,width,height);c.drawImage(bitmap,0,0,width,height);
  const preview=canvas.toDataURL('image/jpeg',.85),data=preview.slice(preview.indexOf(',')+1);
  if(data.length>1398104)throw Error('准备后的图片仍超过 1 MiB，请先裁剪需要分享的部分');
  return {mediaType:'image/jpeg',data,preview,width,height};
 }finally{bitmap.close();}
}
export function ScreenshotSettings({enabled,host,demo}:{enabled:boolean;host:HostSnapshot|null;demo:boolean}){
 const [image,setImage]=useState<SharedImage|null>(null),[confirmed,setConfirmed]=useState(false),[workspace,setWorkspace]=useState(''),[question,setQuestion]=useState('请解释这张截图中值得注意的内容。'),[issue,setIssue]=useState(''),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false);
 const mounted=useRef(true),selection=useRef(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;selection.current++;};},[]);
 useEffect(()=>window.bigfishDesktop?.onHostChanged?.(()=>{selection.current++;setImage(null);setConfirmed(false);setWorkspace('');setQuestion('请解释这张截图中值得注意的内容。');setAnswer('');setIssue('已切换 Host，请重新选择本次图片。');setBusy(false);}),[]);
 useEffect(()=>{if(!enabled){selection.current++;setImage(null);setConfirmed(false);setAnswer('');setBusy(false);if(busy&&!demo)void companionRequest('cancel-screenshot').catch(()=>{});}},[enabled]);
 const choose=async(file:File|undefined)=>{const version=++selection.current;setImage(null);setConfirmed(false);setAnswer('');setIssue('');if(!file)return;try{const next=await prepareSharedImage(file);if(mounted.current&&version===selection.current)setImage(next);}catch(e){if(mounted.current&&version===selection.current)setIssue((e as Error).message);}};
 const send=async()=>{
  if(!image||!confirmed||busy||demo||!host?.policy.enabled||!host.policy.workspaces.includes(workspace))return;
  const version=selection.current;setBusy(true);setAnswer('');setIssue('');
  try{const r=await companionRequest('screenshot',{workspace,confirmed:true,question,image:{mediaType:image.mediaType,data:image.data}}) as {text?:unknown;estimated?:boolean};if(mounted.current&&version===selection.current){setAnswer(typeof r.text==='string'?r.text:'没有收到可显示的结果。');setIssue(r.estimated?'本次模型用量包含估算；可在智能设置查看。':'本次用量已计入共享模型预算。');setImage(null);setConfirmed(false);}}
  catch(e){if(mounted.current&&version===selection.current)setIssue((e as Error).message);}
  finally{if(mounted.current&&version===selection.current)setBusy(false);}
 };
 if(!enabled)return null;
 return <details className="bf-disclosure" data-testid="screenshot-settings"><summary>主动分享截图 · 仅理解本次图片</summary>
  <p className="bf-help">先选文件、查看预览，再确认发送；不会自动截图或读取其他应用。图片会缩至最长边 1024 像素，建议先裁剪到你需要解释的区域。</p>
  {demo&&<p className="bf-help">演示只能预览文件，不发送给模型。</p>}
  {!demo&&!host?.screenshotAvailable&&<p role="status">当前 Host 没有可用的附件与模型服务，可以先预览文件。</p>}
  <label className="bf-field bf-field-stack"><span>本次分享的截图</span><input aria-label="本次分享的截图" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void choose(e.target.files?.[0]);e.target.value='';}}/></label>
  {image&&<figure style={{margin:'10px 0'}}><img src={image.preview} alt="本次将发送的图片预览" style={{width:'100%',maxHeight:250,objectFit:'contain',borderRadius:10}}/><figcaption>{image.width} × {image.height} · 仅本次选择</figcaption><button type="button" disabled={busy} onClick={()=>{selection.current++;setImage(null);setConfirmed(false);}}>移除本次图片</button></figure>}
  <label className="bf-field bf-field-stack"><span>你想了解什么</span><textarea aria-label="截图问题" maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)} disabled={busy}/></label>
  <label className="bf-field"><span>本次图片的工作区</span><SettingsSelect aria-label="截图工作区" value={workspace} onChange={e=>setWorkspace(e.target.value)} disabled={busy}><option value="">选择已授权工作区</option>{host?.policy.workspaces.map(w=><option key={w} value={w}>{w}</option>)}</SettingsSelect></label>
  <label className="bf-field bf-consent"><span>确认将所选图片作为 DSH 附件缓存，并发送给所选支持图片的模型；仅本次理解，不写宠物记忆，会消耗 token</span><input aria-label="确认发送本次截图" type="checkbox" disabled={!image||busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/></label>
  <button type="button" disabled={demo||busy||!confirmed||!image||!host?.screenshotAvailable||!host.policy.enabled||!host.policy.workspaces.includes(workspace)} onClick={()=>void send()}>解释本次图片 · 消耗 token</button>
  {busy&&<div style={{maxWidth:220,margin:'auto'}}><CompanionCanvas id="screen-read" serial="inspecting"/><p role="status">正在看你这次分享的图片……</p><button type="button" onClick={()=>{void companionRequest('cancel-screenshot').catch(e=>setIssue((e as Error).message));}}>取消理解</button><p className="bf-help">已发送的请求仍可能产生模型用量。</p></div>}
  {answer&&<p aria-live="polite" style={{whiteSpace:'pre-wrap'}}>{answer}</p>}{issue&&<p role="status">{issue}</p>}
 </details>;
}
