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
/** Raw 0.1.7 ConfigForm face: `configForms.get(entryId)`; mutate reports acceptance by boolean. */
export interface PreferenceForm {
  getSnapshot(): { status: string; value: unknown; writable: boolean; mode: string; revision: number | undefined };
  subscribe(fn: () => void): () => void;
  mutate(ops: readonly { op: 'set'; path: string[]; value: any }[], expectedRevision?: number): Promise<boolean>;
}
export interface SettingsServices {
  /** DSH 0.1.5/0.1.6 browser settings surface. */
  settingsScope?: { bind(spec: { namespace: string; decode: (value: unknown) => any }): PreferenceScope } | undefined;
  /** DSH 0.1.7+ browser settings surface. */
  configForms?: { get(entryId: string): PreferenceForm } | undefined;
}
export interface SessionStatus { pendingInteraction?: unknown }
export interface UiSessionAdapter { current: Observable<{ key?: unknown }> }
export interface NativeServices {
  /** The list schema differs between legacy and current DSH; only legacy exposes current here. */
  sessions: { list: Observable<object>; binding(id: any): Binding | undefined };
  /** Legacy exposes pendingInteractions; current DSH moves it into sessionStatus and adapter.current. */
  uiSession: {
    pendingInteractions?: Observable<ReadonlyMap<any, unknown>>;
    sessionStatus?: Observable<ReadonlyMap<any, SessionStatus | undefined>>;
    adapter?: UiSessionAdapter;
  };
  connection: { state: Observable<string | undefined> };
}
