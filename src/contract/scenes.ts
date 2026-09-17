import type { WorkState } from './types.js';
export interface Rect { x: number; y: number; width: number; height: number }
export interface Action {
  id: string; kind: 'loop' | 'reaction' | 'story'; states: WorkState[];
  pressure: [number, number]; fatigue: [number, number]; weight: number;
  durationMs: number; cooldownMs: number; channels: string[];
  entryPose: string; exitPose: string; envelope: Rect;
  sprite: number; motion: string;
  animation?: { atlas: 'motions' | 'signs' | 'work' | 'quiet' | 'daily'; frames: number[]; fps: number; pingPong: boolean; loop?: boolean };
}
export interface Scene {
  id: string; states: WorkState[]; minHoldMs: number; actions: Action[];
  /** Conservative hull containing every whip curve, stroke, and interpolation. */
  whipHull: Rect; margin: number;
  theme: string;
}
export interface ScenePack {
  schemaVersion: 1; id: string; version: string; rigId: 'bigfish-v1';
  capabilities: string[]; assets: string[]; fallbackSceneId: string; scenes: Scene[];
}
export const motions = ['breathe', 'type', 'flinch', 'dodge', 'shuffle', 'hug', 'wipe', 'celebrate', 'run', 'read', 'repair', 'sleep', 'wait-sign', 'wave', 'peek', 'stretch', 'tail-wag', 'look-back', 'panic', 'stumble', 'sigh', 'tea', 'stamp', 'bow', 'sign-overhead', 'sign-peek', 'sign-tail', 'sign-bounce', 'confirm'];
const states = new Set<WorkState>(['idle', 'awaiting-output', 'reasoning', 'generating', 'streaming-gap',
  'tool-running', 'waiting-user', 'retrying', 'disconnected', 'completed', 'cancelled', 'failed',
  'blocked', 'limited', 'interrupted', 'unknown-end']);
const channels = new Set(['body', 'arms', 'eyes', 'mouth', 'tail', 'props']);
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw new Error('Expected nonempty string');
  return value;
}
function num(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new Error('Invalid number');
  return value;
}
function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error('Expected array');
  return value.map(parse);
}
function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw new Error('Duplicate ids or entries');
}
function range(value: unknown): [number, number] {
  const a = list(value, item => num(item));
  if (a.length !== 2 || a[0]! > a[1]! || a[1]! > 1) throw new Error('Invalid normalized range');
  return [a[0]!, a[1]!];
}
function stateList(value: unknown): WorkState[] {
  const items = list(value, text);
  if (!items.length || items.some(s => !states.has(s as WorkState))) throw new Error('Unsupported state');
  unique(items); return items as WorkState[];
}
function rect(value: unknown): Rect {
  const r = obj(value);
  return { x: num(r.x, -Infinity), y: num(r.y, -Infinity), width: num(r.width, .001), height: num(r.height, .001) };
}
/** Spatial separation over conservative hulls also covers motion between sampled frames. */
export function canWhip(character: Rect, whip: Rect, margin: number): boolean {
  return character.x + character.width + margin < whip.x || whip.x + whip.width + margin < character.x
    || character.y + character.height + margin < whip.y || whip.y + whip.height + margin < character.y;
}
/** Parse untrusted pack data; assetExists must check the package's own resource inventory. */
export function parsePack(value: unknown, assetExists: (path: string) => boolean): ScenePack {
  const p = obj(value);
  if (p.schemaVersion !== 1 || p.rigId !== 'bigfish-v1') throw new Error('Unsupported pack schema or rig');
  const capabilities = list(p.capabilities, text);
  if (capabilities.some(c => !['layered', 'keyframes'].includes(c))) throw new Error('Unsupported renderer capability');
  const assets = list(p.assets, text);
  for (const path of assets) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(part => part === '..' || part === '' || part === '.')) throw new Error('Unsafe asset path');
    if (!assetExists(path)) throw new Error(`Missing asset: ${path}`);
  }
  const scenes = list(p.scenes, value => {
    const s = obj(value);
    const scene: Scene = { id: text(s.id), theme: s.theme === undefined ? 'desk' : text(s.theme), states: stateList(s.states), minHoldMs: num(s.minHoldMs),
      whipHull: rect(s.whipHull), margin: num(s.margin, 1), actions: list(s.actions, value => {
        const a = obj(value);
        if (!['loop', 'reaction', 'story'].includes(String(a.kind))) throw new Error('Unsupported action kind');
        const occupied = list(a.channels, text);
        if (!occupied.length || occupied.some(c => !channels.has(c))) throw new Error('Unsupported action channel');
        unique(occupied);
        const sprite = a.sprite === undefined ? 0 : num(a.sprite);
        if (!Number.isInteger(sprite) || sprite > 11) throw new Error('Invalid sprite index');
        const motion = a.motion === undefined ? 'breathe' : text(a.motion);
        if (!motions.includes(motion)) throw new Error('Unknown motion');
        let animation: Action['animation'];
        if (a.animation !== undefined) {
          const spec = obj(a.animation);
          const frames = list(spec.frames, n => num(n));
          if (!['motions', 'signs', 'work', 'quiet', 'daily'].includes(String(spec.atlas)) || !assets.includes(`bigfish-${spec.atlas}.png`) || !frames.length || frames.length > 64 || frames.some(n => !Number.isInteger(n) || n > (spec.atlas==='daily'?11:['work', 'quiet'].includes(String(spec.atlas)) ? 7 : 15))) throw new Error('Invalid frame sequence');
          const fps = num(spec.fps, 1); if (fps > 12 || typeof spec.pingPong !== 'boolean') throw new Error('Invalid animation timing');
          if(spec.loop!==undefined&&typeof spec.loop!=='boolean')throw Error('Invalid loop policy');
          animation = { ...(spec.loop===undefined?{}:{loop:spec.loop as boolean}), atlas: spec.atlas as 'motions' | 'signs' | 'work' | 'quiet' | 'daily', frames, fps, pingPong: spec.pingPong };
        }
        return { ...(animation ? { animation } : {}), id: text(a.id), kind: a.kind as Action['kind'], states: stateList(a.states), sprite, motion,
          pressure: range(a.pressure), fatigue: range(a.fatigue), weight: num(a.weight, .001),
          durationMs: num(a.durationMs, 1), cooldownMs: num(a.cooldownMs), channels: occupied,
          entryPose: text(a.entryPose), exitPose: text(a.exitPose), envelope: rect(a.envelope) };
      }) };
    if (!scene.actions.some(a => a.kind === 'loop')) throw new Error('Scene needs a base loop');
    unique(scene.actions.map(a => a.id));
    if (scene.actions.some(a => a.states.some(st => !scene.states.includes(st)))) throw new Error('Action state outside scene');
    return scene;
  });
  unique(scenes.map(s => s.id));
  const fallback = text(p.fallbackSceneId);
  if (!scenes.some(s => s.id === fallback && s.states.includes('idle'))) throw new Error('Missing idle fallback scene');
  return { schemaVersion: 1, id: text(p.id), version: text(p.version), rigId: 'bigfish-v1', capabilities,
    assets, fallbackSceneId: fallback, scenes };
}
export function loadPack(value: unknown, assetExists: (path: string) => boolean, fallback: ScenePack): { pack: ScenePack; error?: string } {
  try { return { pack: parsePack(value, assetExists) }; }
  catch (error) { return { pack: fallback, error: error instanceof Error ? error.message : String(error) }; }
}
