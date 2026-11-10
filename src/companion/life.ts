import type {Collection} from './state.js';

export const playKinds=['wave','tea','biscuit','tail','head','ball','toy'] as const;
export type PlayKind=typeof playKinds[number];
export const playLabels:Record<PlayKind,string>={wave:'招手问候',tea:'一起喝茶',biscuit:'分享饼干',tail:'整理尾巴',head:'轻轻摸头',ball:'一起抛球',toy:'逗小纸鱼'};
/** A local gesture gate. All toys share it; rejected gestures must not create diary entries. */
export class InteractionCooldown {
 private readyAt=0;
 remaining(now:number){return Number.isFinite(now)?Math.max(0,this.readyAt-now):Infinity;}
 accept(now:number,cooldownMs:number){
  if(!Number.isFinite(now)||!Number.isFinite(cooldownMs)||cooldownMs<0||this.remaining(now)>0)return false;
  this.readyAt=now+cooldownMs;return true;
 }
}
export interface LifeJournal {id:string;at:number;kind:PlayKind}
export interface LifeState {firstSeen:number;lastInteraction:number;interactions:number;journal:LifeJournal[]}
export const lifeDefaults=():LifeState=>({firstSeen:0,lastInteraction:0,interactions:0,journal:[]});
const growthMilestones=[{count:0,title:'准备认识你'},{count:1,title:'初次相识'},{count:20,title:'默契渐长'},{count:100,title:'熟悉的伙伴'}] as const;
export function growthProgress(life:LifeState){
 const count=Number.isFinite(life.interactions)?Math.max(0,Math.floor(life.interactions)):0;
 const current=[...growthMilestones].reverse().find(m=>count>=m.count)!;
 const next=growthMilestones.find(m=>count<m.count)??null;
 return {count,current,next,progress:next?Math.min(1,(count-current.count)/(next.count-current.count)):1};
}
export function growthStage(life:LifeState){return growthProgress(life).current.title;}
const day=86400000;
/** Anniversaries derive only from the first recorded interaction, with no penalties for absence. */
export function lifeCalendar(life:LifeState,now=Date.now()){
 if(!Number.isFinite(life.firstSeen)||life.firstSeen<=0||!Number.isFinite(now)||now<life.firstSeen)return null;
 const elapsedDays=Math.floor((now-life.firstSeen)/day);
 const nextDays=[7,30,100,365].find(n=>n>elapsedDays)??(Math.floor(elapsedDays/365)+1)*365;
 const label=(days:number)=>days===7?'相识一周':`相识 ${days} 天`;
 const today=[7,30,100,365].includes(elapsedDays)||(elapsedDays>365&&elapsedDays%365===0);
 return {firstSeen:life.firstSeen,elapsedDays,dayNumber:elapsedDays+1,today:today?label(elapsedDays):null,
  next:{days:nextDays,title:label(nextDays),at:life.firstSeen+nextDays*day,daysRemaining:Math.ceil((life.firstSeen+nextDays*day-now)/day)}};
}
/** Require explicit source references; the caller supplies the actual Host collection, never story output. */
export function sourcedCollections(collections:readonly Collection[]){
 return collections.filter(c=>c.kind==='postcard'&&c.sources.length>0&&c.sources.every(s=>!!s.workspace&&!!s.session&&Number.isSafeInteger(s.seq)&&s.seq>=0));
}
export const seasons={spring:'春日',summer:'夏日',autumn:'秋日',winter:'冬日'} as const;
export type Season=keyof typeof seasons;
export function currentSeason(date=new Date()):Season{
 const m=date.getMonth();return m>=2&&m<=4?'spring':m>=5&&m<=7?'summer':m>=8&&m<=10?'autumn':'winter';
}
export function seasonalStory(season:Season,index=0){
 const stories:Record<Season,readonly string[]>={
  spring:['大肥鱼把小窝门前的第一片新叶收进故事书。纸鱼说，它像一把尚未展开的小伞。','她在花盆旁摆了三把贝壳椅，邀请春风坐一会儿。春风只留下了一阵沙沙声。','小纸鱼找到一朵像尾巴的小花。大肥鱼认真点头：这是花园给鲸鱼写的信。'],
  summer:['她用荷叶做了一顶帽子，尾巴仍躲在凉凉的水影里。小纸鱼负责摇扇，扇来的全是泡泡。','小鱼船今天改卖冰镇星星。每一颗都很小，刚好照亮半杯柠檬茶。','大肥鱼把午后的云叫作漂浮枕头，躺下前还记得给小纸鱼留一角阴凉。'],
  autumn:['一片落叶停在小窝门口。她把它当作来自远方的明信片，上面只有风写的弯弯线条。','她捡来三颗圆果子，给纸鱼船添了新的乘客。船长宣布：今天只开到暖茶杯旁。','尾巴扫过落叶，沙沙声变成了一支很轻的曲子。大肥鱼邀请小纸鱼当唯一的听众。'],
  winter:['大肥鱼替小纸鱼织了一条围巾，结果长到能绕小窝一圈。于是大家都有了暖暖的座位。','窗边落下一颗纸做的雪花，她把它挂在灯下：这样冬天也会有一点海的颜色。','她在故事里煮了一壶不会凉的茶。月亮借走一杯，答应在夜深时把光还回来。'],
 };
 const safeIndex=Number.isFinite(index)?Math.abs(Math.floor(index)):0;
 return {title:`${seasons[season]}小剧场`,text:stories[season][safeIndex%stories[season].length]!,fictional:true as const};
}
export function fictionalStory(theme:'sea'|'night'|'garden',index:number){
 const stories={sea:['大肥鱼把一枚贝壳当作门铃，路过的小纸鱼都要轻轻敲一下。','小鱼船开到杯子旁边就停了：今天的海洋是一杯温茶。'],night:['月亮借了一角光，替小窝照亮还没读完的童话。','尾巴绕着枕头打了一个小圈，今晚的梦从那里出发。'],garden:['她给小水草浇水时，发现叶尖上挂着一颗亮晶晶的露珠。','一片落叶成了小伞，大肥鱼邀请纸鱼一起躲雨。']};
 const safeIndex=Number.isFinite(index)?Math.abs(Math.floor(index)):0;
 return stories[theme][safeIndex%stories[theme].length]!;
}
