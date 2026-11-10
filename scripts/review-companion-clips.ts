import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const catalog=JSON.parse(await readFile('assets/intelligent-pet/catalog.json','utf8')) as {id:string;label:string}[];
const figures=[];
for(const row of catalog){const bytes=await readFile(`artifacts/companion/clips/${row.id}-light.png`);figures.push(`<figure><figcaption>${row.label} · ${row.id}</figcaption><img src="data:image/png;base64,${bytes.toString('base64')}"/></figure>`);}
const html=`<!doctype html><html lang="zh"><meta charset="utf-8"><title>32段基础动作 · 实际浏览器截帧</title><style>body{font:14px system-ui;background:#edf2fb;color:#21324b;margin:20px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;background:white;border-radius:12px;overflow:hidden}figcaption{padding:10px}img{width:100%;display:block}h1{font-size:22px}</style><h1>32段基础动作 · 实际浏览器截帧</h1><p>来源为行走循环代表帧与其余单次序列的末帧截图；播放与最终美术验收分别记录。</p><main>${figures.join('')}</main></html>`;
await mkdir('artifacts/companion',{recursive:true});await writeFile('artifacts/companion/animation-gallery.html',html);
const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.setContent(html);await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>(image as HTMLImageElement).decode())));await page.screenshot({path:'artifacts/companion/runtime-32-contact.png',fullPage:true});}finally{await browser.close();}
