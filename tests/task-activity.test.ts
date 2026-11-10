import test from 'node:test';
import assert from 'node:assert/strict';
import {taskActivity} from '../src/companion/task-activity.js';
import type {Task} from '../src/companion/state.js';

const base:Task={workspace:'/a',session:'one',seq:1,title:'任务',state:'running',updatedAt:1,parent:null,excerpt:''};
test('only current runtime evidence proves work; an already terminal turn wins over driver teardown',()=>{
 assert.equal(taskActivity(base),null);
 assert.equal(taskActivity({...base,runtimeStatus:'idle'}),null);
 assert.equal(taskActivity({...base,runtimeStatus:'running'}),'running');
 for(const state of ['completed','failed','cancelled','waiting'] as const)assert.equal(taskActivity({...base,state,runtimeStatus:'running'}),null);
});
test('answerable pending interactions remain active even when the Agent is idle',()=>{
 for(const state of ['open','continued'] as const)assert.equal(taskActivity({...base,state:'waiting',runtimeStatus:'idle',pendingQuestions:[{callId:'q',state}]}),'waiting');
 assert.equal(taskActivity({...base,pendingApprovals:['id']}),'waiting');
 assert.equal(taskActivity({...base,pendingRemote:{question:1,approval:0}}),'waiting');
 assert.equal(taskActivity({...base,pendingRemote:{question:0,approval:1}}),'waiting');
 assert.equal(taskActivity({...base,state:'waiting',pendingQuestions:[],pendingApprovals:[],pendingRemote:{question:0,approval:0}}),null);
});
