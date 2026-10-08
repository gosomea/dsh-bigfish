import type { PreferenceForm, PreferenceScope, SettingsServices } from './native-contract.js';

export type DshPreferenceKind = 'config-forms' | 'settings-scope' | 'local';

export interface DshPreferenceBridge {
  kind: DshPreferenceKind;
  scope: PreferenceScope | null;
}

/** Normalize the published DSH settings surfaces for PreferenceStore. */
export function createPreferenceBridge(services: SettingsServices): DshPreferenceBridge {
  if (services.configForms !== undefined) {
    return { kind: 'config-forms', scope: configFormScope(services.configForms.get('bigfish')) };
  }
  if (services.settingsScope !== undefined) {
    return {
      kind: 'settings-scope',
      scope: services.settingsScope.bind({ namespace: 'bigfish', decode: value => value }),
    };
  }
  return { kind: 'local', scope: null };
}

function configFormScope(form: PreferenceForm): PreferenceScope {
  return {
    getSnapshot: () => form.getSnapshot(),
    subscribe: listener => form.subscribe(listener),
    // ConfigForm reports Host refusal as false; legacy SettingsScope rejects.
    // PreferenceStore consumes one throw-on-failure contract for both versions.
    mutate: async (ops, revision) => {
      if (!await form.mutate(ops, revision)) throw new Error('Host rejected settings mutation');
    },
  };
}
