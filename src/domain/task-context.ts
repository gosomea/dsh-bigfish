/** A short on-page task cue; never reads reasoning/tool output or persists messages. */
export class TaskContext {
 text='';
 clear(){this.text='';}
 accept(type:string,data:any){
  if(type!=='user/message'||data?.role!=='user'||(data?.source?.kind&&data.source.kind!=='user'))return;
  const blocks=Array.isArray(data.content)?data.content:[];
  const text=blocks.slice(0,20).filter((b:any)=>b?.type==='text'&&typeof b.text==='string').map((b:any)=>b.text.slice(0,500)).join(' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  this.text=text.length>48?text.slice(0,47)+'…':text;
 }
}
