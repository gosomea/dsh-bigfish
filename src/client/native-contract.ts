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
export interface NativeServices {
  sessions: { list: Observable<{ current: string | undefined }>; binding(id: any): Binding | undefined };
  uiSession: { pendingInteractions: Observable<ReadonlyMap<any, unknown>> };
  connection: { state: Observable<string | undefined> };
  settingsScope: { bind(spec: { namespace: string; decode: (value: unknown) => any }): PreferenceScope };
}
