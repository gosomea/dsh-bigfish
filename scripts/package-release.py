"""Package allowlisted source and the independently installable maker Skill."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
dist = root / 'dist'
skill = root / 'skills/dsh-bigfish-pet-maker'
with ZipFile(dist / 'dsh-bigfish-pet-maker-1.0.2.zip', 'w', ZIP_DEFLATED) as archive:
    for file in sorted(skill.rglob('*')):
        if file.is_file() and not any(part.startswith('.') or part == '__pycache__' for part in file.relative_to(skill).parts):
            archive.write(file, 'dsh-bigfish-pet-maker/' + str(file.relative_to(skill)))
roots = ['bin', 'src', 'tests', 'browser-tests', 'scripts', 'docs', 'skills', 'examples', 'packs', 'assets/sprites']
files = ['.gitignore', 'pnpm-workspace.yaml', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'tsconfig.build.json', 'playwright.config.ts', 'cordis.patch.yml', 'README.md', 'NOTICE', 'LICENSE']
with ZipFile(dist / f'dsh-bigfish-source-{version}.zip', 'w', ZIP_DEFLATED) as archive:
    sources = [root / file for file in files]
    for folder in roots:
        sources.extend((root / folder).rglob('*'))
    for file in sorted(set(sources)):
        rel = file.relative_to(root)
        if file.is_file() and (str(rel) in files or not any(part.startswith('.') or part == '__pycache__' for part in rel.parts)):
            archive.write(file, 'dsh-bigfish/' + str(rel))
print(f'Packaged source {version} and dsh-bigfish-pet-maker 1.0.2')
