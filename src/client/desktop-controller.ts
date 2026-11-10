import {SessionTelemetry} from '../domain/session.js';
import {Baselines} from '../domain/baselines.js';
import {engineConfig} from '../contract/preferences.js';
import {PreferenceStore} from './preferences-store.js';
import type {Companion,CompanionView} from './controller.js';
import type {DesktopBridge} from './desktop-bridge.js';
import type {HostSnapshot} from './companion-host.js';
import type {Task} from '../companion/state.js';
import {taskActivity} from '../companion/task-activity.js';
import {DesktopPreferenceScope} from './desktop-preferences.js';

export function desktopTaskActivity(task:Task):'waiting-user'|'awaiting-output'|null {
 const activity=taskActivity(task);
 return activity==='waiting'?'waiting-user':activity==='running'?'awaiting-output':null;
}
/** Read-only Host view. Never synthesize token throughput for a desktop task. */
export class DesktopCompanion implements Companion {
 readonly preferences:PreferenceStore;
 private preferenceScope:DesktopPreferenceScope|null;
 private storageChanged=()=>this.preferences.reloadLocal();
 private listeners=new Set<()=>void>();private timer:ReturnType<typeof setInterval>;private view:CompanionView;private disposed=false;private busy=false;private generation=0;private offHost:(()=>void)|undefined;
 constructor(private bridge:DesktopBridge){
  this.preferenceScope=bridge.preferences?new DesktopPreferenceScope(bridge):null;
  this.preferences=new PreferenceStore(this.preferenceScope,this.preferenceScope?null:localStorage,'bigfish.desktop.preferences.v1');
  const config=engineConfig(this.preferences.getSnapshot().value);
  const engine=new SessionTelemetry('desktop',{now:Date.now},new Baselines(config),config);
  this.view={snapshot:engine.snapshot(),model:'',issue:null,compatibility:{supported:true,kind:'legacy-list-current',capabilities:['desktop-ledger'],missing:[]},demo:false};
  addEventListener('storage',this.storageChanged);
  this.offHost=bridge.onHostChanged?.(()=>{this.generation++;this.busy=false;this.preferenceScope?.reset();this.showHost(null);void this.poll();});
  this.timer=setInterval(()=>void this.poll(),5000);void this.poll();
 }
 private async poll(){if(this.busy||this.disposed)return;this.busy=true;const generation=this.generation;try{
  if(this.preferenceScope)await this.preferenceScope.refresh();
  const {host,connected}=await this.bridge.state();if(this.disposed||generation!==this.generation)return;
  this.showHost(connected?host:null);
 }catch{if(!this.disposed&&generation===this.generation)this.showHost(null);}finally{if(generation===this.generation)this.busy=false;}}
 private showHost(host:HostSnapshot|null){
  const active=(host?.tasks??[]).map(task=>({task,state:desktopTaskActivity(task)})).filter(item=>item.state!==null);
  active.sort((a,b)=>(a.state==='waiting-user'?0:1)-(b.state==='waiting-user'?0:1)||b.task.updatedAt-a.task.updatedAt||a.task.session.localeCompare(b.task.session));
  const current=active[0];
  this.view={...this.view,snapshot:{...this.view.snapshot,state:current?.state??'idle',sessionId:current?.task.session??'desktop',rate:null,whipHz:0,pressure:0},task:current?.task.title,model:host?.policy.model??'',issue:host?null:'connectionError'};
  for(const fn of this.listeners)fn();
 }
 getSnapshot=()=>this.view;subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 canOpenSession=()=>!!this.bridge.openSession;
 openSession=(session:string)=>this.bridge.openSession?.(session).then(()=>{});
 resetLearning(){}dispose(){this.disposed=true;clearInterval(this.timer);removeEventListener('storage',this.storageChanged);this.offHost?.();this.preferenceScope?.dispose();this.preferences.dispose();this.listeners.clear();}
}
