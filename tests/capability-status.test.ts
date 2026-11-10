import test from 'node:test';
import assert from 'node:assert/strict';
import {capabilityStatuses,type CapabilityEnvironment} from '../src/companion/capability-status.js';
import {presetConfig} from '../src/companion/config.js';
const env:CapabilityEnvironment={demo:false,desktop:false,host:true,modelAvailable:true,modelConfigured:false,authorizedWorkspaces:false,intelligenceEnabled:false,budgetRemaining:true,role:{builtin:true,movement:true,touch:true,home:true,paired:true,life:true}};
test('all-capability preset never reports intelligent services ready without actual saved conditions',()=>{
 const rows=capabilityStatuses(presetConfig('all'),env);
 assert.equal(rows.length,8);assert.equal(rows.find(r=>r.id==='memory')!.state,'setup');assert.match(rows.find(r=>r.id==='steward')!.detail,/本地任务状态与额度提醒可用/);
 const ready=capabilityStatuses(presetConfig('all'),{...env,modelConfigured:true,authorizedWorkspaces:true,intelligenceEnabled:true});assert.equal(ready.find(r=>r.id==='memory')!.state,'available');
 const exhausted=capabilityStatuses(presetConfig('all'),{...env,modelConfigured:true,authorizedWorkspaces:true,intelligenceEnabled:true,budgetRemaining:false});assert.equal(exhausted.find(r=>r.id==='memory')!.state,'setup');assert.match(exhausted.find(r=>r.id==='memory')!.detail,/预算不足/);
});
test('demo, missing character art, disabled groups and desktop-only subfeatures remain explicit',()=>{
 const demo=capabilityStatuses(presetConfig('all'),{...env,demo:true});assert.equal(demo.find(r=>r.id==='steward')!.state,'demo');assert.equal(demo.find(r=>r.id==='memory')!.state,'demo');
 const limited=capabilityStatuses(presetConfig('all'),{...env,role:{builtin:false,movement:false,touch:false,home:false,paired:false,life:false}});assert.equal(limited.find(r=>r.id==='body')!.state,'unsupported');assert.equal(limited.find(r=>r.id==='adventures')!.state,'unsupported');
 const gentle=capabilityStatuses(presetConfig('gentle'),env);assert.equal(gentle.find(r=>r.id==='body')!.state,'off');assert.match(capabilityStatuses(presetConfig('all'),env).find(r=>r.id==='adventures')!.detail,/桌面专属/);
});

test('local voice readiness does not require intelligent model grants',()=>{
 const local=capabilityStatuses(presetConfig('all'),{...env,perception:{input:false,output:true,screenshot:false,desktopVoice:false}});
 assert.equal(local.find(r=>r.id==='perception')!.state,'available');
 const absent=capabilityStatuses(presetConfig('all'),{...env,perception:{input:false,output:false,screenshot:true,desktopVoice:false}});
 assert.equal(absent.find(r=>r.id==='perception')!.state,'setup');
});
