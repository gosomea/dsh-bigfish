import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationPolicy,ownsDisplay} from '../src/companion/notification-policy.js';
import {BehaviorScheduler,type Intent} from '../src/companion/scheduler.js';
import type {Insight} from '../src/companion/state.js';
const insight:Insight={id:'fact',text:'已完成',intent:'celebrate',sources:[],createdAt:0};
test('Host completion notices respect quiet, text-only and configured display duration; quota remains visible',()=>{
 assert.equal(notificationPolicy(insight,{completionMode:'quiet',completionSeconds:4}),null);
 assert.deepEqual(notificationPolicy(insight,{completionMode:'message',completionSeconds:3}),{animate:false,durationMs:3000});
 assert.deepEqual(notificationPolicy(insight,{completionMode:'celebrate',completionSeconds:8}),{animate:true,durationMs:8000});
 assert.deepEqual(notificationPolicy({...insight,intent:'attention',system:true},{completionMode:'quiet',completionSeconds:1}),{animate:true,durationMs:10000});
});
test('each desktop must compare its own identity, never borrow another display lease',()=>{
 assert.equal(ownsDisplay({client:'desktop-A'},'desktop-A'),true);assert.equal(ownsDisplay({client:'desktop-A'},'desktop-B'),false);assert.equal(ownsDisplay({client:'desktop-A'},null),false);assert.equal(ownsDisplay(null,null),true);
});
test('changing a completion policy revises the active intent without restarting its clock, and invalidation cancels it',()=>{
 const s=new BehaviorScheduler(),intent:Intent={id:'source-a',key:'host-summary',priority:'background',motion:'success',text:'done',createdAt:0,expiresAt:20000,durationMs:10000,interruptibleAfterMs:3000,cooldownMs:10000};s.submit(intent,0);const initial=s.tick(0)!;s.revise('host-summary',{motion:'',durationMs:4000});const next=s.tick(2500)!;assert.equal(next.startedAt,initial.startedAt);assert.equal(next.intent.motion,'');assert.equal(s.tick(4000),null);
 const newer={...intent,id:'source-b',createdAt:10000,expiresAt:30000};s.submit(newer,10000);assert.ok(s.tick(10000));s.cancel('host-summary');assert.equal(s.tick(10001),null);
});
