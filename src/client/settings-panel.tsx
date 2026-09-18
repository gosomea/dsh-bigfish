import type {IdlePresentation} from '../domain/idle.js';
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
  idle,
}: UIProps & { compact?: boolean; idle?: IdlePresentation }) {
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
  const reduced = motionReduced(p, matchMedia("(prefers-reduced-motion: reduce)").matches);
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
  const display = !p.bubbleEnabled || (!p.bubbleText && !p.bubbleStatus)
    ? "buttons"
    : p.bubbleText
      ? p.bubbleStatus ? "both" : "text"
      : "status";
  return (
    <div className={`bf-settings ${compact ? "bf-compact" : ""}`}>
      {!compact && (
        <header>
          <h2>{t("title")}</h2>
          <p>闲时按你的节奏陪伴，忙时及时回应。</p>
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
            ["occasional", "偶尔活动 · 休息 60–120 秒"],
            ["natural", "自然陪伴 · 休息 15–30 秒"],
            ["frequent", "活泼陪伴 · 休息 5–10 秒"],
            ["continuous", "持续活动 · 休息 1–3 秒"],
            ["custom", "自定义休息时间"],
          ],
          (v) => update({ idleMode: v as Preferences["idleMode"] }),
        )}
        <p className="bf-help">
          {p.idleMode === "quiet" ? "只保留轻微生命感；首次问候可在完整设置中单独关闭。" : `每次动作展示约 ${p.idleHoldSeconds} 秒，完整播放后再休息；提高频率不会加快动画。气泡最多显示 6 秒。`}
        </p>
        {p.idleMode === "custom" && <>
          {slider("idleMinSeconds", "最短休息时间 · 秒", 1)}
          {slider("idleMaxSeconds", "最长休息时间 · 秒", 1)}
        </>}
        {idle && <p className="bf-help" data-testid="idle-status">
          {idle.reason === "reduced" ? "当前：减弱动态已生效，暂停主动互动。" : idle.reason === "hidden" ? "当前：宠物隐藏，保留下一次互动时间。" : idle.reason === "work" ? "当前：跟随任务状态，空闲互动暂未开始。" : idle.active ? "当前：正在播放空闲动作。" : idle.reason === "quiet" ? "当前：安静陪伴，不主动轮换。" : `当前：休息中，约 ${idle.nextInSeconds ?? 0} 秒后开始下一个动作。`}
        </p>}
        {reduced && <p className="bf-help">系统或动画设置正在减弱动态；下列频率与动作偏好会在恢复正常播放后生效。</p>}
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
          {reduced ? "当前减弱动态：使用稳定姿态，暂停动作轮换。" : `当前角色在此档有 ${availableCount} 类候选动作，实际选择取决于任务状态与角色能力。`}
        </p>
        {select(
          "消息显示",
          display,
          [
            ["both", "台词和状态"],
            ["text", "仅台词"],
            ["status", "仅状态"],
            ["buttons", "仅按钮"],
          ],
          (v) =>
            update({
              bubbleEnabled: v !== "buttons",
              bubbleText: v === "both" || v === "text",
              bubbleStatus: v === "both" || v === "status",
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
            !swingAvailable || reduced,
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
            {p.bubbleEnabled && p.bubbleText && toggle("showTask", "显示本轮任务提示（用户消息短摘）")}
            <p className="bf-help">任务提示来自当前用户消息，不额外调用模型。</p>
            {toggle("greetOnOpen", "每个标签页首次空闲时打招呼")}
            {select("举牌偏好", p.idleSignPreference, [["prefer", "多举牌"], ["balanced", "均衡轮换"], ["none", "不举牌"]], v => update({idleSignPreference:v as Preferences["idleSignPreference"]}))}
            <p className="bf-help">多举牌：有台词和素材时，每两次互动至少一次举牌；不举牌不影响其他日常动作。外部角色需要提供牌面锚点。</p>
            {p.idleMode !== "quiet" && slider("idleHoldSeconds", "每次空闲动作展示 · 秒", 1)}
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
            {(display === "both" || display === "text") &&
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
            {p.bubbleEnabled && p.bubbleText && slider("speechSeconds", "工作台词最短停留 · 秒", 0.5)}
            <p className="bf-help">工作台词频率控制同一状态下的换句；新工具和重要事件仍会及时更新。</p>
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
              p.motionPolicy === "system" && p.reducedMotion ? "reduced" : p.motionPolicy,
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
              "成功完成后",
              p.completionMode,
              [
                ["celebrate", "简短庆祝"],
                ["message", "只显示完成提示"],
                ["quiet", "直接休息"],
              ],
              (v) =>
                update({ completionMode: v as Preferences["completionMode"] }),
            )}
            <p className="bf-help">取消或中断先提示 4 秒再休息；错误与等待确认保留明确状态。</p>
            {p.completionMode !== "quiet" &&
              slider("completionSeconds", "完成提示时长 · 秒", 1)}
          </details>
          {p.whipEnabled && swingAvailable && !reduced && (
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
            {!role && <details className="bf-disclosure">
              <summary>内置大肥鱼动作编排（JSON）</summary>
              <PackSettings t={t} />
            </details>}
            {toggle("autoSpeed", "按模型自动校准")}
            {!p.autoSpeed && slider("targetRate", "手动基准速度 · tok/s", 1)}
            {toggle("includeReasoning", "计入可见推理输出")}
            {p.autoSpeed && toggle("learnHistory", "跨会话记住模型速度")}
            <p className="bf-help">
              {p.autoSpeed ? "关闭记忆会清空已记住的模型基准；当前运行仍可学习。" : "手动模式固定使用基准速度，已有模型速度记忆暂不参与判断。"}
            </p>
            {slider("windowSeconds", "速度估算窗口 · 秒", 0.5)}
            <p className="bf-help">窗口越长越平稳，越短越灵敏。</p>
            {p.whipEnabled && swingAvailable && !reduced && (
              <>
                {slider("intensity", "空挥驱动力", 0.05)}
                {slider("maxWhipHz", "空挥调度频率上限", 0.1)}
                <p className="bf-help">
                  完整动作会限制实际频率，不会截短动作来追赶数值。
                </p>
                {toggle("timePressure", "工作较久时加强催促")}
                {p.timePressure &&
                  slider("referenceSeconds", "开始加强催促的工作时长 · 秒", 10)}
              </>
            )}
            {!role && <>{slider("fatigueSeconds", "疲惫积累周期 · 秒", 30)}
            <p className="bf-help">影响内置角色的工作动作选择；轻柔模式不按疲惫切换，其他档位也不保证立即擦汗。</p></>}
            {role && <p className="bf-help">外部角色使用角色包定义的动作；内置布景、疲惫动作编排与音效设置暂不适用。</p>}
            <div className="bf-button-row">
              <button disabled={!live.snapshot.modelKey} onClick={() => controller.resetLearning()}>
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
