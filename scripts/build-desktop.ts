import './sync-companion-clips.js';
import {build} from 'esbuild';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
await mkdir('desktop/renderer',{recursive:true});
await build({entryPoints:['src/client/desktop.tsx'],outfile:'desktop/renderer/app.js',bundle:true,platform:'browser',format:'iife',target:'es2022',loader:{'.webp':'dataurl','.png':'dataurl','.css':'text','.dshpet':'binary'},define:{'process.env.NODE_ENV':'"production"'}});
await writeFile('desktop/renderer/index.html','<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' blob: data:; connect-src \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>大肥鱼</title></head><body><div id="root"></div><script src="app.js"></script></body></html>');

await copyFile('examples/bigfish-playful/thumbnail.png','desktop/renderer/icon.png');

await build({entryPoints:['src/companion/movement.ts'],outfile:'desktop/renderer/movement.mjs',bundle:true,format:'esm',platform:'neutral',target:'es2022'});
await build({entryPoints:['src/companion/activity-area.ts'],outfile:'desktop/renderer/activity-area.mjs',bundle:true,format:'esm',platform:'neutral',target:'es2022'});
await build({entryPoints:['src/companion/shared-preferences.ts'],outfile:'desktop/renderer/shared-preferences.mjs',bundle:true,format:'esm',platform:'neutral',target:'es2022'});
