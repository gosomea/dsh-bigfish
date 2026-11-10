import { decodeLifestyle, decodeSchemes, presetConfig } from '../companion/config.js';
import { parseLines, parseRules } from './dialogue.js';
import { resolveConfig, type Config } from '../domain/config.js';
import {schemeDisplayDefaults,schemeDisplayRanges} from './scheme-display.js';
export interface Preferences {
  lifestyleJson: string; schemesJson: string;
  bubbleEnabled: boolean; bubbleStatus: boolean; bubbleText: boolean; showTask: boolean; showFile: boolean; showTool: boolean; bubbleWidth: number; bubbleFont: number; speechSeconds: number; talkLevel: number; dialogueJson: string; toolRulesJson: string;
  completionMode:'celebrate'|'message'|'quiet';
  idleMode: 'quiet' | 'occasional' | 'natural' | 'frequent' | 'continuous' | 'custom'; idleMinSeconds: number; idleMaxSeconds: number; idleHoldSeconds: number; idleSignPreference: 'balanced' | 'prefer' | 'none'; greetOnOpen: boolean; idleHideMessage: boolean; idleRandomText: boolean; whipEnabled: boolean; motionPolicy: 'system' | 'normal' | 'reduced';
  version: 2; enabled: boolean; mode: 'urge' | 'rhythm'; autoSpeed: boolean; targetRate: number;
  maxWhipHz: number; intensity: number; size: number; opacity: number; richness: number;
  sceneryVisible: boolean; scene: string; sound: boolean; volume: number; reducedMotion: boolean; showStats: boolean;
  includeReasoning: boolean; timePressure: boolean; referenceSeconds: number; fatigueSeconds: number;
  windowSeconds: number; learnHistory: boolean; completionSeconds: number;
}
export const preferenceDefaults: Preferences = {
  ...schemeDisplayDefaults,
  lifestyleJson: JSON.stringify(presetConfig('balanced')), schemesJson: '[]',
  version:2,dialogueJson:'{}',toolRulesJson:'[]',
};
export const preferenceRanges: Partial<Record<keyof Preferences, [number, number]>> = {
  ...schemeDisplayRanges,
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
  decodeLifestyle(JSON.parse(p.lifestyleJson)); p.schemesJson=JSON.stringify(decodeSchemes(JSON.parse(p.schemesJson)));
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
