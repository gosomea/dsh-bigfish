import test from 'node:test';
import assert from 'node:assert/strict';
import {DshSessionBridge} from '../src/client/dsh-session-bridge.js';
import {NativeCompanion} from '../src/client/controller.js';
import type {NativeServices, UiWorkspaceNavigation} from '../src/client/native-contract.js';

const observable = <T>(value: T) => ({getSnapshot: () => value, subscribe: (_listener: () => void) => () => {}});
function services(navigation?: UiWorkspaceNavigation): NativeServices {
  return {
    sessions: {list: observable({current: undefined}), binding: () => {throw new Error('Navigation must not retain sessions itself');}},
    uiSession: {pendingInteractions: observable(new Map())},
    connection: {state: observable('connected')},
    ...(navigation ? {uiWorkspace: navigation} : {}),
  };
}

test('Web navigation delegates exactly once to the public Workspace UI without retaining or writing a session', () => {
  const selected: string[] = [];
  const navigation = {openSession(id: string) { assert.equal(this, navigation); selected.push(id); }};
  const bridge = new DshSessionBridge(services(navigation));
  assert.equal(bridge.canOpenSession(), true);
  bridge.openSession('0199be08-44a5-7000-8000-0123456789ab');
  assert.deepEqual(selected, ['0199be08-44a5-7000-8000-0123456789ab']);
  assert.equal(bridge.currentSessionId(), undefined);
});

test('optional navigation can appear after plugin activation and disappears without stale service capture', () => {
  let navigation: UiWorkspaceNavigation | undefined;
  const ctx = services();
  Object.defineProperty(ctx, 'uiWorkspace', {get: () => navigation});
  const bridge = new DshSessionBridge(ctx), opened: string[] = [];
  assert.equal(bridge.canOpenSession(), false);
  assert.throws(() => bridge.openSession('source'), /未提供会话跳转/);
  navigation = {openSession: id => {opened.push(id);}};
  assert.equal(bridge.canOpenSession(), true);
  bridge.openSession('source');
  navigation = undefined;
  assert.equal(bridge.canOpenSession(), false);
  assert.throws(() => bridge.openSession('source'), /未提供会话跳转/);
  assert.deepEqual(opened, ['source']);
});

test('invalid navigation identifiers are rejected before reaching DSH', () => {
  const calls: string[] = [];
  const bridge = new DshSessionBridge(services({openSession: id => {calls.push(id);}}));
  for (const id of ['', ' source', 'source ', 'source\nother', '\u007fsource', 'a'.repeat(257), undefined, 42]) {
    assert.throws(() => bridge.openSession(id as string), /会话标识无效/);
  }
  assert.deepEqual(calls, []);
});

test('companion exposes live navigation capability and does not navigate after disposal', () => {
  const opened: string[] = [];
  const companion = new NativeCompanion(services({openSession: id => {opened.push(id);}}), null, null);
  try {
    assert.equal(companion.canOpenSession(), true);
    companion.openSession('task-source');
    assert.deepEqual(opened, ['task-source']);
  } finally {companion.dispose();}
  assert.equal(companion.canOpenSession(), false);
  assert.throws(() => companion.openSession('task-source'), /宠物已关闭/);
  assert.deepEqual(opened, ['task-source']);
});

test('legacy compositions retain ordinary companion behavior with navigation unavailable', () => {
  const companion = new NativeCompanion(services(), null, null);
  try {
    assert.equal(companion.getSnapshot().compatibility.supported, true);
    assert.equal(companion.getSnapshot().snapshot.state, 'idle');
    assert.equal(companion.canOpenSession(), false);
    assert.throws(() => companion.openSession('task-source'), /未提供会话跳转/);
    assert.equal(companion.getSnapshot().snapshot.state, 'idle');
  } finally {companion.dispose();}
});

test('errors from the real navigation service propagate rather than pretending a jump succeeded', () => {
  const bridge = new DshSessionBridge(services({openSession() {throw new Error('session unavailable');}}));
  assert.throws(() => bridge.openSession('source'), /session unavailable/);
});
