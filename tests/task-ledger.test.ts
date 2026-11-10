import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {taskLabel,relationLabel,TaskLedger} from '../src/client/task-ledger.js';
import type {Task} from '../src/companion/state.js';
const task:Task={workspace:'/w',session:'a',seq:3,title:'实现插件',state:'running',updatedAt:0,parent:null,excerpt:''};
test('ledger distinguishes ancestry from actual subagents and an idle live agent from active output',()=>{
 assert.match(taskLabel({...task,runtimeStatus:'idle'}),/当前空闲/);assert.equal(relationLabel({...task,relationship:'fork'},[]),'分支会话 · 源会话未记录');assert.match(relationLabel({...task,parent:'p',relationship:'subagent'},[{...task,session:'p',title:'父任务'}]),/子代理 · 父任务/);assert.match(relationLabel({...task,parent:'p'},[]),/^来源会话/);
});
test('question projection and pending remote requests are not added into a false independent count',()=>{
 const html=renderToStaticMarkup(React.createElement(TaskLedger,{tasks:[{...task,state:'waiting',pendingQuestions:[{callId:'q',state:'continued'}],pendingRemote:{question:1,approval:0}}],busy:false,onCollect:()=>{}}));assert.match(html,/问题已转后台继续等待/);assert.doesNotMatch(html,/2 个问题|有远程待回答/);assert.match(html,/事件 3/);
});
