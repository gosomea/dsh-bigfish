import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Baselines, SessionTelemetry, resolveConfig, modelKey, parsePack, Director, seeded, type ModelIdentity } from '../src/index.js';
const c = resolveConfig();
const identity: ModelIdentity = { endpointId: 'synthetic', model: 'fixture', reasoning: 'normal', channels: ['text'], counter: 'exact-replay-v1' };
const pack = parsePack(JSON.parse(await readFile('packs/logic-fixture/manifest.json', 'utf8')), () => true);
const rows: Record<string, unknown>[] = [];
const summary: Record<string, unknown>[] = [];
for (const base of [20, 100, 400]) {
  for (const calibrated of [false, true]) {
    let now = 0; const history = new Baselines(c);
    if (calibrated) for (let i = 0; i < 3; i++) history.commit(modelKey(identity), Array(20).fill(base), 0);
    const engine = new SessionTelemetry(`synthetic-${base}-${calibrated}`, { now: () => now }, history, c);
    const director = new Director(pack, seeded(10));
    engine.accept({ type: 'turn-start', turn: 1 });
    engine.accept({ type: 'attempt-start', turn: 1, id: 'a', epoch: 'demo', model: identity });
    let index = 0;
    for (const ratio of [1, .5, 1.25, 1]) {
      for (let tick = 0; tick < 120; tick++) {
        now += 100;
        engine.accept({ type: 'chunk', id: 'a', epoch: 'demo', index: index++, tokens: base * ratio / 10, quality: 'exact', channel: 'text' });
        const s = engine.snapshot(); const d = director.tick(s, now);
        if (tick % 5 === 0) rows.push({ model: base, calibrated, ms: now, ratio, state: s.state, rate: s.rate,
          baseline: s.baseline?.p50 ?? null, confidence: s.baseline?.confidence ?? 0, pressure: s.pressure,
          fatigue: s.fatigue, action: d.actionId, reaction: d.reactionId, whipHz: s.whipHz });
      }
      const s = engine.snapshot();
      summary.push({ model: base, calibrated, ratio, rate: s.rate === null ? null : +s.rate.toFixed(2),
        baseline: s.baseline?.p50 ?? null, pressure: +s.pressure.toFixed(4) });
    }
    engine.accept({ type: 'turn-end', turn: 1, reason: 'completed' });
  }
}
const folder = resolve('artifacts'); await mkdir(folder, { recursive: true });
const columns = Object.keys(rows[0]!);
const csv = [columns.join(','), ...rows.map(row => columns.map(key => JSON.stringify(row[key] ?? '')).join(','))].join('\n') + '\n';
await writeFile(resolve(folder, 'replay.csv'), csv);
await writeFile(resolve(folder, 'replay-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.table(summary);
console.log(`Synthetic replay only; ${rows.length} rows saved to artifacts/replay.csv. No model API was called.`);
