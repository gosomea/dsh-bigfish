import {decodeActivityAreaRecord,invalidActivityArea,decodeActivityArea,type ActivityAreaConfig,type ActivityAreaSnapshot} from '../companion/activity-area.js';
const key='bigfish.activity-area.v1',event='bigfish-activity-area';
export function webActivityArea():ActivityAreaSnapshot {
 let stored;try{stored=decodeActivityAreaRecord(localStorage.getItem(key));}catch{stored={revision:0,config:invalidActivityArea(),invalid:true};}
 const area={x:8,y:8,width:Math.max(0,innerWidth-16),height:Math.max(0,innerHeight-28)},el=document.querySelector('[data-testid="bigfish-widget"]'),b=el?.getBoundingClientRect();
 return {...stored,area,size:{width:b?.width??0,height:b?.height??0},position:{x:b?.x??area.x,y:b?.y??area.y},measured:!!b&&b.width>0&&b.height>0};
}
export async function readActivityArea():Promise<ActivityAreaSnapshot>{return window.bigfishDesktop?.activityArea?window.bigfishDesktop.activityArea():webActivityArea();}
export async function saveActivityArea(value:ActivityAreaConfig,revision:number,displayId?:string):Promise<ActivityAreaSnapshot>{
 const config=decodeActivityArea(value);
 if(window.bigfishDesktop){if(!window.bigfishDesktop.configureActivityArea)throw Error('此桌面版本尚不支持活动区域，请更新桌面应用');return window.bigfishDesktop.configureActivityArea(config,revision,displayId);}
 const current=webActivityArea();if(current.revision!==revision)throw Error('活动区域已在另一窗口更新，请重新读取后保存');
 localStorage.setItem(key,JSON.stringify({revision:revision+1,config}));window.dispatchEvent(new Event(event));return webActivityArea();
}
export function listenActivityArea(callback:()=>void):()=>void {
 const storage=(e:StorageEvent)=>{if(e.key===null||e.key===key)callback();};window.addEventListener('storage',storage);window.addEventListener(event,callback);
 const off=window.bigfishDesktop?.onActivityArea?.(()=>callback());return()=>{window.removeEventListener('storage',storage);window.removeEventListener(event,callback);off?.();};
}
