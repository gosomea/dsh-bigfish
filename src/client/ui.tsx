import {lifeDefaults} from '../companion/life.js';
import {decodeLifestyle} from '../companion/config.js';
import {effectiveLifeOptions,unlockedClips} from '../companion/life-options.js';
import {LifeProgramDirector,type LifeProgramRequest} from '../companion/life-programs.js';
import {listenLifePrograms,playLifeProgram} from './life-program-bridge.js';
import {availableCompanionClips,resolveCompanionBehavior,petMovementAvailable} from '../pet/behaviors.js';
import {PetHomeLayer} from '../pet/home.js';
import {PairedPetScene} from './paired-pet-scene.js';
import {usePartnerPet} from './partner-pet.js';
import {jointPairedClips,pairedRoleIssue} from '../pet/partner.js';
import {useVisibleSettings} from './settings-presence.js';
import {OutfitLayer} from './outfit-layer.js';
import {ownsDisplay} from '../companion/notification-policy.js';
import {motionReduced} from '../domain/motion-policy.js';
import {DailyActivityRotation,LocalSpeechGate,autonomousClipAllowed,movementInterval,adventureInterval,type DailyActivity} from '../companion/activity.js';
import { HomeScene } from './home-scene.js';
import {CompanionCanvas} from './companion-canvas.js';
import {companionClip,companionClips} from './companion-clips.js';
import {useLocalLife} from './use-local-life.js';
import {AdventureScene} from './adventure-scene.js';
import type {AdventureKind} from '../companion/adventures.js';
import {LifeActions} from './life-actions.js';
import { useWander } from './use-wander.js';
import { useCompanionBehavior } from './use-companion-behavior.js';
import {builtinExtensionData} from './builtin-extension.js';
import { actionIdle } from "../pet/action-dialogue.js";
import { isBuiltinAsset } from "../contract/builtin-assets.js";
import { petLibrary } from "../pet/library.js";
import { useIdle } from "./use-idle.js";
import { DialogueBubble, dialogueCategory } from "./dialogue-view.js";
import { categoryMotions } from "../contract/dialogue.js";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import type { Companion } from "./controller.js";
import { classicPack } from "./renderer.js";
import { loadPack, type ScenePack } from "../contract/scenes.js";
import type { Translate, Key } from "./locales.js";
import { usePetDrag } from "./use-pet-drag.js";
import { usePetResize } from "./use-pet-resize.js";
import { defaultPetSize, maxPetSize, minPetSize, petStageWidth } from "./actor-layout.js";
import { usePresentation } from "./use-presentation.js";
import { FishCanvas } from "./fish-canvas.js";
import { SettingsPanel } from "./settings-panel.js";
import type { SettingsPage } from "./settings-navigation.js";
export { FishCanvas } from "./fish-canvas.js";
export { SettingsPanel } from "./settings-panel.js";
export type { SettingsPanelHandle } from "./settings-panel.js";
import type { SettingsPanelHandle } from "./settings-panel.js";
export interface UIProps {
  controller: Companion;
  t: Translate;
}
const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};
export function Widget({ controller, t }: UIProps) {
  useSyncExternalStore(petLibrary.subscribe, petLibrary.getSnapshot);
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const { value: p } = useSyncExternalStore(
    controller.preferences.subscribe,
    controller.preferences.getSnapshot,
  );
  const [programRequest,setProgramRequest]=useState<{serial:number;request:LifeProgramRequest}|null>(null);
  const [voiceState,setVoiceState]=useState<'listen'|'speak'|'idle'>('idle');
  useEffect(()=>{const update=(event:Event)=>setVoiceState((event as CustomEvent).detail?.state??'idle');window.addEventListener('bigfish:voice-display',update);const off=window.bigfishDesktop?.onVoiceDisplay?.(setVoiceState);return()=>{window.removeEventListener('bigfish:voice-display',update);off?.();};},[]);
  const [animation, setAnimation] = useState({ key: "", id: "" });
  const settingsVisible=useVisibleSettings();
  const [open, setOpen] = useState(false),
    [full, setFull] = useState(false),
    [collapsed, setCollapsed] = useState(false),[hovered,setHovered]=useState(false);
  const [initialSettingsPage,setInitialSettingsPage]=useState<SettingsPage>('companionship');
  const [initialAreaOpen,setInitialAreaOpen]=useState(false);
  const popoverRef=React.useRef<HTMLElement>(null),settingsPanelRef=React.useRef<SettingsPanelHandle>(null);
  const closeSettings=React.useCallback(async()=>{const allowed=await settingsPanelRef.current?.confirmTransition('close');if(allowed!==false){setOpen(false);setFull(false);}},[]);
  const returnQuick=React.useCallback(async()=>{const allowed=await settingsPanelRef.current?.confirmTransition('quick');if(allowed!==false){setFull(false);requestAnimationFrame(()=>{if(popoverRef.current)popoverRef.current.scrollTop=0;});}},[]);
  const [pack, setPack] = useState(() => {
    try {
      const raw = localStorage.getItem("bigfish.pack.v1");
      if (raw)
        return loadPack(
          JSON.parse(raw),
          (path) => isBuiltinAsset(path),
          classicPack,
        ).pack;
    } catch {
      /* Optional imported metadata. */
    }
    return classicPack;
  });
  const resize=usePetResize(p.size,size=>controller.preferences.update({size}));
  const {displaySize,dismiss:dismissResize}=resize;
  React.useLayoutEffect(()=>{
    window.bigfishDesktop?.appearance?.(displaySize,p.enabled,resize.provisional);
  },[displaySize,p.enabled,resize.provisional]);
  const { position, dragging, handlers, elementRef, element, move } = usePetDrag(
    displaySize,
    collapsed,
    resize.provisional,
  );
  const shown = usePresentation(view.snapshot, p);
  const companion = useCompanionBehavior({...view,snapshot:shown},p,dragging,open||settingsVisible,collapsed);
  const quietPrefs = companion.quiet || companion.config.importantOnly ? {...p,idleMode:"quiet" as const,greetOnOpen:false,idleHideMessage:true,...(!["waiting-user","failed","blocked"].includes(view.snapshot.state)?{bubbleText:false,bubbleStatus:false}: {})} : p;
  useEffect(() => {
    const changed = () => {
      try {
        const raw = localStorage.getItem("bigfish.pack.v1");
        setPack(
          raw
            ? loadPack(
                JSON.parse(raw),
                (path) => isBuiltinAsset(path),
                classicPack,
              ).pack
            : classicPack,
        );
      } catch {
        /* Retain current pack. */
      }
    };
    addEventListener("bigfish:pack", changed);
    return () => removeEventListener("bigfish:pack", changed);
  }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closeSettings();
    };
    addEventListener("keydown", escape);
    return () => removeEventListener("keydown", escape);
  }, [closeSettings]);
  const localBusy=React.useRef(false),wanderBusy=React.useRef(false);
  const displayOwner=ownsDisplay(companion.host?.display,companion.clientId);
  useEffect(()=>{
    if(open||settingsVisible||collapsed||!p.enabled||!displayOwner)dismissResize();
  },[open,settingsVisible,collapsed,p.enabled,displayOwner,dismissResize]);
  const activity=React.useRef(new DailyActivityRotation()),localSpeech=React.useRef(new LocalSpeechGate());
  const roleData=petLibrary.active?.pet??builtinExtensionData();
  const reduced=motionReduced(p,matchMedia('(prefers-reduced-motion: reduce)').matches);
  const lifeOptions=effectiveLifeOptions(companion.config);
  const partner=usePartnerPet(companion.config.partnerRole);
  const pairOptions={interactions:companion.host?.life.interactions??0,growthUnlocks:lifeOptions.growthUnlocks,richness:p.richness};
  const pairIssue=partner.issue||pairedRoleIssue(petLibrary.active?.pet??null,partner.loaded?.pet??null,pairOptions);
  const pairAvailable=partner.ready&&!pairIssue;
  const pairedIdentity=`${petLibrary.scope}:${petLibrary.active?.key??'builtin'}:${partner.identity}`;
  const rotationHistory=React.useMemo(()=>new Map<string,number>(),[petLibrary.scope,petLibrary.active?.key]);
  const [finishedThought,setFinishedThought]=useState('');
  const [failedPlayback,setFailedPlayback]=useState('');
  const thoughtSerial=JSON.stringify([shown.sessionId,shown.turn]);
  useEffect(()=>{if(shown.state!=='reasoning')setFinishedThought('');},[shown.state]);
  const clips=unlockedClips(petLibrary.active?availableCompanionClips(petLibrary.active.pet,{interactions:companion.host?.life.interactions??0,growthUnlocks:lifeOptions.growthUnlocks}):companionClips.map(c=>c.id),companion.host?.life.interactions??0,lifeOptions.growthUnlocks);
  const ambientClips=clips.filter(clip=>{
    const active=petLibrary.active?.pet;
    if(!active)return autonomousClipAllowed(clip,p.richness);
    const id=resolveCompanionBehavior(active,clip),animation=active.animations.find(a=>a.id===id);
    return !!animation&&animation.intensity<=p.richness;
  });
  const nativeMovement=petLibrary.active?.pet.manifest.behaviors?.movement;
  const movementCapable=!petLibrary.active||petMovementAvailable(petLibrary.active.pet,{interactions:companion.host?.life.interactions??0,growthUnlocks:lifeOptions.growthUnlocks})&&!!nativeMovement&&[nativeMovement.left,nativeMovement.right,nativeMovement.stop].every(id=>petLibrary.active!.pet.animations.find(a=>a.id===id)!.intensity<=p.richness);
  const autonomous=p.enabled&&displayOwner&&!dragging&&!collapsed&&!open&&!settingsVisible&&!companion.quiet&&!companion.config.importantOnly&&!reduced&&shown.state==='idle'&&voiceState==='idle';
  const dailyChannels:DailyActivity[]=['idle'];
  if(autonomous&&(companion.config.groups.body&&ambientClips.some(id=>['sit-down','stretch','sleep'].includes(id))||p.sceneryVisible&&companion.config.groups.home&&companion.config.homeVisible&&ambientClips.some(id=>id==='nest'&&companion.config.bed||id==='desk-tidy'&&companion.config.desk||id==='lamp'&&companion.config.lamp)))dailyChannels.push('life');
  if(autonomous&&!dailyChannels.includes('life')&&(companion.config.groups.adventures&&!petLibrary.active||companion.config.groups.growth&&lifeOptions.storyAutomatic))dailyChannels.push('life');
  if(autonomous&&!hovered&&companion.config.groups.body&&companion.config.movement!=='fixed'&&movementCapable)dailyChannels.push('wander');
  const [restMin,restMax]=movementInterval(p,companion.config);
  activity.current.configure(quietPrefs,dailyChannels,Date.now(),companion.config.activityOverrides?[restMin,restMax]:undefined);
  const scheduledIdle = useIdle(
    shown.state === "idle"&&!open&&!settingsVisible&&!dragging&&!localBusy.current&&!wanderBusy.current&&!companion.current&&voiceState==='idle',
    p.enabled && !collapsed,
    quietPrefs,
    petLibrary.active?.pet.dialogue.idle,
    activity.current,localSpeech.current,
  );
  const recallBlocked=!p.enabled||!displayOwner||voiceState!=='idle'||collapsed||companion.quiet||companion.config.importantOnly||p.idleMode==='quiet'||p.reducedMotion||reduced;
  const movementEnabled=!recallBlocked&&!open&&!settingsVisible&&companion.config.groups.body&&companion.config.movement!=='fixed';
  const urgent=companion.current?.intent.priority==='urgent';
  const taskSettled=['idle','completed','cancelled','failed','limited','interrupted','unknown-end'].includes(view.snapshot.state);
  const wander=useWander({element,position,move,dragging:dragging||resize.dragging,recallBlocked,blockStart:scheduledIdle.active,activity:activity.current,config:{...companion.config,restMin:Math.max(5,Number.isFinite(restMin)?restMin:600),restMax:Math.max(5,Number.isFinite(restMax)?restMax:1200),speed:Math.max(10,companion.config.speed*[.65,.85,1][p.richness]!),radius:Math.max(20,companion.config.radius*[.6,.8,1][p.richness]!)},...(!petLibrary.active?{availableClips:ambientClips}:{}),
    hovered:hovered||resize.provisional,recallEnabled:movementEnabled&&taskSettled&&!urgent,
    enabled:movementEnabled&&!localBusy.current&&!companion.current&&shown.state==='idle',
    capable:movementCapable,authored:!petLibrary.active});
  const returning=wander.returning;
  const canCancelRecall=wander.areaStatusKind==='queued'||wander.areaStatusKind==='returning';
  const walking=wander.phase;
  wanderBusy.current=walking!=='rest';
  const lastDirection=React.useRef<'walk-left'|'walk-right'>('walk-left');
  if(walking==='walk-left'||walking==='walk-right')lastDirection.current=walking;
  const isWalking=walking==='walk-left'||walking==='walk-right';
  const important=companion.current?.intent.priority==='interaction'||urgent;
  const programEnvironment={enabled:p.enabled&&displayOwner,growth:companion.config.groups.growth,life:companion.host?.life??lifeDefaults(),options:lifeOptions,availableClips:clips,automaticClips:ambientClips,pairedClips:partner.ready?jointPairedClips(petLibrary.active?.pet??null,partner.loaded?.pet??null,pairOptions):[],pairedIdentity,blocked:dragging||collapsed||important||returning||voiceState!=='idle'||settingsVisible&&!open,quiet:companion.quiet||companion.config.importantOnly||p.idleMode==='quiet',working:shown.state!=='idle',reduced};
  useEffect(()=>listenLifePrograms(detail=>{if(open||!collapsed){const check=new LifeProgramDirector();if(displayOwner&&!dragging&&!collapsed&&check.start(detail.request,programEnvironment,Date.now())){detail.accepted=true;void closeSettings();setProgramRequest(old=>({serial:(old?.serial??0)+1,request:detail.request}));}}}),[displayOwner,dragging,collapsed,shown.state,important,companion.config,companion.host?.life,open,voiceState,settingsVisible,pairedIdentity,partner.ready,p.richness,closeSettings]);
  const local=useLocalLife({routine:{enabled:p.enabled&&displayOwner,config:companion.config,sceneryVisible:p.sceneryVisible,idleMode:p.idleMode,idleMinSeconds:p.idleMinSeconds,idleMaxSeconds:p.idleMaxSeconds,state:shown.state,tasks:companion.host?.tasks??[],blocked:dragging||collapsed||open||settingsVisible||returning,blockStart:scheduledIdle.active||walking!=='rest'||!!companion.current,urgent:important||voiceState!=='idle',interacting:companion.current?.intent.priority==='interaction',quiet:companion.quiet,reducedMotion:reduced,completionMode:p.completionMode,availableClips:clips,ambientClips,activity:activity.current},
   adventure:{enabled:p.enabled&&p.sceneryVisible&&companion.config.groups.adventures&&!petLibrary.active,quiet:companion.quiet||p.idleMode==='quiet'||companion.config.importantOnly,important:!!companion.current||open||settingsVisible||collapsed||returning||voiceState!=='idle',working:shown.state!=='idle',dragging,availableClips:clips,automaticClips:ambientClips,displayOwner,autoIntervalMs:adventureInterval(p,companion.config),allowedKinds:([companion.config.adventureBox?'box':null,companion.config.adventureBoat?'paper-boat':null,companion.config.adventureFishing?'fishing':null].filter(Boolean) as AdventureKind[]),reducedMotion:reduced},blockAdventureStart:scheduledIdle.active||walking!=='rest'||!!companion.current,program:{...programEnvironment,blocked:programEnvironment.blocked||open||settingsVisible},programRequest});
  localBusy.current=!!local.routine||!!local.adventure||!!local.program;
  companion.setPresentationBusy(localBusy.current||scheduledIdle.active||walking!=='rest'||shown.state!=='idle');
  const localClip=local.program?.clip??local.routine?.clip??local.adventure?.clip;
  const localSerial=local.program?.serial??local.routine?.serial??local.adventure?.clipSerial;
  const localWords=local.program?.text||local.routine?.text||(local.adventure?`小剧场：${local.adventure.text}`:undefined);
  const directWords=local.program?.source==='manual'||local.adventure?.source==='manual'||!!local.routine?.sources.length;
  const localSource=local.program?'program':local.routine?'routine':'adventure';
  const localText=localWords&&localSpeech.current.allow(`local-${localSource}:${localSerial}`,Date.now(),p.talkLevel,directWords)?localWords:undefined;
  const everydayClip=({wave:'wave',tea:'tea',stretch:'stretch',peek:'edge-peek','tail-wag':'tail-comb'} as Record<string,string>)[scheduledIdle.motion];
  const voiceClip=voiceState==='listen'?'screen-read':voiceState==='speak'?'wave':'';
  const currentClip=companion.current?companionClip(companion.current.intent.motion)?.id??'':'';
  const thinking=shown.state==='reasoning'&&finishedThought!==thoughtSerial&&!petLibrary.active
    &&companion.config.groups.steward&&clips.includes('think')&&voiceState==='idle'&&!reduced
    &&!companion.quiet&&!companion.config.importantOnly&&!dragging&&!open&&!settingsVisible;
  const chosen=returning&&wander.clip&&!urgent?{origin:'wander',clip:wander.clip}:important?{origin:'current',clip:currentClip}:voiceState!=='idle'&&shown.state==='idle'?{origin:'voice',clip:voiceClip}:localClip?{origin:'local',clip:localClip}:wander.clip?{origin:'wander',clip:wander.clip}:scheduledIdle.active&&everydayClip&&clips.includes(everydayClip)?{origin:'idle',clip:everydayClip}:currentClip?{origin:'current',clip:currentClip}:thinking?{origin:'think',clip:'think'}:{origin:'voice',clip:shown.state==='idle'?voiceClip:''};
  const serial=chosen.origin==='current'?companion.current?.intent.id??'':chosen.origin==='local'?localSerial??'':chosen.origin==='wander'?wander.serial:chosen.origin==='think'?thoughtSerial:String(scheduledIdle.serial);
  const playbackKey=JSON.stringify([chosen.origin,serial,chosen.clip]);
  useEffect(()=>setFailedPlayback(''),[playbackKey]);
  const bodyClip=petLibrary.active||failedPlayback===playbackKey?'':chosen.clip;
  const holdMs=chosen.origin==='local'?local.program?.holdMs??local.routine?.holdMs:chosen.origin==='wander'?wander.holdMs:undefined;
  const paintIdentity=JSON.stringify([chosen.origin,localSerial??'',petLibrary.scope,petLibrary.active?.key??'builtin',local.program?.kind==='paired'?pairedIdentity:'single']);
  const currentPaint=React.useRef(paintIdentity);currentPaint.current=paintIdentity;
  const pairedReady=React.useRef({identity:'',actors:new Set<string>()});
  const markReady=(actor:string)=>{if(currentPaint.current!==paintIdentity||chosen.origin!=='local'||!localSerial)return;if(pairedReady.current.identity!==paintIdentity)pairedReady.current={identity:paintIdentity,actors:new Set()};pairedReady.current.actors.add(actor);if(!local.program?.pairedClip||pairedReady.current.actors.size>=2){local.onReady(localSerial);if(local.routine?.sources.length)companion.acknowledgeLocalSources(local.routine.sources);}};
  const ready=()=>{if(chosen.origin==='local')markReady('primary');else if(chosen.origin==='wander')wander.onReady(wander.serial);};
  const failed=(reported:string)=>{
    if(reported!==serial)return;
    if(chosen.origin==='wander')wander.onFailed(reported);
    else if(chosen.origin==='local')local.onFailed(reported);
    else if(chosen.origin==='think')setFinishedThought(thoughtSerial);
    else if(chosen.origin==='current')companion.finishFailedGesture(reported);
    else setFailedPlayback(playbackKey);
  };
  const externalClip=petLibrary.active&&chosen.origin==='local'&&localClip?resolveCompanionBehavior(petLibrary.active.pet,localClip,local.program?.kind==='paired'?{paired:local.program.phase==='exit'?'part':true}:{}):null;
  const externalVoice=petLibrary.active&&voiceState!=='idle'&&shown.state==='idle'&&!important?resolveCompanionBehavior(petLibrary.active.pet,`voice-${voiceState}`):null;
  const currentAnimation = animation.key === (petLibrary.active?.key??"")
    ? roleData?.animations.find(a => a.id === animation.id)
    : undefined;
  const category = dialogueCategory(shown, view.activity);
  const semantic = shown.state === 'retrying' ? 'retry' : ({ complete: 'success', waiting: 'attention', start: 'start' } as Record<string, string>)[category] ?? view.activity?.semantic ?? category;
  const matchingAnimation = currentAnimation?.tags.includes(semantic) ? currentAnimation.id : undefined;
  const idle = roleData && matchingAnimation
    ? actionIdle(scheduledIdle, roleData.dialogue, matchingAnimation, p.dialogueJson)
    : scheduledIdle;
  if (!p.enabled) return null;
  if (!displayOwner) return <aside className="bf-widget" style={position}>
    <div className="bf-card"><p>大肥鱼正在另一个窗口陪你</p><button onClick={()=>{if(window.bigfishDesktop)window.bigfishDesktop.settings();else{setOpen(!open);setFull(true);}}}>打开宠物设置</button></div>
    {open&&<section className="bf-popover"><div className="bf-popover-top"><strong>大肥鱼设置</strong><button aria-label={t('close')} onClick={()=>void closeSettings()}>×</button></div><SettingsPanel ref={settingsPanelRef} controller={controller} t={t}/></section>}
  </aside>;

  if (collapsed)
    return (
      <button
        ref={elementRef}
        className="bf-restore"
        data-dragging={dragging}
        {...handlers}
        aria-label={t("expand")}
        onClick={() => setCollapsed(false)}
        style={position}
      >
        {petLibrary.active ? (
          <img
            alt={petLibrary.active.pet.manifest.name}
            src={petLibrary.active.thumbnail}
          />
        ) : (
          "🐋"
        )}
      </button>
    );
  const s = shown;
  const homeEnabled=p.sceneryVisible&&companion.config.groups.home&&companion.config.homeVisible&&(!petLibrary.active||!!petLibrary.active.pet.manifest.home&&petLibrary.active.pet.manifest.capabilities.includes("home"));
  const scenePresentation={motion:bodyClip||idle.motion,state:s.state,quiet:companion.quiet||companion.config.importantOnly||p.idleMode==="quiet",reduced,paused:dragging||collapsed||open||settingsVisible||!displayOwner};
  const interactionPanel=(variant:'section'|'disclosure')=><LifeActions variant={variant} config={companion.config} state={companion.host} demo={view.demo} reducedMotion={reduced} pairAvailable={pairAvailable} pairIssue={pairIssue} onInteract={kind=>{const accepted=companion.interact(kind);if(accepted&&kind!=='ball'&&kind!=='toy')void closeSettings();return accepted;}} onPlayProgram={playLifeProgram}/>;
  const companionTools=<div className="bf-companion-tools"><button type="button" onClick={()=>void controller.preferences.update(current=>{const latest=decodeLifestyle(JSON.parse(current.lifestyleJson)),now=Date.now();return {lifestyleJson:JSON.stringify({...latest,quietUntil:latest.quietUntil>now?0:now+30*60000})};}).catch(()=>{})}>{companion.quiet?'恢复活动':'安静 30 分钟'}</button><span>{companion.quiet?'保留重要提醒':'按你的节奏陪伴'}</span></div>;
  return (
    <aside
      ref={elementRef}
      className="bf-widget"
      data-layout="unified"
      data-movement={companion.config.movement}
      data-scenery-visible={p.sceneryVisible}
      data-settings-open={settingsVisible||open}
      data-dragging={dragging}
      data-routine={local.routine?.clip??''}
      {...handlers}
      data-testid="bigfish-widget"
      onPointerEnter={()=>setHovered(true)}
      onPointerLeave={()=>setHovered(false)}
      style={{
        ...position,
        width: petStageWidth(displaySize,!!window.bigfishDesktop),
      }}
    >
      <DialogueBubble
        key={petLibrary.active?.key ?? "bigfish"}
        roleLines={roleData?.dialogue}
        animation={matchingAnimation}
        snapshot={s}
        overrideText={companion.invite ? "我学会当小管家啦！我能理解任务、记住近期进展，帮你留意多个会话。智能模式会额外消耗模型 token，并将所选会话摘要发送给你选择的模型。" : returning&&!urgent?undefined:companion.current?.intent.text??localText}
        overridePriority={companion.invite?'notice':companion.current?.intent.priority==='interaction'?'interaction':companion.current?.intent.priority==='urgent'?'notice':localText&&directWords?'interaction':'ordinary'}
        prefs={quietPrefs}
        activity={view.activity}
        task={view.task}
        status={t(s.state)}
        idle={returning||isWalking||localBusy.current?{...idle,active:false,showText:false}:idle}
        actions={
          <>
            <button className="bf-recall" aria-label="叫回来" title="回到保存的回家点" onClick={() => {if(wander.recall()&&window.bigfishDesktop)companion.interact("wave","recall");}}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 7-6 7 6M5 8v9h10V8M8 17v-5h4v5"/></svg><span>回家</span></button>
            <button
              aria-label={t("settings")}
              title={t("settings")}
              aria-expanded={open}
              onClick={() => {setInitialSettingsPage('companionship');setInitialAreaOpen(false);if(window.bigfishDesktop)window.bigfishDesktop.settings();else if(open)void closeSettings();else setOpen(true);}}
            >
              ⚙
            </button>
            <button
              aria-label={t("collapse")}
              title={t("collapse")}
              onClick={() => setCollapsed(true)}
            >
              −
            </button>
          </>
        }
        corner={<div
          className="bf-resize-corner"
          role="slider"
          tabIndex={0}
          aria-label="调整角色大小"
          aria-valuemin={minPetSize}
          aria-valuemax={maxPetSize}
          aria-valuenow={displaySize}
          aria-valuetext={`${Math.round(displaySize/defaultPetSize*100)}%`}
          data-dragging={resize.dragging}
          title="拖动右上角调整大小"
          {...resize.handlers}
        />}
      >
        {resize.error&&<p className="bf-resize-error" role="status">大小未保存，请重试</p>}
        {companion.invite && <><div className="bf-button-row"><button disabled={companion.invitePending} onClick={()=>void companion.dismissInvite().then(confirmed=>{if(confirmed){setInitialSettingsPage('intelligence');setOpen(true);setFull(true);}})}>了解并设置</button><button disabled={companion.invitePending} onClick={()=>void companion.dismissInvite()}>保持普通模式</button></div>{companion.inviteError&&<p className="bf-error" role="status">{companion.inviteError}</p>}</>}
        {p.bubbleEnabled && !companion.quiet && !companion.config.importantOnly && !companion.current && p.showStats && s.state !== "idle" && (
          <div className="bf-stats">
            <span>
              {s.rate === null ? "—" : `≈ ${s.rate.toFixed(0)}`}{" "}
              <small>tok/s</small>
            </span>
            <span>{formatTime(s.wallElapsed)}</span>
            {p.autoSpeed &&
              s.modelKey &&
              !s.baseline &&
              ["generating", "reasoning"].includes(s.state) && (
                <span className="bf-calibrating">{t("learning")}</span>
              )}
          </div>
        )}
        {p.bubbleEnabled && view.issue && (
          <p className="bf-error" role="status">
            {t(view.issue as Key)}
          </p>
        )}
        {wander.areaStatus&&<div className="bf-area-notice" data-recall-active={canCancelRecall}>
          <span className="bf-help" role="status" data-testid="activity-area-status" title={wander.areaStatus}>{wander.areaStatus}</span>
          {canCancelRecall
            ? <button type="button" className="bf-text-button" onClick={wander.cancelRecall}>停止回家 <span aria-hidden="true">×</span></button>
            : <>
                {wander.areaStatusKind!=='playback-failed'&&<button type="button" className="bf-text-button" onClick={()=>{if(window.bigfishDesktop){window.bigfishDesktop.settings('activity-area');return;}setInitialSettingsPage('companionship');setInitialAreaOpen(true);setFull(true);setOpen(true);}}>设置回家点</button>}
                <button type="button" className="bf-area-notice-close" aria-label="关闭活动区域提示" title="关闭提示" onClick={wander.dismissAreaStatus}>×</button>
              </>}
        </div>}
        {!view.compatibility.supported && (
          <p className="bf-compatibility" role="status" data-testid="compatibility-warning">
            {t("compatibilityUnsupported")}
          </p>
        )}
      </DialogueBubble>
      <div ref={resize.stageRef} className="bf-stage bf-pet-stage" onClick={event=>{
        if(event.defaultPrevented||dragging||!companion.config.groups.play)return;
        const bounds=event.currentTarget.getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width*340,y=(event.clientY-bounds.top)/bounds.height*250;
        if(x>=275&&y>=100&&y<=225)companion.interact('tail');
        else if(x>=150&&x<285&&y>=15&&y<110)companion.interact('head');
      }}><div className="bf-pet-hit-area" aria-hidden="true"/>{petLibrary.active?<PetHomeLayer loaded={petLibrary.active} enabled={homeEnabled} {...scenePresentation}/>:p.sceneryVisible&&<HomeScene config={companion.config} collections={companion.host?.collections??[]} {...scenePresentation}/>}
      {p.sceneryVisible&&<AdventureScene snapshot={local.adventure} layer="back"/>}
      {bodyClip ? <CompanionCanvas id={bodyClip} mirror={chosen.origin==='wander'&&wander.mirror} opacity={p.opacity} idleActive={scheduledIdle.active&&bodyClip===everydayClip} serial={serial} reduced={reduced} {...(holdMs!==undefined?{holdMs}:{})} frameMs={chosen.origin==='wander'?wander.frameMs:undefined} transition={returning||important||voiceState!=='idle'||shown.state!=='idle'?'urgent':'normal'} onReady={ready} onFailed={failed} onComplete={reported=>{if(chosen.origin==='think'&&reported===serial)setFinishedThought(thoughtSerial);}}/> : <FishCanvas
        snapshot={s}
        scenery={p.sceneryVisible&&!homeEnabled}
        onAnimation={(id) => setAnimation({ key: petLibrary.active?.key ?? "", id })}
        previewSerial={serial} onReady={()=>markReady('primary')} outfit={companion.config.outfit} interactions={companion.host?.life.interactions??0} growthUnlocks={lifeOptions.growthUnlocks}
        prefs={companion.current || companion.quiet || isWalking || localBusy.current ? {...quietPrefs,whipEnabled:false} : quietPrefs}
        previewMotion={externalClip??externalVoice??(isWalking ? petLibrary.active?.pet.manifest.behaviors?.movement?.[walking==='walk-left'?'left':'right'] ?? "" : walking==='stop'?petLibrary.active?.pet.manifest.behaviors?.movement?.stop??"":companion.current?.intent.motion ?? "")}
        t={t}
        activityTag={view.activity?.semantic ?? view.activity?.category}
        pack={pack}
        rotationHistory={rotationHistory}
        dragging={dragging}
        idle={idle}
        activityMotion={
          view.activity && s.state === "tool-running"
            ? categoryMotions[dialogueCategory(s, view.activity)]
            : ""
        }
      />}{!petLibrary.active&&<OutfitLayer outfit={companion.config.outfit} clip={bodyClip}/>}
      <PairedPetScene key={pairedIdentity} enabled={lifeOptions.pairEnabled&&pairAvailable} frame={local.program} reduced={reduced} outfit={companion.config.outfit} partner={partner} prefs={quietPrefs} onReady={()=>markReady('secondary')} onFailed={reported=>{if(currentPaint.current===paintIdentity)local.onFailed(reported);}}/>
      {p.sceneryVisible&&<AdventureScene snapshot={local.adventure} layer="front"/>}
      </div>
      {open && (
        <section ref={popoverRef} className="bf-popover" data-mode={full?'full':'quick'} aria-label={t("settings")}>
          <div className="bf-popover-top">
            <strong>{t("title")}</strong>
            <button aria-label={t("close")} onClick={() => void closeSettings()}>
              ×
            </button>
          </div>
          {!full&&companionTools}
          <SettingsPanel ref={settingsPanelRef} controller={controller} t={t} compact={!full} idle={idle} initialPage={initialSettingsPage} initialAreaOpen={initialAreaOpen} interactionPanel={full?interactionPanel('disclosure'):undefined} companionTools={full?companionTools:undefined} />
          {!full&&<div className="bf-quick-interactions">{interactionPanel('disclosure')}</div>}
          <div className={full?undefined:'bf-quick-footer'}>
            <button className="bf-text-button" onClick={() => {if(full)void returnQuick();else{setFull(true);requestAnimationFrame(()=>{if(popoverRef.current)popoverRef.current.scrollTop=0;});}}}>
              {full ? "返回快捷设置" : t("openSettings")}
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}
