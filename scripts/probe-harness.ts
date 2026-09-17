import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { attach, HarnessAdapter } from '../src/index.js';

const root = process.cwd();
const harness = resolve(process.argv[2] ?? '../../deepseek-harness');
const git = spawnSync('git', ['-C', harness, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
if (git.status !== 0) throw new Error(git.stderr);
const pkg = JSON.parse(await readFile(resolve(harness, 'package.json'), 'utf8')) as { version: string };
const scratch = resolve(root, '.probe'); await mkdir(scratch, { recursive: true });
const native = (p: string) => JSON.stringify(resolve(harness, p));
const source = `
import type { Context } from ${native('vendor/cordis/lib/types/index.js')};
import type { Agent, AssistantStreamFrame } from ${native('packages/core/agent/lib/types/index.js')};
import type { Session, SessionEvent } from ${native('packages/core/session/lib/types/index.js')};
import type {} from ${native('packages/api/session-controller/lib/types/client/index.js')};
import type {} from ${native('packages/client/ui-session/lib/types/client/index.js')};
import type {} from ${native('packages/client/ui-settings/lib/types/client/settings-scope.js')};
import type {} from ${native('packages/client/connection/lib/types/client/index.js')};
import type { NativeServices } from '../src/client/native-contract.js';
import type { EventContext } from '../src/host/attach.js';
import type { HarnessAdapter, AgentHandle, StreamFrame } from '../src/host/adapter.js';
declare const ctx: Context;
declare const agent: Agent;
declare const frame: AssistantStreamFrame;
declare const session: Session;
declare const event: SessionEvent;
declare const adapter: HarnessAdapter;
const compatibleContext: EventContext = ctx;
declare const connection: import(${native('packages/client/connection/lib/types/client/index.js')}).ConnectionHandle;
declare const sessions: import(${native('packages/api/session-controller/lib/types/client/index.js')}).ISessions;
const compatibleClient: NativeServices = { sessions, uiSession: ctx.uiSession, settingsScope: ctx.settingsScope, connection };
void compatibleClient;
const compatibleAgent: AgentHandle = agent;
const compatibleFrame: StreamFrame = frame;
adapter.frame(agent, frame);
adapter.event(session, event);
void compatibleContext; void compatibleAgent; void compatibleFrame;
`;
const file = resolve(scratch, 'contract.ts'); await writeFile(file, source);
const program = ts.createProgram([file], {
  strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: ['node'], exactOptionalPropertyTypes: true,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: p => p, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else {
  const { Context } = await import(pathToFileURL(resolve(harness, 'vendor/cordis/lib/index.js')).href);
  const ctx = new Context();
  let now = 0;
  const adapter = new HarnessAdapter({ now: () => now });
  const errors: unknown[] = [];
  const off = attach(ctx, adapter, error => errors.push(error));
  const agent = { session: { id: 'probe' }, options: { provider: 'probe', model: 'probe-model' } };
  ctx.emit('session/event', agent.session, { type: 'turn/start', seq: 0, data: { turn: 1 } });
  ctx.emit('agent/assistant-stream', { agent, frame: { type: 'start', attemptId: 'a', revision: 1, turn: 1, step: 1 } });
  now = 100;
  ctx.emit('agent/assistant-stream', { agent, frame: { type: 'chunk', attemptId: 'a', revision: 2, index: 0, time: now, chunk: { type: 'text-delta', index: 0, text: '大肥鱼' } } });
  assert.equal(adapter.session('probe').snapshot().tokens, 3);
  ctx.emit('session/event', agent.session, { type: 'turn/end', seq: 1, data: { turn: 1, reason: { kind: 'completed' } } });
  assert.equal(adapter.session('probe').snapshot().completionSerial, 1);
  off();
  ctx.emit('session/event', agent.session, { type: 'turn/start', seq: 2, data: { turn: 2 } });
  assert.equal(adapter.sessionCount, 0); assert.deepEqual(errors, []);
  const report = { date: new Date().toISOString(), harness: relative(root, harness), version: pkg.version,
    commit: git.stdout.trim(), node: process.version,
    checks: ['native Host frame and Browser session/settings/connection type assignability', 'real Cordis emitter → Host adapter → token/turn projection', 'listener disposal'],
    notVerifiedByThisProbe: ['browser/runtime/package checks are covered separately by smoke:native', 'paid provider API'],
  };
  await writeFile(resolve(scratch, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
