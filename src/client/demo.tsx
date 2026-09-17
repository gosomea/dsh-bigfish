import {petLibrary} from '../pet/library.js';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoCompanion } from './demo-controller.js';
import { FishCanvas, SettingsPanel, Widget } from './ui.js';
import { zh, en, type Key, type Translate } from './locales.js';
import type { WorkState } from '../contract/types.js';
import css from './styles.css';
import { motionLabels } from './motion-catalog.js';
const tag = document.createElement('style'); tag.textContent = css; document.head.append(tag);
let storage: Storage | null = null; try { storage = localStorage; } catch { /* File previews can be ephemeral. */ }
const controller = new DemoCompanion(storage);
void petLibrary.init(false);
function App() {
  useSyncExternalStore(petLibrary.subscribe,petLibrary.getSnapshot);
  const [english, setEnglish] = useState(false), [settings, setSettings] = useState(false), [widget, setWidget] = useState(false);
  const [motion, setMotion] = useState('');
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { value: p } = useSyncExternalStore(controller.preferences.subscribe, controller.preferences.getSnapshot);
  const t: Translate = key => (english ? en : zh)[key];
  const s = view.snapshot;
  useEffect(() => { const onStorage = () => controller.preferences.reloadLocal(); addEventListener('storage', onStorage); return () => removeEventListener('storage', onStorage); }, []);
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setSettings(false); }; addEventListener('keydown', close); return () => removeEventListener('keydown', close); }, []);
  return <main className="bf-surface bf-demo">
    <nav className="bf-demo-nav"><div className="bf-wordmark"><span>🐋</span> BIGFISH <span style={{ fontSize: 11, fontWeight: 400 }}> / dsh companion</span></div><button onClick={() => setEnglish(!english)}>{english ? '中文' : 'EN'}</button></nav>
    <div className="bf-demo-main"><section>
      <div className="bf-demo-intro"><small>THE LITTLE COMPANION · {t('demo')}</small><h1>{t('demoTitle')}</h1><p>{t('demoDescription')}</p></div>
      <div className="bf-demo-stage"><div className="bf-demo-bubble">{t(s.state)}</div><FishCanvas snapshot={s} prefs={p} t={t} previewMotion={motion} /></div>
      <div className="bf-demo-readout"><div><small>{t('speed')}</small><strong data-testid="demo-rate">{s.rate?.toFixed(0) ?? '—'} <em>tok/s</em></strong></div><div><small>{t('calibrated')}</small><strong>{s.baseline?.p50.toFixed(0) ?? '—'} <em>tok/s</em></strong></div><div><small>{t('intensity')}</small><strong>{Math.round(s.pressure * 100)} <em>%</em></strong></div></div>
      <p className="bf-demo-footer">{petLibrary.active?`${petLibrary.active.pet.manifest.name} · ${petLibrary.active.pet.animations.length} 个动作`:t('expressions')} · {t('phaseNote')}</p>
    </section><aside className="bf-demo-controls">
      <h3>{t('preview')}</h3><label>{t('base')}</label><div className="bf-segments">{[20, 100, 400].map(base => <button key={base} aria-pressed={controller.base === base} onClick={() => controller.setBase(base)}>{base}</button>)}</div>
      <label htmlFor="demo-ratio">{t('relative')} <strong>{controller.ratio.toFixed(2)}×</strong></label><input id="demo-ratio" type="range" min="0.1" max="1.6" step="0.05" value={controller.ratio} onChange={e => controller.setRatio(+e.target.value)} />
      <div className="bf-segments">{[.5, 1, 1.25].map(ratio => <button key={ratio} onClick={() => controller.setRatio(ratio)}>{ratio}×</button>)}</div>
      <label htmlFor="demo-state">{t('state')}</label><select id="demo-state" value={controller.state} onChange={e => controller.setState(e.target.value as WorkState)}>{(['idle', 'awaiting-output', 'reasoning', 'generating', 'tool-running', 'waiting-user', 'retrying', 'disconnected', 'completed', 'cancelled', 'failed'] as const).map(state => <option key={state} value={state}>{t(state)}</option>)}</select>
      <label htmlFor="demo-scene">{t('scene')}</label><select id="demo-scene" value={p.scene} onChange={e => { void controller.preferences.update({ scene: e.target.value }); }}>{['auto', 'desk', 'library', 'workshop', 'treadmill', 'rest', 'delivery'].map(scene => <option key={scene} value={scene}>{t(scene as Key)}</option>)}</select>
      <label htmlFor="demo-motion">{t('motionCatalog')}</label><select id="demo-motion" value={motion} onChange={e => setMotion(e.target.value)}><option value="">{t('follow')}</option>{petLibrary.active?petLibrary.active.pet.animations.map(a=><option key={a.id} value={a.id}>{a.label}</option>):Object.entries(motionLabels).map(([id, labels]) => <option key={id} value={id}>{labels[english ? 1 : 0]}</option>)}</select>
      <div className="bf-button-row"><button onClick={() => controller.restart()}>{t('restart')}</button><button onClick={() => setSettings(true)}>{t('openSettings')}</button></div>
      <button className="bf-text-button" onClick={() => setWidget(!widget)}>{t(widget ? 'collapse' : 'expand')}</button>
    </aside></div>
    {widget && <Widget controller={controller} t={t} />}
    {settings && <div className="bf-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setSettings(false); }}><section className="bf-modal" onKeyDown={e => { if (e.key !== 'Tab') return; const all = [...e.currentTarget.querySelectorAll<HTMLElement>('button,input,select')]; const first = all[0], last = all.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }} role="dialog" aria-modal="true" aria-label={t('settings')}><div className="bf-modal-top"><button autoFocus aria-label={t('close')} onClick={() => setSettings(false)}>×</button></div><SettingsPanel controller={controller} t={t} /></section></div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
addEventListener('pagehide', () => controller.dispose());
