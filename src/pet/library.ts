import { decodeBackup, encodeBackup, type LibrarySnapshot } from "./backup.js";
import { decodePet, encodePet, type PetBundle } from "./contract.js";
import type { PetCatalog } from "./host-store.js";
export interface LoadedPet {
  key: string;
  pet: PetBundle;
  images: Record<string, HTMLImageElement>;
  thumbnail: string;
  release: () => void;
}
const endpoint = "/api/bigfish-pets";
export async function loadImages(
  key: string,
  pet: PetBundle,
): Promise<LoadedPet> {
  const urls: string[] = [],
    images: Record<string, HTMLImageElement> = {};
  const url = (path: string) => {
    const value = URL.createObjectURL(
      new Blob([pet.files[path]!.slice()], {
        type: path.endsWith(".png") ? "image/png" : "image/webp",
      }),
    );
    urls.push(value);
    return value;
  };
  try {
    await Promise.all(
      Object.entries(pet.manifest.assets).map(async ([id, a]) => {
        const im = new Image();
        im.src = url(a.path);
        await im.decode();
        if (im.naturalWidth !== a.width || im.naturalHeight !== a.height)
          throw Error("图片解码尺寸不匹配");
        images[id] = im;
      }),
    );
    let thumbnail = url(pet.manifest.thumbnail);
    if (
      Object.values(pet.manifest.assets).some(
        (a) => a.path === pet.manifest.thumbnail,
      )
    ) {
      const f = pet.animations.find(
          (a) => a.id === pet.manifest.fallbacks.idle,
        )!.frames[0]!,
        cell = document.createElement("canvas");
      cell.width = f.rect[2];
      cell.height = f.rect[3];
      cell
        .getContext("2d")!
        .drawImage(images[f.asset]!, ...f.rect, 0, 0, cell.width, cell.height);
      thumbnail = cell.toDataURL("image/png");
    }
    return {
      key,
      pet,
      images,
      thumbnail,
      release: () => urls.forEach((u) => URL.revokeObjectURL(u)),
    };
  } catch (e) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    throw e;
  }
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("dsh-pet-library", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("data");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function local<T>(
  key: string,
  value?: T,
  remove = false,
): Promise<T | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
          "data",
          value !== undefined || remove ? "readwrite" : "readonly",
        ),
        store = tx.objectStore("data"),
        r = remove
          ? store.delete(key)
          : value !== undefined
            ? store.put(value, key)
            : store.get(key);
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
/** One IndexedDB transaction protects the demo library across browser tabs. */
async function localRecords<T>(
  mutate: (
    records: Map<string, any>,
    put: (key: string, value: unknown) => void,
  ) => T,
  write = false,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("data", write ? "readwrite" : "readonly"),
        store = tx.objectStore("data");
      const keys = store.getAllKeys(),
        values = store.getAll();
      let result: T, failure: unknown;
      values.onsuccess = () => {
        try {
          result = mutate(
            new Map(keys.result.map((k, i) => [String(k), values.result[i]])),
            (key, value) => {
              if (value === undefined) store.delete(key);
              else store.put(value, key);
            },
          );
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error);
      tx.onerror = () => reject(failure ?? tx.error);
    });
  } finally {
    db.close();
  }
}
const empty = (): PetCatalog => ({ selected: null, entries: [] });
export class PetLibrary {
  native = false;
  catalog: PetCatalog = empty();
  active: LoadedPet | null = null;
  error = "";
  private listeners = new Set<() => void>();
  private revision = 0;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.revision;
  private emit() {
    this.revision++;
    this.listeners.forEach((fn) => fn());
  }
  async init(native: boolean) {
    this.native = native;
    await this.refresh();
    if (native)
      this.timer = setInterval(() => {
        void this.refresh().catch(() => {});
      }, 15000);
  }
  dispose() {
    clearInterval(this.timer);
    this.generation++;
    this.active?.release();
    this.active = null;
  }
  private async request(query = "", bytes?: Uint8Array) {
    const r = await fetch(endpoint + (bytes ? "-upload" : "") + query, {
      method: bytes || query.startsWith("?op=") ? "POST" : "GET",
      ...(bytes ? { body: bytes.slice() } : {}),
      cache: "no-store",
    });
    if (!r.ok) {
      const error = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw Error(error.error ?? "角色库不可用");
    }
    return r;
  }
  async bytes(key: string): Promise<Uint8Array> {
    if (this.native)
      return new Uint8Array(
        await (
          await this.request("?key=" + encodeURIComponent(key))
        ).arrayBuffer(),
      );
    const b = await local<Uint8Array>("pack:" + key);
    if (!b) throw Error("角色文件已丢失");
    return b;
  }
  async refresh() {
    const generation = ++this.generation;
    try {
      const catalog: PetCatalog = this.native
        ? await (await this.request()).json()
        : ((await local<PetCatalog>("catalog")) ?? empty());
      let loaded: LoadedPet | null = this.active;
      if (catalog.selected !== this.active?.key) {
        loaded = catalog.selected
          ? await loadImages(
              catalog.selected,
              await decodePet(await this.bytes(catalog.selected)),
            )
          : null;
      }
      if (generation !== this.generation) {
        if (loaded !== this.active) loaded?.release();
        return;
      }
      if (loaded !== this.active) {
        const old = this.active;
        this.active = loaded;
        setTimeout(() => old?.release(), 1000);
      }
      this.catalog = catalog;
      this.error = "";
      this.emit();
    } catch (e) {
      if (generation === this.generation) {
        this.error = e instanceof Error ? e.message : "加载失败";
        this.emit();
      }
    }
  }
  async import(bytes: Uint8Array) {
    const pet = await decodePet(bytes),
      key = `${pet.manifest.id}@${pet.manifest.version}`,
      encoded = encodePet(pet);
    const preview = await loadImages(key, pet);
    preview.release();
    if (this.native) await this.request("?op=import", encoded);
    else
      await localRecords((records, put) => {
        const c: PetCatalog = records.get("catalog") ?? empty();
        if (c.entries.some((e) => e.key === key)) {
          const old = records.get("pack:" + key) as Uint8Array;
          if (
            old.length !== encoded.length ||
            old.some((v, i) => v !== encoded[i])
          )
            throw Error("相同版本内容不同，请提升版本");
        } else {
          put("pack:" + key, encoded);
          const m = pet.manifest;
          c.entries.push({
            key,
            id: m.id,
            name: m.name,
            author: m.author,
            version: m.version,
            actions: pet.animations.length,
            capabilities: m.capabilities,
          });
          c.revision = crypto.randomUUID();
          put("catalog", c);
        }
      }, true);
    await this.refresh();
    return key;
  }
  async select(key: string | null) {
    let pending: LoadedPet | undefined;
    if (key)
      pending = await loadImages(key, await decodePet(await this.bytes(key)));
    try {
      if (this.native)
        await this.request(
          "?op=select" + (key ? "&key=" + encodeURIComponent(key) : ""),
        );
      else
        await localRecords((r, put) => {
          const c: PetCatalog = r.get("catalog") ?? empty();
          if (key && !c.entries.some((e) => e.key === key))
            throw Error("角色不存在");
          c.selected = key;
          c.revision = crypto.randomUUID();
          put("catalog", c);
        }, true);
    } finally {
      pending?.release();
    }
    await this.refresh();
  }
  async remove(key: string) {
    if (this.native)
      await this.request("?op=remove&key=" + encodeURIComponent(key));
    else
      await localRecords((r, put) => {
        const c: PetCatalog = r.get("catalog") ?? empty();
        if (key === c.selected) throw Error("先切换到其他角色再移除");
        c.entries = c.entries.filter((e) => e.key !== key);
        c.revision = crypto.randomUUID();
        put("catalog", c);
        put("pack:" + key, undefined);
      }, true);
    await this.refresh();
  }
  async snapshot(): Promise<LibrarySnapshot> {
    if (this.native)
      return decodeBackup(
        new Uint8Array(await (await this.request("?backup=1")).arrayBuffer()),
      );
    return localRecords((r) => {
      const c: PetCatalog = r.get("catalog") ?? empty();
      return {
        selected: c.selected,
        revision: c.revision ?? "legacy",
        packs: c.entries.map((e) => {
          const bytes = r.get("pack:" + e.key);
          if (!bytes) throw Error("角色文件已丢失");
          return bytes;
        }),
      };
    });
  }
  async previewRestore(
    bytes: Uint8Array,
  ): Promise<{
    revision: string;
    added: { name: string; version: string }[];
    retained: number;
    selected: string | null;
  }> {
    const b = await decodeBackup(bytes);
    // All images must actually decode before any preference or library mutation.
    for (const pet of b.pets) {
      const loaded = await loadImages(
        `${pet.manifest.id}@${pet.manifest.version}`,
        pet,
      );
      loaded.release();
    }
    if (this.native)
      return (await this.request("?op=preview-restore", bytes)).json();
    const snap = await this.snapshot(),
      existing = await decodeBackup(
        encodeBackup({ ...snap, preferences: null, choreography: null }),
      );
    const added = [];
    for (let i = 0; i < b.pets.length; i++) {
      const m = b.pets[i]!.manifest,
        j = existing.pets.findIndex(
          (p) => p.manifest.id === m.id && p.manifest.version === m.version,
        );
      if (j >= 0) {
        const old = existing.packs[j]!,
          next = b.packs[i]!;
        if (old.length !== next.length || old.some((v, k) => v !== next[k]))
          throw Error(`角色 ${m.name} ${m.version} 内容冲突`);
      } else added.push({ name: m.name, version: m.version });
    }
    return {
      revision: snap.revision,
      added,
      retained: existing.pets.length,
      selected: b.selected,
    };
  }
  async restore(bytes: Uint8Array, revision: string) {
    if (this.native)
      await this.request(
        "?op=restore&revision=" + encodeURIComponent(revision),
        bytes,
      );
    else {
      const b = await decodeBackup(bytes);
      await localRecords((r, put) => {
        const c: PetCatalog = r.get("catalog") ?? empty();
        if ((c.revision ?? "legacy") !== revision)
          throw Error("角色库在预览后已变化，请重新选择备份并预览");
        b.pets.forEach((pet, i) => {
          const m = pet.manifest,
            key = `${m.id}@${m.version}`;
          if (!c.entries.some((e) => e.key === key)) {
            c.entries.push({
              key,
              id: m.id,
              name: m.name,
              author: m.author,
              version: m.version,
              actions: pet.animations.length,
              capabilities: m.capabilities,
            });
            put("pack:" + key, b.packs[i]);
          }
        });
        c.selected = b.selected;
        c.revision = crypto.randomUUID();
        put("catalog", c);
      }, true);
    }
    await this.refresh();
  }
}
export const petLibrary = new PetLibrary();
