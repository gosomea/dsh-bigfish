import { mkdir } from "node:fs/promises";
import lockfile from "proper-lockfile";

/** All Host instances sharing a canonical directory use the same heartbeat lock. */
export async function withStoreLock<T>(
  directory: string,
  work: (check: () => void) => Promise<T>,
): Promise<T> {
  await mkdir(directory, { recursive: true });
  let compromised: Error | undefined;
  const release = await lockfile.lock(directory, {
    stale: 10000,
    update: 2000,
    retries: {
      retries: 60,
      minTimeout: 100,
      maxTimeout: 500,
      factor: 1.1,
      randomize: true,
    },
    onCompromised: (error) => {
      compromised = error;
    },
  });
  const check = () => {
    if (compromised)
      throw Error("角色库写入锁失效，请重试", { cause: compromised });
  };
  try {
    check();
    return await work(check);
  } finally {
    await release().catch((error) => {
      if (!compromised) throw error;
    });
  }
}
