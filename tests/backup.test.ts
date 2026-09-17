import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,symlink,stat,readdir,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {HostPetStore,petRoute,petFilename} from '../src/pet/host-store.js';
import {decodePet,encodePet,parsePet} from '../src/pet/contract.js';
import {decodeBackup,encodeBackup,MAX_BACKUP} from '../src/pet/backup.js';
import {writeZip,readZip} from '../src/pet/archive.js';
import {preferenceDefaults} from '../src/contract/preferences.js';
import {withStoreLock} from '../src/pet/store-lock.js';
const encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
async function fixture(version='1.0.0'){
 const files:Record<string,Uint8Array>={};for(const name of await readdir('examples/bigfish-adult'))files[name]=new Uint8Array(await readFile('examples/bigfish-adult/'+name));
 const p=parsePet(files);
 p.files['pet.json']=encode({...p.manifest,version});return encodePet(parsePet(p.files));
}
async function temporary(fn:(dir:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'bigfish-backup-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
function child(code:string,args:string[]){return spawn(process.execPath,['--import','tsx','--input-type=module','-e',code,...args],{stdio:['ignore','pipe','pipe']});}
async function runChild(code:string,args:string[]){const p=child(code,args);let error='';p.stderr.on('data',v=>error+=v);const [exit]=await once(p,'exit');assert.equal(exit,0,error);}
const importCode=`import {readFile} from 'node:fs/promises';import {HostPetStore} from './src/pet/host-store.ts';await new HostPetStore(process.argv[1]).import(new Uint8Array(await readFile(process.argv[2])));`;
test('concurrent processes merge different imports, including a symlinked directory',async()=>temporary(async dir=>{
 const target=join(dir,'pets'),alias=join(dir,'alias');await new HostPetStore(target).import(await fixture());
 // Windows unprivileged symlinks are not assumed; the real-directory case still runs there.
 const useAlias=process.platform!=='win32';if(useAlias)await symlink(target,alias,'dir');
 const inputs=await Promise.all([1,2,3].map(async i=>{const path=join(dir,`${i}.dshpet`);await writeFile(path,await fixture(`1.0.${i}`));return path;}));
 await Promise.all(inputs.map((file,i)=>runChild(importCode,[useAlias&&i===1?alias:target,file])));
 const c=await new HostPetStore(target).catalog();assert.equal(c.entries.length,4);assert.equal(new Set(c.entries.map(e=>e.key)).size,4);
}));
test('killed lock owner recovers after stale heartbeat without deleting a live lock',async()=>temporary(async dir=>{
 const p=child(`import {withStoreLock} from './src/pet/store-lock.ts';await withStoreLock(process.argv[1],async()=>{console.log('locked');await new Promise(()=>setInterval(()=>{},1000));});`,[dir]);
 try{await once(p.stdout,'data');await stat(dir+'.lock');const dead=once(p,'exit');p.kill('SIGKILL');await dead;
  const start=Date.now();await withStoreLock(dir,async check=>check());assert.ok(Date.now()-start>=8000);
 }finally{p.kill('SIGKILL');}
}));
test('backup round trip validates preferences, merges roles, restores selection and preserves unrelated roles',async()=>temporary(async dir=>{
 const source=new HostPetStore(join(dir,'a')),destination=new HostPetStore(join(dir,'b'));await source.import(await fixture());await source.change('select','bigfish-adult@1.0.0');
 await destination.import(await fixture('1.1.0'));
 const snapshot=await decodeBackup(await source.backup()),bytes=encodeBackup({...snapshot,preferences:{...preferenceDefaults,whipEnabled:false,dialogueJson:'{"idle":["等你哦"]}'},choreography:null});
 const decoded=await decodeBackup(bytes);assert.equal(decoded.preferences!.whipEnabled,false);assert.equal(decoded.pets.length,1);
 const preview=await destination.restore(bytes,null,true);assert.ok('revision' in preview);
 assert.equal((await destination.catalog()).entries.length,1);
 await destination.restore(bytes,preview.revision!);const c=await destination.catalog();assert.equal(c.entries.length,2);assert.equal(c.selected,'bigfish-adult@1.0.0');
}));
test('restore conflict, stale preview and corrupt archive leave catalog unchanged',async()=>temporary(async dir=>{
 const store=new HostPetStore(dir);await store.import(await fixture());const snapshot=await decodeBackup(await store.backup());
 const original=JSON.stringify(await store.catalog());
 const pet=await decodePet(snapshot.packs[0]!);pet.files['dialogue.json']=encode({idle:['different']});
 const conflicting=encodeBackup({...snapshot,packs:[encodePet(parsePet(pet.files))]});await assert.rejects(store.restore(conflicting,null,true),/冲突/);assert.equal(JSON.stringify(await store.catalog()),original);
 const bytes=encodeBackup(snapshot),plan=await store.restore(bytes,null,true);await store.change('select','bigfish-adult@1.0.0');const changed=JSON.stringify(await store.catalog());
 await assert.rejects(store.restore(bytes,plan.revision!),/已变化/);assert.equal(JSON.stringify(await store.catalog()),changed);
 bytes[120]=bytes[120]!^1;await assert.rejects(store.restore(bytes,(await store.catalog()).revision!));assert.equal(JSON.stringify(await store.catalog()),changed);
}));
test('backup rejects invalid preferences, missing role and excessive limits before restoring',async()=>{
 const bytes=encodeBackup({packs:[],selected:null,revision:'legacy',preferences:preferenceDefaults,choreography:null}),files=await readZip(bytes);
 const m=JSON.parse(new TextDecoder().decode(files['backup.json']));m.preferences.whipEnabled='no';files['backup.json']=encode(m);await assert.rejects(decodeBackup(writeZip(files)),/whipEnabled/);
 m.preferences=preferenceDefaults;m.selected='missing@1.0.0';files['backup.json']=encode(m);await assert.rejects(decodeBackup(writeZip(files)),/选择/);
 assert.throws(()=>encodeBackup({packs:Array.from({length:33},()=>new Uint8Array()),selected:null,revision:'legacy',preferences:null,choreography:null}),/32/);
});
test('backup HTTP export and preview routes are read-only until explicit revisioned restore',async()=>temporary(async dir=>{
 const store=new HostPetStore(dir),route=petRoute(store);await store.import(await fixture());
 const exported=await route(new Request('http://localhost/api/bigfish-pets?backup=1'));assert.equal(exported.status,200);const bytes=new Uint8Array(await exported.arrayBuffer());
 const before=JSON.stringify(await store.catalog());const plan=await route(new Request('http://localhost/api/bigfish-pets-upload?op=preview-restore',{method:'POST',body:bytes}));assert.equal(plan.status,200);assert.equal(JSON.stringify(await store.catalog()),before);
 const rejected=await route(new Request('http://localhost/api/bigfish-pets-upload?op=restore&revision=wrong',{method:'POST',body:bytes}));assert.equal(rejected.status,400);assert.equal(JSON.stringify(await store.catalog()),before);
}));

test('failed multi-pack write does not publish a partial catalog',async()=>temporary(async dir=>{
 const store=new HostPetStore(dir);await store.import(await fixture());const before=JSON.stringify(await store.catalog());
 const bytes=encodeBackup({packs:[await fixture('1.0.1'),await fixture('1.0.2')],selected:'bigfish-adult@1.0.2',revision:'source',preferences:preferenceDefaults,choreography:null});
 const plan=await store.restore(bytes,null,true);await mkdir(join(dir,'bigfish-adult@1.0.2.dshpet'));
 await assert.rejects(store.restore(bytes,plan.revision!));assert.equal(JSON.stringify(await store.catalog()),before);
}));

test('nested compressed role archives cannot bypass the aggregate expanded backup budget',async()=>{
 const {compressedZip}=await import('./zip-fixture.js');
 const pet=await decodePet(await fixture()),packs:Uint8Array[]=[];
 pet.files['padding.bin']=new Uint8Array(20*1024*1024);
 for(let i=0;i<5;i++){
  pet.files['pet.json']=encode({...pet.manifest,version:`2.0.${i}`});packs.push(compressedZip(pet.files));
 }
 const bytes=encodeBackup({packs,selected:null,revision:'nested',preferences:preferenceDefaults,choreography:null});
 assert.ok(bytes.length<MAX_BACKUP);await assert.rejects(decodeBackup(bytes),/总大小超过 128/);
});

test('namespaced role IDs use portable filenames and legacy POSIX role files remain readable',async()=>temporary(async dir=>{
 const store=new HostPetStore(dir),p=await decodePet(await fixture());p.files['pet.json']=encode({...p.manifest,id:'studio:whale'});const bytes=encodePet(parsePet(p.files));await store.import(bytes);
 const key='studio:whale@1.0.0';assert.ok(!petFilename(key).includes(':'));assert.equal(petFilename('bigfish-adult@1.0.0'),'bigfish-adult@1.0.0.dshpet');assert.ok(!/^con\./i.test(petFilename('CON.pet@1.0.0')));
 assert.deepEqual(await store.bytes(key),bytes);
 if(process.platform!=='win32'){
  const {rename}=await import('node:fs/promises');await rename(join(dir,petFilename(key)),join(dir,key+'.dshpet'));assert.deepEqual(await store.bytes(key),bytes);
 }
 await store.change('select',key);await store.change('select',null);await store.change('remove',key);await assert.rejects(store.bytes(key));
}));
