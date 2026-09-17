import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import lockfile from 'proper-lockfile';

const name = 'dsh-bigfish-pet-maker';
const source = fileURLToPath(new URL(`../skills/${name}/`, import.meta.url));
async function exists(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function fingerprint(root, prefix = '') {
  const entries = [];
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Skill 含符号链接，未改动原目录：${join(root,path)}`);
    if (entry.isDirectory()) entries.push(...await fingerprint(root, path));
    else if (entry.isFile()) entries.push([path, createHash('sha256').update(await readFile(join(root,path))).digest('hex')]);
    else throw new Error(`Skill 含特殊文件，未改动原目录：${join(root,path)}`);
  }
  return entries;
}
/** Explicit opt-in copy, never an npm lifecycle side effect. */
export async function installSkill(skillsDir) {
  const root = resolve(skillsDir ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'skills'));
  const target = join(root, name);
  const expected = JSON.stringify(await fingerprint(source));
  await mkdir(root, { recursive: true });
  const release = await lockfile.lock(join(root, `.${name}-install`), {
    realpath:false, stale:10000, update:2000, retries:{retries:10,minTimeout:100,maxTimeout:500},
  });
  let temporary;
  try {
    const current = await exists(target);
    if (current) {
      if (current.isDirectory() && !current.isSymbolicLink() && JSON.stringify(await fingerprint(target)) === expected) {
        return { installed:false, path:target };
      }
      throw new Error(`目标已有不同内容，未覆盖：${target}\n请先备份并移走这个 Skill 目录，或用 --skills-dir 选择其他目录。`);
    }
    temporary = await mkdtemp(join(dirname(target), '.bigfish-skill-'));
    const staged = join(temporary, name);
    await cp(source, staged, { recursive:true, errorOnExist:true, force:false });
    if (JSON.stringify(await fingerprint(staged)) !== expected) throw new Error('Skill 复制校验失败，未安装');
    await rename(staged, target);
    return { installed:true, path:target };
  } finally {
    if (temporary) await rm(temporary, {recursive:true,force:true});
    await release();
  }
}
