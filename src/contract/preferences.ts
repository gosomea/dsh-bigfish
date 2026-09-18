import { parseLines, parseRules } from './dialogue.js';
import { resolveConfig, type Config } from '../domain/config.js';
export interface Preferences {
  bubbleEnabled: boolean; bubbleStatus: boolean; bubbleText: boolean; showTask: boolean; showFile: boolean; showTool: boolean; bubbleWidth: number; bubbleFont: number; speechSeconds: number; talkLevel: number; dialogueJson: string; toolRulesJson: string;
  completionMode:'celebrate'|'message'|'quiet';
  idleMode: 'quiet' | 'occasional' | 'natural' | 'frequent' | 'continuous' | 'custom'; idleMinSeconds: number; idleMaxSeconds: number; idleHoldSeconds: number; idleSignPreference: 'balanced' | 'prefer' | 'none'; greetOnOpen: boolean; idleHideMessage: boolean; idleRandomText: boolean; whipEnabled: boolean; motionPolicy: 'system' | 'normal' | 'reduced';
  version: 2; enabled: boolean; mode: 'urge' | 'rhythm'; autoSpeed: boolean; targetRate: number;
  maxWhipHz: number; intensity: number; size: number; opacity: number; richness: number;
  scene: string; sound: boolean; volume: number; reducedMotion: boolean; showStats: boolean;
  includeReasoning: boolean; timePressure: boolean; referenceSeconds: number; fatigueSeconds: number;
  windowSeconds: number; learnHistory: boolean; completionSeconds: number;
}
export const preferenceDefaults: Preferences = {
  bubbleEnabled: true, bubbleStatus: true, bubbleText: true, showTask: true, showFile: true, showTool: true, bubbleWidth: 270, bubbleFont: 12, speechSeconds: 2.5, talkLevel: 1, dialogueJson: '{}', toolRulesJson: '[]',
  completionMode:'celebrate', idleMode:'frequent', idleMinSeconds:5, idleMaxSeconds:10, idleHoldSeconds:12, idleSignPreference:'prefer', greetOnOpen:true, idleHideMessage:true, idleRandomText:true, whipEnabled:true, motionPolicy:'system',
  version: 2, enabled: true, mode: 'urge', autoSpeed: true, targetRate: 100, maxWhipHz: 2.2,
  intensity: 1, size: 180, opacity: 1, richness: 2, scene: 'auto', sound: false, volume: .15,
  reducedMotion: false, showStats: true, includeReasoning: true, timePressure: false,
  referenceSeconds: 120, fatigueSeconds: 180, windowSeconds: 3, learnHistory: true, completionSeconds: 4,
};
export const preferenceRanges: Partial<Record<keyof Preferences, [number, number]>> = {
  idleMinSeconds:[1,600], idleMaxSeconds:[1,600], idleHoldSeconds:[5,30], bubbleWidth: [180, 400], bubbleFont: [10, 20], speechSeconds: [1, 10], talkLevel: [0, 2], targetRate: [1, 2000], maxWhipHz: [.1, 2.2], intensity: [.25, 1.5], size: [120, 300], opacity: [.3, 1],
  richness: [0, 2], volume: [0, .5], referenceSeconds: [10, 3600], fatigueSeconds: [30, 7200],
  windowSeconds: [1, 10], completionSeconds: [1, 15],
};
export function decodePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preferences');
  const p = { ...preferenceDefaults, ...value } as Preferences;
  const sourceVersion=(value as {version?:number}).version;
  if (sourceVersion !== undefined && sourceVersion !== 1 && sourceVersion !== 2) throw new Error('Unsupported preferences version');
  p.version=2;
  if(sourceVersion===1){p.idleMode='quiet';p.bubbleEnabled=p.bubbleEnabled&&(p.bubbleText||p.bubbleStatus);p.bubbleStatus=p.bubbleEnabled;}
  if (!['celebrate','message','quiet'].includes(p.completionMode)) throw new Error('Invalid completion selection');
  if (!['quiet','occasional','natural','frequent','continuous','custom'].includes(p.idleMode)||!['system','normal','reduced'].includes(p.motionPolicy)) throw new Error('Invalid behavior selection');
  for (const [key, defaultValue] of Object.entries(preferenceDefaults)) {
    const v = p[key as keyof Preferences];
    if (typeof v !== typeof defaultValue) throw new Error(`Invalid preference: ${key}`);
    const range = preferenceRanges[key as keyof Preferences];
    if (range && (typeof v !== 'number' || !Number.isFinite(v) || v < range[0] || v > range[1])) throw new Error(`Out of range: ${key}`);
  }
  if (!['urge', 'rhythm'].includes(p.mode) || !/^[a-z][a-z0-9-]{0,63}$/.test(p.scene)) throw new Error('Invalid selection');
  if (!['balanced','prefer','none'].includes(p.idleSignPreference) || p.idleMinSeconds > p.idleMaxSeconds) throw new Error('Invalid idle settings');
  parseLines(p.dialogueJson); parseRules(p.toolRulesJson);
  if (!Number.isInteger(p.talkLevel)) throw new Error('Invalid talk level');
  if (!Number.isInteger(p.richness)) throw new Error('Invalid richness');
  return Object.fromEntries(Object.keys(preferenceDefaults).map(key => [key, p[key as keyof Preferences]])) as unknown as Preferences;
}
export function engineConfig(p: Preferences): Config {
  return resolveConfig({ mode: p.mode, manualRate: p.autoSpeed ? null : p.targetRate,
    maxWhipHz: p.maxWhipHz, fatigueMs: p.fatigueSeconds * 1000, referenceMs: p.referenceSeconds * 1000,
    timePressure: p.timePressure, windowMs: p.windowSeconds * 1000 });
}
