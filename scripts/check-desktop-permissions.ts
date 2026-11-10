import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const desktop = path.join(root, 'desktop');
const mainKeys = ['com.apple.security.cs.allow-jit', 'com.apple.security.device.audio-input', 'com.apple.security.automation.apple-events'];
const helperKeys = ['com.apple.security.cs.allow-jit', 'com.apple.security.device.audio-input'];
type Plist = Record<string, unknown>;
function plist(file: string): Plist {
  return JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', file], { encoding: 'utf8' })) as Plist;
}
function exactEntitlements(value: Plist, expected: string[]) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
  for (const key of expected) assert.equal(value[key], true, key);
}
function inspectSignature(bundle: string, expected: string[]) {
  const details = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], { encoding: 'utf8' });
  const signature = details.status !== 0 ? 'unsigned' : /Signature=adhoc|flags=.*adhoc/.test(details.stderr) ? 'ad-hoc' : 'signed';
  const embedded = spawnSync('/usr/bin/codesign', ['-d', '--entitlements', ':-', bundle], { encoding: 'utf8' });
  let entitlements: Plist | null = null;
  if (embedded.status === 0 && embedded.stdout.includes('<plist')) {
    entitlements = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: embedded.stdout, encoding: 'utf8' })) as Plist;
  }
  const verify = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { encoding: 'utf8' });
  const requiredEntitlementsPresent = entitlements !== null && expected.every((key) => entitlements![key] === true);
  const unexpectedEntitlements = entitlements === null ? [] : Object.keys(entitlements).filter((key) => !expected.includes(key));
  if (signature === 'signed') {
    assert.equal(verify.status, 0, 'The signed bundle must pass strict codesign verification');
    assert.equal(requiredEntitlementsPresent, true, 'The signed bundle must embed the configured permissions');
    assert.deepEqual(unexpectedEntitlements, [], 'Review any extra signed entitlement explicitly');
    assert.match(details.stderr, /flags=.*runtime/, 'The signed bundle must retain hardened runtime');
  }
  return {
    signature,
    strictSignatureValid: verify.status === 0,
    hardenedRuntime: /flags=.*runtime/.test(details.stderr),
    requiredEntitlementsPresent,
    unexpectedEntitlements,
    permissionRuntimeAcceptance: 'not-tested',
    note: signature === 'signed' ? 'Signature metadata checked; microphone consent, Automation consent and notarization still need separate acceptance.' : 'Unsigned or ad-hoc output cannot establish Developer ID permission behavior or distribution readiness.',
  };
}

assert.equal(process.platform, 'darwin', 'Run the macOS permission check on macOS');
const pkg = JSON.parse(await readFile(path.join(desktop, 'package.json'), 'utf8'));
const mac = pkg.build.mac;
assert.equal(mac.hardenedRuntime, true);
assert.equal(mac.entitlements, 'build/entitlements.mac.plist');
assert.equal(mac.entitlementsInherit, 'build/entitlements.mac.inherit.plist');
assert.equal(mac.darkModeSupport, true);
assert.match(mac.extendInfo.NSMicrophoneUsageDescription, /按住/);
assert.match(mac.extendInfo.NSMicrophoneUsageDescription, /你选择的转写服务/);
assert.match(mac.extendInfo.NSAppleEventsUsageDescription, /主动开启/);
assert.match(mac.extendInfo.NSAppleEventsUsageDescription, /不读取窗口标题、截图或内容/);
assert.equal('NSCameraUsageDescription' in mac.extendInfo, false);
assert.equal('NSScreenCaptureUsageDescription' in mac.extendInfo, false);
exactEntitlements(plist(path.join(desktop, mac.entitlements)), mainKeys);
exactEntitlements(plist(path.join(desktop, mac.entitlementsInherit)), helperKeys);

const report: Record<string, unknown> = {
  timestamp: new Date().toISOString(),
  version: pkg.version,
  sourceConfiguration: 'passed',
  mainEntitlements: mainKeys,
  inheritedEntitlements: helperKeys,
  packagedApp: 'not-checked; pass the final .app path as an argument',
};
const input = process.argv[2];
if (input) {
  const app = path.resolve(input);
  assert.equal(app.endsWith('.app'), true, 'Expected an existing macOS .app bundle');
  const info = plist(path.join(app, 'Contents/Info.plist'));
  assert.equal(info.CFBundleIdentifier, pkg.build.appId);
  assert.equal(info.CFBundleShortVersionString, pkg.version);
  for (const [key, value] of Object.entries(mac.extendInfo)) assert.equal(info[key], value, `Packaged ${key}`);
  assert.equal(info.NSRequiresAquaSystemAppearance, false);
  const frameworks = path.join(app, 'Contents/Frameworks');
  const helpers = (await readdir(frameworks)).filter((name) => name.includes(' Helper') && name.endsWith('.app'));
  assert.ok(helpers.length > 0, 'Expected Electron helper bundles');
  report.packagedApp = {
    path: app,
    infoPlist: 'passed',
    main: inspectSignature(app, mainKeys),
    helpers: helpers.map((name) => ({ name, ...inspectSignature(path.join(frameworks, name), helperKeys) })),
  };
}
await mkdir(path.join(root, 'artifacts/companion'), { recursive: true });
await writeFile(path.join(root, 'artifacts/companion/desktop-permissions.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
