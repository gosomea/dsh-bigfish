import type {Area,Point} from './movement.js';

export interface NormalizedRect {x:number;y:number;width:number;height:number}
export interface ActivityAreaConfig {version:1;enabled:boolean;allowed:NormalizedRect|null;forbidden:NormalizedRect[];home:Point|null}
export type ActivityAreaStatus=''|'outside'|'no-space'|'unreachable'|'returning'|'home-blocked'|'unavailable'|'queued'|'cancelled'|'home-missing'|'recovered'|'playback-failed';
export const activityAreaDefaults=():ActivityAreaConfig=>({version:1,enabled:false,allowed:null,forbidden:[],home:null});
export const invalidActivityArea=():ActivityAreaConfig=>({version:1,enabled:true,allowed:null,forbidden:[{x:0,y:0,width:1,height:1}],home:null});
const unit=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function decodeActivityArea(raw:unknown):ActivityAreaConfig {
 if(!object(raw)||raw.version!==1||typeof raw.enabled!=='boolean'||Object.keys(raw).some(k=>!['version','enabled','allowed','forbidden','home'].includes(k)))throw Error('活动区域配置无效');
 const rect=(v:unknown):NormalizedRect=>{if(!object(v)||Object.keys(v).length!==4||!unit(v.x)||!unit(v.y)||!unit(v.width)||!unit(v.height)||v.width<.01||v.height<.01||v.x+v.width>1.0000001||v.y+v.height>1.0000001)throw Error('区域必须在屏幕内，宽高至少为 1%');return {x:v.x,y:v.y,width:v.width,height:v.height};};
 if(!Array.isArray(raw.forbidden)||raw.forbidden.length>8)throw Error('最多设置 8 个禁行区');
 if(raw.home!==null&&(!object(raw.home)||Object.keys(raw.home).length!==2||!unit(raw.home.x)||!unit(raw.home.y)))throw Error('回家点必须在屏幕内');
 return {version:1,enabled:raw.enabled,allowed:raw.allowed===null?null:rect(raw.allowed),forbidden:raw.forbidden.map(rect),home:raw.home===null?null:{x:(raw.home as unknown as Point).x,y:(raw.home as unknown as Point).y}};
}
export function decodeActivityAreaRecord(raw:string|null):{revision:number;config:ActivityAreaConfig;invalid:boolean}{
 if(raw===null)return {revision:0,config:activityAreaDefaults(),invalid:false};
 try{const value=JSON.parse(raw);if(!object(value)||Object.keys(value).some(k=>!['revision','config'].includes(k))||!Number.isSafeInteger(value.revision)||(value.revision as number)<0)throw Error('Invalid stored revision');return {revision:value.revision as number,config:decodeActivityArea(value.config),invalid:false};}
 catch{return {revision:0,config:invalidActivityArea(),invalid:true};}
}
export const activityAreaMessage=(status:ActivityAreaStatus)=>({
 '':'',outside:'当前位置在允许区外或禁行区内，请把大肥鱼拖到可活动位置。',
 'no-space':'当前区域放不下完整角色，请扩大允许区、减少禁行区或缩小角色。',
 unreachable:'这条路线被禁行区挡住了，大肥鱼会留在原地。',
 returning:'来啦，正在沿安全路线回家。',
 'home-blocked':'回家点无法安全到达，请调整回家点或把大肥鱼拖到同一可达区域。',
 unavailable:'当前为固定、安静或缺少行走素材，暂时不能走回家。',
 queued:'已记下回家请求，关闭设置并等当前任务结束后走。',
 cancelled:'已按你的拖动取消这次回家。',
 'home-missing':'还没有保存回家点，请在活动区域设置中记录当前位置。',
 recovered:'已找回屏幕内的安全位置；保存回家点后，可以沿路线走回家。',
 'playback-failed':'行走素材加载失败，大肥鱼已停下。可以稍后再试。',
})[status];
export interface ActivityAreaSnapshot {revision:number;config:ActivityAreaConfig;area:Area;size:{width:number;height:number};position:Point;measured:boolean;displayId?:string;invalid?:boolean}
interface Domain {allowed:Area;blocked:Area[];fits:boolean}
const epsilon=.001;
function domain(area:Area,size:{width:number;height:number},config?:ActivityAreaConfig,exactBounds=false):Domain {
 const source=config?.enabled&&config.allowed?config.allowed:{x:0,y:0,width:1,height:1};
 const left=area.x+source.x*area.width,top=area.y+source.y*area.height;
 const right=area.x+(source.x+source.width)*area.width-size.width,bottom=area.y+(source.y+source.height)*area.height-size.height;
 const x=exactBounds?left:Math.ceil(left),y=exactBounds?top:Math.ceil(top);
 const allowed={x,y,width:(exactBounds?right:Math.floor(right))-x,height:(exactBounds?bottom:Math.floor(bottom))-y};
 const blocked=config?.enabled?config.forbidden.map(r=>{const x=Math.floor(area.x+r.x*area.width-size.width),y=Math.floor(area.y+r.y*area.height-size.height);return {x,y,width:Math.ceil(area.x+(r.x+r.width)*area.width)-x,height:Math.ceil(area.y+(r.y+r.height)*area.height)-y};}):[];
 return {allowed,blocked,fits:allowed.width>=0&&allowed.height>=0};
}
const inside=(p:Point,a:Area)=>p.x>=a.x-epsilon&&p.y>=a.y-epsilon&&p.x<=a.x+a.width+epsilon&&p.y<=a.y+a.height+epsilon;
const interior=(p:Point,a:Area)=>p.x>a.x+epsilon/10&&p.y>a.y+epsilon/10&&p.x<a.x+a.width-epsilon/10&&p.y<a.y+a.height-epsilon/10;
function pointSafe(p:Point,d:Domain){return d.fits&&inside(p,d.allowed)&&!d.blocked.some(a=>interior(p,a));}
/** Liang-Barsky against an obstacle's open interior: touching a planted boundary is legal. */
function crosses(a:Point,b:Point,r:Area):boolean {
 const lo={x:r.x+epsilon/10,y:r.y+epsilon/10},hi={x:r.x+r.width-epsilon/10,y:r.y+r.height-epsilon/10};let enter=0,exit=1;
 for(const key of ['x','y'] as const){const delta=b[key]-a[key];if(Math.abs(delta)<1e-9){if(a[key]<=lo[key]||a[key]>=hi[key])return false;continue;}const t1=(lo[key]-a[key])/delta,t2=(hi[key]-a[key])/delta;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>=exit)return false;}
 return exit>0&&enter<1&&enter<exit;
}
const visible=(a:Point,b:Point,d:Domain)=>pointSafe(a,d)&&pointSafe(b,d)&&!d.blocked.some(r=>crosses(a,b,r));
export function activityPointSafe(p:Point,area:Area,size:{width:number;height:number},config?:ActivityAreaConfig){return pointSafe(p,domain(area,size,config));}
export function activitySegmentSafe(a:Point,b:Point,area:Area,size:{width:number;height:number},config?:ActivityAreaConfig){return visible(a,b,domain(area,size,config));}
/** Visibility graph in the actor's configuration space; every segment protects its full footprint. */
export function activityRoute(start:Point,target:Point,area:Area,size:{width:number;height:number},config?:ActivityAreaConfig):Point[]|null {
 return routeWithin(start,target,domain(area,size,config));
}
function routeWithin(start:Point,target:Point,d:Domain):Point[]|null {
 if(!pointSafe(start,d)||!pointSafe(target,d))return null;
 if(visible(start,target,d))return [{...target}];
 const vertices=[start,target,...d.blocked.flatMap(r=>[{x:r.x-epsilon,y:r.y-epsilon},{x:r.x+r.width+epsilon,y:r.y-epsilon},{x:r.x-epsilon,y:r.y+r.height+epsilon},{x:r.x+r.width+epsilon,y:r.y+r.height+epsilon}]).map(p=>({x:Math.max(d.allowed.x,Math.min(d.allowed.x+d.allowed.width,p.x)),y:Math.max(d.allowed.y,Math.min(d.allowed.y+d.allowed.height,p.y))})).filter(p=>pointSafe(p,d))];
 const distance=vertices.map(()=>Infinity),previous=vertices.map(()=>-1),used=new Set<number>();distance[0]=0;
 while(used.size<vertices.length){let current=-1;for(let i=0;i<vertices.length;i++)if(!used.has(i)&&(current<0||distance[i]!<distance[current]!))current=i;if(current<0||!Number.isFinite(distance[current]))break;if(current===1){const route:Point[]=[];for(let i=1;i!==0;i=previous[i]!){if(i<0)return null;route.unshift({...vertices[i]!});}return route;}used.add(current);
  for(let i=0;i<vertices.length;i++)if(!used.has(i)&&visible(vertices[current]!,vertices[i]!,d)){const next=distance[current]!+Math.hypot(vertices[current]!.x-vertices[i]!.x,vertices[current]!.y-vertices[i]!.y);if(next<distance[i]!){distance[i]=next;previous[i]=current;}}
 }
 return null;
}
export function activityReturnRoute(start:Point,target:Point,area:Area,size:{width:number;height:number},config?:ActivityAreaConfig):Point[]|null {
 const homeConfig=config?{...config,allowed:null}:config;
 // DOM geometry and the explicit home target share fractional CSS pixels.
 const bounds=domain(area,size,homeConfig,true);
 const direct=routeWithin(start,target,bounds);
 if(direct)return direct;
 if(!config||config.forbidden.length!==0||!pointSafe(target,bounds))return null;
 const safeCandidate=activityCandidates(area,size,homeConfig).sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)-Math.hypot(b.x-start.x,b.y-start.y))[0];if(!safeCandidate)return null;
 const normalRoute=routeWithin(safeCandidate,target,bounds);return normalRoute?[{...safeCandidate},...normalRoute]:null;
}
export function activityCandidates(area:Area,size:{width:number;height:number},config?:ActivityAreaConfig):Point[]{
 const d=domain(area,size,config);if(!d.fits)return [];
 const a=d.allowed,points:Point[]=[];for(const x of [0,.25,.5,.75,1])for(const y of [0,.25,.5,.75,1])points.push({x:a.x+a.width*x,y:a.y+a.height*y});
 for(const r of d.blocked)points.push(...[{x:r.x-epsilon,y:r.y-epsilon},{x:r.x+r.width+epsilon,y:r.y-epsilon},{x:r.x-epsilon,y:r.y+r.height+epsilon},{x:r.x+r.width+epsilon,y:r.y+r.height+epsilon}]);
 return points.map(p=>({x:Math.max(a.x,Math.min(a.x+a.width,p.x)),y:Math.max(a.y,Math.min(a.y+a.height,p.y))})).filter(p=>pointSafe(p,d));
}
export function activityPositionStatus(position:Point,area:Area,size:{width:number;height:number},config?:ActivityAreaConfig):ActivityAreaStatus {
 if(!config?.enabled)return '';if(!activityCandidates(area,size,config).length)return 'no-space';return activityPointSafe(position,area,size,config)?'':'outside';
}
export function activityHomeTarget(config:ActivityAreaConfig,area:Area,size:{width:number;height:number}):Point|null {
 if(!config.home)return null;return {x:Math.max(area.x,Math.min(area.x+area.width-size.width,area.x+config.home.x*area.width-size.width/2)),y:Math.max(area.y,Math.min(area.y+area.height-size.height,area.y+config.home.y*area.height-size.height/2))};
}
export function activityDefaultHomeTarget(config:ActivityAreaConfig,area:Area,size:{width:number;height:number}):Point|null {
 if(config.home)return activityHomeTarget(config,area,size);
 const d=domain(area,size,config);if(!d.fits)return null;const corner={x:d.allowed.x+d.allowed.width,y:d.allowed.y+d.allowed.height};if(pointSafe(corner,d))return corner;
 return activityCandidates(area,size,config).sort((a,b)=>Math.hypot(a.x-corner.x,a.y-corner.y)-Math.hypot(b.x-corner.x,b.y-corner.y))[0]??null;
}
export function activityHomePoint(position:Point,area:Area,size:{width:number;height:number}):Point{return {x:Math.max(0,Math.min(1,(position.x+size.width/2-area.x)/area.width)),y:Math.max(0,Math.min(1,(position.y+size.height/2-area.y)/area.height))};}
