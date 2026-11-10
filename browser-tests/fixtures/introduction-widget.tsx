import React from 'react';
import {createRoot} from 'react-dom/client';
import {Widget} from '../../src/client/ui.js';
import {PreferenceStore} from '../../src/client/preferences-store.js';
import {presetConfig} from '../../src/companion/config.js';
import {zh} from '../../src/client/locales.js';
import type {Companion,CompanionView} from '../../src/client/controller.js';
import css from '../../src/client/styles.css';

// Full Widget/settings wiring with a static idle controller. The test supplies only the Host HTTP carrier.
const preferences=new PreferenceStore(null,null);
const requested=new URLSearchParams(location.search).get('state'),state=requested==='completed'||requested==='cancelled'?requested:'idle';
const view:CompanionView={demo:false,model:'',issue:null,compatibility:{supported:true} as CompanionView['compatibility'],snapshot:{sessionId:'fixture',turn:0,sequence:0,state,modelKey:null,rate:null,quality:'unavailable',baseline:null,relativeRate:null,pressure:0,activity:0,fatigue:0,whipHz:0,wallElapsed:0,workElapsed:0,generationElapsed:0,tools:0,tokens:0,completionSerial:state==='idle'?0:1}};
const controller:Companion={preferences,getSnapshot:()=>view,subscribe:()=>()=>{},resetLearning:()=>{},dispose:()=>{}};
const config=presetConfig('balanced');
void preferences.update({completionSeconds:3,idleMode:'quiet',greetOnOpen:false,bubbleEnabled:false,bubbleText:false,bubbleStatus:false,sceneryVisible:false,reducedMotion:true,motionPolicy:'reduced',lifestyleJson:JSON.stringify({...config,movement:'fixed',groups:{...config.groups,body:false,play:false,home:false,growth:false,adventures:false,perception:false}})}).then(()=>{
 createRoot(document.getElementById('root')!).render(<main className="bf-surface"><style>{css}</style><Widget controller={controller} t={key=>zh[key]}/></main>);
});
