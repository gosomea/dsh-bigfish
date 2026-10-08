import type { Binding, NativeServices } from './native-contract.js';

export type DshBridgeKind = 'legacy-list-current' | 'ui-current-binding' | 'unsupported';

export interface DshBridgeStatus {
  kind: DshBridgeKind;
  supported: boolean;
  capabilities: readonly string[];
  missing: readonly string[];
}

/**
 * Read the public DSH session surfaces without making Bigfish own a session's
 * lifetime. Older hosts stage selection on sessions.list; newer hosts expose
 * the already-retained main UI binding through uiSession.adapter.current.
 */
export class DshSessionBridge {
  readonly status: DshBridgeStatus;

  constructor(private readonly ctx: NativeServices) {
    const alpha = ctx.uiSession.adapter?.current !== undefined && ctx.uiSession.sessionStatus !== undefined;
    const legacy = Object.prototype.hasOwnProperty.call(ctx.sessions.list.getSnapshot(), 'current')
      && ctx.uiSession.pendingInteractions !== undefined;
    this.status = alpha
      ? { kind: 'ui-current-binding', supported: true, capabilities: ['uiSession.adapter.current', 'uiSession.sessionStatus'], missing: [] }
      : legacy
        ? { kind: 'legacy-list-current', supported: true, capabilities: ['sessions.list.current', 'uiSession.pendingInteractions'], missing: [] }
        : {
            kind: 'unsupported', supported: false,
            capabilities: [
              ...(ctx.uiSession.adapter?.current ? ['uiSession.adapter.current'] : []),
              ...(ctx.uiSession.sessionStatus ? ['uiSession.sessionStatus'] : []),
              ...(ctx.uiSession.pendingInteractions ? ['uiSession.pendingInteractions'] : []),
              ...(Object.prototype.hasOwnProperty.call(ctx.sessions.list.getSnapshot(), 'current') ? ['sessions.list.current'] : []),
            ],
            missing: ['legacy: sessions.list.current + uiSession.pendingInteractions', 'current: uiSession.adapter.current + uiSession.sessionStatus'],
          };
  }

  currentSessionId(): string | undefined {
    if (this.status.kind === 'ui-current-binding') {
      const key = this.ctx.uiSession.adapter!.current.getSnapshot().key;
      return typeof key === 'string' ? key : undefined;
    }
    if (this.status.kind === 'legacy-list-current') {
      const current = (this.ctx.sessions.list.getSnapshot() as { current?: unknown }).current;
      return typeof current === 'string' ? current : undefined;
    }
    return undefined;
  }

  currentBinding(): Binding | undefined {
    const id = this.currentSessionId();
    return id === undefined ? undefined : this.ctx.sessions.binding(id);
  }

  waiting(sessionId: string): boolean {
    if (this.status.kind === 'ui-current-binding') {
      return this.ctx.uiSession.sessionStatus!.getSnapshot().get(sessionId)?.pendingInteraction !== undefined;
    }
    return this.status.kind === 'legacy-list-current' && this.ctx.uiSession.pendingInteractions!.getSnapshot().has(sessionId);
  }

  subscribe(listener: () => void): () => void {
    const releases = [this.ctx.sessions.list.subscribe(listener)];
    if (this.status.kind === 'ui-current-binding') {
      releases.push(this.ctx.uiSession.adapter!.current.subscribe(listener));
      releases.push(this.ctx.uiSession.sessionStatus!.subscribe(listener));
    } else if (this.status.kind === 'legacy-list-current') {
      releases.push(this.ctx.uiSession.pendingInteractions!.subscribe(listener));
    }
    return () => { for (const release of releases) release(); };
  }
}
