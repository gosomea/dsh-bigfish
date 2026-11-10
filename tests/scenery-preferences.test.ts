import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePreferences,preferenceDefaults} from '../src/contract/preferences.js';
import {captureScheme,decodeScheme,applyScheme} from '../src/companion/schemes.js';
import {presetConfig} from '../src/companion/config.js';
import {LifeRoutineDirector,type RoutineInput} from '../src/companion/routines.js';

test('old preferences and existing v2 schemes migrate the scenery default while hidden scenes round-trip',()=>{
 const {sceneryVisible:_,...old}=preferenceDefaults;
 assert.equal(decodePreferences(old).sceneryVisible,true);
 const oldScheme=captureScheme('原来的方案',preferenceDefaults,null);
 const display={...oldScheme.display} as Record<string,unknown>;delete display.sceneryVisible;
 const migrated=decodeScheme({...oldScheme,display});assert.equal(migrated.display!.sceneryVisible,true);
 const hidden=decodePreferences({...preferenceDefaults,sceneryVisible:false,lifestyleJson:JSON.stringify(presetConfig('all'))});
 const roundTrip=applyScheme(captureScheme('只看宠物',hidden,null),preferenceDefaults,{currentRole:null,availableRoles:[]});
 assert.equal(roundTrip.preferences.sceneryVisible,false);assert.equal(roundTrip.preferences.lifestyleJson,hidden.lifestyleJson);assert.equal(roundTrip.preferences.scene,hidden.scene);
 assert.throws(()=>decodePreferences({...hidden,sceneryVisible:'false'}));
 assert.throws(()=>decodeScheme({...oldScheme,display:{...display,sceneryVisible:0}}));
 const incomplete={...display};delete incomplete.size;assert.throws(()=>decodeScheme({...oldScheme,display:incomplete}),/完整/);
});

test('hiding scenery stops furniture chains without disabling project collection feedback',()=>{
 const config=presetConfig('gentle'),input:RoutineInput={enabled:true,config,idleMode:'custom',idleMinSeconds:1,idleMaxSeconds:1,state:'idle',tasks:[],blocked:false,urgent:false,interacting:false,quiet:false};
 const director=new LifeRoutineDirector();assert.equal(director.tick(input,0),null);assert.equal(director.tick(input,1000)?.clip,'desk-tidy');
 assert.equal(director.tick({...input,sceneryVisible:false},1100),null);
 assert.equal(director.tick({...input,sceneryVisible:false},2200),null);
 const completed=new LifeRoutineDirector(),task={workspace:'/fixture',session:'one',seq:1,state:'running' as const,updatedAt:0,parent:null,title:'真实项目',excerpt:''};
 const terminal={...input,config:presetConfig('all'),sceneryVisible:false};
 completed.tick({...terminal,tasks:[task]},0);
 const result=completed.tick({...terminal,tasks:[{...task,seq:2,state:'completed',updatedAt:1000}]},1000);
 assert.equal(result?.clip,'book-close');assert.match(result!.text,/项目明信片/);
});
