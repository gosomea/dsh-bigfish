import type {IdlePresentation} from '../domain/idle.js';
import React, {useRef,type ReactNode} from 'react';
import {categoryLabels,defaultLines,parseLines,type Category} from '../contract/dialogue.js';
import type {Snapshot} from '../contract/types.js';
import type {Preferences} from '../contract/preferences.js';
import type {ActivitySummary} from '../domain/activities.js';
import {Speech} from '../domain/speech.js';
export function dialogueCategory(s:Snapshot,a?:ActivitySummary|null):Category {
 if(s.state==='waiting-user')return 'waiting';if(['failed','blocked','retrying','disconnected','limited','unknown-end'].includes(s.state))return 'error';
 if(s.state==='completed')return 'complete';if(['cancelled','interrupted'].includes(s.state))return 'stopped';
 if(s.state==='awaiting-output')return a?.category??'start';
 if(a)return a.category;
 if(s.state==='idle')return 'idle';if(s.state==='tool-running')return 'tool';if(s.state==='reasoning')return 'thinking';return 'writing';
}
export function DialogueBubble({snapshot,prefs,activity,status,actions,children,idle,now=Date.now(),roleLines}:{snapshot:Snapshot;prefs:Preferences;activity?:ActivitySummary|null|undefined;status:string;actions:ReactNode;children:ReactNode;idle?:IdlePresentation;now?:number;roleLines?:Record<string,string[]>|undefined}) {
 const director=useRef(new Speech());const category=dialogueCategory(snapshot,activity);
 const lines=parseLines(prefs.dialogueJson)[category]??roleLines?.[activity?.semantic??category]??roleLines?.[category]??defaultLines[category];
 const tool=activity?.label===categoryLabels[category]?activity.toolName??activity.label:activity?.label;
 const values={tool:prefs.showTool?tool??'工具':'工具',file:prefs.showFile?activity?.file??'这个文件':'这个文件',elapsed:Math.floor((activity?.elapsed??snapshot.wallElapsed)/1000)+' 秒',activeCount:activity?.activeCount??0,completedCount:activity?.completedCount??0};
 const spoken=director.current.choose(snapshot.sessionId+':'+snapshot.turn,category,lines,now,prefs.speechSeconds,prefs.talkLevel,values);
 const resting=category==='idle'&&idle&&!idle.showText;
 const text=category==='idle'&&idle?(idle.showText?idle.text:prefs.idleHideMessage?'':lines[0]??''):spoken;
 const detail=[categoryLabels[category],prefs.showTool&&tool!==categoryLabels[category]?tool:null,prefs.showFile?activity?.file:null,activity&&activity.activeCount>1?`${activity.activeCount} 项`:null,activity?.progress!==undefined?`${Math.round(activity.progress*100)}%`:null].filter(Boolean).join(' · ');
 const enabled=prefs.bubbleEnabled&&(prefs.bubbleText||prefs.bubbleStatus)&&!(resting&&prefs.idleHideMessage);
 const detailText=activity?detail:status;
 return <div className={`bf-card${enabled?' bf-bubble':''}`} data-category={category} style={{width:enabled?prefs.bubbleWidth:undefined,fontSize:prefs.bubbleFont,opacity:prefs.opacity}}>
  {enabled&&prefs.bubbleText&&text&&<div className="bf-dialogue-text" title={text} aria-live="polite">{text}</div>}
  <div className="bf-card-footer">
   {(enabled&&prefs.bubbleStatus)&&<span className="bf-state" title={detailText}><i data-active={['generating','reasoning','tool-running','awaiting-output'].includes(snapshot.state)}/><span className="bf-activity">{detailText}</span></span>}
   <div className="bf-card-actions">{actions}</div>
  </div>
  {children}
 </div>;
}
