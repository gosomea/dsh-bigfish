import {defaultLines,formatLine,type Category} from '../contract/dialogue.js';
/** One visible utterance, never a backlog of stale tool events. */
export class Speech {
 private category:Category|null=null;private template='';private changedAt=-Infinity;private selectedAt=-Infinity;private bridge=false;private last=new Map<Category,number>();private session='';private context='';
 constructor(private random=()=>Math.random()){}
 choose(session:string,category:Category,lines:string[],now:number,minSeconds:number,level:number,values:Record<string,string|number>,context=''){
  if(session!==this.session){this.session=session;this.category=null;this.changedAt=-Infinity;this.selectedAt=-Infinity;this.bridge=false;this.last.clear();this.context='';}
  const urgent=['start','waiting','error','complete','stopped'].includes(category);
  const changed=this.category!==category||this.context!==context;
  const expired=!['idle','waiting','error','complete','stopped'].includes(category)&&now-this.selectedAt>=Math.max(minSeconds*1000,[Infinity,30000,10000][level]??Infinity);
  if(changed&&!urgent&&this.category&&!['idle','start','waiting','error','complete','stopped'].includes(this.category)&&now-this.changedAt<minSeconds*1000){
   this.category=category;this.context=context;this.template='我在继续处理～';this.bridge=true;
  }else if(changed||(!this.bridge&&!lines.includes(this.template))||(this.bridge&&now-this.changedAt>=minSeconds*1000)||expired){
   const previous=this.last.get(category)??-1;const choices=lines.map((_,i)=>i).filter(i=>i!==previous);const index=choices.length?choices[Math.floor(this.random()*choices.length)]!:0;
   this.template=lines[index]??'';this.last.set(category,index);this.category=category;this.context=context;this.changedAt=this.selectedAt=now;this.bridge=false;
  }
  if(!lines.length)return '';
  return formatLine(this.template,values);
 }
}
