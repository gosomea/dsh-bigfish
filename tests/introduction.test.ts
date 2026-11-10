import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CompanionHostStore} from '../src/companion/host-store.js';
import {installCompanion} from '../src/companion/host.js';

async function fixture(fn:(a:CompanionHostStore,b:CompanionHostStore,clock:{now:number})=>Promise<void>){
 const directory=await mkdtemp(join(tmpdir(),'bigfish-introduction-')),clock={now:1700000000000};
 try{await fn(new CompanionHostStore(directory,()=>clock.now),new CompanionHostStore(directory,()=>clock.now),clock);}
 finally{await rm(directory,{recursive:true,force:true});}
}

test('reading and acquiring a display never consumes an unanswered introduction',()=>fixture(async(a,b)=>{
 const before=await a.snapshot();await a.lease('web','web');
 assert.equal((await b.snapshot()).introducedAt,null);assert.equal((await a.snapshot()).introducedAt,null);
 assert.deepEqual((await b.snapshot()).policy,before.policy);assert.deepEqual((await b.snapshot()).today,before.today);
}));

test('only a valid, unexpired display owner can acknowledge the introduction',()=>fixture(async(a,b,clock)=>{
 assert.equal(await a.introduce('web'),false);
 await a.lease('web','web');assert.equal(await b.introduce('other-page'),false);
 clock.now+=15000;assert.equal(await a.introduce('web'),false);
 assert.equal((await b.snapshot()).introducedAt,null);
 for(const client of ['', '   ', null, 7])assert.throws(()=>a.introduce(client as string),/介绍确认无效/);
 assert.equal((await b.snapshot()).introducedAt,null);
}));

test('an unanswered introduction follows display handover and explicit acknowledgment is durable and once-only',()=>fixture(async(a,b,clock)=>{
 await a.lease('web','web');await b.lease('desktop','desktop');
 assert.equal(await a.introduce('web'),false);assert.equal((await a.snapshot()).introducedAt,null);
 const before=await a.snapshot(),results=await Promise.all([a.introduce('desktop'),b.introduce('desktop')]);
 assert.equal(results.filter(Boolean).length,1);assert.equal((await b.snapshot()).introducedAt,clock.now);
 assert.deepEqual((await b.snapshot()).policy,before.policy);assert.deepEqual((await b.snapshot()).today,before.today);
 await b.release('desktop');await a.lease('new-web','web');
 assert.equal(await b.introduce('new-web'),false);assert.equal((await a.snapshot()).introducedAt,clock.now);
}));

test('the HTTP introduction operation rejects malformed and stale acknowledgments without enabling intelligence',()=>fixture(async(store,other,clock)=>{
 let handle:((request:Request)=>Promise<Response>)|undefined;
 installCompanion({inject(keys,callback){if(keys[0]==='connection')callback({
  connection:{fetch:{register(route:{path:string;fetch:(request:Request)=>Promise<Response>}){if(route.path==='/api/bigfish-companion')handle=route.fetch;return()=>{};}}},
  effect(fn:()=>unknown){fn();},
 });}},store);
 const request=(body:unknown)=>handle!(new Request('http://host/api/bigfish-companion',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 const before=await store.snapshot();
 assert.equal((await handle!(new Request('http://host/api/bigfish-companion'))).status,200);
 for(const client of [undefined,null,7,{},[], '', '   ']){
  const response=await request({op:'introduce',client});assert.equal(response.status,400);assert.match((await response.json()).error,/介绍确认无效/);
 }
 await other.lease('active-page','web');
 const wrong=await request({op:'introduce',client:'background-page'});assert.equal(wrong.status,200);assert.deepEqual(await wrong.json(),{result:false});
 assert.equal((await store.snapshot()).introducedAt,null);
 const accepted=await request({op:'introduce',client:'active-page'});assert.equal(accepted.status,200);assert.deepEqual(await accepted.json(),{result:true});
 assert.equal((await other.snapshot()).introducedAt,clock.now);
 const duplicate=await request({op:'introduce',client:'active-page'});assert.deepEqual(await duplicate.json(),{result:false});
 assert.deepEqual((await other.snapshot()).policy,before.policy);assert.deepEqual((await other.snapshot()).today,before.today);
}));
