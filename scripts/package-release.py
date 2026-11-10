"""Package allowlisted source and the independently installable maker Skill."""
import json
import re
import os
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
dist = root / 'dist'
skill = root / 'skills/dsh-bigfish-pet-maker'
skill_version_match = re.search(r'^  version: "([0-9]+\.[0-9]+\.[0-9]+)"$', (skill / 'SKILL.md').read_text(), re.MULTILINE)
if not skill_version_match:
    raise SystemExit('Skill metadata.version is missing')
skill_version = skill_version_match.group(1)
dist.mkdir(exist_ok=True)
with ZipFile(dist / f'dsh-bigfish-pet-maker-{skill_version}.zip', 'w', ZIP_DEFLATED) as archive:
    for file in sorted(skill.rglob('*')):
        if file.is_file() and not any(part.startswith('.') or part == '__pycache__' for part in file.relative_to(skill).parts):
            archive.write(file, 'dsh-bigfish-pet-maker/' + str(file.relative_to(skill)))
roots = ['bin', 'src', 'tests', 'browser-tests', 'scripts', 'docs', 'skills', 'examples', 'packs', 'assets/sprites', 'assets/intelligent-pet', 'desktop', '.github']
files = ['.gitignore', 'pnpm-workspace.yaml', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'tsconfig.build.json', 'playwright.config.ts', 'cordis.patch.yml', 'README.md', 'NOTICE', 'LICENSE']
def source_file(file):
    rel = file.relative_to(root)
    if not file.is_file() or file.is_symlink():
        return False
    if any(part in {'node_modules', '__pycache__', '.DS_Store'} for part in rel.parts):
        return False
    if rel.parts[0] == 'desktop' and len(rel.parts) > 1 and rel.parts[1] in {'dist', 'renderer'}:
        return False
    return not any(part.startswith('.') for part in rel.parts if part != '.github')
with ZipFile(dist / f'dsh-bigfish-source-{version}.zip', 'w', ZIP_DEFLATED) as archive:
    sources = [root / file for file in files]
    for folder in roots:
        for directory, dirs, names in os.walk(root / folder):
            dirs[:] = [name for name in dirs if name not in {'node_modules', '__pycache__'} and not name.startswith('.') and not (Path(directory) == root / 'desktop' and name in {'dist', 'renderer'})]
            sources.extend(Path(directory) / name for name in names)
    for file in sorted(set(sources)):
        rel = file.relative_to(root)
        if str(rel) in files or source_file(file):
            archive.write(file, 'dsh-bigfish/' + str(rel))
print(f'Packaged source {version} and dsh-bigfish-pet-maker {skill_version}')
