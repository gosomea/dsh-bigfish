import {HostPetStore,petRoute} from '../pet/host-store.js';
import z from '@deepseek-ai/schemastery';
import { preferenceDefaults, preferenceRanges, decodePreferences } from '../contract/preferences.js';
/** Native Host half: expose one durable namespace; no model calls or prompt mutations. */
export function apply(ctx: { inject(keys: string[], callback: (ctx: any) => void): unknown }, base: Record<string, unknown> = {}): void {
  ctx.inject(['connection'], scoped => {
    const fetch=petRoute(new HostPetStore());
    scoped.effect(() => scoped.connection.fetch.register({path:'/api/bigfish-pets',methods:['GET','POST'],requestBody:'buffered',fetch}), 'bigfish role library');
    scoped.effect(() => scoped.connection.fetch.register({path:'/api/bigfish-pets-upload',methods:['POST'],requestBody:'streaming',fetch}), 'bigfish role upload');
  });
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(preferenceDefaults)) {
    if (key === 'mode') fields[key] = z.union(['urge', 'rhythm']).default(value);
    else if (typeof value === 'boolean') fields[key] = z.boolean().default(value);
    else if (typeof value === 'number') {
      const range = preferenceRanges[key as keyof typeof preferenceDefaults];
      fields[key] = (range ? z.number().min(range[0]).max(range[1]) : z.number()).default(value);
    } else fields[key] = z.string().default(value);
  }
  ctx.inject(['settings'], scoped => { scoped.settings.register('bigfish', z.object(fields), {
    base, validate: (value: unknown) => { decodePreferences(value); },
  }); });
}
