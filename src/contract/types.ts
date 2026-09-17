export type WorkState = 'idle' | 'awaiting-output' | 'reasoning' | 'generating' | 'streaming-gap'
  | 'tool-running' | 'waiting-user' | 'retrying' | 'disconnected'
  | 'completed' | 'cancelled' | 'failed' | 'blocked' | 'limited' | 'interrupted' | 'unknown-end';
export type CountQuality = 'exact' | 'tokenized' | 'estimated' | 'unavailable';
export type Channel = 'text' | 'reasoning' | 'tool-arguments';
export type Mode = 'urge' | 'rhythm';
export interface ModelIdentity {
  /** Stable configuration id, never a URL containing credentials. */
  endpointId: string;
  model: string;
  reasoning: string;
  channels: readonly Channel[];
  counter: string;
}
/** Restore only the latest output phase; historical text never enters counters. */
export interface ObservedOutput { channel: Channel; ageMs: number }
export const modelKey = (model: ModelIdentity): string => JSON.stringify([
  model.endpointId, model.model, model.reasoning, [...new Set(model.channels)].sort(), model.counter,
]);
export type EndReason = 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'interrupted' | 'unknown';
export type InputEvent =
  | { type: 'turn-start'; turn: number }
  | { type: 'turn-end'; turn: number; reason: EndReason }
  | { type: 'attempt-start'; id: string; epoch: string; turn: number; model: ModelIdentity; observed?: ObservedOutput }
  | { type: 'chunk'; id: string; epoch: string; index: number; tokens: number | null; quality: CountQuality; channel: Channel }
  | { type: 'attempt-end'; id: string; epoch: string }
  | { type: 'tool-start' | 'tool-end'; id: string }
  | { type: 'waiting' | 'retry' | 'connection'; active: boolean }
  | { type: 'resume'; turn: number; wallElapsed: number; workElapsed: number; state: WorkState };
export interface Baseline {
  p25: number; p50: number; p75: number;
  seconds: number; attempts: number; confidence: number;
}
export interface Snapshot {
  sessionId: string; turn: number; sequence: number; state: WorkState;
  modelKey: string | null; rate: number | null; quality: CountQuality;
  baseline: Baseline | null; relativeRate: number | null;
  pressure: number; activity: number; fatigue: number; whipHz: number;
  wallElapsed: number; workElapsed: number; generationElapsed: number;
  tools: number; tokens: number; completionSerial: number;
}
export interface Clock { now(): number }
