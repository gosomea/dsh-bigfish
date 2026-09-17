import { PetPreview } from "./preview.js";
import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { petLibrary, loadImages, type LoadedPet } from "./library.js";
import { decodePet } from "./contract.js";
import { BuiltinPreview } from "./builtin-preview.js";
export function RoleSettings() {
  useSyncExternalStore(petLibrary.subscribe, petLibrary.getSnapshot);
  const file = useRef<HTMLInputElement>(null),
    [preview, setPreview] = useState<LoadedPet | null>(null),
    [pending, setPending] = useState<Uint8Array | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [builtinPreview, setBuiltinPreview] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => () => preview?.release(), [preview]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bf-role-library">
      <h3>角色</h3>
      <p className="bf-help">
        {petLibrary.native
          ? "已保存到 dsh Host，同一实例的浏览器共用角色库。"
          : "演示模式：仅保存到此浏览器。"}{" "}
        动作数量与名称不受大肥鱼预设限制。
      </p>
      <button disabled={busy} onClick={() => file.current?.click()}>
        导入角色包
      </button>
      <input
        ref={file}
        hidden
        type="file"
        aria-label="角色包文件"
        accept=".dshpet,.zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            void run(async () => {
              if (f.size > 32 * 1024 * 1024) throw Error("角色包超过 32 MB");
              const bytes = new Uint8Array(await f.arrayBuffer()),
                pet = await decodePet(bytes),
                loaded = await loadImages("preview", pet);
              if (!mounted.current) {
                loaded.release();
                return;
              }
              setBuiltinPreview(false);
              setPreview(loaded);
              setPending(bytes);
            });
        }}
      />
      <div className="bf-role-card">
        <strong>大肥鱼 · 内置</strong>
        <span>29 类动作 · 5 种举牌 · 支持空挥反应</span>
        <div className="bf-button-row">
          <button
            disabled={busy}
            onClick={() => {
              setPreview(null);
              setPending(null);
              setBuiltinPreview(true);
            }}
          >
            预览
          </button>
          <button
            disabled={busy || petLibrary.catalog.selected === null}
            onClick={() =>
              void run(async () => {
                await petLibrary.select(null);
                setMessage("已使用大肥鱼");
              })
            }
          >
            {petLibrary.catalog.selected === null ? "使用中" : "使用大肥鱼"}
          </button>
        </div>
      </div>
      {builtinPreview && (
        <div className="bf-pet-import">
          <strong>大肥鱼 · 内置</strong>
          <BuiltinPreview />
          <button onClick={() => setBuiltinPreview(false)}>关闭预览</button>
        </div>
      )}
      {petLibrary.catalog.entries.map((e) => (
        <div className="bf-role-card" key={e.key}>
          <strong>
            {petLibrary.active?.key === e.key && (
              <img
                className="bf-role-thumb"
                src={petLibrary.active.thumbnail}
                alt=""
              />
            )}
            {e.name} <small>{e.version}</small>
          </strong>
          <span>
            {e.author} · {e.actions} 个动作{" "}
            {e.capabilities.includes("air-swing") ? "· 支持空挥反应" : ""}
          </span>
          <div className="bf-button-row">
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const loaded = await loadImages(
                    e.key,
                    await decodePet(await petLibrary.bytes(e.key)),
                  );
                  if (!mounted.current) {
                    loaded.release();
                    return;
                  }
                  setBuiltinPreview(false);
                  setPending(null);
                  setPreview(loaded);
                })
              }
            >
              预览
            </button>
            <button
              disabled={busy || petLibrary.catalog.selected === e.key}
              onClick={() =>
                void run(async () => {
                  await petLibrary.select(e.key);
                  setMessage("角色已切换，原有行为设置保留");
                })
              }
            >
              {petLibrary.catalog.selected === e.key ? "使用中" : "使用"}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const bytes = await petLibrary.bytes(e.key),
                    url = URL.createObjectURL(
                      new Blob([bytes.slice()], { type: "application/zip" }),
                    ),
                    a = document.createElement("a");
                  a.href = url;
                  a.download =
                    e.id.replaceAll(":", "-") + "-" + e.version + ".dshpet";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                })
              }
            >
              导出
            </button>
            <button
              disabled={busy || petLibrary.catalog.selected === e.key}
              onClick={() =>
                void run(async () => {
                  await petLibrary.remove(e.key);
                  setMessage("已移除");
                })
              }
            >
              移除
            </button>
          </div>
        </div>
      ))}
      {preview && (
        <div className="bf-pet-import">
          <strong>
            {preview.pet.manifest.name} · {preview.pet.manifest.version}
          </strong>
          <p>{preview.pet.manifest.description}</p>
          <PetPreview
            key={preview.key + preview.pet.manifest.id}
            loaded={preview}
          />
          {preview.pet.warnings.length > 0 && (
            <details>
              <summary>兼容回退说明</summary>
              <ul>
                {preview.pet.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {pending && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const key = await petLibrary.import(pending);
                  await petLibrary.select(key);
                  setPending(null);
                  setMessage("角色已安装并使用");
                })
              }
            >
              安装并使用
            </button>
          )}
          <button
            onClick={() => {
              setPreview(null);
              setPending(null);
            }}
          >
            关闭预览
          </button>
        </div>
      )}
      {(message || petLibrary.error) && (
        <p role="status" className="bf-help">
          {message || petLibrary.error}
        </p>
      )}
    </section>
  );
}
