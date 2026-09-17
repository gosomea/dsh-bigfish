import type { Mode } from '../contract/types.js';
export interface Config {
  mode: Mode; windowMs: number; smoothMs: number; gapMs: number;
  sampleMs: number; provisionalMs: number; matureMs: number; matureAttempts: number;
  maxSamples: number; maxAttemptSamples: number; maxModels: number; baselineTtlMs: number;
  baselineStep: number; manualRate: number | null; maxWhipHz: number; slewHzPerSecond: number;
  fatigueMs: number; timePressure: boolean; referenceMs: number; timeWeight: number;
  gapPressureCap: number;
}
export const defaults: Readonly<Config> = Object.freeze({
  mode: 'urge', windowMs: 3000, smoothMs: 1000, gapMs: 3000,
  sampleMs: 3000, provisionalMs: 12000, matureMs: 60000, matureAttempts: 3,
  maxSamples: 120, maxAttemptSamples: 20, maxModels: 100, baselineTtlMs: 30 * 86400000,
  baselineStep: 0.1, manualRate: null, maxWhipHz: 2.2, slewHzPerSecond: 0.6,
  fatigueMs: 120000, timePressure: false, referenceMs: 120000, timeWeight: 0.25,
  gapPressureCap: 0.25,
});
/** Validate configuration at the public boundary, rather than repairing bad values silently. */
export function resolveConfig(patch: Partial<Config> = {}): Config {
  const c = { ...defaults, ...patch };
  if (c.mode !== 'urge' && c.mode !== 'rhythm') throw new Error('Invalid mode');
  for (const [key, value] of Object.entries(c)) {
    if (!(key in defaults)) throw new Error(`Unknown setting: ${key}`);
    if (typeof defaults[key as keyof Config] === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
      throw new Error(`Invalid positive setting: ${key}`);
    }
  }
  if (typeof c.timePressure !== 'boolean') throw new Error('Invalid timePressure');
  if (c.manualRate !== null && (!Number.isFinite(c.manualRate) || c.manualRate <= 0)) throw new Error('Invalid manualRate');
  for (const key of ['maxSamples', 'maxAttemptSamples', 'maxModels', 'matureAttempts'] as const) {
    if (!Number.isInteger(c[key])) throw new Error(`Invalid integer setting: ${key}`);
  }
  if (c.baselineStep > 1 || c.timeWeight > 1 || c.gapPressureCap > 1) throw new Error('Weight exceeds one');
  if (c.provisionalMs > c.matureMs || c.maxAttemptSamples > c.maxSamples) throw new Error('Inconsistent calibration settings');
  return c;
}
export const clamp = (n: number, low = 0, high = 1): number => Math.max(low, Math.min(high, n));
