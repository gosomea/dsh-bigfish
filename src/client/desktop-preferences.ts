import {decodePreferences} from '../contract/preferences.js';
import type {PreferenceScope} from './native-contract.js';
import type {DesktopBridge} from './desktop-bridge.js';
/** A disconnected desktop retains its last confirmed view, never silently forks Host preferences. */
export class DesktopPreferenceScope implements PreferenceScope {
 private value:ReturnType<PreferenceScope['getSnapshot']>={status:'loading',mode:'host',writable:false,revision:undefined,value:undefined};
 private listeners=new Set<()=>void>();private busy=false;private disposed=false;private generation=0;
 constructor(private bridge:DesktopBridge){}
 getSnapshot=()=>this.value;subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 private emit(){for(const fn of this.listeners)fn();}
 reset(){this.generation++;this.busy=false;this.value={status:'loading',mode:'host',writable:false,revision:undefined,value:undefined};this.emit();}
 async refresh(){if(this.busy||this.disposed||!this.bridge.preferences)return;this.busy=true;const generation=this.generation;try{const next=await this.bridge.preferences();if(this.disposed||generation!==this.generation)return;this.value={...next,mode:'host',value:decodePreferences(next.value)};this.emit();}catch{if(!this.disposed&&generation===this.generation){this.value={...this.value,status:'error',writable:false};this.emit();}}finally{if(generation===this.generation)this.busy=false;}}
 async mutate(ops:Parameters<PreferenceScope['mutate']>[0],revision?:number){if(!this.bridge.mutatePreferences)throw Error('Host 共享设置接口不可用');const generation=this.generation,next=await this.bridge.mutatePreferences(ops,revision);if(this.disposed)return;if(generation!==this.generation)throw Error('Host 已切换，请重试');this.value={...next,mode:'host',value:decodePreferences(next.value)};this.emit();}
 dispose(){this.disposed=true;this.listeners.clear();}
}
