import { petLibrary } from "../pet/library.js";
import { RoleSettings } from "../pet/settings.js";
import { motionAllowed, motionReduced } from "../domain/motion-policy.js";
import { PackSettings } from "./pack-settings.js";
import { DialogueSettings } from "./dialogue-settings.js";
import { categoryMotions } from "../contract/dialogue.js";
import React, { useSyncExternalStore } from "react";
import { classicPack } from "./renderer.js";
import {
  preferenceDefaults,
  preferenceRanges,
  type Preferences,
} from "../contract/preferences.js";
import type { Translate, Key } from "./locales.js";
import { FishCanvas } from "./fish-canvas.js";
import { PreviewDisclosure } from "./behavior-preview.js";
import { BackupSettings } from "./backup-settings.js";
import type { UIProps } from "./ui.js";
const sceneNames = [
  "auto",
  "desk",
  "library",
  "workshop",
  "treadmill",
  "rest",
  "delivery",
] as const;
export function SettingsPanel({
  controller,
  t,
  compact = false,
}: UIProps & { compact?: boolean }) {
  useSyncExternalStore(petLibrary.subscribe, petLibrary.getSnapshot);
  const live = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const store = useSyncExternalStore(
      controller.preferences.subscribe,
      controller.preferences.getSnapshot,
    ),
    p = store.value;
  const update = (patch: Partial<Preferences>) => {
    void controller.preferences.update(patch).catch(() => {});
  };
  const toggle = (key: keyof Preferences, label: string) => (
    <label className="bf-field">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={Boolean(p[key])}
        onChange={(e) => update({ [key]: e.target.checked })}
      />
    </label>
  );
  const slider = (key: keyof Preferences, label: string, step: number) => {
    const range = preferenceRanges[key]!;
    return (
      <label className="bf-field bf-range">
        <span>
          {label}
          <output>
            {key === "size"
              ? Math.round((p.size / 180) * 100) + "%"
              : String(p[key])}
          </output>
        </span>
        <input
          aria-label={label}
          type="range"
          min={range[0]}
          max={range[1]}
          step={step}
          value={Number(p[key])}
          onChange={(e) => update({ [key]: +e.target.value })}
        />
      </label>
    );
  };
  const select = (
    label: string,
    value: string | number,
    options: readonly (readonly [string | number, string])[],
    change: (v: string) => void,
    disabled = false,
  ) => (
    <label className="bf-field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => change(e.target.value)}
      >
        {options.map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const role = petLibrary.active?.pet;
  const availableCount = role
    ? role.animations.filter(
        (a) =>
          a.intensity <= p.richness &&
          (p.whipEnabled || !a.tags.includes("near-miss")),
      ).length
    : new Set(
        classicPack.scenes
          .flatMap((s) => s.actions)
          .filter(
            (a) =>
              motionAllowed(a.motion, p.richness, false) &&
              (p.whipEnabled || !["flinch", "dodge"].includes(a.motion)),
          )
          .map((a) => a.motion),
      ).size;
  const swingAvailable =
    !role ||
    (role.manifest.capabilities.includes("air-swing") &&
      role.animations.some(
        (a) => a.tags.includes("near-miss") && a.intensity <= p.richness,
      ));
  const display = !p.bubbleEnabled
    ? "buttons"
    : p.bubbleText
      ? "both"
      : "status";
  return (
    <div className={`bf-settings ${compact ? "bf-compact" : ""}`}>
      {!compact && (
        <header>
          <h2>{t("title")}</h2>
          <p>闲时安静陪着，忙时及时回应。</p>
        </header>
      )}
      <fieldset>
        <legend>陪伴与打扰</legend>
        {!compact && toggle("enabled", "显示宠物")}
        {select(
          "空闲互动",
          p.idleMode,
          [
            ["quiet", "安静陪着"],
            ["occasional", "偶尔互动 · 2–5 分钟"],
            ["frequent", "经常互动 · 20–40 秒"],
          ],
          (v) => update({ idleMode: v as Preferences["idleMode"] }),
        )}
        <p className="bf-help">
          {p.idleMode === "quiet"
            ? "首次问候后安静休息，不反复举牌或换台词。"
            : "每次动作展示约 12 秒，气泡最多 6 秒；内置大肥鱼有台词时，每两次互动至少一次举牌。其他角色使用角色包提供的问候动作。"}
        </p>
        {select(
          "动作表现",
          p.richness,
          [
            [0, "轻柔"],
            [1, "自然"],
            [2, "活泼"],
          ],
          (v) => update({ richness: +v }),
        )}
        <p className="bf-help">
          {
            [
              "稳定姿态，轻微动作，无跳跃和粒子。",
              "日常打字、阅读、修理，幅度适中。",
              "更多动作与变化，更明显的跳跃和特效。",
            ][p.richness]
          }{" "}
          空闲频率独立控制。
        </p>
        <p className="bf-help" data-testid="motion-availability">
          当前角色在此档有 {availableCount} 类动作可用，实际动作随任务状态选择。
        </p>
        {select(
          "消息显示",
          display,
          [
            ["both", "台词和状态"],
            ["status", "仅状态"],
            ["buttons", "仅按钮"],
          ],
          (v) =>
            update({
              bubbleEnabled: v !== "buttons",
              bubbleText: v === "both",
              bubbleStatus: v !== "buttons",
            }),
        )}
        {slider("size", "角色大小", 10)}
        {toggle("whipEnabled", "启用鞭策动作")}
        <p className="bf-help">
          {p.whipEnabled
            ? "鞭子只在角色旁边空挥，不会接触角色。可随时关闭。"
            : "已关闭鞭子、配套躲闪反应和鞭声音效；打字、阅读、工具操作与完成反馈照常。"}
        </p>
        {p.whipEnabled &&
          select(
            "鞭策节奏",
            p.mode,
            [
              ["urge", "慢了催一催"],
              ["rhythm", "跟着速度动"],
            ],
            (v) => update({ mode: v as Preferences["mode"] }),
            !swingAvailable,
          )}
        {role && p.whipEnabled && (
          <p className="bf-help">
            {swingAvailable
              ? "当前角色支持空挥联动，使用与内置大肥鱼相同的节拍和绘制；暂不播放音效。"
              : role.manifest.capabilities.includes("air-swing")
                ? "当前动作档位没有空挥反应素材，互动已暂停；调高动作档位可启用。"
                : "当前角色未提供空挥反应，互动已暂停。切回支持角色后恢复原偏好。"}
          </p>
        )}
      </fieldset>
      {!compact && (
        <>
          <details className="bf-disclosure">
            <summary>角色库</summary>
            <RoleSettings />
          </details>
          <details className="bf-disclosure">
            <summary>消息内容与空闲习惯</summary>
            {toggle("showTask", "文案关联本轮任务摘要")}
            {toggle("greetOnOpen", "首次出现时打招呼")}
            {toggle("idleHideMessage", "安静休息时隐藏消息文字")}
            {select(
              "空闲文字",
              p.idleRandomText ? "random" : "fixed",
              [
                ["fixed", "固定第一句"],
                ["random", "从自定义台词中随机选择"],
              ],
              (v) => update({ idleRandomText: v === "random" }),
            )}
            <p className="bf-help">
              在下方“自定义台词 → 空闲等候”编辑，同时用于气泡与牌子。
            </p>
            {display === "both" &&
              select(
                "工作台词",
                p.talkLevel,
                [
                  [0, "仅事件变化时"],
                  [1, "偶尔说一句 · 至少 30 秒"],
                  [2, "经常说一句 · 至少 10 秒"],
                ],
                (v) => update({ talkLevel: +v }),
              )}
            {display !== "buttons" && (
              <>
                {toggle("showTool", "显示工具名称")}
                {toggle("showFile", "显示文件短名")}
                {toggle("showStats", "显示速度与用时")}
              </>
            )}
          </details>
          <details className="bf-disclosure">
            <summary>外观与动画</summary>
            {select(
              "动画",
              p.reducedMotion ? "reduced" : p.motionPolicy,
              [
                ["system", "跟随系统"],
                ["normal", "正常播放"],
                ["reduced", "减弱动态"],
              ],
              (v) =>
                update({
                  motionPolicy: v as Preferences["motionPolicy"],
                  reducedMotion: false,
                }),
            )}
            {motionReduced(
              p,
              matchMedia("(prefers-reduced-motion: reduce)").matches,
            ) && (
              <p className="bf-help" role="status">
                减弱动态已生效：停止非必要轮播、位移、粒子和空挥，保留状态更新。
              </p>
            )}
            {!petLibrary.active && (
              <>
                {select(
                  "布景",
                  p.scene,
                  sceneNames.map((v) => [v, t(v)] as const),
                  (v) => update({ scene: v }),
                )}
                <p className="bf-help">固定背景，动作仍跟随任务。</p>
              </>
            )}
            {petLibrary.active && (
              <p className="bf-help">布景由当前角色的动作包提供。</p>
            )}
            {slider("opacity", "角色与消息透明度", 0.05)}
            {display !== "buttons" && (
              <>
                {slider("bubbleWidth", "气泡宽度", 10)}
                {slider("bubbleFont", "文字大小", 1)}
              </>
            )}
            {select(
              "任务结束后",
              p.completionMode,
              [
                ["celebrate", "简短庆祝"],
                ["message", "只显示完成提示"],
                ["quiet", "直接休息"],
              ],
              (v) =>
                update({ completionMode: v as Preferences["completionMode"] }),
            )}
            {p.completionMode !== "quiet" &&
              slider("completionSeconds", "完成提示时长 · 秒", 1)}
          </details>
          {p.whipEnabled && swingAvailable && (
            <details className="bf-disclosure">
              <summary>空挥节奏与声音</summary>
              {select(
                "空挥节奏",
                p.intensity === 0.5 && p.maxWhipHz === 0.6
                  ? "light"
                  : p.intensity === 1 && p.maxWhipHz === 1.2
                    ? "medium"
                    : p.intensity === 1.4 && p.maxWhipHz === 1.8
                      ? "strong"
                      : "custom",
                [
                  ["light", "轻"],
                  ["medium", "中"],
                  ["strong", "强"],
                  ["custom", "自定义（保留当前数值）"],
                ],
                (v) => {
                  if (v !== "custom")
                    update(
                      v === "light"
                        ? { intensity: 0.5, maxWhipHz: 0.6 }
                        : v === "medium"
                          ? { intensity: 1, maxWhipHz: 1.2 }
                          : { intensity: 1.4, maxWhipHz: 1.8 },
                    );
                },
              )}
              {!role && toggle("sound", "空挥音效")}
              {!role && p.sound && (
                <>
                  {slider("volume", "音量", 0.05)}
                  <p className="bf-help">
                    浏览器可能需要先点击角色才可播放声音。
                  </p>
                </>
              )}
            </details>
          )}
          <details className="bf-disclosure">
            <summary>自定义台词与工具</summary>
            <DialogueSettings
              recentTools={live.recentTools ?? []}
              prefs={p}
              save={(patch) => controller.preferences.update(patch)}
              preview={(category, text) => (
                <>
                  <div className="bf-preview-speech">
                    {text || "（此类台词已关闭）"}
                  </div>
                  <FishCanvas
                    snapshot={{
                      ...controller.getSnapshot().snapshot,
                      state:
                        category === "idle"
                          ? "idle"
                          : category === "complete"
                            ? "completed"
                            : category === "waiting"
                              ? "waiting-user"
                              : category === "writing"
                                ? "generating"
                                : "tool-running",
                      pressure: 0,
                      activity: 0,
                      whipHz: 0,
                    }}
                    prefs={{ ...p, sound: false }}
                    t={t}
                    previewMotion={categoryMotions[category]}
                  />
                </>
              )}
            />
          </details>
          <details className="bf-disclosure">
            <summary>高级与重置</summary>
            <details className="bf-disclosure">
              <summary>内置大肥鱼动作编排（JSON）</summary>
              <PackSettings t={t} />
            </details>
            {toggle("autoSpeed", "按模型自动校准")}
            {!p.autoSpeed && slider("targetRate", "手动基准速度 · tok/s", 1)}
            {toggle("includeReasoning", "计入可见推理输出")}
            {toggle("learnHistory", "跨会话记住模型速度")}
            <p className="bf-help">
              只影响宠物的速度估算。关闭记忆会清空已记住的速度，当前运行仍可学习。
            </p>
            {slider("windowSeconds", "速度估算窗口 · 秒", 0.5)}
            <p className="bf-help">窗口越长越平稳，越短越灵敏。</p>
            {p.whipEnabled && swingAvailable && (
              <>
                {slider("intensity", "空挥强度", 0.05)}
                {slider("maxWhipHz", "空挥调度频率上限", 0.1)}
                <p className="bf-help">
                  完整动作会限制实际频率，不会截短动作来追赶数值。
                </p>
                {toggle("timePressure", "工作较久时加强催促")}
                {p.timePressure &&
                  slider("referenceSeconds", "开始加强催促的工作时长 · 秒", 10)}
              </>
            )}
            {slider("fatigueSeconds", "疲惫积累周期 · 秒", 30)}
            <p className="bf-help">
              周期的 40% 起可随机出现擦汗，不保证立即触发。
            </p>
            <div className="bf-button-row">
              <button onClick={() => controller.resetLearning()}>
                {t("resetLearning")}
              </button>
              <button onClick={() => controller.resetLearning(true)}>
                {t("resetAll")}
              </button>
              <button
                onClick={() =>
                  update({
                    ...preferenceDefaults,
                    dialogueJson: p.dialogueJson,
                    toolRulesJson: p.toolRulesJson,
                  })
                }
              >
                恢复显示与行为默认（保留台词和规则）
              </button>
            </div>
          </details>
          <details className="bf-disclosure">
            <summary>备份与恢复</summary>
            <BackupSettings controller={controller} />
          </details>
          <PreviewDisclosure controller={controller} t={t} prefs={p} />
        </>
      )}
      <p className="bf-save" role="status">
        {store.saving ? t("saving") : t(store.persistence)}
      </p>
      {store.error && (
        <p className="bf-error" role="alert">
          {t(store.error as Key)}
        </p>
      )}
    </div>
  );
}
