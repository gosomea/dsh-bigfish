import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBehaviors} from '../src/pet/capabilities.js';
const animations=[{id:'walk',frames:[{asset:'a',rect:[0,0,100,100]},{asset:'a',rect:[100,0,100,100]}]},{id:'stand',frames:[{asset:'a',rect:[0,0,100,100]}]}];
const manifest={canvas:{width:100,height:100},capabilities:['movement','touch'],body:{bounds:{x:5,y:5,width:90,height:90},foot:{x:50,y:95}},behaviors:{movement:{left:'walk',right:'walk',stop:'stand'},interactions:{head:'stand'}}};
test('optional behavior contract accepts old packs and rejects missing poses or invalid anchors',()=>{
 validateBehaviors({canvas:{width:100,height:100},capabilities:[]},animations);validateBehaviors(manifest,animations);
 assert.throws(()=>validateBehaviors({...manifest,body:{...manifest.body,foot:{x:1000,y:95}}},animations));
 assert.throws(()=>validateBehaviors({...manifest,behaviors:{movement:{left:'stand',right:'walk',stop:'stand'}}},animations),/不同姿态/);
 assert.throws(()=>validateBehaviors({...manifest,behaviors:{...manifest.behaviors,interactions:{head:'missing'}}},animations),/不存在/);
});
