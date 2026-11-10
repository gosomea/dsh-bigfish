import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePreferences,preferenceDefaults,type Preferences} from '../src/contract/preferences.js';
import {schemeDisplayKeys} from '../src/contract/scheme-display.js';
import {decodeLifestyle,decodeSchemes,presetConfig} from '../src/companion/config.js';
import {captureScheme,decodeScheme,exportPortableScheme,applyScheme,diffScheme,saveNamedScheme,resetDisplayPreferences,resetTypePreferences,resetPreferenceField,resetLifestyleField,clearNamedSchemes} from '../src/companion/schemes.js';

const lifestyle=(p:Preferences)=>decodeLifestyle(JSON.parse(p.lifestyleJson));
function configured():Preferences {
  return decodePreferences({...preferenceDefaults,size:240,opacity:.8,idleMode:'custom',idleMinSeconds:7,idleMaxSeconds:12,richness:1,intensity:.75,talkLevel:0,whipEnabled:false,mode:'rhythm',autoSpeed:false,targetRate:120,
    dialogueJson:JSON.stringify({idle:['PRIVATE DIALOGUE']}),toolRulesJson:JSON.stringify([{pattern:'private-*',category:'tool',label:'PRIVATE RULE'}]),
    lifestyleJson:JSON.stringify({...presetConfig('all'),nickname:'伙伴',theme:'garden',quietUntil:123456,importantOnly:true})});
}
test('named portable capture, serialization and application preserve the same complete display/behavior scope',()=>{
  const source=configured(),captured=captureScheme('上班',source,'adult@1.0.0');
  const imported=decodeScheme(JSON.parse(JSON.stringify(exportPortableScheme(captured))));
  const current=decodePreferences({...preferenceDefaults,dialogueJson:'{"idle":["my local text"]}',toolRulesJson:source.toolRulesJson,lifestyleJson:JSON.stringify({...presetConfig('gentle'),quietUntil:999,importantOnly:true})});
  const result=applyScheme(imported,current,{currentRole:null,availableRoles:['adult@1.0.0']});
  assert.equal(imported.version,2);for(const key of schemeDisplayKeys)assert.equal(result.preferences[key],source[key],key);
  assert.deepEqual(result.role,{selected:'adult@1.0.0',changed:true,missing:null});
  assert.equal(lifestyle(result.preferences).theme,'garden');assert.equal(lifestyle(result.preferences).quietUntil,999);assert.equal(lifestyle(result.preferences).importantOnly,true);
  assert.equal(result.preferences.dialogueJson,current.dialogueJson);assert.equal(result.preferences.toolRulesJson,current.toolRulesJson);
  assert.equal(result.preferences.schemesJson,current.schemesJson);assert.equal('dialogueJson' in result.patch,false);assert.equal('schemesJson' in result.patch,false);
  const paths=diffScheme(imported,current,{currentRole:null,availableRoles:['adult@1.0.0']}).changes.map(change=>change.path);
  for(const key of ['size','idleMode','richness','talkLevel','whipEnabled','role','lifestyle.theme'])assert.ok(paths.includes(key),key);
});
test('portable files contain no private text, temporary quiet timer, authority or task state',()=>{
  const captured=captureScheme('我的方案',configured(),null),text=JSON.stringify(captured);
  assert.equal(captured.config.quietUntil,0);assert.equal(captured.config.importantOnly,false);
  assert.doesNotMatch(text,/PRIVATE|apiKey|provider|dailyTokens|workspaces|transcript|dialogueJson|toolRulesJson/);
  for(const key of ['policy','credentials','dailyTokens','tasks','memory','microphone','screenshots'])assert.throws(()=>decodeScheme({...captured,[key]:{enabled:true}}));
  for(const key of ['policy','apiKey','dailyTokens','dialogueJson','quietUntil'])assert.throws(()=>decodeScheme({...captured,display:{...captured.display,[key]:'private'}}));
  assert.throws(()=>decodeScheme({...captured,role:{kind:'pack',key:'adult@1.0.0',url:'https://example.invalid/pack'}}));
  assert.throws(()=>decodeScheme({...captured,display:{}}));
});
test('missing roles keep the current role with an explicit warning; builtin selection and installed roles are deliberate',()=>{
  const current=configured(),scheme=captureScheme('外部角色',current,'missing@1.0.0');
  const unavailable=applyScheme(scheme,current,{currentRole:'current@1.0.0',availableRoles:['current@1.0.0']});
  assert.deepEqual(unavailable.role,{selected:'current@1.0.0',changed:false,missing:'missing@1.0.0'});assert.match(unavailable.warnings[0]!,/未安装.*保留当前角色/);
  assert.equal(diffScheme(scheme,current,{currentRole:'current@1.0.0',availableRoles:[]}).changes.some(c=>c.path==='role'),false);
  assert.deepEqual(applyScheme(captureScheme('内置',current,null),current,{currentRole:'current@1.0.0',availableRoles:[]}).role,{selected:null,changed:true,missing:null});
});
test('bare version-one imports and old named schemes update Lifestyle without overwriting modern display or role preferences',()=>{
  const current=configured(),old={...presetConfig('gentle'),quietUntil:87654,importantOnly:true};
  for(const raw of [old,{name:'旧方案',config:old}]) {
    const scheme=decodeScheme(raw);assert.equal(scheme.version,undefined);assert.equal(scheme.config.quietUntil,0);
    const applied=applyScheme(scheme,current,{currentRole:'current@1.0.0',availableRoles:[]});
    for(const key of schemeDisplayKeys)assert.equal(applied.preferences[key],current[key]);
    assert.equal(applied.role.changed,false);assert.equal(lifestyle(applied.preferences).quietUntil,lifestyle(current).quietUntil);
    assert.equal(lifestyle(applied.preferences).groups.home,true);
  }
  assert.throws(()=>decodeSchemes([{name:'x',config:old},{name:' x ',config:old}]));
  assert.throws(()=>decodeScheme({name:'x',config:old,version:3}));
});
test('reset operations preserve saved schemes and private text; clearing names is a separate explicit operation',()=>{
  let current=configured();current=decodePreferences({...current,...saveNamedScheme(current,'上班','adult@1.0.0')});
  const originalLifestyle=current.lifestyleJson,schemes=current.schemesJson;
  const display=resetDisplayPreferences(current);
  assert.equal(display.size,preferenceDefaults.size);assert.equal(display.schemesJson,schemes);assert.equal(display.lifestyleJson,originalLifestyle);
  for(const next of [display,resetTypePreferences(current),resetPreferenceField(current,'size'),resetLifestyleField(current,'theme')]) {
    assert.equal(next.schemesJson,schemes);assert.equal(next.dialogueJson,current.dialogueJson);assert.equal(next.toolRulesJson,current.toolRulesJson);
    assert.equal(lifestyle(next).quietUntil,lifestyle(current).quietUntil);assert.equal(lifestyle(next).importantOnly,true);
  }
  assert.equal(lifestyle(resetTypePreferences(current)).nickname,'伙伴');
  assert.throws(()=>resetPreferenceField(current,'schemesJson' as never));assert.throws(()=>resetLifestyleField(current,'quietUntil' as never));
  const cleared=clearNamedSchemes(current);assert.equal(cleared.schemesJson,'[]');assert.equal(cleared.size,current.size);assert.equal(cleared.lifestyleJson,current.lifestyleJson);
  assert.throws(()=>saveNamedScheme(current,'上班',null),/重复/);
});
test('restoring one endpoint keeps paired activity ranges valid without restoring unrelated choices',()=>{
  const p=decodePreferences({...configured(),idleMinSeconds:100,idleMaxSeconds:200,lifestyleJson:JSON.stringify({...presetConfig('all'),restMin:400,restMax:500,activityOverrides:true})});
  const idle=resetPreferenceField(p,'idleMaxSeconds');assert.equal(idle.idleMinSeconds,preferenceDefaults.idleMaxSeconds);assert.equal(idle.idleMaxSeconds,preferenceDefaults.idleMaxSeconds);assert.equal(idle.size,p.size);
  const rest=lifestyle(resetLifestyleField(p,'restMax'));assert.equal(rest.restMin,45);assert.equal(rest.restMax,45);assert.equal(rest.activityOverrides,true);
});
test('old expert intervals migrate explicitly while default values and a saved disabled override remain disabled',()=>{
  const baseline=presetConfig('balanced'),{activityOverrides:_,...old}=baseline;
  assert.equal(baseline.activityOverrides,false);assert.equal(decodeLifestyle(old).activityOverrides,false);
  for(const patch of [{restMin:10},{restMax:90},{adventureMinutes:120}])assert.equal(decodeLifestyle({...old,...patch}).activityOverrides,true);
  assert.equal(decodeLifestyle({...old,restMin:10,activityOverrides:false}).activityOverrides,false);
  assert.throws(()=>decodeLifestyle({...old,activityOverrides:'true'}));assert.throws(()=>decodeLifestyle({...old,adventureMinutes:121}));
});
test('shared Preferences accept both saved formats and sanitize old serialized temporary quiet state',()=>{
  const old={name:'旧版',config:{...presetConfig('balanced'),quietUntil:123456,importantOnly:true}},modern=captureScheme('新版',configured(),null);
  const preferences=decodePreferences({...preferenceDefaults,schemesJson:JSON.stringify([old,modern])});
  const saved=decodeSchemes(JSON.parse(preferences.schemesJson));assert.equal(saved.length,2);assert.equal(saved[0]!.config.quietUntil,0);assert.equal(saved[0]!.config.importantOnly,false);assert.equal(saved[1]!.version,2);
  assert.throws(()=>decodePreferences({...preferences,schemesJson:JSON.stringify([{...modern,display:{...modern.display,size:9999}}])}));
});
