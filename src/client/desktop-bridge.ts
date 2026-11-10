import type {HostSnapshot} from './companion-host.js';
import type {SharedPreferenceSnapshot,PreferenceOp} from '../companion/shared-preferences.js';
import type {DesktopSettings} from '../companion/desktop-settings.js';
import type {WanderFrame} from '../companion/movement.js';
import type {ActivityAreaConfig,ActivityAreaSnapshot} from '../companion/activity-area.js';
export interface DesktopEnvironment {revision:number;packaged?:boolean;settings:DesktopSettings;displays:{id:number;label:string;scaleFactor:number;workArea:{x:number;y:number;width:number;height:number}}[];geometry:{state:'off'|'ready'|'unavailable'|'permission';windows:number;message:string;localGranted?:boolean};voice:{configured:boolean;endpoint:string;model:string};}
export interface DesktopBridge {
 state():Promise<{url:string;connected:boolean;host:HostSnapshot|null;platform:string;clientId?:string}>;
 connect(url:string,token:string):Promise<boolean>;
 preferences?():Promise<SharedPreferenceSnapshot>;
 mutatePreferences?(ops:readonly PreferenceOp[],revision?:number):Promise<SharedPreferenceSnapshot>;
 petRequest?(query:string,bytes?:Uint8Array):Promise<{status:number;bytes:Uint8Array;contentType:string}>;
 openSession?(session:string):Promise<boolean>;
 environment?():Promise<DesktopEnvironment>;
 configureDesktop?(settings:DesktopSettings,revision:number,authorizeGeometry?:boolean,launchAtLogin?:boolean):Promise<boolean>;
 configureVoice?(config:{endpoint:string;model:string;key:string}):Promise<boolean>;
 microphone?():Promise<boolean>;
 transcribe?(audio:Uint8Array,mediaType:string):Promise<string>;
 cancelTranscription?():Promise<void>;
 onGeometryGesture?(fn:(kind:'edge-peek')=>void):()=>void;
 onHostChanged?(fn:()=>void):()=>void;
 voiceDisplay?(state:'listen'|'speak'|'idle'):void;
 onVoiceDisplay?(fn:(state:'listen'|'speak'|'idle')=>void):()=>void;
 onVoiceReset?(fn:()=>void):()=>void;
 request(op:string,body:Record<string,unknown>):Promise<{result:unknown}>;
 dragState(active:boolean):void;
 drag(dx:number,dy:number):void; regions(regions:{x:number;y:number;width:number;height:number}[]):void;
 appearance(size:number,enabled:boolean,preview?:boolean):void;
 walkPolicy(policy:{mode?:'horizontal'|'screen';recallBlocked?:boolean;enabled:boolean;blockStart:boolean;capable:boolean;radius:number;speed:number;restMin:number;restMax:number;readySerial?:string;failedSerial?:string;ready?:boolean;availableClips?:readonly string[]}):void;
 onMotionState?(fn:(frame:WanderFrame)=>void):()=>void;
 onMotion(fn:(motion:'rest'|'walk-left'|'walk-right'|'stop')=>void):()=>void;
 activityArea?():Promise<ActivityAreaSnapshot>;
 configureActivityArea?(value:ActivityAreaConfig,revision:number,displayId?:string):Promise<ActivityAreaSnapshot>;
 onActivityArea?(fn:()=>void):()=>void;
 settings(page?:'activity-area'):void;onSettingsNavigate?(fn:(page:'activity-area')=>void):()=>void;recall():void;cancelRecall():void;onRecall(fn:()=>void):()=>void;
}
declare global {interface Window {bigfishDesktop?:DesktopBridge}}
