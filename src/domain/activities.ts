import {categories, classifyTool, type Category, type ToolRule} from '../contract/dialogue.js';
export interface Activity { semantic?:string; id:string; parent?:string|undefined; name:string; file?:string|undefined; at:number; category?:Category; label?:string; progress?:number|undefined }
export interface ActivitySummary { id?:string; semantic?:string; toolName?:string; category:Category; label:string; file?:string|undefined; elapsed:number; activeCount:number; completedCount:number; progress?:number|undefined; motion?:string }
export function toolResults(data:any): {id:string;error:boolean}[] {
 const blocks=data?.message?.content;
 if(Array.isArray(blocks))return blocks.filter(b=>b?.type==='tool-result'&&typeof b.toolCallId==='string').map(b=>({id:b.toolCallId,error:b.isError===true}));
 return typeof data?.callId==='string'?[{id:data.callId,error:Boolean(data.isError)}]:[];
}
export interface ExtensionActivity {semantic?:string;version:1;sessionId:string;id:string;phase:'start'|'progress'|'end';category:Category;label:string;progress?:number|undefined;isError?:boolean}
export function extensionActivity(value:unknown):ExtensionActivity|null {
 const v=value as ExtensionActivity;
 return v&&v.version===1&&typeof v.sessionId==='string'&&v.sessionId.length<=200&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=100&&['start','progress','end'].includes(v.phase)&&categories.includes(v.category)&&(v.semantic===undefined||(typeof v.semantic==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/.test(v.semantic)))&&typeof v.label==='string'&&v.label.length<=80&&(v.progress===undefined||(Number.isFinite(v.progress)&&v.progress>=0&&v.progress<=1))&&(v.isError===undefined||typeof v.isError==='boolean')?v:null;
}
/** Bounded per-session activity map; raw arguments and tool output are never retained. */
export class Activities {
 recentTools:string[]=[];
 private items=new Map<string,Activity>();private completed=0;private failed:{label:string;until:number}|null=null;
 clear(){this.items.clear();this.completed=0;this.failed=null;}
 private start(item:Activity){if(this.items.has(item.id))return;if(this.items.size>=256)this.items.delete(this.items.keys().next().value!);this.items.set(item.id,item);}
 private end(id:string,error:boolean,now:number){const a=this.items.get(id);if(!a)return;const removed=new Set([id]);let grew=true;while(grew){grew=false;for(const [key,item]of this.items)if(item.parent&&removed.has(item.parent)&&!removed.has(key)){removed.add(key);grew=true;}}for(const key of removed)this.items.delete(key);this.completed++;if(error)this.failed={label:a.name,until:now+4000};}
 accept(type:string,data:any,now:number,hydrating=false){
  if(type==='turn/start'||type==='turn/end'){this.clear();return;}
  if(type==='tool/call'||type==='tool/ptc-dispatch-start'){
   const id=type==='tool/call'?data?.callId:data?.subCallId;if(typeof id!=='string'||typeof data?.name!=='string')return;
   if(!this.recentTools.includes(data.name))this.recentTools=[...this.recentTools.slice(-19),data.name.slice(0,100)];
   let args=data.arguments;try{if(typeof args==='string')args=args.length<=16000?JSON.parse(args):{};}catch{args={};}
   const path=args?.path??args?.file_path??args?.filename;const file=typeof path==='string'?path.replaceAll('\\','/').split('/').at(-1)?.slice(0,80):undefined;
   this.start({id,name:data.name.slice(0,100),at:now,file,parent:type==='tool/call'?undefined:data.parentCallId});
  }
  if(type==='tool/result')for(const r of toolResults(data))this.end(r.id,!hydrating&&r.error,now);
  if(type==='tool/ptc-dispatch')this.end(data?.subCallId,!hydrating&&data?.isError===true,now);
 }
 extension(e:ExtensionActivity,now:number){const id='extension:'+e.id;if(e.phase==='end'){this.end(id,e.isError===true,now);return;}if(e.phase==='start')this.start({id,name:e.label,label:e.label,category:e.category,at:now,progress:e.progress,...(e.semantic?{semantic:e.semantic}:{})});else {const a=this.items.get(id);if(a){a.progress=e.progress;a.label=e.label;}}}
 summary(now:number,rules:ToolRule[]):ActivitySummary|null {
  if(this.failed&&now<this.failed.until)return {category:'error',label:this.failed.label,elapsed:0,activeCount:this.items.size,completedCount:this.completed};
  const all=[...this.items.values()];const leaves=all.filter(a=>!all.some(b=>b.parent===a.id));const a=leaves.at(-1);if(!a)return null;
  const kind=a.category?{category:a.category,label:a.label??a.name}:classifyTool(a.name,rules);
  return {id:a.id,...kind,...(a.semantic?{semantic:a.semantic}:{}),toolName:a.name,category:leaves.length>1?'parallel':kind.category,file:a.file,elapsed:Math.max(0,now-a.at),activeCount:leaves.length,completedCount:this.completed,progress:a.progress};
 }
}
