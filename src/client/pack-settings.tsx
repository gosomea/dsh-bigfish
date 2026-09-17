import {isBuiltinAsset} from '../contract/builtin-assets.js';
import React,{useRef,useState} from 'react';
import {loadPack} from '../contract/scenes.js';
import {classicPack} from './renderer.js';
import type {Translate} from './locales.js';
export function PackSettings({t}:{t:Translate}){
 const input=useRef<HTMLInputElement>(null);const [message,setMessage]=useState('');
 return <section><h3>内置动作编排</h3><p className="bf-help">仅调整内置大肥鱼的动作顺序与条件，保存在此浏览器。更换角色请使用上方“角色库”导入 .dshpet 文件。</p>
 <div className="bf-pack-controls"><button onClick={()=>input.current?.click()}>{t('exportPack')}</button><button onClick={()=>{try{localStorage.removeItem('bigfish.pack.v1');dispatchEvent(new Event('bigfish:pack'));setMessage(t('restorePack'));}catch{setMessage(t('packError'));}}}>{t('restorePack')}</button></div>
 <input ref={input} type="file" hidden accept="application/json,.json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>1024*1024)throw Error();const raw=JSON.parse(await file.text());const result=loadPack(raw,path=>isBuiltinAsset(path),classicPack);if(result.error||result.pack.scenes.some(s=>s.actions.some(a=>a.kind!=='loop')))throw Error();localStorage.setItem('bigfish.pack.v1',JSON.stringify(result.pack));dispatchEvent(new Event('bigfish:pack'));setMessage(t('packLoaded'));}catch{setMessage(t('packError'));}e.target.value='';}}/><p role="status">{message}</p></section>;
}
