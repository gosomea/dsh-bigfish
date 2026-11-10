import test from 'node:test';
import assert from 'node:assert/strict';
import {exchangeHost,hostAddress} from '../desktop/host-connection.mjs';
test('desktop connection accepts an explicit launch link but never follows redirects or exposes the token in state',async()=>{
 const transport=(async(input:URL,init:RequestInit)=>{
  assert.equal(input.origin,'http://127.0.0.1:3080');assert.equal(input.searchParams.get('token'),'launch');assert.equal(init.redirect,'manual');
  return new Response(null,{status:303,headers:{location:'https://unrelated.invalid/','set-cookie':'dsh-auth-test=v1.body.signature; HttpOnly; Path=/'}});
 }) as unknown as typeof fetch;
 assert.deepEqual(await exchangeHost('http://127.0.0.1:3080/?token=launch','',transport),{url:'http://127.0.0.1:3080',cookie:'dsh-auth-test=v1.body.signature'});
 for(const address of ['http://example.com/','https://u:p@example.com/','http://localhost:3080/evil','http://localhost/?token=a&token=b'])assert.throws(()=>hostAddress(address));
 await assert.rejects(exchangeHost('http://localhost/?token=a','',(async()=>new Response(null,{status:303})) as typeof fetch),/未返回/);
});
