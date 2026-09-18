import { isBuiltinAsset } from "../contract/builtin-assets.js";
import { petLibrary } from "../pet/library.js";
import { useIdle } from "./use-idle.js";
import { DialogueBubble, dialogueCategory } from "./dialogue-view.js";
import { categoryMotions } from "../contract/dialogue.js";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import type { Companion } from "./controller.js";
import { classicPack } from "./renderer.js";
import { loadPack, type ScenePack } from "../contract/scenes.js";
import type { Translate, Key } from "./locales.js";
import { usePetDrag } from "./use-pet-drag.js";
import { usePresentation } from "./use-presentation.js";
import { FishCanvas } from "./fish-canvas.js";
import { SettingsPanel } from "./settings-panel.js";
export { FishCanvas } from "./fish-canvas.js";
export { SettingsPanel } from "./settings-panel.js";
export interface UIProps {
  controller: Companion;
  t: Translate;
}
const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};
export function Widget({ controller, t }: UIProps) {
  useSyncExternalStore(petLibrary.subscribe, petLibrary.getSnapshot);
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const { value: p } = useSyncExternalStore(
    controller.preferences.subscribe,
    controller.preferences.getSnapshot,
  );
  const [open, setOpen] = useState(false),
    [full, setFull] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  const [pack, setPack] = useState(() => {
    try {
      const raw = localStorage.getItem("bigfish.pack.v1");
      if (raw)
        return loadPack(
          JSON.parse(raw),
          (path) => isBuiltinAsset(path),
          classicPack,
        ).pack;
    } catch {
      /* Optional imported metadata. */
    }
    return classicPack;
  });
  const { position, dragging, handlers, elementRef } = usePetDrag(
    p.size,
    collapsed,
  );
  useEffect(() => {
    const changed = () => {
      try {
        const raw = localStorage.getItem("bigfish.pack.v1");
        setPack(
          raw
            ? loadPack(
                JSON.parse(raw),
                (path) => isBuiltinAsset(path),
                classicPack,
              ).pack
            : classicPack,
        );
      } catch {
        /* Retain current pack. */
      }
    };
    addEventListener("bigfish:pack", changed);
    return () => removeEventListener("bigfish:pack", changed);
  }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setFull(false);
      }
    };
    addEventListener("keydown", escape);
    return () => removeEventListener("keydown", escape);
  }, []);
  const shown = usePresentation(view.snapshot, p);
  const idle = useIdle(
    shown.state === "idle",
    p.enabled && !collapsed,
    p,
    petLibrary.active?.pet.dialogue.idle,
  );
  if (!p.enabled) return null;
  if (collapsed)
    return (
      <button
        ref={elementRef}
        className="bf-restore"
        data-dragging={dragging}
        {...handlers}
        aria-label={t("expand")}
        onClick={() => setCollapsed(false)}
        style={position}
      >
        {petLibrary.active ? (
          <img
            alt={petLibrary.active.pet.manifest.name}
            src={petLibrary.active.thumbnail}
          />
        ) : (
          "🐋"
        )}
      </button>
    );
  const s = shown;
  return (
    <aside
      ref={elementRef}
      className="bf-widget"
      data-layout="unified"
      data-dragging={dragging}
      {...handlers}
      data-testid="bigfish-widget"
      style={{
        ...position,
        width: `min(${(340 * p.size) / 180}px, calc(100vw - 16px))`,
      }}
    >
      <DialogueBubble
        key={petLibrary.active?.key ?? "bigfish"}
        roleLines={petLibrary.active?.pet.dialogue}
        snapshot={s}
        prefs={p}
        activity={view.activity}
        task={view.task}
        status={t(s.state)}
        idle={idle}
        actions={
          <>
            <button
              aria-label={t("settings")}
              title={t("settings")}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              ⚙
            </button>
            <button
              aria-label={t("collapse")}
              title={t("collapse")}
              onClick={() => setCollapsed(true)}
            >
              −
            </button>
          </>
        }
      >
        {p.bubbleEnabled && p.showStats && s.state !== "idle" && (
          <div className="bf-stats">
            <span>
              {s.rate === null ? "—" : `≈ ${s.rate.toFixed(0)}`}{" "}
              <small>tok/s</small>
            </span>
            <span>{formatTime(s.wallElapsed)}</span>
            {p.autoSpeed &&
              s.modelKey &&
              !s.baseline &&
              ["generating", "reasoning"].includes(s.state) && (
                <span className="bf-calibrating">{t("learning")}</span>
              )}
          </div>
        )}
        {p.bubbleEnabled && view.issue && (
          <p className="bf-error" role="status">
            {t(view.issue as Key)}
          </p>
        )}
      </DialogueBubble>
      <FishCanvas
        snapshot={s}
        prefs={p}
        t={t}
        activityTag={view.activity?.semantic ?? view.activity?.category}
        pack={pack}
        dragging={dragging}
        idle={idle}
        activityMotion={
          view.activity && s.state === "tool-running"
            ? categoryMotions[dialogueCategory(s, view.activity)]
            : ""
        }
      />
      {open && (
        <section className="bf-popover" aria-label={t("settings")}>
          <div className="bf-popover-top">
            <strong>{t("title")}</strong>
            <button aria-label={t("close")} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <SettingsPanel controller={controller} t={t} compact={!full} idle={idle} />
          <button className="bf-text-button" onClick={() => setFull(!full)}>
            {full ? "返回快捷设置" : t("openSettings")}
          </button>
        </section>
      )}
    </aside>
  );
}
