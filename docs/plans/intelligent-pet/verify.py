"""Check reviewed phase evidence against the current source, package and proof bytes."""
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIRS = ('bin', 'src', 'tests', 'browser-tests', 'scripts', 'skills', 'examples', 'packs', 'assets', 'desktop', 'docs', '.github')
SOURCE_FILES = ('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.build.json', 'playwright.config.ts', 'cordis.patch.yml', 'README.md', 'LICENSE', 'NOTICE', '.gitignore')

def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()

def source_fingerprint(root):
    files = {root / name for name in SOURCE_FILES if (root / name).is_file()}
    for folder in SOURCE_DIRS:
        for directory, dirs, names in os.walk(root / folder):
            rel = Path(directory).relative_to(root).as_posix()
            dirs[:] = [name for name in dirs if name not in {'node_modules', '__pycache__'} and not name.startswith('.') and not (rel == 'desktop' and name in {'renderer', 'dist'}) and not (rel == 'docs' and name == 'plans') and not (rel == 'assets' and name == 'references')]
            for name in names:
                file = Path(directory) / name
                if not name.startswith('.') and not file.is_symlink() and file.is_file():
                    files.add(file)
    # The verifier itself affects what constitutes valid evidence; receipts live outside source.
    verifier = root / 'docs/plans/intelligent-pet/verify.py'
    if verifier.is_file():
        files.add(verifier)
    value = hashlib.sha256()
    for file in sorted(files, key=lambda file: file.relative_to(root).as_posix()):
        value.update((file.relative_to(root).as_posix() + '\0' + digest(file) + '\n').encode())
    return {'version': json.loads((root / 'package.json').read_text())['version'], 'sourceSha256': value.hexdigest(), 'sourceFiles': len(files)}

def inside(root, relative):
    file = (root / relative).resolve()
    if not file.is_relative_to(root.resolve()):
        raise ValueError('Evidence path escapes the project')
    return file

def verify_phase(root, phase):
    if phase not in {'foundation', 'intelligence', 'desktop', 'life', 'perception', 'delivery'}:
        raise ValueError('Unknown phase')
    folder = root / 'docs/plans/intelligent-pet/evidence'
    evidence = json.loads((folder / f'{phase}.json').read_text())
    if evidence.get('phase') != phase or evidence.get('accepted') is not True or not evidence.get('checks') or evidence.get('remaining'):
        raise ValueError(f'{phase}: 仍有未完成验收')
    snapshot_name = evidence.get('snapshot')
    if not isinstance(snapshot_name, str) or Path(snapshot_name).name != snapshot_name:
        raise ValueError(f'{phase}: 缺少有效验收快照')
    snapshot = json.loads((folder / snapshot_name).read_text())
    current = source_fingerprint(root)
    if snapshot.get('version') != current['version'] or snapshot.get('sourceSha256') != current['sourceSha256']:
        raise ValueError(f'{phase}: 验收快照未绑定当前源码，请重新执行门禁；旧回执不代表当前代码通过')
    package = root / 'dist' / f'dsh-bigfish-{current["version"]}.tgz'
    package_sha = digest(package)
    if snapshot.get('testedPackageSha256') != package_sha or evidence.get('testedPackageSha256') != package_sha:
        raise ValueError(f'{phase}: 验收安装包与当前产物不一致')
    proofs = snapshot.get('proofFiles')
    if not isinstance(proofs, list) or not proofs:
        raise ValueError(f'{phase}: 缺少带哈希的实际验证记录')
    for proof in proofs:
        if digest(inside(root, proof['path'])) != proof.get('sha256'):
            raise ValueError(f'{phase}: 验证记录已变化: {proof["path"]}')
    if phase == 'delivery' and (snapshot.get('formalReleaseAccepted') is not True or snapshot.get('remaining')):
        raise ValueError('delivery: 正式发行的硬件、权限或签名人工验收尚未完成')
    return evidence

if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Usage: verify.py <phase|--fingerprint>')
        result = source_fingerprint(ROOT) if sys.argv[1] == '--fingerprint' else verify_phase(ROOT, sys.argv[1])
        print(json.dumps(result, ensure_ascii=False))
    except (ValueError, KeyError, OSError) as error:
        raise SystemExit(str(error))
