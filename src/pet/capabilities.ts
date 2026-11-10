export const interactionKinds=['head','tail','biscuit','tea','ball','toy','wave','click'] as const;
export type InteractionKind=typeof interactionKinds[number];
export const lifeActions=['sit-down','wake-up','sleep','stretch','lie-down','nest','desk-tidy','lamp','book-close','postcard','success-bow','failure-check','point'] as const;
export type LifeAction=typeof lifeActions[number];
export const homeActions=['nest','desk-tidy','lamp'] as const;
export interface MovementActions {left:string;right:string;stop:string;turn?:string}
export type AnchorPoint={x:number;y:number};
export type AccessoryAnchors=Partial<Record<'head'|'neck'|'chest',AnchorPoint>>;
export interface PetBody {bounds:{x:number;y:number;width:number;height:number};foot:AnchorPoint;accessories?:AccessoryAnchors}
export interface PetBehaviors {movement?:MovementActions;interactions?:Partial<Record<InteractionKind,string>>;life?:Partial<Record<LifeAction,string>>;home?:Partial<Record<typeof homeActions[number],string>>;voice?:{listen:string;speak:string};paired?:{greet:string;exchange:string;part:string}}
export interface PetHome {background:string}
export function validateAccessoryAnchors(value:any,width:number,height:number){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('装扮锚点无效');
 for(const [key,p] of Object.entries(value) as [string,any][]){if(!['head','neck','chest'].includes(key)||!p||typeof p!=='object'||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>width||p.y>height)throw Error('装扮锚点越出角色画布');}
}
/** Optional data-only additions; every behavior must reference actual packaged artwork. */
export function validateBehaviors(p:any,animations:{id:string;frames:{rect:number[];asset:string}[]}[]){
 const finite=(v:any,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 if(p.body!==undefined){
  const b=p.body?.bounds,f=p.body?.foot;
  if(!b||!f||!finite(b.x,0,p.canvas.width)||!finite(b.y,0,p.canvas.height)||!finite(b.width,1,p.canvas.width-b.x)||!finite(b.height,1,p.canvas.height-b.y)||!finite(f.x,b.x,b.x+b.width)||!finite(f.y,b.y,b.y+b.height))throw Error('身体边界或落脚点无效');
  if(p.body.accessories!==undefined)validateAccessoryAnchors(p.body.accessories,p.canvas.width,p.canvas.height);
 }
 const check=(id:unknown)=>{if(typeof id!=='string'||!animations.some(a=>a.id===id))throw Error('行为引用了不存在的动作');};
 const mapping=(raw:any,keys:readonly string[],label:string)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Object.keys(raw).length)throw Error(`${label}声明无效`);for(const [key,value]of Object.entries(raw)){if(!keys.includes(key))throw Error(`未知${label}类型`);check(value);}};
 if(p.behaviors!==undefined){
  if(!p.behaviors||typeof p.behaviors!=='object'||Array.isArray(p.behaviors))throw Error('行为声明无效');
  if(p.behaviors.movement!==undefined){
   const m=p.behaviors.movement;if(!m||typeof m!=='object')throw Error('行走声明无效');
   for(const key of ['left','right','stop'])check(m[key]);if(m.turn!==undefined)check(m.turn);
   for(const key of ['left','right']){const a=animations.find(a=>a.id===m[key])!;if(new Set(a.frames.map(f=>JSON.stringify([f.asset,f.rect]))).size<2)throw Error('行走需要至少两张不同姿态，不能平移站立图');}
  }
  if(p.behaviors.interactions!==undefined)mapping(p.behaviors.interactions,interactionKinds,'触摸');
  if(p.behaviors.life!==undefined)mapping(p.behaviors.life,lifeActions,'生活');
  if(p.behaviors.home!==undefined)mapping(p.behaviors.home,homeActions,'家园');
  if(p.behaviors.voice!==undefined){mapping(p.behaviors.voice,['listen','speak'],'语音展示');check(p.behaviors.voice.listen);check(p.behaviors.voice.speak);}
  if(p.behaviors.paired!==undefined){mapping(p.behaviors.paired,['greet','exchange','part'],'双宠');for(const key of ['greet','exchange','part'])check(p.behaviors.paired[key]);}
 }
 if(p.home!==undefined){if(!p.home||typeof p.home!=='object'||typeof p.home.background!=='string'||!Object.hasOwn(p.assets??{},p.home.background))throw Error('家园背景必须引用包内图片资源');}
 if(p.capabilities.includes('movement')&&(!p.body||!p.behaviors?.movement))throw Error('行走能力需要身体边界、落脚点及动作映射');
 if(p.capabilities.includes('touch')&&!Object.keys(p.behaviors?.interactions??{}).length)throw Error('触摸能力需要至少一个动作映射');
 for(const [cap,key]of [['life','life'],['home','home'],['voice-display','voice'],['paired','paired']] as const)if(p.capabilities.includes(cap)&&!Object.keys(p.behaviors?.[key]??{}).length)throw Error(`${cap}能力需要真实动作映射`);
 if(p.capabilities.includes('home')&&!p.home)throw Error('家园能力需要真实背景图片');
 if(p.capabilities.includes('paired')&&!p.body)throw Error('双宠能力需要身体碰撞边界');
}
