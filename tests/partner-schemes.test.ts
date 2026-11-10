import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeLifestyle,presetConfig} from '../src/companion/config.js';
import {decodePreferences,preferenceDefaults} from '../src/contract/preferences.js';
import {captureScheme,applyScheme,diffScheme,decodeScheme} from '../src/companion/schemes.js';

test('legacy schemes follow the main character while an imported missing partner remains an explicit inactive choice',()=>{
 const {partnerRole:_,...old}=presetConfig('balanced');
 assert.equal(decodeLifestyle(old).partnerRole,'follow-main');
 const source=decodePreferences({...preferenceDefaults,lifestyleJson:JSON.stringify({...presetConfig('all'),partnerRole:'adult@1.0.0'})});
 const scheme=captureScheme('和伙伴一起',source,null),current=decodePreferences(preferenceDefaults);
 const result=applyScheme(scheme,current,{currentRole:null,availableRoles:[]});
 assert.equal(decodeLifestyle(JSON.parse(result.preferences.lifestyleJson)).partnerRole,'adult@1.0.0');
 assert.deepEqual(result.role,{selected:null,changed:false,missing:null});
 assert.match(result.warnings.join(' '),/小伙伴.*未安装.*不会邀请或自动下载/);
 assert.ok(diffScheme(scheme,current,{currentRole:null,availableRoles:[]}).changes.some(c=>c.path==='lifestyle.partnerRole'));
 assert.equal(applyScheme(scheme,current,{currentRole:null,availableRoles:['adult@1.0.0']}).warnings.length,0);
});

test('partner choices cannot import URLs, device geometry or model authority through a portable scheme',()=>{
 const captured=captureScheme('安全范围',decodePreferences(preferenceDefaults),null);
 for(const role of ['https://example.invalid/pack','../other-host','other@latest','file:/tmp/pet'])assert.throws(()=>decodeScheme({...captured,config:{...captured.config,partnerRole:role}}));
 for(const key of ['activityAreas','homePoint','allowedRegion','microphone','policy'])assert.throws(()=>decodeScheme({...captured,config:{...captured.config,[key]:{enabled:true}}}));
 assert.equal('partnerRole' in captured.config,true);
 assert.equal('activityAreas' in captured.config,false);
});
