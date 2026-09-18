import {idleSignFrame} from '../domain/idle-frames.js';
import {WorkMotion} from '../domain/work-motion.js';
import {IdleDirector, type IdlePresentation} from '../domain/idle.js';
import {motionAllowed,motionReduced} from '../domain/motion-policy.js';
import { AirSwing } from '../domain/air-swing.js';
import {spriteUrls,layouts,classicPack} from './sprite-assets.js';
export {classicPack} from './sprite-assets.js';
import {canWhip,type ScenePack} from '../contract/scenes.js';
import {Director,seeded} from '../domain/director.js';
import type {Snapshot} from '../contract/types.js';
import type {Preferences} from '../contract/preferences.js';
import {whipBeat} from './whip-choreography.js';
import {drawAirSwing} from './draw-air-swing.js';
import {motionTransform} from './motion-transform.js';
import {drawSceneProps} from './draw-scene.js';
const active = new Set(['generating', 'reasoning', 'streaming-gap']);
export interface RenderStats { frames: number; lastMs: number; sprite: number; motion: string; scene: string; whipAllowed: boolean }
/** Sprite poses plus per-motion keyframes. Separate clips make non-contact invariant under every motion. */
export class FishRenderer {
  private ctx: CanvasRenderingContext2D;
  private images=Object.fromEntries(Object.keys(spriteUrls).map(key=>[key,new Image()])) as Record<keyof typeof spriteUrls,HTMLImageElement>;
  private get atlas(){return this.images.classic;}
  idlePresentation: IdlePresentation | undefined;
  private idleDirector = new IdleDirector();
  signAlternatives = ['我在等哦'];
  private actionAt = 0;
  private lastAction = '';
  previewMotion = '';
  activityMotion = '';
  private workMotion = new WorkMotion();
  private finishedAt:number|undefined;
  signText = '我在等哦';
  private frame = 0;
  private lastDraw = 0;
  private director: Director;
  private snapshot: Snapshot;
  private prefs: Preferences;
  private turn = '';
  private lastScene = '';
  private transitionStart = 0;
  private animationCursor = 0;
  private cycleComplete = true;
  private phase = 0;
  private swing = new AirSwing();
  private previous = 0;
  private lastSound = 0;
  private audio: AudioContext | null = null;
  private disposed = false;
  private paused = false;
  private onReady: (() => void) | undefined;
  readonly stats: RenderStats = { frames: 0, lastMs: 0, sprite: 0, motion: 'breathe', scene: 'rest', whipAllowed: false };
  constructor(private canvas: HTMLCanvasElement, snapshot: Snapshot, prefs: Preferences,
    private pack: ScenePack = classicPack, onReady?: () => void) {
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D unavailable'); this.ctx = ctx;
    this.snapshot = snapshot; this.prefs = prefs; this.director = new Director(pack, seeded(23)); this.onReady = onReady;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = 340 * dpr; canvas.height = 250 * dpr; ctx.scale(dpr, dpr);
    for(const key of Object.keys(spriteUrls) as (keyof typeof spriteUrls)[]){
      const image=this.images[key];image.onload=()=>{this.onReady?.();this.schedule();};
      image.onerror=()=>{canvas.dataset.error='atlas';this.onReady?.();};image.src=spriteUrls[key];
    }
    document.addEventListener('visibilitychange', this.visibility);
    document.addEventListener('pointerdown', this.audioGesture);
  }
  update(snapshot: Snapshot, prefs: Preferences): void { this.snapshot = snapshot; this.prefs = prefs; this.schedule(); }
  setPaused(paused: boolean): void { this.paused = paused; if (paused) { cancelAnimationFrame(this.frame); this.frame = 0; } else this.schedule(); }
  private audioGesture = () => this.unlockSound();
  unlockSound(): void {
    if (!this.prefs.sound) return;
    this.audio ??= new AudioContext(); void this.audio.resume();
  }
  private visibility = () => { if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; } else { this.previous = 0; this.schedule(); } };
  private schedule() {
    if (!this.disposed && !this.frame && !this.paused && !document.hidden && this.atlas.complete && this.atlas.naturalWidth) this.frame = requestAnimationFrame(this.draw);
  }
  private swoosh(now: number) {
    if (!this.audio || this.audio.state !== 'running' || !this.prefs.sound || now - this.lastSound < 600) return;
    this.lastSound = now;
    const ac = this.audio, oscillator = ac.createOscillator(), gain = ac.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(500, ac.currentTime); oscillator.frequency.exponentialRampToValueAtTime(160, ac.currentTime + .08);
    gain.gain.setValueAtTime(0, ac.currentTime); gain.gain.linearRampToValueAtTime(this.prefs.volume * .12, ac.currentTime + .015); gain.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .09);
    oscillator.connect(gain); gain.connect(ac.destination); oscillator.start(); oscillator.stop(ac.currentTime + .1); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  private draw = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.paused || document.hidden) return;
    if (now - this.lastDraw < 1000 / 30) { this.schedule(); return; }
    const started = performance.now(); const c = this.ctx, p = this.prefs;
    const dt = Math.min(.1, this.previous ? (now - this.previous) / 1000 : 0); this.previous = now; this.lastDraw = now;
    const reduced = motionReduced(p,matchMedia('(prefers-reduced-motion: reduce)').matches);
    const input = { ...this.snapshot, pressure: Math.min(1, this.snapshot.pressure * p.intensity) };
    const task = `${input.sessionId}:${input.turn}`;
    if (task !== this.turn) { this.turn = task; this.phase = 0; this.swing.reset(); this.workMotion=new WorkMotion(); this.transitionStart = now; this.lastScene = ''; }
    const idle=this.idlePresentation??this.idleDirector.tick(Date.now(),input.state==='idle',!document.hidden,p,reduced);
    const idleMotion=input.state==='idle'?(this.previewMotion&&!reduced&&motionAllowed(this.previewMotion,p.richness,reduced)?this.previewMotion:idle.motion):'';
    const stillCompletion=input.state==='completed'&&p.completionMode!=='celebrate';
    const direction = this.director.tick(input, now, {richness:stillCompletion?0:p.richness,reduced:reduced||stillCompletion,idleMotion,switchReady:this.cycleComplete,whipEnabled:p.whipEnabled});
    const scene = this.pack.scenes.find(s => s.id === direction.sceneId)!;
    const toolMotion=this.workMotion.choose(input.state==='tool-running',this.activityMotion,now,this.cycleComplete);
    const requestedMotion=this.previewMotion||toolMotion;
    const action = (requestedMotion && !reduced && motionAllowed(requestedMotion,p.richness,reduced) ? this.pack.scenes.flatMap(s => s.actions).find(a => a.motion === requestedMotion) : undefined) ?? scene.actions.find(a => a.id === direction.actionId)!;
    const actionKey = `${task}:${action.id}`;
    if (actionKey !== this.lastAction) { this.lastAction = actionKey; this.actionAt = now; this.finishedAt=undefined; this.animationCursor=0; this.cycleComplete=false; this.transitionStart=now; }
    const actionTime = (now - this.actionAt) / 1000;
    const theme = p.scene === 'auto' ? scene.theme : p.scene;
    if (direction.sceneId !== this.lastScene) { this.lastScene = direction.sceneId; this.transitionStart = now; }
    if (direction.transition && now - this.transitionStart >= 350) this.director.completeTransition();
    const transition = Math.min(1, (now - this.transitionStart) / 350);
    const safe = canWhip({ x: 124, y: 0, width: 216, height: 230 }, { x: 0, y: 0, width: 103, height: 225 }, 18);
    const hz = Math.min(p.maxWhipHz, this.snapshot.whipHz * p.intensity);
    const working = active.has(input.state) && safe && !reduced && !this.paused && p.enabled && p.whipEnabled;
    const swing = this.swing.tick(dt, hz, working && direction.whipAllowed, working,
      reduced || this.paused || !p.enabled || !p.whipEnabled || ['waiting-user','cancelled','interrupted','disconnected','failed','blocked','limited'].includes(input.state));
    const previousPhase = this.phase; this.phase = swing.cycles;
    const allowed = swing.responding;
    if (allowed && Math.floor(this.phase + .58) !== Math.floor(previousPhase + .58)) this.swoosh(now);
    const beat = whipBeat(this.phase, input.pressure);
    c.clearRect(0, 0, 340, 250);
    drawSceneProps(c,theme, reduced ? 0 : now / 1000, input.activity, false);
    let sprite = action.sprite;
    if (p.richness === 0 && active.has(input.state)) sprite = 3;
    const t = now / 1000, speed = .7 + input.activity * 1.8;
    let {dx,dy,rotation,sy}=reduced||stillCompletion?{dx:0,dy:0,rotation:0,sy:1}:motionTransform(p.richness===0&&active.has(input.state)?'breathe':action.motion,t,speed);
    if (allowed) {
      // Replace independent body oscillations with the response to this exact air swing.
      dx = beat.dx; dy = beat.dy; rotation = beat.rotation; sy = beat.squash;
      if (p.richness === 0) { dx *= .15; dy *= .15; rotation = 0; sy = 1; }
    }
    if(!reduced){const amplitude=[.2,.65,1][p.richness]!;dx*=amplitude;dy*=amplitude;rotation*=amplitude;sy=1+(sy-1)*amplitude;}
    c.save(); c.beginPath(); c.rect(124, 0, 216, 230); c.clip();
    c.globalAlpha = .7 + .3 * transition;
    c.translate(236 + dx, 213 + dy); c.rotate(rotation); c.scale(1, sy);
    const reacting = allowed && p.richness > 0;
    let animation = reacting ? { atlas: 'motions' as const, frames: [beat.pose], fps: 1, pingPong: false, loop: true }
      : p.richness === 0 && active.has(input.state) ? undefined : action.animation;
    if (input.state==='idle' && idle.active && !this.previewMotion && animation && (action.motion==='wait-sign'||action.motion.startsWith('sign-'))) animation={...animation,loop:false,pingPong:false};
    const sequenceAtlas = this.images[animation?.atlas??'motions'];
    const animated = Boolean(animation && sequenceAtlas.complete && sequenceAtlas.naturalWidth);
    let frame = sprite;
    if (animated && animation) {
      const frames = animation.pingPong ? [...animation.frames, ...animation.frames.slice(1, -1).reverse()] : animation.frames;
      const fps = animation.fps * (active.has(input.state) ? .8 + input.pressure * .9 : 1);
      const before=this.animationCursor;if(!reacting)this.animationCursor+=dt*fps;
      if(animation.loop===false&&this.animationCursor>=frames.length&&this.finishedAt===undefined)this.finishedAt=now;
      this.cycleComplete=reacting?false:animation.loop===false?this.finishedAt!==undefined&&now-this.finishedAt>=2500:Math.floor(before/frames.length)!==Math.floor(this.animationCursor/frames.length);
      frame = frames[reduced ? 0 : animation.loop===false?Math.min(frames.length-1,Math.floor(this.animationCursor)):Math.floor(this.animationCursor)%frames.length]!;
      if(!reduced && input.state==='idle' && idle.active && !this.previewMotion && (action.motion==='wait-sign'||action.motion.startsWith('sign-'))) frame=frames[idleSignFrame(actionTime,fps,frames.length,p.idleMode==='quiet'?5:p.idleHoldSeconds)]!;
    }
    if(!animated)this.cycleComplete=actionTime*1000>=action.durationMs;
    const source = animated ? sequenceAtlas : this.atlas;
    const layout = layouts[animated ? animation!.atlas : 'classic'].frames[frame]!;
    if(animated&&animation!.atlas==='daily'){
      const frameLayout=layouts.daily.frames[frame]!,scale=.52;
      c.drawImage(source,layout.x,layout.y,layout.width,layout.height,-frameLayout.anchor.x*scale,-frameLayout.anchor.y*scale,layout.width*scale,layout.height*scale);
    }else c.drawImage(source, layout.x, layout.y, layout.width, layout.height, -92, -190, 184, 190);
    if (action.motion === 'wait-sign' || action.motion.startsWith('sign-')) {
      const signSet = animation?.atlas === 'signs';
      const centerY = signSet ? [.385, .191, .190, .197, .643, .636, .638, .644, .682, .684, .682, .691, .565, .535, .543, .544][frame]! : animated ? [.716, .59, .605, .62][frame]! : .64;
      const angle = signSet ? [0, 0, -.055, .09, 0, 0, 0, 0, 0, 0, 0, 0, 0, .20, -.18, 0][frame]! : 0;
      const text = input.state==='idle' ? idle.text.slice(0,20) : this.signText;
      const centerX = signSet ? [.494, .465, .439, .513, .483, .475, .470, .503, .500, .497, .467, .523, .481, .461, .474, .479][frame]! : .49;
      c.save(); c.translate(-92 + centerX * 184, -190 + centerY * 190); c.rotate(angle);
      c.fillStyle = '#435778'; c.font = '600 10px "PingFang SC", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, 0, 0, signSet && frame >= 8 && frame <= 11 ? 58 : 83); c.restore();
    }
    if (action.motion === 'tea' && animation?.atlas!=='daily') { c.fillStyle = '#d2b68e'; c.fillRect(-17, -64, 23, 17); c.strokeStyle = '#a98b65'; c.strokeRect(5, -60, 7, 9); }
    if (action.motion === 'stamp') { c.fillStyle = '#759a82'; c.font = '22px sans-serif'; c.fillText('✓', 0, -61); }
    c.restore();
    drawSceneProps(c,theme, reduced ? 0 : t, input.activity, true);
    if (swing.visible) { c.save(); c.globalAlpha = swing.opacity; drawAirSwing(c, beat); c.restore(); }
    if (p.richness > 0 && !reduced && !stillCompletion) this.particles(input, t);
    Object.assign(this.stats, { frames: this.stats.frames + 1, lastMs: performance.now() - started, sprite, motion: action.motion, scene: theme, whipAllowed: allowed });
    this.canvas.dataset.idleActive=String(idle.active);this.canvas.dataset.richness=String(p.richness);this.canvas.dataset.reduced=String(reduced);
    this.canvas.dataset.renderMs = String(this.stats.lastMs); this.canvas.dataset.renderCount = String(this.stats.frames);
    this.canvas.dataset.motion = action.motion; this.canvas.dataset.frame = String(frame); this.canvas.dataset.atlas = animated ? animation!.atlas : 'classic';
    this.canvas.dataset.scene = theme; this.canvas.dataset.expression = String(sprite); this.canvas.dataset.whip = String(swing.visible);
    this.canvas.dataset.beat = swing.holding ? 'hold' : allowed ? beat.stage : swing.visible ? 'retract' : 'rest';
    this.canvas.dataset.reaction = reacting ? ['dodge', 'tail-cover', 'type-faster'][beat.variant]! : 'none';
    this.canvas.dataset.beatPose = reacting ? String(beat.pose) : '';
    this.schedule();
  };
  private particles(input: Snapshot, t: number) {
    const c = this.ctx; c.save(); c.fillStyle = '#91afd6';
    if (input.state === 'completed') for (let i = 0; i < 7; i++) {
      const x = 150 + i * 26, y = 15 + (t * 22 + i * 13) % 85;
      c.save(); c.translate(x, y); c.rotate(t + i); c.fillRect(-2, -4, 4, 8); c.restore();
    }
    if (this.prefs.richness === 2 && input.pressure > .55 && active.has(input.state)) {
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(301 + i * 5, 65 + (t * 25 + i * 13) % 35, 1.7, 3, -.3, 0, 7); c.fill(); }
    }
    if (input.state === 'idle' && this.stats.motion === 'sleep') { c.font = '14px sans-serif'; c.fillText('z', 312, 55 + Math.sin(t) * 4); }
    c.restore();
  }
  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.frame); document.removeEventListener('visibilitychange', this.visibility); document.removeEventListener('pointerdown', this.audioGesture);
    for(const image of Object.values(this.images))image.onload=image.onerror=null;
    if (this.audio) void this.audio.close();
  }
}
