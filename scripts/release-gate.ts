/** Local release verification. Recording runs fixed, keyless checks; it never publishes or starts DSH. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const verifier = 'docs/plans/intelligent-pet/verify.py';
const receiptPath = 'artifacts/companion/release-receipt.json';
const commands = ['pnpm check', 'pnpm build', 'pnpm test', 'pnpm exec playwright test', 'npm pack --ignore-scripts --pack-destination dist'] as const;
interface CommandProof { command: string; exitCode: number; log: string; sha256: string }
interface Receipt { schemaVersion: number; version: string; sourceSha256: string; packageSha256: string; commands: CommandProof[] }
export async function sha256(file: string) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
function inside(root: string, relative: string) {
  const file = path.resolve(root, relative);
  assert.ok(file.startsWith(path.resolve(root) + path.sep), 'Path must stay inside the project');
  return file;
}
function python(root: string, args: string[]) {
  const result = spawnSync('python3', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'Python verification failed');
  return result.stdout;
}
export function sourceIdentity(root: string) {
  return JSON.parse(python(root, [verifier, '--fingerprint'])) as {version: string; sourceSha256: string};
}
async function filesUnder(root: string, folder: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(inside(root, folder), { withFileTypes: true })) {
    const relative = `${folder}/${entry.name}`;
    assert.equal(entry.isSymbolicLink(), false, 'Runtime package files cannot be symlinks');
    if (entry.isDirectory()) files.push(...await filesUnder(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}
export async function inspectPackage(root: string, version: string) {
  const tarball = inside(root, `dist/dsh-bigfish-${version}.tgz`);
  const rows = JSON.parse(python(root, ['-c', `import hashlib,json,tarfile,sys
from pathlib import PurePosixPath
rows={}; total=0
with tarfile.open(sys.argv[1],'r:gz') as archive:
 for item in archive:
  parts=PurePosixPath(item.name).parts
  if not parts or parts[0]!='package' or '..' in parts or item.name.startswith('/'):
   raise SystemExit('Unsafe npm archive path')
  if item.isdir(): continue
  if not item.isfile() or item.name in rows: raise SystemExit('Non-file or duplicate npm entry')
  total+=item.size
  if len(rows)>=10000 or total>1024*1024*1024: raise SystemExit('Npm archive exceeds verification bounds')
  value=hashlib.sha256()
  stream=archive.extractfile(item)
  for chunk in iter(lambda: stream.read(1024*1024),b''): value.update(chunk)
  rows[item.name]={'sha256':value.hexdigest(),'bytes':item.size}
print(json.dumps(rows))`, tarball])) as Record<string, {sha256: string; bytes: number}>;
  const required = ['package.json', 'README.md', 'LICENSE', 'NOTICE', 'cordis.patch.yml', 'packs/classic/manifest.json', ...await filesUnder(root, 'lib'), ...await filesUnder(root, 'bin'), ...await filesUnder(root, 'skills/dsh-bigfish-pet-maker')];
  for (const relative of required) assert.ok(rows[`package/${relative}`], `Missing npm runtime/resource entry: ${relative}`);
  for (const [name, expected] of Object.entries(rows)) {
    const file = inside(root, name.slice('package/'.length));
    assert.equal((await lstat(file)).isFile(), true, `Unexpected package entry: ${name}`);
    assert.equal(await sha256(file), expected.sha256, `Package differs from current build/source: ${name}`);
  }
  return { packageSha256: await sha256(tarball), entries: Object.keys(rows).length };
}
export function verifySummary(command: string, raw: string) {
  const log = raw.replace(/\x1b\[[0-9;]*m/g, '');
  if (command === 'pnpm test') {
    assert.ok(/(?:#|ℹ)\s+tests\s+[1-9]\d*/.test(log), 'Missing full Node test summary');
    for (const name of ['fail', 'cancelled', 'skipped']) {
      const count = log.match(new RegExp(`(?:#|ℹ)\\s+${name}\\s+(\\d+)`));
      assert.equal(count?.[1], '0', `Node ${name} must be zero`);
    }
  }
  if (command === 'pnpm exec playwright test') {
    assert.ok(/^\s*[1-9]\d* passed\b/m.test(log), 'Missing full browser test summary');
    assert.doesNotMatch(log, /^\s*[1-9]\d* (?:failed|skipped|flaky|interrupted)\b/m, 'Full browser run must pass without repaired/partial counts');
  }
}
export async function checkRelease(root: string) {
  const receipt = JSON.parse(await readFile(inside(root, receiptPath), 'utf8')) as Receipt;
  const current = sourceIdentity(root);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.version, current.version, 'Receipt version is stale');
  assert.equal(receipt.sourceSha256, current.sourceSha256, 'Source changed since the complete checks; record a new receipt');
  assert.deepEqual(receipt.commands.map(proof => proof.command), commands, 'Receipt must contain the fixed complete checks');
  for (const proof of receipt.commands) {
    assert.equal(proof.exitCode, 0, `Failed gate: ${proof.command}`);
    assert.ok(proof.log.startsWith('artifacts/companion/release-'), 'Expected release log');
    const file = inside(root, proof.log);
    assert.equal(await sha256(file), proof.sha256, `Changed proof: ${proof.command}`);
    verifySummary(proof.command, await readFile(file, 'utf8'));
  }
  const artifact = await inspectPackage(root, current.version);
  assert.equal(receipt.packageSha256, artifact.packageSha256, 'The npm tarball changed after verification');
  return { ...current, ...artifact, automatedChecks: commands };
}
export async function recordRelease(root: string) {
  await mkdir(inside(root, 'artifacts/companion'), { recursive: true });
  await rm(inside(root, receiptPath), { force: true });
  const proofs: CommandProof[] = [];
  let builtSource: ReturnType<typeof sourceIdentity> | undefined;
  for (const [index, command] of commands.entries()) {
    console.log(`Running gate ${index + 1}/${commands.length}: ${command}`);
    const [executable, ...args] = command.split(' ');
    const result = spawnSync(process.platform === 'win32' ? `${executable}.cmd` : executable!, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    const log = `artifacts/companion/release-${index + 1}.log`, text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    await writeFile(inside(root, log), text);
    assert.equal(result.status, 0, `${command} failed; see ${log}`);
    verifySummary(command, text);
    proofs.push({ command, exitCode: 0, log, sha256: await sha256(inside(root, log)) });
    console.log(`Passed: ${command}`);
    if (command === 'pnpm build') builtSource = sourceIdentity(root);
  }
  const current = sourceIdentity(root);
  assert.equal(current.sourceSha256, builtSource?.sourceSha256, 'Source changed while tests ran');
  const artifact = await inspectPackage(root, current.version);
  await writeFile(inside(root, receiptPath), JSON.stringify({ schemaVersion: 1, recordedAt: new Date().toISOString(), ...current, ...artifact, commands: proofs }, null, 2) + '\n');
  return checkRelease(root);
}
export async function checkFormalRelease(root: string) {
  const evidence = JSON.parse(await readFile(inside(root, 'docs/plans/intelligent-pet/evidence/delivery.json'), 'utf8'));
  assert.ok(evidence.accepted === true && Array.isArray(evidence.remaining) && evidence.remaining.length === 0, `Formal all-capability release blocked: ${(evidence.remaining ?? ['delivery not accepted']).join('; ')}`);
  const verified = await checkRelease(root);
  python(root, [verifier, 'delivery']);
  const manifest = JSON.parse(await readFile(inside(root, 'artifacts/companion/delivery-manifest.json'), 'utf8'));
  assert.equal(manifest.sourceSha256, verified.sourceSha256, 'Delivery approvals are not bound to current source');
  for (const flag of ['complete', 'formalReleaseReady', 'signed', 'notarized', 'windowsRuntimeTested']) assert.equal(manifest[flag], true, `Missing formal/manual acceptance: ${flag}`);
  assert.deepEqual(manifest.formalAcceptanceRemaining, [], 'Formal/manual acceptance is incomplete');
  for (const name of ['ledger', 'quota', 'screenshot', 'tool-context']) {
    const report = JSON.parse(await readFile(inside(root, `artifacts/companion/${name}-native-smoke.json`), 'utf8'));
    assert.equal(report.packageSha256, verified.packageSha256, `Native ${name} did not test the final tarball`);
    assert.ok(report.checks?.length > 0, `Native ${name} proof missing`);
  }
  assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.some((row: {path: string}) => row.path.endsWith('.dmg')) && manifest.artifacts.some((row: {path: string}) => row.path.endsWith('.exe')), 'Final desktop artifacts are required');
  for (const artifact of manifest.artifacts) assert.equal(await sha256(inside(root, artifact.path)), artifact.sha256, `Changed delivery artifact: ${artifact.path}`);
  assert.equal(process.platform, 'darwin', 'Run final macOS signature/notarization validation on macOS');
  const desktop = JSON.parse(await readFile(inside(root, 'desktop/package.json'), 'utf8'));
  const app = inside(root, `desktop/dist/mac-arm64/${desktop.build.productName}.app`);
  const permission = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-desktop-permissions.ts', app], { cwd: root, encoding: 'utf8' });
  assert.equal(permission.status, 0, 'Final macOS Info.plist/entitlement validation failed');
  const metadata = JSON.parse(permission.stdout).packagedApp;
  for (const signed of [metadata.main, ...metadata.helpers]) {
    assert.equal(signed.signature, 'signed', 'Ad-hoc or unsigned output is not a formal distribution');
    for (const key of ['strictSignatureValid', 'hardenedRuntime', 'requiredEntitlementsPresent']) assert.equal(signed[key], true, `Missing effective macOS protection: ${key}`);
  }
  for (const [program, args] of [['spctl', ['--assess', '--type', 'execute', app]], ['xcrun', ['stapler', 'validate', app]]] as const) {
    const result = spawnSync(program, [...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, `Final macOS distribution validation failed: ${program}`);
  }
  return { ...verified, formalManualAcceptance: 'reviewed, source-bound declarations; not automated hardware measurements' };
}

async function publishPreview(root: string) {
  const {version} = sourceIdentity(root);
  assert.match(version, /^\d+\.\d+\.\d+-next\.[1-9]\d*$/, 'Web previews require a next prerelease version');
  const verified = await checkRelease(root);
  const native = JSON.parse(await readFile(inside(root, 'artifacts/companion/ledger-native-smoke.json'), 'utf8'));
  assert.equal(native.packageSha256, verified.packageSha256, 'The isolated DSH ledger smoke must test this tarball');
  assert.ok(Array.isArray(native.checks) && native.checks.length > 0, 'Missing isolated DSH ledger checks');
  const tarball = inside(root, `dist/dsh-bigfish-${version}.tgz`);
  const result = spawnSync('npm', ['publish', tarball, '--registry=https://registry.npmjs.org/', '--tag', 'next', '--access', 'public'], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
  });
  assert.equal(result.status, 0, result.error?.message ?? 'npm publish did not complete');
  return verified;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2] ?? 'check';
    assert.ok(['record', 'check', 'formal', 'fingerprint', 'publish-preview'].includes(mode), 'Use record, check, formal, fingerprint or publish-preview');
    const result = mode === 'record' ? await recordRelease(project) : mode === 'formal' ? await checkFormalRelease(project) :
      mode === 'fingerprint' ? sourceIdentity(project) : mode === 'publish-preview' ? await publishPreview(project) : await checkRelease(project);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release verification failed');
    process.exitCode = 1;
  }
}
