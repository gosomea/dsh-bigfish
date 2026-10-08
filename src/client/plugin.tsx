import {petLibrary} from '../pet/library.js';
import React from 'react';
import { NativeCompanion } from './controller.js';
import type { NativeServices, SettingsServices } from './native-contract.js';
import { createPreferenceBridge } from './dsh-preference-bridge.js';
import { SettingsPanel, Widget, type UIProps } from './ui.js';
import { zh, en, type Translate } from './locales.js';
import css from './styles.css';
export const inject = ['slots', 'locale', 'sessions', 'uiSession', 'connection'];
export interface ClientContext extends NativeServices {
  slots: { inject(name: any, callback: () => unknown): unknown; register(spec: any, component: any): () => void };
  locale: { register(namespace: any, dictionaries: any): () => void; bind(namespace: any): any };
  get<K extends keyof SettingsServices>(name: K): SettingsServices[K] | undefined;
  effect(effect: () => () => void, label?: string): unknown;
}
function Overlay(props: UIProps) { return <div className="bf-surface"><Widget {...props} /></div>; }
function Section(props: UIProps) { return <div className="bf-surface"><SettingsPanel {...props} /></div>; }
/** Native shell and settings contributions owned by the plugin fiber. */
export function apply(ctx: ClientContext): void {
  void petLibrary.init(true); ctx.effect(() => () => petLibrary.dispose(), 'pet library');
  ctx.effect(() => ctx.locale.register('bigfish', { zh, en }), 'bigfish dictionaries');
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'dsh-bigfish'; tag.textContent = css;
    document.head.append(tag); return () => tag.remove();
  }, 'bigfish styles');
  let storage: Storage | null = null;
  try { storage = localStorage; } catch { /* Browsers may disallow persistence. */ }
  const preferenceBridge = createPreferenceBridge({
    configForms: ctx.get('configForms'),
    settingsScope: ctx.get('settingsScope'),
  });
  const controller = new NativeCompanion(ctx, storage, preferenceBridge.scope);
  ctx.effect(() => () => controller.dispose(), 'bigfish controller');
  const t = ctx.locale.bind('bigfish') as Translate;
  const injected = () => ({ controller, t });
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'bigfish', order: 50, inject: injected }, Overlay));
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'bigfish', order: 90, label: () => t('title'), inject: injected }, Section));
}
