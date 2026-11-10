import {InteractionCooldown,type PlayKind} from '../companion/life.js';
import {companionClip} from './companion-clips.js';
import {petLibrary} from '../pet/library.js';
import {useEffect,useRef,useState} from 'react';
import {BehaviorScheduler,noticeSourceKey,sourcesCovered,type NoticeSource,type Scheduled,type Intent} from '../companion/scheduler.js';
import {decodeLifestyle,type Lifestyle} from '../companion/config.js';
import type {Preferences} from '../contract/preferences.js';
import type {CompanionView} from './controller.js';
import {companionRequest,useCompanionHost} from './companion-host.js';
import {notificationPolicy,ownsDisplay} from '../companion/notification-policy.js';
import {useIntroduction} from './use-introduction.js';
import {actionUnlocked,effectiveLifeOptions} from '../companion/life-options.js';
import {petAnimationUnlocked,resolveCompanionBehavior} from '../pet/behaviors.js';
const clientId=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`web-${Math.random()}`;
function hostMotion(intent:string,animate:boolean){
 const clip=intent==='attention'?'confirm-card':intent==='celebrate'?'success-bow':'task-cards',active=petLibrary.active?.pet;
 return !animate?'':active?resolveCompanionBehavior(active,clip)??'':companionClip(clip)?`companion:${clip}`:'';
}
export function useCompanionBehavior(view:CompanionView,prefs:Preferences,dragging:boolean,settingsOpen:boolean,collapsed:boolean){
 const config=decodeLifestyle(JSON.parse(prefs.lifestyleJson));
 const scheduler=useRef(new BehaviorScheduler()),seen=useRef(new Set<string>()),inflight=useRef(new Set<string>()),held=useRef(new Map<string,{intent:Intent;expiresAt:number}>());
 const directUntil=useRef(0);
 const presentationBusy=useRef(false);
 const localSources=useRef(new Set<string>());
 const latestPrefs=useRef(prefs);latestPrefs.current=prefs;
 const noDisplay=useRef(false);
 const blocked=useRef(false);blocked.current=dragging||collapsed||settingsOpen;
 const [current,setCurrent]=useState<Scheduled|null>(null);
 const {state:host,refresh}=useCompanionHost(!view.demo&&prefs.enabled);
 const ownerId=window.bigfishDesktop?host?.localClient??null:clientId;
 noDisplay.current=!ownsDisplay(host?.display,ownerId);blocked.current=blocked.current||noDisplay.current;
 const quiet=config.quietUntil>Date.now();
 const introduction=useIntroduction({host,client:ownerId,eligible:prefs.enabled&&!view.demo&&!dragging&&!settingsOpen&&!collapsed&&!quiet&&!config.importantOnly&&!current&&view.snapshot.state==='idle',refresh});
 useEffect(()=>{
  if(window.bigfishDesktop||view.demo||!prefs.enabled)return;
  const claim=()=>{void companionRequest(document.visibilityState==='visible'?'lease':'release',{client:clientId,kind:'web'}).catch(()=>{});};
  claim();const timer=setInterval(claim,5000);document.addEventListener('visibilitychange',claim);
  const release=()=>{void companionRequest('release',{client:clientId},true).catch(()=>{});};addEventListener('pagehide',release);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',claim);removeEventListener('pagehide',release);release();};
 },[view.demo,prefs.enabled]);
 useEffect(()=>{const s=scheduler.current;s.quietUntil=config.quietUntil;s.importantOnly=config.importantOnly;
  const timer=setInterval(()=>{
   const now=Date.now(),unavailable=blocked.current||document.visibilityState!=='visible';
   for(const [id,item] of held.current)if(item.expiresAt<=now)held.current.delete(id);
   if(!unavailable)for(const item of held.current.values())s.submit({...item.intent,createdAt:now,expiresAt:Math.min(item.expiresAt,now+30000)},now);
   const next=s.tick(now,dragging||collapsed||noDisplay.current||document.visibilityState!=='visible'||(settingsOpen&&now>=directUntil.current),{occupied:presentationBusy.current,boundary:!presentationBusy.current});if(next)held.current.delete(next.intent.id);
   setCurrent(old=>old===next?old:next);
  },100);
  return()=>clearInterval(timer);
 },[config.quietUntil,config.importantOnly,dragging,collapsed,settingsOpen]);
 useEffect(()=>{
  if(!host)return;
  for(const [id,item] of held.current)if(!host.insights.some(i=>i.id===id)){
   held.current.delete(id);scheduler.current.cancel(item.intent.key);
  }
  for(const [id,item] of held.current){const insight=host.insights.find(i=>i.id===id);if(insight?.intent!=='celebrate')continue;const policy=notificationPolicy(insight,prefs);if(!policy){held.current.delete(id);scheduler.current.cancel(item.intent.key);}else item.intent={...item.intent,motion:hostMotion(insight.intent,policy.animate),durationMs:policy.durationMs};}
  if(current?.intent.key.startsWith('host-')){
   const insight=host.insights.find(i=>i.id===current.intent.id);
   if(!insight)scheduler.current.cancel(current.intent.key);
   else if(insight.intent==='celebrate'){
    const policy=notificationPolicy(insight,prefs),motion=policy?hostMotion(insight.intent,policy.animate):'';
    if(!policy)scheduler.current.cancel(current.intent.key);
    else if(current.intent.motion!==motion||current.intent.durationMs!==policy.durationMs)scheduler.current.revise(current.intent.key,{motion,durationMs:policy.durationMs});
   }
  }
  if(blocked.current||document.visibilityState!=='visible')return;
  const owner=ownerId;
  if(!owner||host.display?.client!==owner)return;
  const now=Date.now();
  for(const insight of host.insights){
   if((!config.groups.steward&&!insight.system)||insight.announcedAt!==undefined||seen.current.has(insight.id)||inflight.current.has(insight.id)||(insight.expiresAt!==undefined?now>=insight.expiresAt:!insight.system&&now-insight.createdAt>60000))continue;
   inflight.current.add(insight.id);
   void companionRequest('announce',{id:insight.id,client:owner}).then(won=>{
    if(!won)return;seen.current.add(insight.id);
    const presentation=notificationPolicy(insight,latestPrefs.current);
    if(!presentation||(insight.intent==='celebrate'&&sourcesCovered(insight.sources,localSources.current)))return;
    // Preserve a won notice locally if settings or a drag opened while the claim was in flight.
    const key=insight.intent==='attention'?'host-attention':'host-summary';
    for(const [id,item] of held.current)if(item.intent.key===key)held.current.delete(id);
    held.current.set(insight.id,{expiresAt:insight.expiresAt??now+(insight.system?86400000:60000),intent:{id:insight.id,key,priority:insight.intent==='attention'?'urgent':'background',motion:hostMotion(insight.intent,presentation.animate),text:insight.text,createdAt:now,expiresAt:now+30000,durationMs:presentation.durationMs,interruptibleAfterMs:Math.min(4000,presentation.durationMs),cooldownMs:10000,sources:insight.sources}});
   }).catch(()=>{}).finally(()=>inflight.current.delete(insight.id));
  }
  if(seen.current.size>100)seen.current=new Set([...seen.current].slice(-50));
 },[host,config.groups.steward,dragging,collapsed,settingsOpen,ownerId,current?.intent.id,prefs.completionMode,prefs.completionSeconds]);
 const gestureGate=useRef(new InteractionCooldown());
 useEffect(()=>{
  return window.bigfishDesktop?.onGeometryGesture?.(()=>{
   const now=Date.now();
   if(blocked.current||view.snapshot.state!=='idle'||!prefs.enabled||!config.groups.body||config.importantOnly||config.quietUntil>now||petLibrary.active)return;
   scheduler.current.submit({id:`geometry-${now}`,key:'geometry-edge',priority:'life',motion:'companion:edge-peek',text:'到窗口边缘啦，先停下来看看～',createdAt:now,expiresAt:now+8000,durationMs:5240,interruptibleAfterMs:5240,cooldownMs:60000},now);
  });
 },[view.snapshot.state,prefs.enabled,config.groups.body,config.importantOnly,config.quietUntil]);
 const acknowledgeLocalSources=(sources:readonly NoticeSource[])=>{
  for(const source of sources)localSources.current.add(noticeSourceKey(source));
  if(localSources.current.size>200)localSources.current=new Set([...localSources.current].slice(-100));
  const duplicate=(id:string,refs:readonly NoticeSource[]|undefined)=>host?.insights.find(i=>i.id===id)?.intent==='celebrate'&&sourcesCovered(refs,localSources.current);
  for(const [id,item] of held.current)if(duplicate(id,item.intent.sources)){held.current.delete(id);scheduler.current.cancel(item.intent.key);}
  if(current&&duplicate(current.intent.id,current.intent.sources))scheduler.current.cancel(current.intent.key);
 };
 const interact=(kind:PlayKind,feedback?:'recall')=>{
  if(!config.groups.play||gestureGate.current.remaining(Date.now())>0)return false;
  const now=Date.now(),name=config.nickname?`${config.nickname}，`:'';
  const phrases:Record<Lifestyle['personality'],Record<typeof kind,string>>={
   gentle:{wave:`${name}我在这里，慢慢来～`,tea:'一起喝口茶吧。',biscuit:'分你半块小饼干～',tail:'尾巴梳顺了，舒服多了。',head:'轻轻摸摸头，收到你的心意啦～',ball:'接住啦，再来一球！',toy:'小纸鱼，慢慢游～'},
   serious:{wave:`${name}收到，我在。`,tea:'短暂休息，喝口茶。',biscuit:'补充一点能量。',tail:'整理完毕，继续陪你。',head:'收到，精神补充完毕。',ball:'目标锁定，接球。',toy:'我来观察小纸鱼的路线。'},
   playful:{wave:`${name}小鲸鱼到！`,tea:'茶杯稳稳的，尾巴也乖乖的～',biscuit:'一人一半，不许抢我的哦～',tail:'尾巴今天也要闪闪亮亮！',head:'嘿嘿，再摸一下就好～',ball:'嘿！球球别跑！',toy:'纸鱼今天也是我的好朋友！'},
  };
  const active=petLibrary.active?.pet;
  const authored=feedback??{wave:'wave',tea:'tea',biscuit:'biscuit',tail:'tail-comb',head:'head-pat',ball:'ball-catch',toy:'fish-toy'}[kind];
  const {growthUnlocks}=effectiveLifeOptions(config);
  if(!actionUnlocked(authored,host?.life.interactions??0,growthUnlocks))return false;
  const motion=active ? active.manifest.behaviors?.interactions?.[kind] ?? active.manifest.fallbacks.idle : companionClip(authored)?`companion:${authored}`:{wave:'wave',tea:'tea',biscuit:'bigfish:biscuit-share',tail:'bigfish:tail-comb',head:'wave',ball:'wave',toy:'peek'}[kind];
  if(active){const animation=active.animations.find(a=>a.id===motion);if(!animation||!petAnimationUnlocked(animation,host?.life.interactions??0,growthUnlocks))return false;}
  for(const previous of ['wave','tea','biscuit','tail','head','ball','toy'])scheduler.current.cancel(`touch-${previous}`);
  const accepted=scheduler.current.submit({id:`touch-${now}`,key:`touch-${kind}`,priority:'interaction',motion,text:phrases[config.personality][kind],createdAt:now,expiresAt:now+12000,durationMs:8000,interruptibleAfterMs:6000,cooldownMs:config.interactionCooldown*1000},now);
  if(accepted)directUntil.current=now+8000;
  if(accepted)gestureGate.current.accept(now,config.interactionCooldown*1000);
  if(accepted&&config.groups.growth&&!view.demo)void companionRequest('interaction',{kind}).catch(()=>{});
  return accepted;
 };
 const finishFailedGesture=(id:string)=>{
  if(current?.intent.id!==id)return;
  scheduler.current.cancel(current.intent.key,id);
  setCurrent(previous=>previous?.intent.id===id?null:previous);
 };
 return {config,quiet,current,host,invite:introduction.invite,invitePending:introduction.pending,inviteError:introduction.error,dismissInvite:introduction.dismiss,interact,finishFailedGesture,clientId:ownerId,acknowledgeLocalSources,setPresentationBusy:(busy:boolean)=>{presentationBusy.current=busy;}};
}
