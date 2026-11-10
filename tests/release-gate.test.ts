import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkRelease, checkFormalRelease, inspectPackage, recordRelease, sha256, sourceIdentity, verifySummary } from '../scripts/release-gate.js';

const root = process.cwd();
async function put(directory: string, name: string, value: string) {
  const file = path.join(directory, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
}
async function temporary(action: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'bigfish-release-'));
  try { await action(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
function python(directory: string, args: string[]) {
  return spawnSync('python3', args, { cwd: directory, encoding: 'utf8' });
}
async function fixture(directory: string) {
  for (const name of ['package.json', 'README.md', 'LICENSE', 'NOTICE', 'cordis.patch.yml', 'packs/classic/manifest.json', 'lib/index.js', 'bin/dsh-bigfish.mjs', 'skills/dsh-bigfish-pet-maker/SKILL.md', 'src/index.ts']) {
    await put(directory, name, name === 'package.json' ? '{"version":"0.7.0-dev.0"}' : 'fixture ' + name);
  }
  await put(directory, 'docs/plans/intelligent-pet/verify.py', await readFile(path.join(root, 'docs/plans/intelligent-pet/verify.py'), 'utf8'));
}
async function archive(directory: string, omit = '') {
  await mkdir(path.join(directory, 'dist'), { recursive: true });
  const result = python(directory, ['-c', `import tarfile,pathlib,sys
with tarfile.open('dist/dsh-bigfish-0.7.0-dev.0.tgz','w:gz') as output:
 for file in sorted(pathlib.Path('.').rglob('*')):
  if file.is_file() and file.parts[0] not in {'dist','artifacts','docs'} and str(file)!=sys.argv[1]:
   output.add(file,arcname='package/'+str(file))`, omit]);
  assert.equal(result.status, 0, result.stderr);
}
async function receipt(directory: string, browser = '52 passed (10m)') {
  const names = ['pnpm check', 'pnpm build', 'pnpm test', 'pnpm exec playwright test', 'npm pack --ignore-scripts --pack-destination dist'];
  const outputs = ['tsc passed', 'build passed', 'ℹ tests 306\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0', browser, 'created package'];
  const proofs = [];
  for (const [index, command] of names.entries()) {
    const log = `artifacts/companion/release-${index + 1}.log`;
    await put(directory, log, outputs[index]!);
    proofs.push({ command, exitCode: 0, log, sha256: await sha256(path.join(directory, log)) });
  }
  await put(directory, 'artifacts/companion/release-receipt.json', JSON.stringify({ schemaVersion: 1, ...sourceIdentity(directory), ...await inspectPackage(directory, '0.7.0-dev.0'), commands: proofs }));
}

test('source archive carries actual desktop and new artwork inputs but omits local dependencies, output and private files', () => temporary(async directory => {
  const files = ['.gitignore', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'tsconfig.json', 'tsconfig.build.json', 'playwright.config.ts', 'cordis.patch.yml', 'README.md', 'NOTICE', 'LICENSE'];
  for (const name of files) await put(directory, name, 'fixture');
  await put(directory, 'package.json', '{"version":"0.7.0-dev.0"}');
  await put(directory, 'skills/dsh-bigfish-pet-maker/SKILL.md', '---\nmetadata:\n  version: "1.2.3"\n---');
  const needed = ['desktop/main.mjs', 'desktop/geometry.d.mts', 'desktop/build/entitlements.mac.plist', 'desktop/package.json', 'assets/intelligent-pet/catalog.json', 'assets/intelligent-pet/scenes/sea.webp', '.github/workflows/verify.yml', 'bin/dsh-bigfish.mjs'];
  const excluded = ['desktop/node_modules/electron/binary', 'desktop/dist/old.dmg', 'desktop/renderer/app.js', 'desktop/.env', 'assets/references/private.png'];
  for (const name of [...needed, ...excluded]) await put(directory, name, name);
  await put(directory, 'scripts/package-release.py', await readFile(path.join(root, 'scripts/package-release.py'), 'utf8'));
  const packaged = python(directory, ['scripts/package-release.py']);
  assert.equal(packaged.status, 0, packaged.stderr);
  const listed = python(directory, ['-c', 'import zipfile,json; print(json.dumps(zipfile.ZipFile("dist/dsh-bigfish-source-0.7.0-dev.0.zip").namelist()))']);
  const names = JSON.parse(listed.stdout) as string[];
  for (const name of needed) assert.ok(names.includes('dsh-bigfish/' + name), name);
  for (const name of excluded) assert.ok(!names.includes('dsh-bigfish/' + name), name);
  assert.ok((await readFile(path.join(directory, 'dist/dsh-bigfish-pet-maker-1.2.3.zip'))).length > 0);
}));

test('a tarball must match the current build and contain every required runtime file', () => temporary(async directory => {
  await fixture(directory); await archive(directory);
  assert.ok((await inspectPackage(directory, '0.7.0-dev.0')).entries > 0);
  await put(directory, 'lib/index.js', 'new build');
  await assert.rejects(inspectPackage(directory, '0.7.0-dev.0'), /differs from current/);
  await archive(directory, 'lib/index.js');
  await assert.rejects(inspectPackage(directory, '0.7.0-dev.0'), /Missing npm runtime/);
}));

test('a passing receipt becomes invalid when source, test proof or the tarball changes', () => temporary(async directory => {
  await fixture(directory); await archive(directory); await receipt(directory);
  await checkRelease(directory);
  await put(directory, 'src/index.ts', 'new runtime source');
  await assert.rejects(checkRelease(directory), /Source changed/);
  await put(directory, 'src/index.ts', 'fixture src/index.ts');
  await put(directory, 'artifacts/companion/release-4.log', '1 failed');
  await assert.rejects(checkRelease(directory), /Changed proof/);
  await receipt(directory);
  await writeFile(path.join(directory, 'dist/dsh-bigfish-0.7.0-dev.0.tgz'), 'not the verified package');
  await assert.rejects(checkRelease(directory));
}));

test('one complete browser pass and no skipped Node cases are required; repairs are not added to a failed full run', () => {
  verifySummary('pnpm exec playwright test', '52 passed (11m)');
  assert.throws(() => verifySummary('pnpm exec playwright test', '3 failed\n49 passed\n5 passed'), /Full browser/);
  assert.throws(() => verifySummary('pnpm exec playwright test', '2 skipped\n50 passed'), /Full browser/);
  assert.throws(() => verifySummary('pnpm test', 'ℹ tests 306\nℹ fail 0\nℹ cancelled 0\nℹ skipped 1'), /skipped/);
});

test('phase acceptance checks immutable source, exact package and proof hashes, rather than an accepted checkbox', () => temporary(async directory => {
  await fixture(directory); await archive(directory);
  const evidence = 'docs/plans/intelligent-pet/evidence';
  await put(directory, 'artifacts/proof.log', 'actual proof');
  const packageSha = await sha256(path.join(directory, 'dist/dsh-bigfish-0.7.0-dev.0.tgz'));
  await put(directory, `${evidence}/snapshot.json`, JSON.stringify({ ...sourceIdentity(directory), testedPackageSha256: packageSha, proofFiles: [{ path: 'artifacts/proof.log', sha256: await sha256(path.join(directory, 'artifacts/proof.log')) }] }));
  await put(directory, `${evidence}/foundation.json`, JSON.stringify({ phase: 'foundation', accepted: true, remaining: [], checks: ['reviewed'], snapshot: 'snapshot.json', testedPackageSha256: packageSha }));
  assert.equal(python(directory, ['docs/plans/intelligent-pet/verify.py', 'foundation']).status, 0);
  await put(directory, 'src/index.ts', 'unreviewed new code');
  const stale = python(directory, ['docs/plans/intelligent-pet/verify.py', 'foundation']);
  assert.notEqual(stale.status, 0); assert.match(stale.stderr, /当前源码/);
}));

test('formal omnipotent release refuses current missing hardware and signature acceptance before any publish work', () => temporary(async directory => {
  await put(directory, 'docs/plans/intelligent-pet/evidence/delivery.json', JSON.stringify({ accepted: false, remaining: ['Windows real-device installation', 'Developer ID signature and notarization'] }));
  await assert.rejects(checkFormalRelease(directory), /Formal all-capability release blocked.*Windows.*signature/);
}));

test('a newly failing verification deletes the old receipt and cannot retain a previous pass', () => temporary(async directory => {
  await fixture(directory); await archive(directory); await receipt(directory);
  const executable = process.platform === 'win32' ? 'tools/pnpm.cmd' : 'tools/pnpm';
  await put(directory, executable, process.platform === 'win32' ? '@echo off\r\nif "%1"=="test" exit /b 1\r\necho passing fixture\r\n' : '#!/bin/sh\nif [ "$1" = test ]; then echo "failing fixture"; exit 1; fi\necho "passing fixture"\n');
  if (process.platform !== 'win32') await chmod(path.join(directory, executable), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = path.join(directory, 'tools') + path.delimiter + previous;
  try {
    await assert.rejects(recordRelease(directory), /pnpm test failed/);
    await assert.rejects(readFile(path.join(directory, 'artifacts/companion/release-receipt.json')), { code: 'ENOENT' });
  } finally {
    if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous;
  }
}));
