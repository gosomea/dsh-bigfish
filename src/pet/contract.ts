import {safePath,readZip,writeZip,MAX_ARCHIVE} from './archive.js';
export const PET_FORMAT_VERSION=1;
export const requiredRoles=['idle','working','attention','success','error'] as const;
export type Role=typeof requiredRoles[number];
export interface PetFrame {asset:string;rect:[number,number,number,number];durationMs:number;sign?:{x:number;y:number;width:number;height:number;angle:number}}
export interface PetAnimation {id:string;label:string;tags:string[];intensity:number;loop:boolean;weight:number;cooldownMs:number;frames:PetFrame[];speed:[number,number];scene?:string}
export interface PetManifest {format:'dsh-pet';formatVersion:1;id:string;name:string;version:string;author:string;description:string;canvas:{width:number;height:number};assets:Record<string,{path:string;width:number;height:number}>;thumbnail:string;animations:string;fallbacks:Record<Role,string>;dialogue?:string;scenes?:Record<string,{asset:string}>;capabilities:string[]}
export interface PetBundle {manifest:PetManifest;animations:PetAnimation[];dialogue:Record<string,string[]>;files:Record<string,Uint8Array>;warnings:string[]}
function object(v:any):Record<string,any>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('应为对象');return v;}
function str(v:any,max=160){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('文字字段无效');return v;}
function number(v:any,min:number,max:number){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('数值超出范围');return v;}
function id(v:any){const s=str(v,100);if(!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(s))throw Error('ID 无效');return s;}
function json(files:Record<string,Uint8Array>,path:string){if(!safePath(path)||!Object.hasOwn(files,path))throw Error(`缺少文件：${path}`);const b=files[path]!;if(b.length>4*1024*1024)throw Error('JSON 文件超过 4 MB');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}
export function imageSize(b:Uint8Array):{width:number;height:number} {
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.length>=24&&v.getUint32(0)===0x89504e47&&v.getUint32(4)===0x0d0a1a0a)return {width:v.getUint32(16),height:v.getUint32(20)};
 if(b.length>=30&&new TextDecoder().decode(b.subarray(0,4))==='RIFF'&&new TextDecoder().decode(b.subarray(8,12))==='WEBP'){
  const kind=new TextDecoder().decode(b.subarray(12,16));
  if(kind==='VP8X')return {width:1+b[24]!+(b[25]!<<8)+(b[26]!<<16),height:1+b[27]!+(b[28]!<<8)+(b[29]!<<16)};
  if(kind==='VP8 ')return {width:v.getUint16(26,true)&0x3fff,height:v.getUint16(28,true)&0x3fff};
  if(kind==='VP8L'&&b[20]===0x2f){const bits=v.getUint32(21,true);return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}
 }
 throw Error('只支持 PNG / WebP 图片');
}
export function parsePet(files:Record<string,Uint8Array>):PetBundle {
 const p=object(json(files,'pet.json')),warnings:string[]=[];
 if(p.format!=='dsh-pet'||p.formatVersion!==1)throw Error('不支持的角色包协议版本');
 id(p.id);if(p.id==='bigfish-classic')throw Error('此 ID 为内置角色保留');str(p.name,60);str(p.author??'',100);str(p.description??'',500);if(!/^\d+\.\d+\.\d+$/.test(p.version))throw Error('版本格式应为 x.y.z');
 object(p.canvas);number(p.canvas.width,32,2048);number(p.canvas.height,32,2048);
 const assets=object(p.assets);let pixels=0;
 if(!Object.keys(assets).length||Object.keys(assets).length>64)throw Error('需要 1–64 张图集');
 for(const [key,a]of Object.entries(assets)){id(key);object(a);if(!safePath(a.path)||!files[a.path]||! /\.(png|webp)$/i.test(a.path))throw Error('图片资源路径无效');const size=imageSize(files[a.path]!);number(a.width,1,8192);number(a.height,1,8192);if(size.width!==a.width||size.height!==a.height)throw Error(`图片尺寸不符：${a.path}`);pixels+=a.width*a.height;}
 if(pixels>32*1024*1024)throw Error('总解码像素超过 32 M');
 if(!files[p.thumbnail]||!safePath(p.thumbnail))throw Error('缺少缩略图');const thumb=imageSize(files[p.thumbnail]!);if(thumb.width*thumb.height>32*1024*1024)throw Error("缩略图尺寸超限");
 if(!Array.isArray(p.capabilities)||p.capabilities.some((c:any)=>!['sign','air-swing','scenes','look'].includes(c)))throw Error('不支持的必要能力');
 const raw=json(files,str(p.animations)),animations:PetAnimation[]=[],ids=new Set<string>();let frames=0;
 if(!Array.isArray(raw)||!raw.length||raw.length>2048)throw Error('动画数量应为 1–2048');
 for(const value of raw){const a=object(value);id(a.id);if(ids.has(a.id))throw Error('动作 ID 重复');ids.add(a.id);str(a.label,80);
  if(!Array.isArray(a.tags)||!a.tags.length||a.tags.length>32)throw Error('缺少动作用途标签');a.tags.forEach(id);number(a.intensity,0,2);if(!Number.isInteger(a.intensity)||typeof a.loop!=='boolean')throw Error('动作强度或循环方式无效');
  number(a.weight,0.01,100);number(a.cooldownMs,0,3600000);
  if(!Array.isArray(a.frames)||!a.frames.length||a.frames.length>512||(frames+=a.frames.length)>32768)throw Error('动画帧数量超限');
  for(const f of a.frames){object(f);const asset=assets[f.asset];if(!Object.hasOwn(assets,f.asset)||!asset||!Array.isArray(f.rect)||f.rect.length!==4)throw Error('帧资源或矩形无效');const [x,y,w,h]=f.rect;number(x,0,asset.width);number(y,0,asset.height);number(w,1,asset.width);number(h,1,asset.height);if(x+w>asset.width||y+h>asset.height)throw Error('帧超出图集');if(w!==p.canvas.width||h!==p.canvas.height)throw Error('每帧尺寸必须等于角色逻辑画布（制作时先对齐）');number(f.durationMs,16,10000);
   if(f.sign){const s=object(f.sign);number(s.x,0,w);number(s.y,0,h);number(s.width,1,w);number(s.height,1,h);number(s.angle,-45,45);if(s.x+s.width>w||s.y+s.height>h)throw Error('牌面超出画布');}
  }
  if(!a.speed)a.speed=[1,1];if(!Array.isArray(a.speed)||a.speed.length!==2)throw Error('速度范围无效');number(a.speed[0],.5,2);number(a.speed[1],a.speed[0],2);
  if(a.scene&&(!p.scenes||!Object.hasOwn(p.scenes,a.scene)))throw Error('动作引用的场景不存在');animations.push(a as PetAnimation);
 }
 object(p.fallbacks);for(const role of requiredRoles){const a=animations.find(a=>a.id===p.fallbacks[role]);if(!a||!a.tags.includes(role))throw Error(`缺少 ${role} 基础动作映射`);if(a.intensity!==0)throw Error(`基础动作 ${role} 必须支持轻柔模式`);}
 if(p.scenes)for(const [key,s]of Object.entries(object(p.scenes))){id(key);if(!Object.hasOwn(assets,object(s).asset))throw Error('场景资源不存在');}
 const dialogue=p.dialogue?object(json(files,str(p.dialogue))):{};
 for(const [key,lines]of Object.entries(dialogue)){id(key);if(!Array.isArray(lines)||lines.length>30||lines.some((s:any)=>typeof s!=='string'||!s.trim()||s.length>160||/\{(?!task\}|tool\}|file\}|elapsed\}|activeCount\}|completedCount\})[^}]*\}/.test(s)))throw Error('角色台词格式无效');}
 if(p.capabilities.includes('air-swing')&&!animations.some(a=>a.tags.includes('near-miss')))throw Error('空挥互动需要 near-miss 反应动画');
 if(p.capabilities.includes('sign')&&!animations.some(a=>a.frames.some(f=>f.sign)))throw Error('举牌能力需要牌面锚点');
 const optional=['read','search','edit','test','greeting'];for(const tag of optional)if(!animations.some(a=>a.tags.includes(tag)))warnings.push(`${tag} 使用基础动作回退`);
 return {manifest:p as PetManifest,animations,dialogue:dialogue as Record<string,string[]>,files,warnings};
}
/** Codex v1/v2 adapter: imported atlas stays byte-identical; only metadata is generated. */
export function convertCodex(files:Record<string,Uint8Array>):Record<string,Uint8Array> {
 const p=object(json(files,'pet.json'));if(p.format==='dsh-pet')return files;
 const version=p.spriteVersionNumber??1;if(![1,2].includes(version))throw Error('未知 Codex 宠物版本');
 const path=str(p.spritesheetPath);if(!safePath(path)||!files[path])throw Error('缺少 Codex 图集');const size=imageSize(files[path]!);
 if(size.width!==1536||size.height!==(version===2?2288:1872))throw Error('Codex 图集尺寸不匹配');
 const rows=[['idle',6,'idle'],['drag-right',8,'drag-right'],['drag-left',8,'drag-left'],['wave',4,'greeting'],['jump',5,'success'],['failed',8,'error'],['waiting',6,'attention'],['work',6,'working'],['review',6,'thinking']] as const;
 const animations:PetAnimation[]=rows.map(([name,count,tag],row)=>({id:name,label:name,tags:[tag],intensity:['idle','jump','failed','waiting','work'].includes(name)?0:1,loop:['idle','work','review'].includes(name),weight:1,cooldownMs:0,speed:[1,1],frames:Array.from({length:count},(_,col)=>({asset:'main',rect:[col*192,row*208,192,208],durationMs:col===count-1?280:140}))}));
 if(version===2)for(let i=0;i<16;i++)animations.push({id:`look-${i}`,label:`视线 ${i*22.5}°`,tags:[`look-${i}`],intensity:0,loop:true,weight:1,cooldownMs:0,speed:[1,1],frames:[{asset:'main',rect:[i%8*192,(9+Math.floor(i/8))*208,192,208],durationMs:1000}]});
 const pet={format:'dsh-pet',formatVersion:1,id:'codex-'+String(p.id??'imported').replace(/[^a-zA-Z0-9_.-]/g,'-').slice(0,70),name:p.displayName??'Codex 宠物',version:'1.0.0',author:'Imported',description:p.description||'从 Codex 图集导入',canvas:{width:192,height:208},assets:{main:{path,width:size.width,height:size.height}},thumbnail:path,animations:'animations.json',fallbacks:{idle:'idle',working:'work',attention:'waiting',success:'jump',error:'failed'},capabilities:version===2?['look']:[]};
 const encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));return {...files,'pet.json':encode(pet),'animations.json':encode(animations)};
}
export async function decodePet(bytes:Uint8Array):Promise<PetBundle>{return parsePet(convertCodex(await readZip(bytes)));}
export const encodePet=(pet:PetBundle)=>{const bytes=writeZip(pet.files);if(bytes.length>MAX_ARCHIVE)throw Error('标准化后的角色包超过 32 MB，请减小素材');return bytes;};
