import {lifeOptionDefaults,outfits,validatePartnerRole,type LifeOptions} from './life-options.js';
import {decodeSchemeDisplay,type SchemeDisplay} from '../contract/scheme-display.js';

/** Portable choices only. Permissions, credentials and billing NEVER belong here. */
export const groups = {
  body: '身体与活动', play: '触摸与玩耍', steward: '任务管家', memory: '记忆与个性',
  home: '小窝与收藏', growth: '成长与故事', adventures: '桌面奇遇', perception: '语音与感知',
} as const;
export type Group = keyof typeof groups;
export const presets = {
  balanced: { name: '均衡型', groups: ['body', 'play', 'steward', 'memory'] },
  gentle: { name: '温柔陪伴型', groups: ['play', 'memory', 'home'] },
  steward: { name: '认真管家型', groups: ['steward', 'memory'] },
  playful: { name: '淘气搭子型', groups: ['body', 'play', 'adventures'] },
  growing: { name: '共同成长型', groups: ['play', 'home', 'growth', 'memory'] },
  assistant: { name: '可交谈助手型', groups: ['steward', 'memory', 'perception'] },
  all: { name: '全能型', groups: Object.keys(groups) as Group[] },
} satisfies Record<string, {name: string; groups: Group[]}>;
export type Preset = keyof typeof presets;
export interface Lifestyle extends LifeOptions {
  version: 1; preset: Preset | 'custom'; basedOn: Preset;
  groups: Record<Group, boolean>; personality: 'gentle' | 'serious' | 'playful'; nickname: string;
  movement: 'fixed' | 'nearby' | 'wide' | 'screen'; radius: number; speed: number; restMin: number; restMax: number;
  activityOverrides:boolean;
  interactionCooldown: number; quietUntil: number; importantOnly: boolean;
  theme: 'sea' | 'night' | 'garden'; homeVisible: boolean; bed:boolean; desk:boolean; lamp:boolean;
  adventureMinutes:number;adventureBox:boolean;adventureBoat:boolean;adventureFishing:boolean;
}
const base: Omit<Lifestyle, 'preset' | 'basedOn' | 'groups'> = {
  ...lifeOptionDefaults, version: 1, personality: 'gentle', nickname: '', movement: 'nearby', radius: 120,
  speed: 35, restMin: 20, restMax: 45, activityOverrides:false, interactionCooldown: 5, quietUntil: 0, importantOnly: false,
  theme: 'sea', homeVisible: true, bed:true, desk:true, lamp:true,
  adventureMinutes:30,adventureBox:true,adventureBoat:true,adventureFishing:true,
};
export function presetConfig(id: Preset): Lifestyle {
  return {...base,pairEnabled:id==='all', preset: id, basedOn: id, personality: id === 'steward' ? 'serious' : id === 'playful' ? 'playful' : 'gentle',
    groups: Object.fromEntries(Object.keys(groups).map(g => [g, (presets[id].groups as string[]).includes(g)])) as Lifestyle['groups']};
}
const choices: Partial<Record<keyof Lifestyle, readonly string[]>> = {
  preset: [...Object.keys(presets), 'custom'], basedOn: Object.keys(presets), personality: ['gentle','serious','playful'],
  movement: ['fixed','nearby','wide','screen'], theme: ['sea','night','garden'],outfit:Object.keys(outfits),
};
const ranges: Partial<Record<keyof Lifestyle, readonly [number, number]>> = {
  radius:[20,600], speed:[10,120], restMin:[5,600], restMax:[5,1200], interactionCooldown:[1,120], quietUntil:[0,8640000000000000],adventureMinutes:[15,120],storyMinutes:[15,1440],
};
export function decodeLifestyle(value: unknown): Lifestyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('陪伴方案必须是对象');
  const raw = value as Record<string, unknown>, result = presetConfig('balanced');
  // Reject rather than preserve unknown fields: imported schemes cannot smuggle consent or keys.
  for (const key of Object.keys(raw)) if (!Object.hasOwn(result, key)) throw Error(`方案不支持字段：${key}`);
  if (raw.version !== 1) throw Error('不支持的陪伴方案版本');
  if(raw.activityOverrides===undefined) result.activityOverrides=(['restMin','restMax','adventureMinutes'] as const).some(key=>raw[key]!==undefined&&raw[key]!==base[key]);
  for (const key of Object.keys(result) as (keyof Lifestyle)[]) {
    const v = raw[key]; if (v === undefined) continue;
    if (key === 'groups') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('功能组合无效');
      for (const [g,on] of Object.entries(v)) {
        if (!Object.hasOwn(groups,g) || typeof on !== 'boolean') throw Error('功能组无效');
        result.groups[g as Group] = on;
      }
      continue;
    }
    if (typeof v !== typeof result[key]) throw Error(`方案字段无效：${key}`);
    if (choices[key] && !choices[key]!.includes(v as string)) throw Error(`方案选项无效：${key}`);
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw Error('数值必须有限');
      const range = ranges[key]; if (range && (v < range[0] || v > range[1])) throw Error(`方案数值越界：${key}`);
    }
    if (key === 'nickname' && (v as string).length > 40) throw Error('称呼最多 40 字');
    if (key === 'partnerRole') validatePartnerRole(v);
    Object.assign(result, {[key]: v});
  }
  if (result.restMin > result.restMax) throw Error('活动或记忆范围无效');
  // A serialized preset with edited values is custom regardless of the supplied label.
  if (result.preset !== 'custom') {
    const expected = presetConfig(result.preset);
    if (Object.keys(result).some(k => !['quietUntil','importantOnly'].includes(k) && JSON.stringify(result[k as keyof Lifestyle]) !== JSON.stringify(expected[k as keyof Lifestyle]))) {
      result.basedOn = result.preset; result.preset = 'custom';
    }
  }
  return result;
}
export function editLifestyle(config: Lifestyle, patch: Partial<Lifestyle>): Lifestyle {
  return decodeLifestyle({...config, ...patch, preset:'custom', basedOn:config.preset === 'custom' ? config.basedOn : config.preset});
}
export function lifestyleDiff(a: Lifestyle, b: Lifestyle): string[] {
  return (Object.keys(a) as (keyof Lifestyle)[]).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
export type SchemeRole = {kind:'builtin'}|{kind:'pack';key:string};
export interface SavedScheme { name:string;config:Lifestyle;version?:2;display?:SchemeDisplay;role?:SchemeRole }
export interface PortableScheme extends SavedScheme {version:2;display:SchemeDisplay;role:SchemeRole}
export function decodeSchemeRole(raw:unknown):SchemeRole {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw Error('方案角色无效');
  const role=raw as Record<string,unknown>;
  if(role.kind==='builtin'&&Object.keys(role).length===1)return {kind:'builtin'};
  if(role.kind==='pack'&&Object.keys(role).length===2&&typeof role.key==='string'&&role.key.length<140&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*@\d+\.\d+\.\d+$/.test(role.key)) return {kind:'pack',key:role.key};
  throw Error('方案角色只允许内置角色或已安装的角色标识');
}
export function decodeSchemes(raw: unknown): SavedScheme[] {
  if (!Array.isArray(raw) || raw.length > 20) throw Error('最多保存 20 套方案');
  const names = new Set<string>();
  return raw.map(s => {
    if (!s ||typeof s!=='object'||Array.isArray(s)|| typeof s.name !== 'string' || !s.name.trim() || s.name.length > 40 || names.has(s.name.trim())) throw Error('方案名称无效或重复');
    const allowed=s.version===2?['version','name','config','display','role']:['name','config'];
    for(const key of Object.keys(s))if(!allowed.includes(key))throw Error(`方案不能包含字段：${key}`);
    names.add(s.name.trim());
    const entry={name:s.name.trim(),config:exportScheme(decodeLifestyle(s.config))};
    return s.version===2?{...entry,version:2,display:decodeSchemeDisplay(s.display),role:decodeSchemeRole(s.role)}:entry;
  });
}
export function exportScheme(config: Lifestyle): Lifestyle {
  // Quiet timers are local intentions, never carried from somebody else's machine.
  return {...decodeLifestyle(config), quietUntil:0, importantOnly:false};
}
