import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {withStoreLock} from '../pet/store-lock.js';
export interface DesktopSettings {crossScreen:boolean;windowGeometry:boolean;alwaysOnTop:boolean;launchAtLogin:boolean}
export const desktopDefaults:DesktopSettings={crossScreen:false,windowGeometry:false,alwaysOnTop:true,launchAtLogin:false};
export function decodeDesktopSettings(value:unknown):DesktopSettings{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('桌面设置无效');const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!Object.hasOwn(desktopDefaults,k)))throw Error('未知桌面设置');
 for(const k of Object.keys(desktopDefaults))if(typeof v[k]!=='boolean')throw Error('桌面设置必须明确选择');
 return {...v} as unknown as DesktopSettings;
}
interface DesktopState {version:1;revision:number;settings:DesktopSettings;navigation:{id:string;session:string;expiresAt:number}|null}
export class DesktopSettingsStore {
 constructor(readonly directory=join(process.env.DSH_HOME??join(homedir(),'.dsh'),'pets','dsh-bigfish','desktop'),private now=Date.now){}
 private async load():Promise<DesktopState>{try{const v=JSON.parse(await readFile(join(this.directory,'state.json'),'utf8'));if(v.version!==1||!Number.isSafeInteger(v.revision))throw Error('桌面配置版本无效');v.settings=decodeDesktopSettings(v.settings);return v;}catch(e:any){if(e.code==='ENOENT')return {version:1,revision:0,settings:{...desktopDefaults},navigation:null};throw e;}}
 private change<T>(fn:(state:DesktopState)=>T){return withStoreLock(this.directory,async check=>{const state=await this.load(),result=fn(state),path=join(this.directory,randomUUID()+'.tmp');try{await writeFile(path,JSON.stringify(state),{mode:0o600});check();await rename(path,join(this.directory,'state.json'));}finally{await unlink(path).catch(()=>{});}return result;});}
 async snapshot(){const state=await this.load();return {...state,navigation:state.navigation&&state.navigation.expiresAt>this.now()?state.navigation:null};}
 configure(value:unknown,revision:unknown){const settings=decodeDesktopSettings(value);return this.change(s=>{if(s.revision!==revision)throw Error('桌面设置已在另一窗口更新，请刷新后重试');s.settings=settings;s.revision++;return s;});}
 navigate(session:unknown){if(typeof session!=='string'||!session||session.length>200)throw Error('会话无效');return this.change(s=>{s.navigation={id:randomUUID(),session,expiresAt:this.now()+120000};return s.navigation;});}
 claim(id:unknown){return this.change(s=>{if(!s.navigation||s.navigation.id!==id||s.navigation.expiresAt<=this.now())return null;const n=s.navigation;s.navigation=null;return n;});}
}
/** A separate Host namespace keeps desktop grants outside portable presets and role packs. */
export function installDesktopSettings(ctx:{inject(keys:string[],callback:(ctx:any)=>void):unknown},allowed:(session:string)=>Promise<boolean>,store=new DesktopSettingsStore()){
 ctx.inject(['connection'],c=>{c.effect(()=>c.connection.fetch.register({path:'/api/bigfish-desktop',methods:['GET','POST'],requestBody:'buffered',fetch:async(request:Request)=>{
  try{
   if(request.method==='GET')return Response.json(await store.snapshot(),{headers:{'cache-control':'no-store'}});
   const origin=request.headers.get('origin');if(request.headers.get('sec-fetch-site')==='cross-site')return new Response(null,{status:403});if(origin){const parsed=new URL(origin),authority=request.headers.get('host')??new URL(request.url).host;if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==origin||new URL(`${parsed.protocol}//${authority}`).origin!==parsed.origin)return new Response(null,{status:403});}
   if(!request.headers.get('content-type')?.startsWith('application/json'))return new Response(null,{status:415});
   if(Number(request.headers.get('content-length'))>16384)throw Error('桌面请求过大');const text=await request.text();if(Buffer.byteLength(text)>16384)throw Error('桌面请求过大');const b=JSON.parse(text);let result:unknown;
   if(b.op==='configure')result=await store.configure(b.settings,b.revision);
   else if(b.op==='navigate'){if(!await allowed(b.session))throw Error('只能打开当前 Host 已知的来源会话');result=await store.navigate(b.session);}
   else if(b.op==='claim')result=await store.claim(b.id);else throw Error('未知桌面操作');
   return Response.json({result},{headers:{'cache-control':'no-store'}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'桌面操作失败'},{status:400,headers:{'cache-control':'no-store'}});}
 }}),'bigfish desktop namespace');});
}
