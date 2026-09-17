import type { Baseline } from '../contract/types.js';
import type { Config } from './config.js';
import { clamp } from './config.js';
interface RecordValue { samples: number[]; attempts: number; center: number; updated: number }
const percentile = (sorted: number[], fraction: number): number => sorted[Math.floor((sorted.length - 1) * fraction)]!;
/** Bounded aggregate-only model history. The client stores this aggregate-only history locally. */
export class Baselines {
  private readonly entries = new Map<string, RecordValue>();
  constructor(private readonly config: Config) {}
  get size(): number { return this.entries.size; }
  export(now: number): unknown {
    for (const key of [...this.entries.keys()]) this.get(key, now);
    return { version: 1, rows: [...this.entries].map(([key, row]) => ({ key, ...row })) };
  }
  restore(value: unknown, now: number): void {
    if (!value || typeof value !== 'object') throw new Error('Invalid history');
    const data = value as { version?: unknown; rows?: unknown };
    if (data.version !== 1 || !Array.isArray(data.rows) || data.rows.length > this.config.maxModels) throw new Error('Unsupported history');
    const restored = new Map<string, RecordValue>();
    for (const raw of data.rows) {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid history row');
      const r = raw as RecordValue & { key: string };
      if (typeof r.key !== 'string' || r.key.length > 2048 || !Array.isArray(r.samples) || !r.samples.length || r.samples.length > this.config.maxSamples
        || r.samples.some(n => typeof n !== 'number' || !Number.isFinite(n) || n <= 0) || !Number.isFinite(r.center) || r.center <= 0
        || !Number.isInteger(r.attempts) || r.attempts < 1 || !Number.isFinite(r.updated) || r.updated > now + 60000) throw new Error('Invalid history row');
      if (now - r.updated <= this.config.baselineTtlMs) restored.set(r.key, { samples: [...r.samples], center: r.center, attempts: r.attempts, updated: r.updated });
    }
    this.entries.clear(); for (const [key, row] of restored) this.entries.set(key, row);
  }
  reset(key?: string): void { if (key === undefined) this.entries.clear(); else this.entries.delete(key); }
  get(key: string, now: number): Baseline | null {
    const row = this.entries.get(key);
    if (!row) return null;
    if (now - row.updated > this.config.baselineTtlMs) { this.entries.delete(key); return null; }
    this.entries.delete(key); this.entries.set(key, row);
    const sorted = [...row.samples].sort((a, b) => a - b);
    const seconds = row.samples.length * this.config.sampleMs / 1000;
    if (seconds * 1000 < this.config.provisionalMs) return null;
    return {
      p25: percentile(sorted, .25), p50: row.center, p75: percentile(sorted, .75), seconds,
      attempts: row.attempts,
      confidence: Math.min(1, seconds * 1000 / this.config.matureMs, row.attempts / this.config.matureAttempts),
    };
  }
  /** One settlement per attempt, using non-overlapping valid samples. */
  commit(key: string, samples: readonly number[], now: number): void {
    const good = samples.filter(n => Number.isFinite(n) && n > 0).slice(-this.config.maxAttemptSamples);
    if (!good.length) return;
    this.get(key, now); // expire before merging
    const prev = this.entries.get(key);
    const all = [...(prev?.samples ?? []), ...good].slice(-this.config.maxSamples);
    const sorted = [...all].sort((a, b) => a - b);
    const candidate = percentile(sorted, .5);
    const mature = prev && prev.samples.length * this.config.sampleMs >= this.config.provisionalMs;
    const center = mature ? clamp(candidate, prev.center * (1 - this.config.baselineStep), prev.center * (1 + this.config.baselineStep)) : candidate;
    this.entries.delete(key);
    this.entries.set(key, { samples: all, attempts: (prev?.attempts ?? 0) + 1, center, updated: now });
    while (this.entries.size > this.config.maxModels) this.entries.delete(this.entries.keys().next().value!);
  }
  provisional(samples: readonly number[]): Baseline | null {
    if (samples.length * this.config.sampleMs < this.config.provisionalMs) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    return { p25: percentile(sorted, .25), p50: percentile(sorted, .5), p75: percentile(sorted, .75),
      seconds: samples.length * this.config.sampleMs / 1000, attempts: 1, confidence: .25 };
  }
}
