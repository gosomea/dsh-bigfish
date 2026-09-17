import {builtinAssets} from '../src/contract/builtin-assets.js';
import {parsePet,encodePet} from '../src/pet/contract.js';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await rm('lib', { recursive: true, force: true });
const tsc = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);
await mkdir('lib', { recursive: true }); await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true, platform: 'node', format: 'esm', external: ['proper-lockfile'], target: 'node22', sourcemap: true });
await build({ entryPoints: ['src/client/plugin.tsx'], outfile: 'lib/client.js', bundle: true, platform: 'browser', format: 'cjs', target: 'es2022',
  loader: { '.png': 'dataurl', '.css': 'text' }, external: ['react', 'react/jsx-runtime'], minify: true,
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-bigfish",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' }, define: { 'process.env.NODE_ENV': '"production"' } });
await build({ entryPoints: ['src/client/demo.tsx'], outfile: 'dist/demo.js', bundle: true, platform: 'browser', format: 'iife', target: 'es2022',
  loader: { '.png': 'dataurl', '.css': 'text' }, minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
const js = (await readFile('dist/demo.js', 'utf8')).replaceAll('</script', '<\\/script');
await writeFile('dist/preview.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bigfish · 大肥鱼的工作室</title><style>body{margin:0}</style></head><body><div id="root"></div><script>${js}</script></body></html>`);
for (const name of builtinAssets) await cp(`assets/sprites/${name}`, `packs/classic/${name}`);
console.log('Built Host plugin, native Client module, declarations, scene pack and self-contained dist/preview.html');

await mkdir('skills/dsh-bigfish-pet-maker/references', {recursive:true});
await build({entryPoints:['src/pet/contract.ts'],outfile:'skills/dsh-bigfish-pet-maker/scripts/pet-core.mjs',bundle:true,platform:'neutral',format:'esm',target:'es2022'});
await cp('docs/pet-pack/spec.md','skills/dsh-bigfish-pet-maker/references/pack-spec.md');

for (const id of ['bigfish-adult']) {
  const files:Record<string,Uint8Array>={};
  for(const name of await readdir(`examples/${id}`))files[name]=new Uint8Array(await readFile(`examples/${id}/${name}`));
  const pet=parsePet(files);
  await writeFile(`dist/${id}-${pet.manifest.version}.dshpet`,encodePet(pet));
}
