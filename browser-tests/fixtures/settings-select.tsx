import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SettingsSelect} from '../../src/client/settings-select.js';
import css from '../../src/client/styles.css';
function App(){
 const long=new URLSearchParams(location.search).has('long');const [value,setValue]=useState(long?'motion-39':'nearby'),[count,setCount]=useState(0);
 return <main className="bf-surface"><style>{css}</style><section className="bf-modal" style={{position:'fixed',inset:'auto 12px 18px',width:'min(520px,calc(100vw - 24px))',height:240,padding:16,overflow:'auto',transform:'translateZ(0)'}}>
 <div style={{height:120}}/><label className="bf-field"><span>活动范围</span><SettingsSelect aria-label="活动范围" value={value} onChange={event=>{setValue(event.target.value);setCount(c=>c+1);}}>{long?Array.from({length:40},(_,i)=><option key={i} value={`motion-${i}`}>动作 {i+1}</option>):<optgroup label="本地活动"><option value="fixed">固定位置</option><option value="nearby">附近散步</option><option value="blocked" disabled>跨屏（尚未授权）</option><option value="wide">较大范围</option></optgroup>}</SettingsSelect></label>
 <label className="bf-field"><span>声音</span><SettingsSelect aria-label="声音" value="none" disabled><option value="none">没有可用设备</option></SettingsSelect></label>
 <p className="bf-help">设置帮助说明保持清晰可读。</p><div style={{height:500}}/><output data-testid="value">{value}</output><output data-testid="count">{count}</output>
 </section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
