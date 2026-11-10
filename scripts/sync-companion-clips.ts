import {readFile,access,writeFile} from 'node:fs/promises';
const rows=JSON.parse(await readFile('assets/intelligent-pet/catalog.json','utf8')) as {id:string;label:string;group:string;file:string;columns:number;rows:number;frames:number;frameMs:number;holdMs:number;loop:boolean;artAccepted:boolean}[];
const present=[];
for(const row of rows){try{await access(`assets/intelligent-pet/${row.file}`);let file=row.file;try{await access(`assets/intelligent-pet/${file.replace(/\.png$/,'.webp')}`);file=file.replace(/\.png$/,'.webp');}catch{}present.push({...row,file});}catch{/* Planned art never becomes a runtime animation. */}}
const imports=present.map((r,i)=>`import sheet${i} from '../../assets/intelligent-pet/${r.file}';`).join('\n');
await writeFile('src/client/companion-clips.ts',`${imports}\nexport const companionClips = ${JSON.stringify(present).replace(/"file":"[^"]+"/g,'"file":""')}.map((row,index)=>({...row,sheet:[${present.map((_,i)=>`sheet${i}`).join(',')}][index]!}));\nexport const companionClip=(id:string)=>companionClips.find(c=>c.id===id.replace(/^companion:/,''));\n`);
console.log(`Companion clips: ${present.length} generated sequences / ${rows.length} planned; art acceptance tracked separately.`);
