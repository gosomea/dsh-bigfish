import {decodePreferences,type Preferences} from '../contract/preferences.js';
import {decodeSchemeDisplay,schemeDisplayDefaults,schemeDisplayKeys,type SchemeDisplayKey} from '../contract/scheme-display.js';
import {decodeLifestyle,decodeSchemes,editLifestyle,exportScheme,lifestyleDiff,presetConfig,type Lifestyle,type PortableScheme,type Preset,type SavedScheme} from './config.js';

export interface SchemeRoles {currentRole:string|null;availableRoles:readonly string[]}
export interface SchemeRoleResult {selected:string|null;changed:boolean;missing:string|null}
export interface SchemeChange {path:string;before:unknown;after:unknown}
export interface SchemeApplication {preferences:Preferences;patch:Partial<Preferences>;role:SchemeRoleResult;warnings:string[]}
const lifestyle=(preferences:Preferences)=>decodeLifestyle(JSON.parse(preferences.lifestyleJson));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Old downloads were bare v1 Lifestyle objects; old named entries only changed Lifestyle. */
export function decodeScheme(raw:unknown):SavedScheme {
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&(raw as {version?:unknown}).version===1)return {name:'导入的方案',config:exportScheme(decodeLifestyle(raw))};
  return decodeSchemes([raw])[0]!;
}
export function captureScheme(name:string,preferences:Preferences,selectedRole:string|null):PortableScheme {
  const current=decodePreferences(preferences);
  const display=decodeSchemeDisplay(Object.fromEntries(schemeDisplayKeys.map(key=>[key,current[key]])));
  return decodeSchemes([{version:2,name,config:exportScheme(lifestyle(current)),display,role:selectedRole===null?{kind:'builtin'}:{kind:'pack',key:selectedRole}}])[0] as PortableScheme;
}
export function exportPortableScheme(scheme:SavedScheme):SavedScheme {
  return decodeScheme(scheme);
}
export function saveNamedScheme(preferences:Preferences,name:string,selectedRole:string|null):Partial<Preferences> {
  const existing=decodeSchemes(JSON.parse(preferences.schemesJson));
  return {schemesJson:JSON.stringify(decodeSchemes([...existing,captureScheme(name,preferences,selectedRole)]))};
}
/** This helper never selects/installs a role or writes permissions; UI commits the returned choices. */
export function applyScheme(scheme:SavedScheme,preferences:Preferences,roles:SchemeRoles):SchemeApplication {
  const entry=decodeScheme(scheme),current=decodePreferences(preferences),before=lifestyle(current);
  const config={...entry.config,quietUntil:before.quietUntil,importantOnly:before.importantOnly};
  const next=decodePreferences({...current,...entry.display,lifestyleJson:JSON.stringify(config)});
  const patch:Partial<Preferences>={};
  for(const key of [...schemeDisplayKeys,'lifestyleJson'] as const)if(!same(current[key],next[key]))Object.assign(patch,{[key]:next[key]});
  const role:SchemeRoleResult={selected:roles.currentRole,changed:false,missing:null},warnings:string[]=[];
  if(config.partnerRole!=='follow-main'&&config.partnerRole!=='builtin'&&!roles.availableRoles.includes(config.partnerRole))warnings.push(`方案中的小伙伴「${config.partnerRole}」未安装；选择会保留，安装前不会邀请或自动下载。`);
  if(entry.role?.kind==='builtin')role.selected=null;
  else if(entry.role?.kind==='pack') {
    if(roles.availableRoles.includes(entry.role.key))role.selected=entry.role.key;
    else {role.missing=entry.role.key;warnings.push(`方案中的角色「${entry.role.key}」未安装，已保留当前角色；安装该角色包后可再次应用。`);}
  }
  role.changed=role.selected!==roles.currentRole;
  return {preferences:next,patch,role,warnings};
}
export function diffScheme(scheme:SavedScheme,preferences:Preferences,roles:SchemeRoles):{changes:SchemeChange[];warnings:string[]} {
  const result=applyScheme(scheme,preferences,roles),current=decodePreferences(preferences),before=lifestyle(current),after=lifestyle(result.preferences);
  const changes:SchemeChange[]=schemeDisplayKeys.filter(key=>!same(current[key],result.preferences[key])).map(key=>({path:key,before:current[key],after:result.preferences[key]}));
  for(const key of lifestyleDiff(before,after))changes.push({path:`lifestyle.${key}`,before:before[key as keyof Lifestyle],after:after[key as keyof Lifestyle]});
  if(result.role.changed)changes.push({path:'role',before:roles.currentRole,after:result.role.selected});
  return {changes,warnings:result.warnings};
}
/** Display/behavior reset preserves the role, named schemes, private text and current Lifestyle. */
export function resetDisplayPreferences(preferences:Preferences):Preferences {
  return decodePreferences({...preferences,...schemeDisplayDefaults});
}
export function resetTypePreferences(preferences:Preferences,type?:Preset):Preferences {
  const current=decodePreferences(preferences),before=lifestyle(current);
  const config={...presetConfig(type??before.basedOn),nickname:before.nickname,quietUntil:before.quietUntil,importantOnly:before.importantOnly};
  return decodePreferences({...current,lifestyleJson:JSON.stringify(config)});
}
export function resetPreferenceField(preferences:Preferences,key:SchemeDisplayKey):Preferences {
  if(!Object.hasOwn(schemeDisplayDefaults,key))throw Error('只能恢复可分享的显示或行为选项');
  const next={...decodePreferences(preferences),[key]:schemeDisplayDefaults[key]};
  if(key==='idleMinSeconds')next.idleMaxSeconds=Math.max(next.idleMinSeconds,next.idleMaxSeconds);
  if(key==='idleMaxSeconds')next.idleMinSeconds=Math.min(next.idleMinSeconds,next.idleMaxSeconds);
  return decodePreferences(next);
}
type ResettableLifestyleField=Exclude<keyof Lifestyle,'version'|'preset'|'basedOn'|'groups'|'quietUntil'|'importantOnly'>;
export function resetLifestyleField(preferences:Preferences,key:ResettableLifestyleField):Preferences {
  if(['version','preset','basedOn','groups','quietUntil','importantOnly'].includes(key))throw Error('此选项需要使用类型恢复或明确的本次操作');
  const current=decodePreferences(preferences),config=lifestyle(current),defaults=presetConfig(config.basedOn);
  if(!Object.hasOwn(defaults,key))throw Error('陪伴选项无效');
  const patch:Partial<Lifestyle>={[key]:defaults[key]};
  if(key==='restMin')patch.restMax=Math.max(defaults.restMin,config.restMax);
  if(key==='restMax')patch.restMin=Math.min(defaults.restMax,config.restMin);
  return decodePreferences({...current,lifestyleJson:JSON.stringify(editLifestyle(config,patch))});
}
/** Clearing named schemes is deliberately separate from every restore-default operation. */
export function clearNamedSchemes(preferences:Preferences):Preferences {
  return decodePreferences({...preferences,schemesJson:'[]'});
}
