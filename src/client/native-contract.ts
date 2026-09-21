/** Structural read-only face, checked against the pinned dsh types by the native probe. */
export interface Observable<T> { getSnapshot(): T; subscribe(fn: () => void): () => void }
export interface Entry { type: string; event: { type: string; seq: number; time: number; data: any } }
export interface EventWindow {
  revision: number; entries: readonly Entry[];
  change: { kind: string; entries?: readonly Entry[]; attemptId?: string; entry?: Entry };
}
export interface Binding {
  sessionId: string; eventSource: Observable<EventWindow>;
  session: Observable<{ running: boolean; openState: string; lastAgentError: string | null;
    pendingSubmissions?: readonly { placement: string }[]; awaitingFirstTurn?: boolean }> & {
    projections: { faceOf(key: string): Observable<unknown> };
  };
}
export interface PreferenceScope {
  getSnapshot(): { status: string; value: unknown; writable: boolean; mode: string; revision: number | undefined };
  subscribe(fn: () => void): () => void;
  mutate(ops: readonly { op: 'set'; path: string[]; value: any }[], revision?: number): Promise<void>;
}
export interface SessionStatus { pendingInteraction?: unknown }
export interface UiSessionAdapter { current: Observable<{ key?: unknown }> }
export interface NativeServices {
  /** The list schema differs between rc.2 and alpha.2; the bridge narrows only the optional legacy current field. */
  sessions: { list: Observable<object>; binding(id: any): Binding | undefined };
  /** rc.2 exposes pendingInteractions; alpha.2 moves it into sessionStatus and owns selection through adapter.current. */
  uiSession: {
    pendingInteractions?: Observable<ReadonlyMap<any, unknown>>;
    sessionStatus?: Observable<ReadonlyMap<any, SessionStatus | undefined>>;
    adapter?: UiSessionAdapter;
  };
  connection: { state: Observable<string | undefined> };
  settingsScope: { bind(spec: { namespace: string; decode: (value: unknown) => any }): PreferenceScope };
}
