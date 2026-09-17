import { readZip, writeZip } from "./archive.js";
import { decodePet, encodePet, type PetBundle } from "./contract.js";
import {
  decodePreferences,
  type Preferences,
} from "../contract/preferences.js";
import { parsePack, type ScenePack } from "../contract/scenes.js";
import manifest from "../../packs/classic/manifest.json" with { type: "json" };

export const MAX_BACKUP = 128 * 1024 * 1024;
export const backupLimits = { archive: MAX_BACKUP, expanded: MAX_BACKUP };
export interface LibrarySnapshot {
  selected: string | null;
  revision: string;
  packs: Uint8Array[];
}
export interface BackupContent extends LibrarySnapshot {
  preferences: Preferences | null;
  choreography: ScenePack | null;
}
export interface DecodedBackup extends BackupContent {
  pets: PetBundle[];
}
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
export function encodeBackup(content: BackupContent): Uint8Array {
  if (content.packs.length > 32) throw Error("单个备份最多包含 32 个角色版本");
  const files: Record<string, Uint8Array> = {};
  const paths = content.packs.map((bytes, i) => {
    const path = `roles/${i}.dshpet`;
    files[path] = bytes;
    return path;
  });
  files["backup.json"] = encode({
    format: "dsh-bigfish-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    selected: content.selected,
    revision: content.revision,
    preferences: content.preferences,
    choreography: content.choreography,
    roles: paths,
  });
  if (
    Object.values(files).reduce((n, b) => n + b.length, 0) >
    MAX_BACKUP - 65536
  )
    throw Error("备份超过 128 MB，请先移除不需要的角色版本");
  return writeZip(files);
}
export async function decodeBackup(bytes: Uint8Array): Promise<DecodedBackup> {
  const files = await readZip(bytes, backupLimits);
  if (!files["backup.json"] || files["backup.json"].length > 1024 * 1024)
    throw Error("缺少或超大的备份清单");
  const m = JSON.parse(new TextDecoder().decode(files["backup.json"]));
  if (
    m.format !== "dsh-bigfish-backup" ||
    m.version !== 1 ||
    !Array.isArray(m.roles) ||
    m.roles.length > 32 ||
    typeof m.revision !== "string" ||
    m.revision.length > 128
  )
    throw Error("不支持的备份格式");
  if (m.selected !== null && typeof m.selected !== "string")
    throw Error("备份角色选择无效");
  const seen = new Set<string>(),
    pets: PetBundle[] = [],
    packs: Uint8Array[] = [];
  let expandedTotal = files["backup.json"].length;
  for (let i = 0; i < m.roles.length; i++) {
    const path = m.roles[i];
    if (path !== `roles/${i}.dshpet` || !files[path])
      throw Error("备份角色路径无效");
    const pet = await decodePet(files[path]);
    expandedTotal += Object.values(pet.files).reduce(
      (n, file) => n + file.length,
      0,
    );
    if (expandedTotal > MAX_BACKUP)
      throw Error("所有角色展开后的总大小超过 128 MB");
    const key = `${pet.manifest.id}@${pet.manifest.version}`;
    if (seen.has(key)) throw Error("备份包含重复角色版本");
    seen.add(key);
    pets.push(pet);
    packs.push(encodePet(pet));
  }
  if (
    Object.keys(files).length !== m.roles.length + 1 ||
    (m.selected !== null && !seen.has(m.selected))
  )
    throw Error("备份目录或角色选择无效");
  const preferences =
    m.preferences === null ? null : decodePreferences(m.preferences);
  const choreography =
    m.choreography === null
      ? null
      : parsePack(m.choreography, (path) => manifest.assets.includes(path));
  if (
    choreography?.scenes.some((s) => s.actions.some((a) => a.kind !== "loop"))
  )
    throw Error("编排仅支持现有循环动作");
  return {
    selected: m.selected,
    revision: m.revision,
    packs,
    pets,
    preferences,
    choreography,
  };
}
