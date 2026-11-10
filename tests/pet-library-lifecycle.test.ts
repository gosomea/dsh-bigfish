import test from 'node:test';import assert from 'node:assert/strict';
import {PetLibrary} from '../src/pet/library.js';
import {writeZip} from '../src/pet/archive.js';
test('Host replacement clears the old catalog and an older async init cannot create a second refresh timer',async()=>{
 const beforeSet=globalThis.setInterval,beforeClear=globalThis.clearInterval,timers=new Set<ReturnType<typeof setInterval>>();let sequence=0;
 globalThis.setInterval=((_callback:()=>void)=>{const id=++sequence as unknown as ReturnType<typeof setInterval>;timers.add(id);return id;}) as typeof setInterval;
 globalThis.clearInterval=((id:ReturnType<typeof setInterval>)=>{timers.delete(id);}) as typeof clearInterval;
 let release!:(response:Response)=>void;const library=new PetLibrary();
 try{const old=library.init(true,()=>new Promise(resolve=>{release=resolve;}));library.dispose();assert.deepEqual(library.catalog.entries,[]);await library.init(true,async()=>Response.json({selected:null,entries:[],revision:'new-host'}));assert.equal(timers.size,1);release(Response.json({selected:null,entries:[],revision:'old-host'}));await old;assert.equal(library.catalog.revision,'new-host');assert.equal(timers.size,1);library.dispose();assert.equal(timers.size,0);}finally{library.dispose();globalThis.setInterval=beforeSet;globalThis.clearInterval=beforeClear;}
});

function petBytes(){
 const png=new Uint8Array(24),view=new DataView(png.buffer);view.setUint32(0,0x89504e47);view.setUint32(4,0x0d0a1a0a);view.setUint32(16,32);view.setUint32(20,32);
 const roles=['idle','working','attention','success','error'],encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
 const manifest={format:'dsh-pet',formatVersion:1,id:'old',name:'fixture',version:'1.0.0',author:'fixture',description:'fixture',canvas:{width:32,height:32},assets:{a:{path:'a.png',width:32,height:32}},thumbnail:'thumb.png',animations:'animations.json',fallbacks:Object.fromEntries(roles.map(x=>[x,x])),capabilities:[]};
 const animations=roles.map(id=>({id,label:id,tags:[id],intensity:0,loop:true,weight:1,cooldownMs:0,frames:[{asset:'a',rect:[0,0,32,32],durationMs:100}],speed:[1,1]}));
 return writeZip({'pet.json':encode(manifest),'animations.json':encode(animations),'a.png':png,'thumb.png':png});
}
const catalog=()=>Response.json({selected:null,entries:[],revision:'new-host'});
test('an old role download cannot send its selection to the replacement Host',async()=>{
 const library=new PetLibrary(),writes:string[]=[];let finish!:(value:Uint8Array)=>void;
 try{
  await library.init(true,async()=>catalog());library.bytes=async()=>new Promise(resolve=>{finish=resolve;});
  const selecting=library.select('old@1.0.0');library.dispose();await library.init(true,async query=>{if(query.startsWith('?op='))writes.push(query);return catalog();});
  finish(petBytes());await assert.rejects(selecting,/Host 已切换/);assert.deepEqual(writes,[]);assert.equal(library.catalog.revision,'new-host');
 }finally{library.dispose();}
});
test('Host replacement during image decode releases preflight URLs and never selects the stale role',async()=>{
 const image=Object.getOwnPropertyDescriptor(globalThis,'Image'),create=URL.createObjectURL,revoke=URL.revokeObjectURL,created:string[]=[],released:string[]=[],writes:string[]=[];
 let ready!:()=>void,decoding!:()=>void;const entered=new Promise<void>(resolve=>{decoding=resolve;}),held=new Promise<void>(resolve=>{ready=resolve;});
 class Image {naturalWidth=32;naturalHeight=32;src='';decode(){decoding();return held;}}
 Object.defineProperty(globalThis,'Image',{value:Image,configurable:true});
 URL.createObjectURL=()=>{const url='blob:fixture-'+created.length;created.push(url);return url;};URL.revokeObjectURL=url=>{released.push(url);};
 const library=new PetLibrary();
 try{
  await library.init(true,async()=>catalog());library.bytes=async()=>petBytes();const selecting=library.select('old@1.0.0');await entered;
  library.dispose();await library.init(true,async query=>{if(query.startsWith('?op='))writes.push(query);return catalog();});ready();
  await assert.rejects(selecting,/Host 已切换/);assert.deepEqual(writes,[]);assert.ok(created.length>0);assert.deepEqual([...released].sort(),[...created].sort());
 }finally{ready();library.dispose();URL.createObjectURL=create;URL.revokeObjectURL=revoke;if(image)Object.defineProperty(globalThis,'Image',image);else Reflect.deleteProperty(globalThis,'Image');}
});
test('a selection reply from an older Host cannot refresh or publish over the new catalog',async()=>{
 const library=new PetLibrary();let finish!:(value:Response)=>void,entered!:()=>void,newReads=0;
 const sent=new Promise<void>(resolve=>{entered=resolve;});
 try{
  await library.init(true,async query=>{if(query.startsWith('?op=')){entered();return new Promise(resolve=>{finish=resolve;});}return catalog();});
  const selecting=library.select(null);await sent;library.dispose();await library.init(true,async()=>{newReads++;return catalog();});finish(catalog());
  await assert.rejects(selecting,/Host 已切换/);assert.equal(newReads,1);assert.equal(library.catalog.revision,'new-host');
 }finally{library.dispose();}
});
