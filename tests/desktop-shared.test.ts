import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DesktopSettingsStore,desktopDefaults,decodeDesktopSettings,installDesktopSettings} from '../src/companion/desktop-settings.js';
import {validateSharedPreferenceOps} from '../src/companion/shared-preferences.js';
import {preferenceDefaults} from '../src/contract/preferences.js';
import {DesktopPreferenceScope} from '../src/client/desktop-preferences.js';
import {PreferenceStore} from '../src/client/preferences-store.js';
import {readPreferences,petQuery} from '../desktop/host-api.mjs';
import type {DesktopBridge} from '../src/client/desktop-bridge.js';
async function storeCase(fn:(s:DesktopSettingsStore,advance:(n:number)=>void)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'bf-desktop-'));let now=1000;try{await fn(new DesktopSettingsStore(dir,()=>now),n=>{now+=n;});}finally{await rm(dir,{recursive:true,force:true});}}
test('desktop grants are independent, fail closed and revision fenced across clients',()=>storeCase(async s=>{
 assert.deepEqual((await s.snapshot()).settings,desktopDefaults);
 const changed={...desktopDefaults,crossScreen:true};await s.configure(changed,0);
 await assert.rejects(s.configure({...changed,windowGeometry:true},0),/另一窗口/);assert.equal((await s.snapshot()).settings.windowGeometry,false);
 assert.throws(()=>decodeDesktopSettings({...desktopDefaults,enabled:true}),/未知/);assert.throws(()=>decodeDesktopSettings({crossScreen:true}),/明确/);
 assert.deepEqual((await new DesktopSettingsStore(s.directory).snapshot()).settings,changed);
}));
test('desktop navigation is one expiring intent, atomically claimed without executing a task',()=>storeCase(async(s,advance)=>{
 const n=await s.navigate('source');const results=await Promise.all([s.claim(n.id),s.claim(n.id)]);assert.equal(results.filter(Boolean).length,1);assert.equal((await s.snapshot()).navigation,null);
 await s.navigate('expired');advance(120001);assert.equal((await s.snapshot()).navigation,null);assert.equal(await s.claim('wrong'),null);
}));
test('shared appearance mutations validate the full result and cannot write intelligence, credentials or desktop grants',()=>{
 assert.deepEqual(validateSharedPreferenceOps(preferenceDefaults,[{op:'set',path:['size'],value:220}]),[{op:'set',path:['size'],value:220}]);
 for(const key of ['policy','dailyTokens','enabledIntelligence','apiKey','windowGeometry','crossScreen'])assert.throws(()=>validateSharedPreferenceOps(preferenceDefaults,[{op:'set',path:[key],value:true}]),/只允许/);
 assert.throws(()=>validateSharedPreferenceOps(preferenceDefaults,[{op:'set',path:['size'],value:10000}]),/range/);
 assert.throws(()=>validateSharedPreferenceOps(preferenceDefaults,[{op:'set',path:['lifestyleJson'],value:'{"preset":"all","policy":{"enabled":true}}'}]));
});
test('desktop PreferenceScope publishes only Host-confirmed writes; disconnect is read-only and stale revisions refuse',async()=>{
 let value={...preferenceDefaults},revision=1,offline=false;
 const bridge={preferences:async()=>{if(offline)throw Error('offline');return {status:'ready',mode:'host' as const,writable:true,revision,value};},mutatePreferences:async(ops:any[],expected:number)=>{if(expected!==revision)throw Error('conflict');for(const op of ops)value={...value,[op.path[0]]:op.value};revision++;return {status:'ready',mode:'host' as const,writable:true,revision,value};}} as unknown as DesktopBridge;
 const scope=new DesktopPreferenceScope(bridge),prefs=new PreferenceStore(scope,null);
 try{await scope.refresh();await prefs.update({size:230});assert.equal(prefs.getSnapshot().value.size,230);assert.equal(prefs.getSnapshot().persistence,'host');revision++;await assert.rejects(prefs.update({opacity:.5}),/conflict/);assert.equal(prefs.getSnapshot().value.opacity,1);offline=true;await scope.refresh();await assert.rejects(prefs.update({size:240}),/Read-only/);assert.equal(prefs.getSnapshot().value.size,230);}finally{prefs.dispose();scope.dispose();}
});
test('switching Hosts discards an older pending preference read instead of restoring its value',async()=>{
 const pending:((value:any)=>void)[]=[],scope=new DesktopPreferenceScope({preferences:()=>new Promise(resolve=>pending.push(resolve))} as unknown as DesktopBridge);
 try{const first=scope.refresh();scope.reset();const second=scope.refresh();pending[1]!({status:'ready',writable:true,revision:1,value:{...preferenceDefaults,size:210}});await second;pending[0]!({status:'ready',writable:true,revision:1,value:{...preferenceDefaults,size:290}});await first;assert.equal((scope.getSnapshot().value as {size:number}).size,210);}finally{scope.dispose();}
});
test('desktop reads only the bigfish namespace and restricts role-library paths and payload ceilings',async()=>{
 const transport=(async(_url:URL|RequestInfo,init?:RequestInit)=>{assert.equal(JSON.parse(String(init?.body)).method,'settings/describe');return Response.json({result:{ok:true,value:{writable:true,namespaces:[{ns:'secret',value:{key:'must-not-return'}},{ns:'bigfish',revision:3,value:preferenceDefaults}]}}});}) as typeof fetch;
 const state=await readPreferences({url:'http://localhost:1',cookie:'dsh-auth-test=safe'},transport);assert.equal(state.revision,3);assert.doesNotMatch(JSON.stringify(state),/must-not-return/);
 assert.equal(petQuery('?op=select&key=pet%401.0'),'/api/bigfish-pets?op=select&key=pet%401.0');
 for(const query of ['https://evil/','?op=execute','?key=x&key=y','?url=https://evil'])assert.throws(()=>petQuery(query));assert.throws(()=>petQuery('?op=import',new Uint8Array(32*1024*1024+1)));
});
test('Host desktop route rejects foreign origins and unknown source sessions',()=>storeCase(async s=>{
 let fetch!:(request:Request)=>Promise<Response>;
 installDesktopSettings({inject(_keys,cb){cb({effect:(fn:()=>void)=>fn(),connection:{fetch:{register:(r:{fetch:typeof fetch})=>{fetch=r.fetch;return()=>{};}}}});}},async session=>session==='known',s);
 const request=(op:unknown,origin='http://localhost:1')=>new Request('http://dsh.internal/api/bigfish-desktop',{method:'POST',headers:{'content-type':'application/json',host:'localhost:1',origin},body:JSON.stringify(op)});
 assert.equal((await fetch(request({op:'navigate',session:'known'},'http://evil.invalid'))).status,403);
 assert.equal((await fetch(request({op:'navigate',session:'unknown'}))).status,400);assert.equal((await fetch(request({op:'navigate',session:'known'}))).status,200);assert.equal((await s.snapshot()).navigation?.session,'known');
}));
