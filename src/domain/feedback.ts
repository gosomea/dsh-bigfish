import type { Baseline, WorkState } from '../contract/types.js';
import type { Config } from './config.js';
import { clamp } from './config.js';
const ratios = [.25, .5, .8, 1, 1.25, 1.5];
function interpolate(ratio: number, values: readonly number[]): number {
  if (ratio <= ratios[0]!) return values[0]!;
  for (let i = 1; i < ratios.length; i++) {
    if (ratio <= ratios[i]!) return values[i - 1]! + (values[i]! - values[i - 1]!) * (ratio - ratios[i - 1]!) / (ratios[i]! - ratios[i - 1]!);
  }
  return values.at(-1)!;
}
export function feedback(state: WorkState, rate: number | null, baseline: Baseline | null, workMs: number, c: Config) {
  const base = c.manualRate ?? baseline?.p50;
  const ratio = rate !== null && base !== undefined && base > 0 ? rate / base : null;
  const confidence = c.manualRate !== null ? 1 : baseline?.confidence ?? 0;
  const activity = ratio === null ? .15 : interpolate(ratio, [.05, .2, .4, .55, .75, 1]);
  const drive = ratio === null ? .15 : c.mode === 'urge' ? interpolate(ratio, [1, .75, .35, .15, .05, 0]) : activity;
  const allowed = state === 'generating' || state === 'reasoning' || state === 'streaming-gap';
  const time = c.timePressure ? c.timeWeight * clamp((workMs - c.referenceMs) / c.referenceMs) : 0;
  let pressure = allowed ? clamp(confidence * drive + (1 - confidence) * .15 + time) : 0;
  if (state === 'streaming-gap') pressure = Math.min(c.gapPressureCap, pressure);
  return { relativeRate: ratio, pressure, activity, fatigue: clamp(workMs / c.fatigueMs) };
}
