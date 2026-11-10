import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LifeSettings} from '../src/client/life-settings.js';
import {LifeActions} from '../src/client/life-actions.js';
import {presetConfig} from '../src/companion/config.js';
import {lifeDefaults} from '../src/companion/life.js';
test('life configuration sections expose only their own controls while actions stay in the interaction menu',()=>{
 let calls=0;const noop=()=>{calls++;},config=presetConfig('all'),state={life:lifeDefaults(),collections:[]};
 const appearance=renderToStaticMarkup(React.createElement(LifeSettings,{config,state,section:'appearance',variant:'section',onClearDiary:noop,onRemoveCollection:noop,onOptionsChange:noop}));
 assert.ok(appearance.startsWith('<section'));assert.ok(appearance.includes('允许邀请小伙伴'));assert.ok(appearance.includes('不会自动启动双宠'));assert.ok(!appearance.includes('清空相处记录'));assert.ok(!appearance.includes('表演这一季'));
 const growth=renderToStaticMarkup(React.createElement(LifeSettings,{config,state,section:'growth',onClearDiary:noop,onRemoveCollection:noop,onOptionsChange:noop}));
 assert.ok(growth.includes('成长规则'));assert.ok(!growth.includes('角色装扮'));assert.ok(!growth.includes('项目收藏柜'));
 const actions=renderToStaticMarkup(React.createElement(LifeActions,{config,state,onInteract:noop,onPlayProgram:noop}));
 assert.ok(actions.includes('邀请小伙伴'));assert.ok(actions.includes('预览本地小剧场'));assert.ok(actions.includes('玩具箱'));assert.ok(!actions.includes('清空相处记录'));assert.equal(calls,0);
});
test('paused adventure and growth groups preserve preferences but cannot expose an enabled pair invite',()=>{
 const config=presetConfig('all');config.groups.adventures=false;config.groups.growth=false;config.growthUnlocks=true;
 const markup=renderToStaticMarkup(React.createElement(LifeActions,{config,state:{life:lifeDefaults()}}));
 assert.match(markup,/<button[^>]*disabled=""[^>]*>邀请小伙伴/);assert.ok(markup.includes('允许后也不会自动启动'));assert.ok(!markup.includes('宠物小剧场'));assert.equal(config.pairEnabled,true);assert.equal(config.growthUnlocks,true);
});
