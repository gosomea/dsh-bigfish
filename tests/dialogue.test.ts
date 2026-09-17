import test from 'node:test';import assert from 'node:assert/strict';
import {Activities,extensionActivity,toolResults} from '../src/domain/activities.js';
import {classifyTool,parseLines,parseRules,formatLine} from '../src/contract/dialogue.js';
import {Speech} from '../src/domain/speech.js';import {AirSwing} from '../src/domain/air-swing.js';
test('native result blocks retire root and nested tools, without keeping arguments',()=>{
 const a=new Activities();a.accept('tool/call',{callId:'root',name:'run_code',arguments:'secret'},0);
 a.accept('tool/ptc-dispatch-start',{parentCallId:'root',subCallId:'r',name:'read_file',arguments:{path:'/private/example.ts',secret:'never display'}},20);
 assert.equal(a.summary(50,[])?.category,'read');assert.equal(a.summary(50,[])?.activeCount,1);assert.equal(a.summary(50,[])?.file,'example.ts');
 a.accept('tool/ptc-dispatch-start',{parentCallId:'root',subCallId:'s',name:'search',arguments:{}},30);assert.equal(a.summary(50,[])?.category,'parallel');
 a.accept('tool/ptc-dispatch',{subCallId:'r'},50);assert.equal(a.summary(60,[])?.category,'search');
 a.accept('tool/result',{message:{content:[{type:'tool-result',toolCallId:'root'}]}},80);assert.equal(a.summary(90,[]),null);
});
test('tool error expires and terminal states flush activity',()=>{
 const a=new Activities();a.accept('tool/call',{callId:'a',name:'test'},0);a.accept('tool/result',{message:{content:[{type:'tool-result',toolCallId:'a',isError:true}]}},100);
 assert.equal(a.summary(200,[])?.category,'error');assert.equal(a.summary(5000,[]),null);a.accept('turn/end',{},5100);assert.equal(a.summary(5101,[]),null);
});
test('extension validates progress and lifecycle, unknown tools fall back and exact rules beat prefixes',()=>{
 assert.equal(extensionActivity({version:1,sessionId:'s',id:'x',phase:'start',category:'image',label:'画图',progress:2}),null);
 const event=extensionActivity({version:1,sessionId:'s',id:'x',phase:'start',category:'image',label:'画图',progress:.2})!;const a=new Activities();a.extension(event,0);assert.equal(a.summary(10,[])?.progress,.2);a.extension({...event,phase:'end'},20);assert.equal(a.summary(30,[]),null);
 assert.equal(classifyTool('new_unknown',[]).category,'tool');assert.equal(classifyTool('x_read',[{pattern:'x_*',category:'tool',label:''},{pattern:'x_read',category:'read',label:'读取'}]).category,'read');
});
test('dialogue validation rejects invalid placeholders; empty category is silent',()=>{
 assert.throws(()=>parseLines('{"read":["{secret}"]}'));assert.throws(()=>parseRules('[{"pattern":"foo[bar]","category":"read","label":""}]'));
 assert.deepEqual(parseLines('{"read":[]}'),{read:[]});assert.equal(formatLine('看 {file}，{elapsed}',{}),'看 这个文件，片刻');
});
test('speech merges rapid switches, urgent prompts interrupt, and never repeats adjacent alternatives',()=>{
 const s=new Speech(()=>0),v={};assert.equal(s.choose('a','read',['read1','read2'],0,2.5,2,v),'read1');
 assert.equal(s.choose('a','search',['search'],100,2.5,2,v),'我在继续处理～');
 assert.equal(s.choose('a','waiting',['confirm'],200,2.5,2,v),'confirm');
 assert.equal(s.choose('a','read',['read1','read2'],300,2.5,2,v),'read2');
 assert.equal(s.choose('b','read',['new'],400,2.5,2,v),'new');
});
test('short output does not flash a whip; scene changes do not rewind a running gesture',()=>{
 const w=new AirSwing();for(let i=0;i<4;i++)assert.equal(w.tick(.04,2,true,true).visible,false);
 let v=w.tick(.04,2,true,true);assert.equal(v.visible,true);v=w.tick(.1,2,false,true);const prior=v.cycles;v=w.tick(.1,2,false,true);assert.ok(v.cycles>prior);
 v=w.tick(.1,2,false,false);assert.equal(v.responding,false);assert.ok(v.opacity<1);
 w.tick(.1,2,false,false);assert.equal(w.tick(.1,2,false,false).visible,false);assert.equal(w.tick(.1,2,true,true,true).visible,false);
});
