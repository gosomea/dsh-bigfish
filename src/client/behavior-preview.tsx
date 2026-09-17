import { petLibrary } from "../pet/library.js";
import { IdleDirector } from "../domain/idle.js";
import { motionReduced } from "../domain/motion-policy.js";
import { DialogueBubble } from "./dialogue-view.js";
import React, { useEffect, useRef, useState } from "react";
import type { Companion } from "./controller.js";
import { type Preferences } from "../contract/preferences.js";
import type { Translate } from "./locales.js";
import type { Snapshot } from "../contract/types.js";
import { FishCanvas } from "./fish-canvas.js";
export function PreviewDisclosure(props: {
  controller: Companion;
  t: Translate;
  prefs: Preferences;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="bf-disclosure"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>预览当前效果</summary>
      {open && <BehaviorPreview {...props} />}
    </details>
  );
}
function BehaviorPreview({
  controller,
  t,
  prefs,
}: {
  controller: Companion;
  t: Translate;
  prefs: Preferences;
}) {
  const [state, setState] = useState<Snapshot["state"]>("idle"),
    [offset, setOffset] = useState(0),
    [now, setNow] = useState(Date.now());
  const director = useRef(new IdleDirector());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  const time = now + offset;
  const idle = director.current.tick(
    time,
    state === "idle",
    true,
    prefs,
    motionReduced(
      prefs,
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    petLibrary.active?.pet.dialogue.idle,
  );
  const snapshot = {
    ...controller.getSnapshot().snapshot,
    sessionId: "settings-preview",
    turn: 1,
    state,
    rate: 100,
    wallElapsed: time - now,
    pressure: 0.7,
    activity: 0.7,
    whipHz: 1.5,
    completionSerial: 1,
  };
  return (
    <section className="bf-behavior-preview" aria-label="行为预览">
      <strong>即时预览</strong>
      <p className="bf-help">
        使用当前设置，不调用模型或工具。可快进观察空闲节奏。
      </p>
      <label className="bf-field">
        <span>预览状态</span>
        <select
          value={state}
          onChange={(e) => setState(e.target.value as Snapshot["state"])}
        >
          {(
            [
              "idle",
              "generating",
              "reasoning",
              "tool-running",
              "waiting-user",
              "completed",
            ] as const
          ).map((v) => (
            <option key={v} value={v}>
              {t(v)}
            </option>
          ))}
        </select>
      </label>
      <div className="bf-button-row">
        {[5, 30, 120].map((seconds) => (
          <button
            key={seconds}
            onClick={() => setOffset((v) => v + seconds * 1000)}
          >
            快进 {seconds} 秒
          </button>
        ))}
        <button
          onClick={() => {
            director.current = new IdleDirector();
            setOffset(0);
            setNow(Date.now());
          }}
        >
          重新预览
        </button>
      </div>
      <p className="bf-help">已快进 {offset / 1000} 秒</p>
      <DialogueBubble
        roleLines={petLibrary.active?.pet.dialogue}
        snapshot={snapshot}
        prefs={prefs}
        status={t(state)}
        idle={idle}
        now={time}
        actions={null}
      >
        {null}
      </DialogueBubble>
      <FishCanvas
        snapshot={snapshot}
        prefs={{ ...prefs, sound: false }}
        t={t}
        idle={idle}
      />
    </section>
  );
}
