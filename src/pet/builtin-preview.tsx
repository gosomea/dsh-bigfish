import React, { useEffect, useRef, useState } from 'react';
import { FishRenderer, classicPack } from '../client/renderer.js';
import { motionLabels } from '../client/motion-catalog.js';
import { preferenceDefaults } from '../contract/preferences.js';
import type { Snapshot } from '../contract/types.js';

const motions = [...new Set(classicPack.scenes.flatMap(scene => scene.actions.map(action => action.motion)))];

/** Audition the built-in renderer without changing the selected pet or user preferences. */
export function BuiltinPreview() {
  const [motion, setMotion] = useState('breathe');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const action = classicPack.scenes.flatMap(scene => scene.actions).find(action => action.motion === motion)!;
    const snapshot: Snapshot = {
      sessionId: 'builtin-preview', turn: 1, sequence: 0, state: action.states[0]!,
      modelKey: null, rate: null, quality: 'unavailable', baseline: null, relativeRate: null,
      pressure: .4, activity: .5, fatigue: .5, whipHz: 0, wallElapsed: 0,
      workElapsed: 0, generationElapsed: 0, tools: 0, tokens: 0, completionSerial: 1,
    };
    const renderer = new FishRenderer(canvas.current!, snapshot, {
      ...preferenceDefaults, richness: 2, motionPolicy: 'normal', reducedMotion: false,
      sound: false, whipEnabled: false,
    }, classicPack);
    renderer.previewMotion = motion;
    renderer.signText = '我在等哦';
    renderer.idlePresentation = { active: true, showText: true, text: '我在等哦', motion, serial: 1 };
    return () => renderer.dispose();
  }, [motion]);
  return <div className="bf-pet-preview" data-testid="builtin-pet-preview">
    <label className="bf-field"><span>逐个预览动作（共 {motions.length} 个）</span>
      <select aria-label="内置角色动作预览" value={motion} onChange={event => setMotion(event.target.value)}>
        {motions.map(id => <option key={id} value={id}>{motionLabels[id]?.[0] ?? id}</option>)}
      </select>
    </label>
    <div className="bf-stage"><canvas ref={canvas} role="img" aria-label="大肥鱼动作预览" /></div>
    <p className="bf-help">预览展示完整动作，不切换当前角色，也不修改你的日常陪伴设置。</p>
  </div>;
}
