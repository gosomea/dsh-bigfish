import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restoreBackup,choreographyKey,type RestorePlan} from '../src/client/restore-backup.js';
import {PreferenceStore} from '../src/client/preferences-store.js';
import {preferenceDefaults} from '../src/contract/preferences.js';
class Memory implements Storage {
 map=new Map<string,string>();get length(){return this.map.size;}clear(){this.map.clear();}
 getItem(k:string){return this.map.get(k)??null;}key(i:number){return [...this.map.keys()][i]??null;}
 removeItem(k:string){this.map.delete(k);}setItem(k:string,v:string){this.map.set(k,v);}
}
function fixture(){
 const storage=new Memory(),preferences=new PreferenceStore(null,storage);
 const plan:RestorePlan={bytes:new Uint8Array(),revision:'preview-revision',before:JSON.stringify(preferences.getSnapshot().value),data:{selected:null,revision:'source',packs:[],pets:[],choreography:null,preferences:{...preferenceDefaults,whipEnabled:false}}};
 storage.setItem(choreographyKey,'previous choreography');return {storage,preferences,plan};
}
test('successful restore commits roles after preferences and browser choreography',async()=>{
 const {storage,preferences,plan}=fixture();let calls=0;
 await restoreBackup(plan,preferences,storage,{restore:async(bytes,revision)=>{calls++;assert.equal(bytes,plan.bytes);assert.equal(revision,'preview-revision');assert.equal(storage.getItem(choreographyKey),null);assert.equal(preferences.getSnapshot().value.whipEnabled,false);}});
 assert.equal(calls,1);assert.equal(preferences.getSnapshot().value.whipEnabled,false);
});
test('catalog conflict rolls back preferences and choreography',async()=>{
 const {storage,preferences,plan}=fixture();await assert.rejects(restoreBackup(plan,preferences,storage,{restore:async()=>{throw Error('目录冲突');}}),/目录冲突.*此前/);
 assert.equal(preferences.getSnapshot().value.whipEnabled,true);assert.equal(storage.getItem(choreographyKey),'previous choreography');
});
test('rollback preserves newer preferences and choreography written by another window',async()=>{
 const {storage,preferences,plan}=fixture();await assert.rejects(restoreBackup(plan,preferences,storage,{restore:async()=>{
  storage.setItem(choreographyKey,'newer choreography');await preferences.update({size:230});throw Error('连接失败');
 }}),/未能回滚 动作编排、偏好/);
 assert.equal(storage.getItem(choreographyKey),'newer choreography');assert.equal(preferences.getSnapshot().value.size,230);
});
test('local storage failure restores preferences without attempting role commit',async()=>{
 const {storage,preferences,plan}=fixture();storage.removeItem=()=>{throw Error('storage blocked');};
 let called=false;await assert.rejects(restoreBackup(plan,preferences,storage,{restore:async()=>{called=true;}}),/storage blocked/);
 assert.equal(called,false);assert.equal(preferences.getSnapshot().value.whipEnabled,true);assert.equal(storage.getItem(choreographyKey),'previous choreography');
});
