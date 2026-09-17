import { decodePreferences, preferenceDefaults, type Preferences } from '../contract/preferences.js';
import type { PreferenceScope } from './native-contract.js';
export interface PreferenceView { value: Preferences; error: string | null; saving: boolean; persistence: 'host' | 'local' | 'memory' }
/** Both UI entry points share the same confirmed state and serialized write path. */
export class PreferenceStore {
  private listeners = new Set<() => void>();
  private value: PreferenceView;
  private disposeScope: (() => void) | undefined;
  private tail = Promise.resolve();
  private disposed = false;
  private storageKey: string;
  constructor(private scope: PreferenceScope | null, private storage: Storage | null, key = 'bigfish.preferences.v1') {
    this.storageKey = key;
    let initial = { ...preferenceDefaults }; let error: string | null = null;
    if (!scope && storage) {
      try { const raw = storage.getItem(key); if (raw) initial = decodePreferences(JSON.parse(raw)); }
      catch { error = 'preferencesRead'; }
    }
    this.value = { value: initial, error, saving: false, persistence: scope ? 'host' : storage ? 'local' : 'memory' };
    if (scope) { this.disposeScope = scope.subscribe(() => this.sync()); this.sync(); }
  }
  getSnapshot = (): PreferenceView => this.value;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private publish(patch: Partial<PreferenceView>) {
    if (this.disposed) return;
    this.value = { ...this.value, ...patch }; for (const fn of this.listeners) fn();
  }
  private sync() {
    const s = this.scope!.getSnapshot();
    try {
      this.publish({ ...(s.value === undefined ? {} : { value: decodePreferences(s.value) }),
        persistence: s.mode === 'host' ? 'host' : 'memory' });
    } catch { this.publish({ error: 'preferencesRead' }); }
  }
  update(patch: Partial<Preferences>, expected?: string): Promise<void> {
    const job = this.tail.then(async () => {
      if (this.disposed) throw new Error('Settings store disposed');
      if(expected!==undefined&&JSON.stringify(this.value.value)!==expected)throw new Error('偏好在预览后已变化，请重新选择备份');
      const next = decodePreferences({ ...this.value.value, ...patch });
      this.publish({ saving: true, error: null });
      try {
        if (this.scope) {
          const s = this.scope.getSnapshot();
          if (s.mode === 'host') {
            if (!s.writable || s.status !== 'ready') throw new Error('Read-only host settings');
            const migrated = (s.value as {version?:number}|undefined)?.version !== 2;
            const ops = Object.keys(migrated ? next : patch).map(key => ({ op: 'set' as const, path: [key], value: next[key as keyof Preferences] }));
            await this.scope.mutate(ops, s.revision);
            this.sync();
            if(migrated&&(this.scope.getSnapshot().value as {version?:number})?.version!==2)throw new Error('Host rejected preference migration');
            if (Object.keys(patch).some(key => this.value.value[key as keyof Preferences] !== next[key as keyof Preferences])) throw new Error('Host rejected settings mutation');
          } else this.publish({ value: next, persistence: 'memory' });
        } else {
          this.storage?.setItem(this.storageKey, JSON.stringify(next));
          this.publish({ value: next });
        }
      } catch (error) { this.publish({ error: 'preferencesWrite' }); throw error; }
      finally { this.publish({ saving: false }); }
    });
    this.tail = job.catch(() => {}); return job;
  }
  reloadLocal(): void {
    if (this.scope || !this.storage) return;
    try { const raw = this.storage.getItem(this.storageKey); if (raw) this.publish({ value: decodePreferences(JSON.parse(raw)) }); }
    catch { this.publish({ error: 'preferencesRead' }); }
  }
  dispose(): void { this.disposed = true; this.disposeScope?.(); this.listeners.clear(); }
}
