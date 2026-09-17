import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { decodePet, encodePet, type PetBundle } from "./contract.js";
import { MAX_ARCHIVE } from "./archive.js";
import { withStoreLock } from "./store-lock.js";
import {
  decodeBackup,
  encodeBackup,
  MAX_BACKUP,
  type DecodedBackup,
} from "./backup.js";
export interface PetEntry {
  key: string;
  id: string;
  name: string;
  version: string;
  author: string;
  actions: number;
  capabilities: string[];
}
export interface PetCatalog {
  selected: string | null;
  entries: PetEntry[];
  revision?: string;
}
const validKey = (key: unknown): key is string =>
  typeof key === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*@\d+\.\d+\.\d+$/.test(key) &&
  key.length < 140;
const entry = (pet: PetBundle): PetEntry => {
  const m = pet.manifest;
  return {
    key: `${m.id}@${m.version}`,
    id: m.id,
    name: m.name,
    version: m.version,
    author: m.author,
    actions: pet.animations.length,
    capabilities: m.capabilities,
  };
};
/** Keep existing safe filenames; encode colons (NTFS streams) and Windows device prefixes. */
export function petFilename(key: string): string {
  if (!validKey(key)) throw Error("角色标识无效");
  return (
    (key.includes(":") || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(key)
      ? "pet-" + Buffer.from(key).toString("base64url")
      : key) + ".dshpet"
  );
}
export class HostPetStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly directory = join(
      process.env.DSH_HOME ?? join(homedir(), ".dsh"),
      "pets",
      "dsh-bigfish",
    ),
  ) {}
  async catalog(): Promise<PetCatalog> {
    try {
      return JSON.parse(
        await readFile(join(this.directory, "catalog.json"), "utf8"),
      );
    } catch (e: any) {
      if (e.code === "ENOENT") return { selected: null, entries: [] };
      throw e;
    }
  }
  private async atomic(path: string, data: string | Uint8Array) {
    await mkdir(this.directory, { recursive: true });
    const temp = path + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temp, data);
      await rename(temp, path);
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  private serialize<T>(fn: (check: () => void) => Promise<T>): Promise<T> {
    const run = () => withStoreLock(this.directory, fn);
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
  private publish(c: PetCatalog, check: () => void) {
    check();
    c.revision = randomUUID();
    return this.atomic(join(this.directory, "catalog.json"), JSON.stringify(c));
  }
  async bytes(key: string) {
    const filename = petFilename(key);
    try {
      return new Uint8Array(await readFile(join(this.directory, filename)));
    } catch (e: any) {
      if (
        e.code === "ENOENT" &&
        process.platform !== "win32" &&
        filename !== key + ".dshpet"
      )
        return new Uint8Array(
          await readFile(join(this.directory, key + ".dshpet")),
        );
      throw e;
    }
  }
  async import(bytes: Uint8Array) {
    // Parsing can be CPU-heavy; do it before acquiring the heartbeat lease.
    const pet = await decodePet(bytes),
      encoded = encodePet(pet),
      item = entry(pet);
    return this.serialize(async (check) => {
      const catalog = await this.catalog();
      if (catalog.entries.some((e) => e.key === item.key)) {
        if (
          !Buffer.from(await this.bytes(item.key)).equals(Buffer.from(encoded))
        )
          throw Error("同一版本已有不同内容，请提升角色包版本");
        return catalog;
      }
      check();
      await this.atomic(join(this.directory, petFilename(item.key)), encoded);
      catalog.entries.push(item);
      await this.publish(catalog, check);
      return catalog;
    });
  }
  change(op: "select" | "remove", key: string | null) {
    return this.serialize(async (check) => {
      const c = await this.catalog();
      if (
        key !== null &&
        (!validKey(key) || !c.entries.some((e) => e.key === key))
      )
        throw Error("角色不存在");
      if (op === "select") c.selected = key;
      else {
        if (key === null) throw Error("不能移除内置角色");
        if (c.selected === key) throw Error("请先切换到其他角色再移除");
        c.entries = c.entries.filter((e) => e.key !== key);
      }
      await this.publish(c, check);
      if (op === "remove") {
        check();
        await unlink(join(this.directory, petFilename(key!))).catch(() => {});
        if (
          process.platform !== "win32" &&
          petFilename(key!) !== key + ".dshpet"
        )
          await unlink(join(this.directory, key + ".dshpet")).catch(() => {});
      }
      return c;
    });
  }
  async backup() {
    const snapshot = await this.serialize(async (check) => {
      const c = await this.catalog(),
        packs: Uint8Array[] = [];
      let size = 0;
      for (const e of c.entries) {
        const bytes = await this.bytes(e.key);
        size += bytes.length;
        if (size > MAX_BACKUP) throw Error("备份超过 128 MB");
        packs.push(bytes);
      }
      check();
      return {
        selected: c.selected,
        revision: c.revision ?? "legacy",
        packs,
        preferences: null,
        choreography: null,
      };
    });
    return encodeBackup(snapshot);
  }
  private async prepareRestore(backup: DecodedBackup, c: PetCatalog) {
    const additions: { item: PetEntry; bytes: Uint8Array }[] = [];
    for (let i = 0; i < backup.pets.length; i++) {
      const item = entry(backup.pets[i]!),
        bytes = backup.packs[i]!;
      if (c.entries.some((e) => e.key === item.key)) {
        if (!Buffer.from(await this.bytes(item.key)).equals(Buffer.from(bytes)))
          throw Error(
            `角色 ${item.name} ${item.version} 与现有版本内容冲突，请提升角色包版本`,
          );
      } else additions.push({ item, bytes });
    }
    return additions;
  }
  async restore(bytes: Uint8Array, expected: string | null, preview = false) {
    const backup = await decodeBackup(bytes);
    return this.serialize(async (check) => {
      const c = await this.catalog(),
        revision = c.revision ?? "legacy";
      if (!preview && expected !== revision)
        throw Error("角色库在预览后已变化，请重新选择备份并预览");
      const additions = await this.prepareRestore(backup, c);
      if (preview)
        return {
          revision,
          added: additions.map((a) => a.item),
          retained: c.entries.length,
          selected: backup.selected,
        };
      // Publish the catalog last. A crash before publication leaves only unreferenced files.
      for (const a of additions) {
        check();
        await this.atomic(
          join(this.directory, petFilename(a.item.key)),
          a.bytes,
        );
      }
      c.entries.push(...additions.map((a) => a.item));
      c.selected = backup.selected;
      await this.publish(c, check);
      return c;
    });
  }
}
async function boundedBody(
  request: Request,
  limit = MAX_ARCHIVE,
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw Error("缺少上传文件");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > limit) throw Error(`上传超过 ${limit / 1024 / 1024} MB`);
      chunks.push(r.value);
    }
  } finally {
    await reader.cancel();
  }
  const result = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    result.set(c, at);
    at += c.length;
  }
  return result;
}
export function petRoute(store: HostPetStore) {
  return async (request: Request): Promise<Response> => {
    try {
      const u = new URL(request.url),
        op = u.searchParams.get("op"),
        key = u.searchParams.get("key");
      if (request.method === "GET") {
        if (u.searchParams.has("backup"))
          return new Response((await store.backup()).slice(), {
            headers: {
              "content-type": "application/zip",
              "cache-control": "no-store",
            },
          });
        if (key !== null)
          return new Response((await store.bytes(key)).slice(), {
            headers: {
              "content-type": "application/octet-stream",
              "cache-control": "no-store",
            },
          });
        return Response.json(await store.catalog());
      }
      if (op === "restore" || op === "preview-restore")
        return Response.json(
          await store.restore(
            await boundedBody(request, MAX_BACKUP),
            u.searchParams.get("revision"),
            op === "preview-restore",
          ),
        );
      if (op === "import")
        return Response.json(await store.import(await boundedBody(request)));
      if (op === "select" || op === "remove")
        return Response.json(await store.change(op, key));
      return Response.json({ error: "未知操作" }, { status: 400 });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "角色包操作失败" },
        { status: 400 },
      );
    }
  };
}
