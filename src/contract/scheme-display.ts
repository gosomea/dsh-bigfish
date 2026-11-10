import type {Preferences} from './preferences.js';

/** Shareable display/behavior choices. Text, task context, consent and runtime data are excluded. */
export const schemeDisplayDefaults = {
  bubbleEnabled:true,bubbleStatus:true,bubbleText:true,showTask:true,showFile:true,showTool:true,
  bubbleWidth:270,bubbleFont:12,speechSeconds:2.5,talkLevel:1,completionMode:'celebrate',
  idleMode:'continuous',idleMinSeconds:5,idleMaxSeconds:10,idleHoldSeconds:12,idleSignPreference:'prefer',
  greetOnOpen:true,idleHideMessage:true,idleRandomText:true,whipEnabled:true,motionPolicy:'system',
  enabled:true,mode:'urge',autoSpeed:true,targetRate:100,maxWhipHz:2.2,intensity:1,size:180,opacity:1,
  richness:2,sceneryVisible:true,scene:'auto',sound:false,volume:.15,reducedMotion:false,showStats:true,includeReasoning:true,
  timePressure:false,referenceSeconds:120,fatigueSeconds:180,windowSeconds:3,learnHistory:true,completionSeconds:4,
} satisfies Partial<Preferences>;
export type SchemeDisplay = Pick<Preferences,keyof typeof schemeDisplayDefaults>;
export type SchemeDisplayKey = keyof SchemeDisplay;
export const schemeDisplayKeys = Object.keys(schemeDisplayDefaults) as SchemeDisplayKey[];
export const schemeDisplayRanges:Partial<Record<SchemeDisplayKey,[number,number]>> & {size:[number,number]} = {
  idleMinSeconds:[1,600],idleMaxSeconds:[1,600],idleHoldSeconds:[5,30],bubbleWidth:[180,400],bubbleFont:[10,20],
  speechSeconds:[1,10],talkLevel:[0,2],targetRate:[1,2000],maxWhipHz:[.1,2.2],intensity:[.25,1.5],size:[120,300],opacity:[.3,1],
  richness:[0,2],volume:[0,.5],referenceSeconds:[10,3600],fatigueSeconds:[30,7200],windowSeconds:[1,10],completionSeconds:[1,15],
};
const choices:Partial<Record<SchemeDisplayKey,readonly string[]>> = {
  completionMode:['celebrate','message','quiet'],idleMode:['quiet','occasional','natural','frequent','continuous','custom'],
  idleSignPreference:['balanced','prefer','none'],motionPolicy:['system','normal','reduced'],mode:['urge','rhythm'],
};
export function decodeSchemeDisplay(value:unknown):SchemeDisplay {
  if (!value||typeof value!=='object'||Array.isArray(value)) throw Error('方案显示配置必须是对象');
  const raw=value as Record<string,unknown>;
  for(const key of Object.keys(raw)) if(!Object.hasOwn(schemeDisplayDefaults,key)) throw Error(`方案不能包含字段：${key}`);
  // Existing v2 schemes predate the global scenery switch; only this additive field has a default.
  if(schemeDisplayKeys.some(key=>key!=='sceneryVisible'&&!Object.hasOwn(raw,key)))throw Error('新版方案必须包含完整的显示与行为配置');
  const result={...schemeDisplayDefaults,...raw} as SchemeDisplay;
  for(const key of schemeDisplayKeys) {
    const v=result[key];
    if(typeof v!==typeof schemeDisplayDefaults[key]) throw Error(`方案显示字段无效：${key}`);
    const range=schemeDisplayRanges[key];
    if(typeof v==='number'&&(!Number.isFinite(v)||(range&&(v<range[0]||v>range[1])))) throw Error(`方案显示数值越界：${key}`);
    if(choices[key]&&!choices[key]!.includes(v as string)) throw Error(`方案显示选项无效：${key}`);
  }
  if(!Number.isInteger(result.talkLevel)||!Number.isInteger(result.richness)) throw Error('动作与说话档位必须为整数');
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(result.scene)||result.idleMinSeconds>result.idleMaxSeconds) throw Error('方案显示范围无效');
  return result;
}
