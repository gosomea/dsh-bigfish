import type { DecodedBackup } from "../pet/backup.js";
import type { PreferenceStore } from "./preferences-store.js";
import type { PetLibrary } from "../pet/library.js";
export const choreographyKey = "bigfish.pack.v1";
export interface RestorePlan {
  bytes: Uint8Array;
  data: DecodedBackup;
  revision: string;
  before: string;
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** The Host catalog is committed last; rollback never overwrites subsequent user edits. */
export async function restoreBackup(
  plan: RestorePlan,
  preferences: PreferenceStore,
  storage: Storage,
  library: Pick<PetLibrary, "restore">,
): Promise<void> {
  const old = preferences.getSnapshot().value;
  let oldPack: string | null = null,
    writtenPack: string | null = null,
    preferencesWritten = false,
    packWritten = false;
  try {
    if (!plan.data.preferences) throw Error("备份缺少偏好");
    if (JSON.stringify(old) !== plan.before || preferences.getSnapshot().saving)
      throw Error("偏好在预览后已变化，请重新选择备份");
    oldPack = storage.getItem(choreographyKey);
    writtenPack = plan.data.choreography
      ? JSON.stringify(plan.data.choreography)
      : null;
    await preferences.update(plan.data.preferences, plan.before);
    preferencesWritten = true;
    if (writtenPack === null) storage.removeItem(choreographyKey);
    else storage.setItem(choreographyKey, writtenPack);
    packWritten = true;
    await library.restore(plan.bytes, plan.revision);
  } catch (e) {
    const failures: string[] = [];
    if (packWritten)
      try {
        if (storage.getItem(choreographyKey) !== writtenPack)
          throw Error("编排已被其他窗口修改");
        if (oldPack === null) storage.removeItem(choreographyKey);
        else storage.setItem(choreographyKey, oldPack);
      } catch {
        failures.push("动作编排");
      }
    if (preferencesWritten)
      try {
        await preferences.update(old, JSON.stringify(plan.data.preferences));
      } catch {
        failures.push("偏好");
      }
    throw Error(
      `恢复失败：${message(e)}。${failures.length ? "未能回滚 " + failures.join("、") + "，请检查当前设置。" : "此前的偏好与编排已保留。"}`,
      { cause: e },
    );
  }
}
