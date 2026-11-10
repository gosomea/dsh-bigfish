import React,{useEffect,useRef,useState} from 'react';
import {activityAreaDefaults,activityHomePoint,activityDefaultHomeTarget,activityPositionStatus,activityAreaMessage,activityReturnRoute,type ActivityAreaConfig,type ActivityAreaSnapshot,type NormalizedRect} from '../companion/activity-area.js';
import {listenActivityArea,readActivityArea,saveActivityArea} from './activity-area-store.js';
import {useDirtyDraft} from './settings-draft-guard.js';
type Tool='inspect'|'allowed'|'forbidden'|'home';
const percent=(v:number)=>Math.round(v*1000)/10;
function RectFields({label,value,onChange,remove}:{label:string;value:NormalizedRect;onChange:(v:NormalizedRect)=>void;remove:()=>void}){
 return <fieldset className="bf-area-rect-fields"><legend>{label}</legend><div className="bf-area-grid">{(['x','y','width','height'] as const).map(key=><label key={key}><span>{{x:'左侧',y:'顶部',width:'宽度',height:'高度'}[key]} %</span><input type="number" aria-label={`${label} ${key}`} min={key==='width'||key==='height'?1:0} max="100" step="0.1" value={percent(value[key])} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))onChange({...value,[key]:e.target.valueAsNumber/100});}}/></label>)}</div><button type="button" onClick={remove}>移除{label}</button></fieldset>;
}
/** Device geometry stays outside shared presets and model permissions. Drafts are applied explicitly. */
export function ActivityAreaSettings(){
 const [snapshot,setSnapshot]=useState<ActivityAreaSnapshot|null>(null),[draft,setDraft]=useState<ActivityAreaConfig>(activityAreaDefaults),[tool,setTool]=useState<Tool>('inspect'),[preview,setPreview]=useState<NormalizedRect|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const drag=useRef<{id:number;x:number;y:number}|null>(null),dirty=useRef(false);
 dirty.current=!!snapshot&&JSON.stringify(draft)!==JSON.stringify(snapshot.config);
 const {confirmDiscard}=useDirtyDraft({id:'activity-area',label:'活动区域与回家点',domain:'activity-area'},dirty.current);
 useEffect(()=>{let alive=true,reading=false;const refresh=async()=>{if(reading)return;reading=true;try{const next=await readActivityArea();if(!alive)return;setSnapshot(previous=>dirty.current&&previous&&(previous.revision!==next.revision||previous.displayId!==next.displayId)?{...next,revision:previous.revision,config:previous.config,...(previous.displayId===undefined?{}:{displayId:previous.displayId})}:next);if(!dirty.current)setDraft(next.config);}catch(e){if(alive)setError((e as Error).message);}finally{reading=false;}};void refresh();const off=listenActivityArea(()=>void refresh()),timer=setInterval(()=>void refresh(),750);return()=>{alive=false;off();clearInterval(timer);};},[]);
 const reload=async()=>{if(busy||!await confirmDiscard('reload'))return;setBusy(true);setError('');setMessage('');try{const next=await readActivityArea();setSnapshot(next);setDraft(next.config);dirty.current=false;setMessage('已读取本设备设置');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const edit=(patch:Partial<ActivityAreaConfig>)=>{setDraft(old=>({...old,...patch}));setError('');setMessage('');};
 const save=async()=>{if(!snapshot||busy||!dirty.current)return;setBusy(true);setError('');setMessage('');try{const next=await saveActivityArea(draft,snapshot.revision,snapshot.displayId);setSnapshot(next);setDraft(next.config);dirty.current=false;setMessage('本设备活动区域与回家点已保存');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const point=(e:React.PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 const rectangle=(a:{x:number;y:number},b:{x:number;y:number}):NormalizedRect=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});
 const footprint=snapshot?.measured?{x:(snapshot.position.x-snapshot.area.x)/snapshot.area.width,y:(snapshot.position.y-snapshot.area.y)/snapshot.area.height,width:snapshot.size.width/snapshot.area.width,height:snapshot.size.height/snapshot.area.height}:null;
 const positionStatus=snapshot?.measured?activityPositionStatus(snapshot.position,snapshot.area,snapshot.size,draft):'';
 const target=snapshot?activityDefaultHomeTarget(draft,snapshot.area,snapshot.size):null;
 const homePoint=draft.home??(snapshot&&target?activityHomePoint(target,snapshot.area,snapshot.size):null);
 const homeBlocked=!!(snapshot?.measured&&target&&!activityReturnRoute(snapshot.position,target,snapshot.area,snapshot.size,draft));
 const svgRect=(r:NormalizedRect)=>({x:r.x*100,y:r.y*100,width:r.width*100,height:r.height*100});
 return <section className="bf-area-settings" aria-label="活动区域设置" data-testid="activity-area-settings">
  <div className="bf-area-toolbar" data-testid="activity-area-toolbar">
   <div><strong>活动区域与回家点</strong><p className="bf-help" role="status">{busy?'正在保存…':!snapshot?'正在读取本设备设置…':dirty.current?'有未保存修改':snapshot.invalid?'需要修复本设备配置':'已保存'}</p></div>
   <button type="button" className="bf-primary-button" disabled={busy||!snapshot||!dirty.current} onClick={()=>void save()}>{busy?'正在保存…':'保存活动区域'}</button>
   {error&&<p className="bf-error" role="alert">{error}</p>}{message&&<p className="bf-help" role="status">{message}</p>}
  </div>
 <p className="bf-help">{window.bigfishDesktop?'只设置大肥鱼当前显示器的工作区；不同显示器分别保存。':'只设置当前浏览器的可见网页区域。'}区域与回家点保存在本设备，不随陪伴方案导入或同步到其他设备。</p>
 <p className="bf-help">回家点表示角色对准的位置，边缘时任一部位到点即可；允许区只限制自动散步。</p>
 <label className="bf-field"><span>限制自动活动区域<small className="bf-help">保护完整角色占位，沿可达路线绕开禁区；拖动始终由你接管。</small></span><input type="checkbox" aria-label="限制自动活动区域" checked={draft.enabled} onChange={e=>edit({enabled:e.target.checked})}/></label>
  <div className="bf-button-row" role="group" aria-label="地图工具">{([['inspect','查看'],['allowed','画允许区'],['forbidden','画禁行区'],['home','设回家点']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={tool===id} disabled={busy||id==='forbidden'&&draft.forbidden.length>=8} onClick={()=>{setTool(id);setPreview(null);}}>{label}</button>)}</div>
  {dirty.current&&<p className="bf-help" role="status">有尚未保存的区域修改，保存后才影响实际活动。下面的地图和区域警告展示草稿。</p>}
  <p className="bf-help">选择工具后在地图拖出矩形，或在下方输入百分比。</p>
  <svg className="bf-area-map" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="活动区域地图" style={{touchAction:'none'}} onPointerDown={e=>{if(busy||tool==='inspect'||e.button!==0)return;const p=point(e);e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,...p};if(tool==='home')edit({home:p});else setPreview(rectangle(p,p));}} onPointerMove={e=>{if(!drag.current||drag.current.id!==e.pointerId||tool==='home')return;setPreview(rectangle(drag.current,point(e)));}} onPointerUp={e=>{const start=drag.current;if(!start||start.id!==e.pointerId)return;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(tool!=='home'){const r=rectangle(start,point(e));if(r.width>=.01&&r.height>=.01){if(tool==='allowed')edit({allowed:r,enabled:true});else if(draft.forbidden.length<8)edit({forbidden:[...draft.forbidden,r],enabled:true});}else setError('矩形宽高至少需要 1%；也可以在下方输入。');}setPreview(null);setTool('inspect');}} onPointerCancel={()=>{drag.current=null;setPreview(null);}}>
   <rect x="0" y="0" width="100" height="100" fill="var(--bf-bg)"/>
   {draft.allowed&&<rect {...svgRect(draft.allowed)} className="bf-area-allowed"/>}
   {draft.forbidden.map((r,i)=><g key={i}><rect {...svgRect(r)} className="bf-area-forbidden"/><text x={(r.x+r.width/2)*100} y={(r.y+r.height/2)*100} textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="4">×{i+1}</text></g>)}
   {footprint&&<rect {...svgRect(footprint)} className="bf-area-pet"/>}
   {homePoint&&<g className="bf-area-home" transform={`translate(${homePoint.x*100} ${homePoint.y*100})`}><circle r="2" fill="var(--bf-accent)"/><path d="M -1 0 L 0 -1 L 1 0 M -.7 -.1 V 1 H .7 V -.1" fill="none" stroke="var(--bf-bg)" strokeWidth=".4"/></g>}
   {preview&&<rect {...svgRect(preview)} className="bf-area-draft"/>}
  </svg>
  <p className="bf-help">实线框：允许区 · ×：禁行区 · 虚线框：当前角色占位 · 圆点：回家点{snapshot?.displayId?` · 显示器 ${snapshot.displayId}`:''}</p>
  {!snapshot?.measured&&<p className="bf-help" role="status">展开大肥鱼后，可看到实际占位并保存当前位置。</p>}
  {snapshot?.invalid&&<p className="bf-error" role="alert">本设备的区域配置无法读取，已停止自动走动。请恢复本设备默认或重新设置后保存。</p>}
  {snapshot?.measured&&<p className="bf-help">可见区域 {Math.round(snapshot.area.width)} × {Math.round(snapshot.area.height)}，当前角色占位 {Math.round(snapshot.size.width)} × {Math.round(snapshot.size.height)}。</p>}
  {positionStatus&&<p className="bf-help" role="status">{dirty.current?'草稿：':''}{activityAreaMessage(positionStatus)}</p>}
  {homeBlocked&&<p className="bf-help" role="status">{dirty.current?'草稿：':''}{activityAreaMessage('home-blocked')}</p>}
  {draft.enabled&&window.bigfishDesktop&&<p className="bf-help">启用区域约束时暂停自动跨屏旅行，避免跨屏路线穿过禁区。</p>}
  {draft.allowed?<RectFields label="允许区" value={draft.allowed} onChange={allowed=>edit({allowed})} remove={()=>edit({allowed:null})}/>:<button type="button" onClick={()=>edit({allowed:{x:0,y:0,width:1,height:1},enabled:true})}>添加允许区</button>}
  {draft.forbidden.map((r,i)=><RectFields key={i} label={`禁行区 ${i+1}`} value={r} onChange={value=>edit({forbidden:draft.forbidden.map((x,n)=>n===i?value:x)})} remove={()=>edit({forbidden:draft.forbidden.filter((_,n)=>n!==i)})}/>)}
  <div className="bf-button-row"><button type="button" disabled={draft.forbidden.length>=8} onClick={()=>edit({forbidden:[...draft.forbidden,{x:.4,y:.4,width:.2,height:.2}],enabled:true})}>添加禁行区</button><button type="button" disabled={!snapshot?.measured} onClick={()=>{if(snapshot?.measured)edit({home:activityHomePoint(snapshot.position,snapshot.area,snapshot.size)});}}>把当前位置设为回家点</button>{draft.home&&<button type="button" onClick={()=>edit({home:null})}>恢复默认回家点</button>}</div>
  {!draft.home&&<p className="bf-help">默认回家点：允许区内靠近屏幕右下角的安全位置</p>}
  {draft.home&&<fieldset className="bf-area-rect-fields"><legend>回家落脚点</legend><div className="bf-area-grid">{(['x','y'] as const).map(key=><label key={key}><span>{key==='x'?'横向':'纵向'} %</span><input type="number" aria-label={`回家点 ${key}`} min="0" max="100" step="0.1" value={percent(draft.home![key])} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))edit({home:{...draft.home!,[key]:e.target.valueAsNumber/100}});}}/></label>)}</div></fieldset>}
  <div className="bf-button-row bf-area-secondary-actions"><button type="button" disabled={busy} onClick={()=>void reload()}>重新读取</button><button type="button" disabled={busy} onClick={()=>edit(activityAreaDefaults())}>恢复本设备默认</button></div>
 </section>;
}
