import type { AgentHandle, StreamFrame, SessionEvent } from './adapter.js';
import { HarnessAdapter } from './adapter.js';
type ListenerOptions = { global: true };
export interface EventContext {
  on(name: 'agent/assistant-stream', listener: (payload: { agent: AgentHandle; frame: StreamFrame }) => void, options: ListenerOptions): () => void;
  on(name: 'session/event', listener: (session: { id: string }, event: SessionEvent) => void, options: ListenerOptions): () => void;
  on(name: 'session/disposed', listener: (session: { id: string }) => void, options: ListenerOptions): () => void;
  effect(effect: () => () => void): unknown;
}
/** Observational Host attachment. Explicit error reporting contains plugin failures. */
export function attach(ctx: EventContext, adapter: HarnessAdapter, report: (error: unknown) => void): () => void {
  const contain = <A extends unknown[]>(callback: (...args: A) => void) => (...args: A) => {
    try { callback(...args); } catch (error) { report(error); }
  };
  const disposers: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const off of disposers.splice(0).reverse()) off();
    adapter.dispose();
  };
  try {
    disposers.push(ctx.on('agent/assistant-stream', contain(({ agent, frame }) => adapter.frame(agent, frame)), { global: true }));
    disposers.push(ctx.on('session/event', contain((session, event) => adapter.event(session, event)), { global: true }));
    disposers.push(ctx.on('session/disposed', contain(session => adapter.disposeSession(session.id)), { global: true }));
    ctx.effect(() => dispose);
    return dispose;
  } catch (error) { dispose(); throw error; }
}
