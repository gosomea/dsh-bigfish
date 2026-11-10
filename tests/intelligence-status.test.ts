import test from 'node:test';
import assert from 'node:assert/strict';
import {intelligenceStatus} from '../src/client/intelligence-status.js';
import {emptyState} from '../src/companion/state.js';
import type {HostSnapshot} from '../src/client/companion-host.js';
const connected=():HostSnapshot=>({...emptyState(),today:{used:0,reserved:0,automatic:0,estimated:false},modelAvailable:true});
test('intelligence setup reports each missing condition without granting model or workspace permission',()=>{
 const host=connected(),before=structuredClone(host),status=intelligenceStatus(host);
 assert.equal(status.label,'普通模式');assert.ok(status.missing.some(s=>s.includes('模型')));assert.ok(status.missing.some(s=>s.includes('工作区')));assert.ok(status.missing.some(s=>s.includes('允许')));
 assert.deepEqual(host,before);assert.equal(intelligenceStatus(null).label,'等待 Host');assert.equal(intelligenceStatus(host,true).label,'模拟演示');
});
test('only complete saved configuration reports enabled and exhausted budgets retain a distinct status',()=>{
 const host=connected();host.policy={...host.policy,enabled:true,provider:'configured',model:'configured',workspaces:['/a']};
 assert.equal(intelligenceStatus(host).label,'智能模式已启用');assert.deepEqual(intelligenceStatus(host).missing,[]);
 host.today.used=host.policy.dailyTokens-100;host.today.reserved=100;
 assert.equal(intelligenceStatus(host).label,'今日预算已用完');assert.equal(intelligenceStatus(host).remaining,0);
 host.modelAvailable=false;assert.equal(intelligenceStatus(host).label,'普通模式');assert.ok(intelligenceStatus(host).missing.some(s=>s.includes('模型服务')));
});
