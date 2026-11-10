import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {settingsOptions,selectPopupPosition} from '../src/client/settings-select.js';

test('the themed select preserves dynamic option labels, fragments, groups and disabled rows',()=>{
 const option=(value:string,label:React.ReactNode,disabled=false)=>React.createElement('option',{key:value,value,disabled},label);
 const values=settingsOptions([
  option('','选择工作区'),
  React.createElement('optgroup',{label:'类型预设'},[option('balanced','均衡型'),option('all',['全能型',' · 预览版'])]),
  React.createElement(React.Fragment,null,option('custom','自定义')),
  React.createElement('optgroup',{label:'不可用',disabled:true},option('blocked','当前角色不支持')),
 ]);
 assert.deepEqual(values.map(({value,text,disabled,group})=>({value,text,disabled,group})),[
  {value:'',text:'选择工作区',disabled:false,group:undefined},
  {value:'balanced',text:'均衡型',disabled:false,group:'类型预设'},
  {value:'all',text:'全能型 · 预览版',disabled:false,group:'类型预设'},
  {value:'custom',text:'自定义',disabled:false,group:undefined},
  {value:'blocked',text:'当前角色不支持',disabled:true,group:'不可用'},
 ]);
});
test('select popups fit the viewport, flip above the anchor and respect visual viewport offsets',()=>{
 const anchor={left:800,right:1020,top:600,bottom:636,width:220};
 const small=selectPopupPosition(anchor,{width:900,height:700},200);
 assert.equal(small.side,'top');assert.equal(small.left,668);assert.equal(small.top,396);assert.equal(small.width,220);
 const narrow=selectPopupPosition({left:30,right:350,top:60,bottom:96,width:320},{width:240,height:600,left:20,top:30},400);
 assert.equal(narrow.left,32);assert.equal(narrow.width,216);assert.equal(narrow.side,'bottom');assert.ok(narrow.top+narrow.maxHeight<=618);
});
