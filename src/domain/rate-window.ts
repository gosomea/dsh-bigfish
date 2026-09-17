import type { Config } from './config.js';
/** Fixed-rate time buckets bound memory independently of the number of chunks. */
export class RateWindow {
  private buckets = new Map<number, number>();
  private start: number | null = null;
  private lastRead: number | null = null;
  private smooth: number | null = null;
  lastTokenAt: number | null = null;
  constructor(private readonly config: Config) {}
  reset(): void { this.buckets.clear(); this.start = this.lastRead = this.smooth = this.lastTokenAt = null; }
  get size(): number { return this.buckets.size; }
  add(tokens: number, now: number): void {
    if (tokens <= 0) return;
    this.start ??= now;
    this.lastTokenAt = now;
    const bucket = Math.floor(now / 100);
    this.buckets.set(bucket, (this.buckets.get(bucket) ?? 0) + tokens);
    this.prune(now);
  }
  private prune(now: number): void {
    for (const key of this.buckets.keys()) if (key * 100 <= now - this.config.windowMs) this.buckets.delete(key);
  }
  read(now: number): number | null {
    if (this.start === null) return null;
    const duration = Math.min(this.config.windowMs, now - this.start);
    if (duration < 500) return null;
    this.prune(now);
    const raw = [...this.buckets.values()].reduce((sum, n) => sum + n, 0) * 1000 / duration;
    if (this.lastRead === null) this.smooth = raw;
    else if (now > this.lastRead) this.smooth = this.smooth! + (1 - Math.exp(-(now - this.lastRead) / this.config.smoothMs)) * (raw - this.smooth!);
    this.lastRead = now;
    return this.smooth;
  }
}
