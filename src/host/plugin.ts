import {HostPetStore,petRoute} from '../pet/host-store.js';
import z from '@deepseek-ai/schemastery';
import { preferenceDefaults, preferenceRanges, decodePreferences } from '../contract/preferences.js';
const fields: Record<string, any> = {};
const legacyFields: Record<string, any> = {};
for (const [key, value] of Object.entries(preferenceDefaults)) {
  let field: any;
  if (key === 'mode') field = z.union(['urge', 'rhythm']).default(value);
  else if (typeof value === 'boolean') field = z.boolean().default(value);
  else if (typeof value === 'number') {
    const range = preferenceRanges[key as keyof typeof preferenceDefaults];
    field = (range ? z.number().min(range[0]).max(range[1]) : z.number()).default(value);
  } else field = z.string().default(value);
  legacyFields[key] = field;
  fields[key] = field.volatile();
}

/** DSH 0.1.7+ derives profile-backed settings directly from this Config. */
export const Config = z.object(fields);
const LegacyConfig = z.object(legacyFields);

interface SettingsBridge {
  register?: (namespace: string, schema: unknown, options: { base: Record<string, unknown>; validate(value: unknown): void }) => unknown;
  configure?: (presentation: { auto?: boolean }, owner?: unknown) => () => void;
}

function snapshotConfig(base: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(base).map(([key, value]) => [
    key,
    value && typeof value === 'object' && typeof (value as { get?: unknown }).get === 'function'
      ? (value as { get(): unknown }).get()
      : value,
  ]));
}

/** Native Host half: expose one durable namespace; no model calls or prompt mutations. */
export function apply(ctx: { inject(keys: string[], callback: (ctx: any) => void): unknown; fiber?: unknown }, base: Record<string, unknown> = {}): void {
  ctx.inject(['connection'], scoped => {
    const fetch=petRoute(new HostPetStore());
    scoped.effect(() => scoped.connection.fetch.register({path:'/api/bigfish-pets',methods:['GET','POST'],requestBody:'buffered',fetch}), 'bigfish role library');
    scoped.effect(() => scoped.connection.fetch.register({path:'/api/bigfish-pets-upload',methods:['POST'],requestBody:'streaming',fetch}), 'bigfish role upload');
  });
  ctx.inject(['settings'], scoped => {
    const settings = scoped.settings as SettingsBridge;
    if (typeof settings.register === 'function') {
      settings.register('bigfish', LegacyConfig, { base: snapshotConfig(base), validate: (value: unknown) => { decodePreferences(value); } });
      return;
    }
    if (typeof settings.configure === 'function') {
      scoped.effect(() => settings.configure!({ auto: false }, ctx.fiber), 'bigfish settings presentation');
    }
  });
}
