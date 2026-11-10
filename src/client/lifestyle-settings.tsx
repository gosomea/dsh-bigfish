import {SettingsSelect} from './settings-select.js';
import React,{useEffect,useState} from 'react';
import {decodeLifestyle,decodeSchemes,groups,presetConfig,presets,type Lifestyle,type Preset,type SavedScheme} from '../companion/config.js';
import {applyScheme,captureScheme,decodeScheme,diffScheme,exportPortableScheme,resetTypePreferences,saveNamedScheme} from '../companion/schemes.js';
import type {Preferences} from '../contract/preferences.js';
import {petLibrary} from '../pet/library.js';
import {lifestylePreferencePatch,type LifestyleEdit} from './lifestyle-preferences.js';
import type {PreferenceUpdate} from './preferences-store.js';
import {useDirtyDraft} from './settings-draft-guard.js';

const names:Record<string,string>={enabled:'显示宠物',bubbleEnabled:'显示气泡',showTask:'任务短摘',showFile:'文件短名',showTool:'工具名称',bubbleWidth:'气泡宽度',bubbleFont:'气泡字号',speechSeconds:'台词停留',completionMode:'完成反馈',idleMinSeconds:'最短休息',idleMaxSeconds:'最长休息',idleHoldSeconds:'空闲动作停留',idleSignPreference:'举牌偏好',greetOnOpen:'首次问候',idleHideMessage:'休息时隐藏文字',idleRandomText:'随机台词',motionPolicy:'动态偏好',mode:'鞭策节奏',autoSpeed:'模型速度校准',targetRate:'基准速度',maxWhipHz:'空挥频率上限',intensity:'空挥驱动力',opacity:'透明度',sound:'空挥音效',volume:'音量',reducedMotion:'减弱动态',showStats:'速度与用时',includeReasoning:'计入推理输出',timePressure:'长任务催促',referenceSeconds:'催促时长',fatigueSeconds:'疲惫周期',windowSeconds:'速度窗口',learnHistory:'记住模型速度',completionSeconds:'完成提示时长',homeVisible:'显示小窝',bed:'小床',desk:'书桌',lamp:'灯',interactionCooldown:'互动冷却',adventureMinutes:'奇遇间隔',adventureBox:'纸箱奇遇',adventureBoat:'纸船奇遇',adventureFishing:'钓鱼奇遇',outfit:'角色装扮',growthUnlocks:'成长解锁',pairEnabled:'允许邀请小伙伴',partnerRole:'小伙伴角色',storyAutomatic:'阶段故事',storyMinutes:'故事冷却',preset:'陪伴类型',basedOn:'基础类型',groups:'功能组合',personality:'性格',nickname:'称呼',movement:'活动范围',radius:'散步半径',speed:'走动速度',restMin:'最短休息',restMax:'最长休息',activityOverrides:'精确间隔',theme:'小窝主题',role:'角色',idleMode:'活跃程度',richness:'动作幅度',talkLevel:'说话频率',size:'角色大小',whipEnabled:'鞭策动作',bubbleText:'气泡台词',bubbleStatus:'气泡状态',scene:'工作布景',sceneryVisible:'显示场景'};
const groupHelp:Record<string,string>={body:'行走与身体活动；行走需要角色素材。',play:'摸头、茶点与玩具，不消耗 token。',steward:'关注任务状态；智能解释需另行授权。',memory:'按工作区保存记忆；模型理解需另行授权。',home:'小窝布置与真实项目收藏。',growth:'相处记录与明确标注的宠物故事。',adventures:'本地小剧场；跨屏与窗口互动需桌面授权。',perception:'按住说话、朗读与主动分享图片；权限单独申请。'};

function schemeFieldLabel(path:string){return path.startsWith('group.')?groups[path.slice(6) as keyof typeof groups]:names[path.replace(/^lifestyle\./,'')]??path;}
function schemeValue(path:string,value:unknown):string {
 if(typeof value==='boolean')return value?'开启':'关闭';
 if(path==='role')return value===null?'大肥鱼':petLibrary.catalog.entries.find(e=>e.key===value)?.name??String(value);
 const key=path.replace(/^lifestyle\./,'');
 if(key==='partnerRole')return value==='follow-main'?'跟随主角色':value==='builtin'?'大肥鱼 · 内置':petLibrary.catalog.entries.find(e=>e.key===value)?.name??`${String(value)}（未安装）`;
 const choices:Record<string,Record<string,string>>={preset:Object.fromEntries(Object.entries(presets).map(([id,p])=>[id,p.name])),basedOn:Object.fromEntries(Object.entries(presets).map(([id,p])=>[id,p.name])),movement:{fixed:'固定位置',nearby:'附近散步',wide:'较大范围',screen:'全屏自由活动'},personality:{gentle:'温柔',serious:'认真',playful:'淘气'},theme:{sea:'浅海',night:'月夜',garden:'花园'},idleMode:{quiet:'安静陪着',occasional:'偶尔',natural:'自然',frequent:'活泼',continuous:'持续',custom:'自定义'},richness:{0:'轻柔',1:'自然',2:'活泼'},talkLevel:{0:'仅事件',1:'偶尔',2:'经常'},motionPolicy:{system:'跟随系统',normal:'正常',reduced:'减弱'},mode:{urge:'慢了催一催',rhythm:'跟着速度动'},completionMode:{celebrate:'庆祝',message:'提示',quiet:'直接休息'},idleSignPreference:{prefer:'多举牌',balanced:'均衡',none:'不举牌'}};
 return choices[key]?.[String(value)]??(value===''?'未设置':String(value));
}
type Part='presets'|'customize'|'home'|'advanced'|'schemes';

export function LifestyleSettings({prefs,update,part='presets'}:{prefs:Preferences;update:(patch:PreferenceUpdate,expected?:string)=>void|Promise<void>;part?:Part}){
  const config=decodeLifestyle(JSON.parse(prefs.lifestyleJson)),schemes=decodeSchemes(JSON.parse(prefs.schemesJson));
  const [pending,setPending]=useState<SavedScheme|null>(null),[name,setName]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const roleContext={currentRole:petLibrary.catalog.selected,availableRoles:petLibrary.catalog.entries.map(e=>e.key)};
  async function commit(patch:PreferenceUpdate){setBusy(true);setError('');try{await update(patch);setMessage('已保存');return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
  const edit=(patch:LifestyleEdit)=>{void commit(lifestylePreferencePatch(patch));};
  const download=()=>{try{const value=exportPortableScheme(captureScheme('我的陪伴方案',prefs,petLibrary.catalog.selected)),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='bigfish-companion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError((e as Error).message);}};
  const difference=pending?diffScheme(pending,prefs,roleContext):null;
  const matchingScheme=schemes.findIndex(s=>{const diff=diffScheme(s,prefs,roleContext);return s.version===2&&diff.changes.length===0&&!diff.warnings.length;});
  const confirmation=pending&&difference&&<section className="bf-scheme-diff" aria-label="方案差异">
    <strong>应用“{pending.name}”</strong>
    {difference.changes.length?<ul className="bf-diff-list">{difference.changes.flatMap(change=>change.path==='lifestyle.groups'?Object.keys(groups).filter(g=>(change.before as Record<string,boolean>)[g]!==(change.after as Record<string,boolean>)[g]).map(g=>({path:`group.${g}`,before:(change.before as Record<string,boolean>)[g],after:(change.after as Record<string,boolean>)[g]})):[change]).map(change=><li key={change.path}><strong>{schemeFieldLabel(change.path)}</strong>：{schemeValue(change.path,change.before)} → {schemeValue(change.path,change.after)}</li>)}</ul>:<p>当前设置已一致</p>}
    {difference.warnings.map(w=><p className="bf-help" key={w}>{w}</p>)}
    <p className="bf-help">不改变模型权限、智能开关、费用上限或系统权限；保留本次安静状态与私人台词。</p>
    <div className="bf-button-row"><button type="button" disabled={busy} onClick={async()=>{
      const next=applyScheme(pending,prefs,roleContext);setBusy(true);setError('');let saved=false;
      try{await update(next.patch,JSON.stringify(prefs));saved=true;if(petLibrary.catalog.selected!==roleContext.currentRole)throw Error('角色在确认后已变化，请重新应用');if(next.role.changed)await petLibrary.select(next.role.selected);setPending(null);setMessage(next.warnings.join('；')||'方案已应用');}catch(e){setError(`${saved?'行为设置已保存，但角色未完成切换：':''}${(e as Error).message}`);}finally{setBusy(false);}
    }}>应用方案</button><button type="button" disabled={busy} onClick={()=>setPending(null)}>取消</button></div>
  </section>;
  const feedback=<>{error&&<p role="alert" className="bf-error">{error}</p>}{message&&<p className="bf-help" role="status">{message}</p>}</>;
  if(part==='presets')return <section data-testid="lifestyle-settings">
    <label className="bf-field"><span>陪伴方案<small className="bf-help">选择能力组合，随时可以自定义。</small></span><SettingsSelect aria-label="陪伴方案" disabled={busy} value={matchingScheme>=0?`saved:${matchingScheme}`:config.preset==='custom'?'custom':`preset:${config.preset}`} onChange={e=>{
      if(e.target.value.startsWith('saved:'))setPending(schemes[Number(e.target.value.slice(6))]!);
      else if(e.target.value.startsWith('preset:')){const id=e.target.value.slice(7) as Preset;setPending({name:presets[id].name,config:presetConfig(id)});}
    }}>{config.preset==='custom'&&<option value="custom">自定义 · 基于{presets[config.basedOn].name}</option>}
      <optgroup label="类型预设">{Object.entries(presets).map(([key,p])=><option key={key} value={`preset:${key}`}>{p.name}{key==='all'?' · 预览版':''}</option>)}</optgroup>
      {schemes.length>0&&<optgroup label="我的方案">{schemes.map((s,i)=><option key={s.name} value={`saved:${i}`}>{s.name}</option>)}</optgroup>}
    </SettingsSelect></label>
    {config.basedOn==='all'&&<p className="bf-help" role="status">全能型预览版：启用全部功能组合，实际可用状态会随角色、设备与配置显示。智能模式、付费能力和系统权限仍需单独开启。</p>}
    {confirmation}{feedback}
  </section>;
  if(part==='home')return <section aria-label="小窝布置">
    <p className="bf-help">小窝是独立的生活布景；工作布景会跟随任务。关闭小窝后保留家具选择。首页“显示场景”统一控制布景可见性。</p>{!prefs.sceneryVisible&&<p className="bf-help" role="status">场景显示已关闭，布置仍会保存；在日常陪伴开启“显示场景”后恢复显示。</p>}
    <label className="bf-field"><span>启用小窝与收藏</span><input type="checkbox" aria-label="启用小窝与收藏" checked={config.groups.home} onChange={e=>edit({groups:{home:e.target.checked}})}/></label>
    <label className="bf-field"><span>小窝主题</span><SettingsSelect aria-label="小窝主题" disabled={!config.groups.home} value={config.theme} onChange={e=>edit({theme:e.target.value as Lifestyle['theme']})}><option value="sea">浅海</option><option value="night">月夜</option><option value="garden">花园</option></SettingsSelect></label>
    {(['homeVisible','bed','desk','lamp'] as const).map(key=><label className="bf-field" key={key}><span>{{homeVisible:'显示小窝',bed:'小床',desk:'书桌',lamp:'灯'}[key]}</span><input type="checkbox" aria-label={{homeVisible:'显示小窝',bed:'小床',desk:'书桌',lamp:'灯'}[key]} disabled={!config.groups.home} checked={config[key]} onChange={e=>edit({[key]:e.target.checked})}/></label>)}{feedback}
  </section>;
  if(part==='customize')return <section data-testid="custom-capabilities">
    <p className="bf-help">修改后标记为自定义。功能开关不授予模型、麦克风或截图权限。</p>
    <label className="bf-field"><span>性格</span><SettingsSelect aria-label="性格" value={config.personality} onChange={e=>edit({personality:e.target.value as Lifestyle['personality']})}><option value="gentle">温柔</option><option value="serious">认真</option><option value="playful">淘气</option></SettingsSelect></label>
    <label className="bf-field"><span>怎么称呼你</span><input aria-label="怎么称呼你" maxLength={40} value={config.nickname} onChange={e=>edit({nickname:e.target.value})}/></label>
    {Object.entries(groups).map(([key,label])=><label className="bf-field" key={key}><span>{label}<small className="bf-help">{groupHelp[key]}</small></span><input type="checkbox" aria-label={label} checked={config.groups[key as keyof typeof groups]} onChange={e=>edit({groups:{[key]:e.target.checked}})}/></label>)}
    {config.groups.adventures&&<details className="bf-disclosure"><summary>奇遇内容</summary>{(['adventureBox','adventureBoat','adventureFishing'] as const).map(key=><label className="bf-field" key={key}><span>{{adventureBox:'纸箱躲猫猫',adventureBoat:'小纸鱼船',adventureFishing:'浅海钓纸鱼'}[key]}</span><input type="checkbox" aria-label={{adventureBox:'纸箱躲猫猫',adventureBoat:'小纸鱼船',adventureFishing:'浅海钓纸鱼'}[key]} checked={config[key]} onChange={e=>edit({[key]:e.target.checked})}/></label>)}<p className="bf-help">空闲时偶尔安排一段虚构小剧场；外部角色需对应能力。工作与重要提醒优先。</p></details>}
    {feedback}
  </section>;
  if(part==='advanced')return <ActivityPrecision config={config} save={async patch=>{await update(lifestylePreferencePatch(patch));}}/>;
  return <section aria-label="方案管理" data-testid="scheme-management">
    <p className="bf-help">保存角色选择、陪伴能力、活跃程度、外观和说话偏好。私人台词、工具规则、记忆、授权与预算不进入方案。</p>
    <label className="bf-field"><span>方案名称</span><input aria-label="方案名称" maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label>
    <div className="bf-button-row"><button type="button" disabled={busy||!name.trim()} onClick={async()=>{if(await commit(current=>saveNamedScheme(current,name,petLibrary.catalog.selected)))setName('');}}>保存方案</button><button type="button" onClick={download}>导出当前方案</button></div>
    {schemes.map(s=><div className="bf-saved-scheme" key={s.name}><span>{s.name}{s.version!==2&&<small> · 仅生活配置</small>}</span><div className="bf-button-row"><button type="button" disabled={busy} onClick={()=>setPending(s)}>使用 {s.name}</button><button type="button" aria-label={`删除方案 ${s.name}`} disabled={busy} onClick={()=>void commit(current=>({schemesJson:JSON.stringify(decodeSchemes(JSON.parse(current.schemesJson)).filter(x=>x.name!==s.name))}))}>删除</button></div></div>)}
    <label className="bf-field"><span>导入方案<small className="bf-help">先查看差异，再应用。</small></span><input aria-label="导入陪伴方案" type="file" accept=".json" onChange={async e=>{const input=e.currentTarget;try{const file=input.files?.[0];if(!file)return;if(file.size>32000)throw Error('方案文件过大');setPending(decodeScheme(JSON.parse(await file.text())));setError('');}catch(err){setError((err as Error).message);}finally{input.value='';}}}/></label>
    {confirmation}
    <button type="button" className="bf-text-button" onClick={()=>{const next=resetTypePreferences(prefs);setPending({name:`恢复${presets[config.basedOn].name}`,config:decodeLifestyle(JSON.parse(next.lifestyleJson))});}}>恢复当前类型默认值</button>{feedback}
  </section>;
}

function ActivityPrecision({config,save}:{config:Lifestyle;save:(patch:Partial<Lifestyle>)=>Promise<void>}){
  const keys=['radius','speed','restMin','restMax','interactionCooldown','adventureMinutes'] as const;
  const fields={radius:['附近活动半径 · 像素',20,600],speed:['走动速度 · 像素/秒',10,120],restMin:['散步最短休息 · 秒',5,600],restMax:['散步最长休息 · 秒',5,1200],interactionCooldown:['主动互动冷却 · 秒',1,120],adventureMinutes:['彩蛋最短间隔 · 分钟',15,120]} as const;
  const [draft,setDraft]=useState<Partial<Record<typeof keys[number],string>>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const {epoch}=useDirtyDraft({id:'activity-precision',label:'活动精确参数',domain:'preferences'},Object.keys(draft).length>0);
  useEffect(()=>{setDraft({});setError('');},[epoch]);
  return <section aria-label="活动精确参数">
    <p className="bf-help">日常动作、散步与生活共用首页的活跃程度。只有开启覆盖，才使用下方散步休息与彩蛋间隔；速度用于实际走动，主动互动冷却独立生效。</p>
    {config.movement==='screen'?<p className="bf-help">全屏自由活动按屏幕边界选择路线，不使用附近半径；半径偏好会保留。</p>:config.movement==='fixed'?<p className="bf-help">固定位置不走动，半径和速度偏好会保留；切回散步后使用。</p>:null}
    <label className="bf-field"><span>使用精确间隔覆盖</span><input aria-label="使用精确间隔覆盖" type="checkbox" checked={config.activityOverrides} disabled={busy} onChange={async e=>{setBusy(true);try{await save({activityOverrides:e.target.checked});setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}/></label>
    {keys.map(key=><label className="bf-field" key={key}><span>{fields[key][0]}</span><input aria-label={fields[key][0]} type="number" min={fields[key][1]} max={fields[key][2]} disabled={busy||key==='radius'&&(config.movement==='screen'||config.movement==='fixed')||(!config.activityOverrides&&['restMin','restMax','adventureMinutes'].includes(key))} value={draft[key]??config[key]} onChange={e=>{setDraft(old=>({...old,[key]:e.target.value}));setError('');}}/></label>)}
    <button type="button" disabled={busy||!Object.keys(draft).length} onClick={async()=>{try{const patch:Partial<Lifestyle>={};for(const key of keys){if(draft[key]===undefined)continue;const raw=draft[key]!.trim(),value=Number(raw);if(!raw||!Number.isFinite(value)||value<fields[key][1]||value>fields[key][2])throw Error(`${fields[key][0]}需在 ${fields[key][1]}–${fields[key][2]} 之间`);patch[key]=value;}if((patch.restMin??config.restMin)>(patch.restMax??config.restMax))throw Error('最短休息不能大于最长休息');setBusy(true);await save(patch);setDraft({});setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>保存活动参数</button>
    {error&&<p role="alert" className="bf-error">{error}</p>}
  </section>;
}
