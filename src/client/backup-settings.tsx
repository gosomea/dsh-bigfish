import { restoreBackup, choreographyKey } from "./restore-backup.js";
import React, { useRef, useState } from "react";
import { petLibrary } from "../pet/library.js";
import {
  decodeBackup,
  encodeBackup,
  MAX_BACKUP,
  type DecodedBackup,
} from "../pet/backup.js";
import type { Companion } from "./controller.js";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export function BackupSettings({ controller }: { controller: Companion }) {
  const file = useRef<HTMLInputElement>(null),
    sequence = useRef(0);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [preview, setPreview] = useState<{
      bytes: Uint8Array;
      data: DecodedBackup;
      revision: string;
      added: number;
      retained: number;
      before: string;
    } | null>(null);
  const save = async () => {
    setBusy(true);
    setStatus("正在整理备份…");
    try {
      const snapshot = await petLibrary.snapshot(),
        raw = localStorage.getItem(choreographyKey);
      const bytes = encodeBackup({
        ...snapshot,
        preferences: controller.preferences.getSnapshot().value,
        choreography: raw ? JSON.parse(raw) : null,
      });
      await decodeBackup(bytes);
      const url = URL.createObjectURL(
          new Blob([bytes.slice()], { type: "application/zip" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = `dsh-bigfish-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(
        `已导出 ${snapshot.packs.length} 个角色版本、偏好、台词和动作编排。`,
      );
    } catch (e) {
      setStatus("备份失败：" + message(e));
    } finally {
      setBusy(false);
    }
  };
  const inspect = async (f: File) => {
    const id = ++sequence.current;
    setBusy(true);
    setPreview(null);
    setStatus("正在校验全部角色与图片…");
    try {
      if (f.size > MAX_BACKUP) throw Error("备份超过 128 MB");
      const bytes = new Uint8Array(await f.arrayBuffer()),
        data = await decodeBackup(bytes);
      if (!data.preferences)
        throw Error("这是内部角色库快照，请选择从设置导出的完整备份");
      const plan = await petLibrary.previewRestore(bytes);
      if (id === sequence.current) {
        setPreview({
          bytes,
          data,
          revision: plan.revision,
          added: plan.added.length,
          retained: plan.retained,
          before: JSON.stringify(controller.preferences.getSnapshot().value),
        });
        setStatus("校验通过，尚未修改任何设置。");
      }
    } catch (e) {
      if (id === sequence.current) setStatus("无法恢复：" + message(e));
    } finally {
      if (id === sequence.current) setBusy(false);
    }
  };
  const restore = async () => {
    if (!preview) return;
    setBusy(true);
    setStatus("正在恢复…");
    try {
      await restoreBackup(
        preview,
        controller.preferences,
        localStorage,
        petLibrary,
      );
      dispatchEvent(new Event("bigfish:pack"));
      setStatus(
        "恢复完成。已有角色已保留，角色选择、偏好、台词和动作编排已恢复。",
      );
    } catch (e) {
      setStatus(message(e));
    } finally {
      setPreview(null);
      setBusy(false);
    }
  };

  return (
    <section aria-label="备份与恢复">
      <p className="bf-help">
        保存全部角色版本、当前角色、显示与行为偏好、自定义台词、工具规则和此浏览器的动作编排。最多
        32 个角色版本、128 MB。不包含聊天、密钥、模型速度学习记录和宠物位置。
      </p>
      <fieldset disabled={busy}>
        <div className="bf-button-row">
          <button onClick={() => void save()}>导出完整备份</button>
          <button onClick={() => file.current?.click()}>选择备份恢复</button>
        </div>
        <input
          ref={file}
          type="file"
          aria-label="备份文件"
          hidden
          accept=".zip,application/zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void inspect(f);
          }}
        />
        {preview && (
          <div className="bf-backup-preview">
            <strong>恢复预览</strong>
            <p>
              备份含 {preview.data.pets.length} 个角色版本；新增 {preview.added}{" "}
              个，保留现有 {preview.retained} 个。相同版本已核对内容。
            </p>
            <p>
              使用角色：
              {preview.data.pets.find(
                (p) =>
                  `${p.manifest.id}@${p.manifest.version}` ===
                  preview.data.selected,
              )?.manifest.name ?? "大肥鱼 · 内置"}
            </p>
            <p>
              将替换显示与行为偏好、自定义台词、工具规则和此浏览器的动作编排。
            </p>
            <p className="bf-help">
              恢复期间请保持页面打开。角色库与 DSH
              偏好分开保存，失败时会尝试回滚偏好与编排；不会删除原有角色。
            </p>
            <div className="bf-button-row">
              <button onClick={() => void restore()}>确认恢复备份</button>
              <button
                onClick={() => {
                  sequence.current++;
                  setPreview(null);
                  setStatus("已取消恢复。");
                }}
              >
                取消恢复
              </button>
            </div>
          </div>
        )}
      </fieldset>
      <p role="status">{status}</p>
    </section>
  );
}
