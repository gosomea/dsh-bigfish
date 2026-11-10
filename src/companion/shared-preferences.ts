import {decodePreferences,type Preferences} from '../contract/preferences.js';
export interface PreferenceOp {op:'set';path:string[];value:unknown}
/** Only cosmetic/behavior keys reach the shared namespace; intelligence and grants live elsewhere. */
export function validateSharedPreferenceOps(current:unknown,raw:unknown):PreferenceOp[]{
 if(!Array.isArray(raw)||!raw.length||raw.length>80)throw Error('偏好修改无效');
 const next=decodePreferences(current),keys=new Set(Object.keys(next));
 for(const op of raw){if(!op||typeof op!=='object'||op.op!=='set'||!Array.isArray(op.path)||op.path.length!==1||!keys.has(op.path[0]))throw Error('只允许修改大肥鱼外观与行为偏好');(next as unknown as Record<string,unknown>)[op.path[0]]=op.value;}
 decodePreferences(next);return raw.map(op=>({op:'set',path:[op.path[0]],value:op.value}));
}
export interface SharedPreferenceSnapshot {status:string;mode:'host';writable:boolean;revision:number|undefined;value:Preferences|undefined}
