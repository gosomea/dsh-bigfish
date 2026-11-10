export interface ClipFrame { frame: number; durationMs: number }
export const companionTiming={oneShotMs:8*280,walkLoopMs:8*180,recallWalkMs:8*135,recallFrameMs:90} as const;
export interface AnimationClip {
  id: string;
  entry?: readonly ClipFrame[];
  loop?: readonly ClipFrame[];
  exit?: readonly ClipFrame[];
  /** One-shots keep their final pose for this many real milliseconds. */
  holdMs?: number;
  reducedFrame?: number;
}
export type ClipPhase = 'entry' | 'loop' | 'exit' | 'hold' | 'complete';
export interface ClipSnapshot {
  clip: string;
  phase: ClipPhase;
  frame: number;
  index: number;
  finished: boolean;
}

/** Shared authored timing keeps directors and the visible player on the same clock. */
export function sequenceClip(input:{id:string;frames:number;frameMs:number;holdMs?:number;loop?:boolean},holdMs=input.holdMs):AnimationClip {
  const frames=Array.from({length:input.frames},(_,frame)=>({frame,durationMs:input.frameMs}));
  return {id:input.id,...(input.loop?{loop:frames}:{entry:frames}),...(holdMs===undefined?{}:{holdMs}),reducedFrame:input.loop?0:input.frames-1};
}

export function clipPlayDuration(clip:AnimationClip):number {
  return [...clip.entry??[],...clip.loop??[],...clip.exit??[]].reduce((total,frame)=>total+frame.durationMs,0);
}

function validated(clip: AnimationClip): AnimationClip {
  if (!clip.id || ![clip.entry, clip.loop, clip.exit].some(frames => frames?.length)) {
    throw new Error('A clip needs an id and at least one frame');
  }
  for (const frames of [clip.entry, clip.loop, clip.exit]) {
    for (const item of frames ?? []) {
      if (!Number.isInteger(item.frame) || item.frame < 0 ||
          !Number.isFinite(item.durationMs) || item.durationMs <= 0) {
        throw new Error('Clip frames need a non-negative index and positive duration');
      }
    }
  }
  if (clip.holdMs !== undefined && (!Number.isFinite(clip.holdMs) || clip.holdMs < 0)) {
    throw new Error('Clip hold duration must be finite and non-negative');
  }
  if (clip.reducedFrame !== undefined && (!Number.isInteger(clip.reducedFrame) || clip.reducedFrame < 0)) {
    throw new Error('Reduced-motion frame must be a non-negative index');
  }
  return {
    ...clip,
    ...(clip.entry ? {entry: clip.entry.map(frame => ({...frame}))} : {}),
    ...(clip.loop ? {loop: clip.loop.map(frame => ({...frame}))} : {}),
    ...(clip.exit ? {exit: clip.exit.map(frame => ({...frame}))} : {}),
  };
}

/** Delta-based playback: changing speed never rewrites time already played. */
export class ClipTimeline {
  private clip: AnimationClip;
  private pending: AnimationClip | null = null;
  private phase: ClipPhase = 'entry';
  private index = 0;
  private progressMs = 0;
  private lastFrame = 0;
  readonly reducedMotion: boolean;

  constructor(initial: AnimationClip, options: {reducedMotion?: boolean} = {}) {
    this.clip = validated(initial);
    this.reducedMotion = options.reducedMotion ?? false;
    this.start(this.clip);
  }

  /** Latest normal request wins; work starting or direct interaction uses urgent. */
  request(next: AnimationClip, urgency: 'normal' | 'urgent' = 'normal'): void {
    if (next.id === this.clip.id) { this.pending = null; return; }
    if (next.id === this.pending?.id && urgency === 'normal') return;
    const clip = validated(next);
    if (urgency === 'urgent' || this.phase === 'complete') {
      this.start(clip);
    } else {
      this.pending = clip;
    }
  }

  advance(deltaMs: number, playbackRate = 1): ClipSnapshot {
    if (!Number.isFinite(deltaMs) || deltaMs < 0 || !Number.isFinite(playbackRate) || playbackRate <= 0) {
      throw new Error('Playback needs a finite non-negative delta and positive rate');
    }
    let remaining = deltaMs;
    while (this.phase !== 'complete') {
      const frames = this.frames();
      // Skip whole loops when waking after a long pause, while preserving phase.
      if (this.phase === 'loop' && this.index === 0 && this.progressMs === 0 && !this.pending) {
        const duration = frames.reduce((sum, frame) => sum + frame.durationMs, 0) / playbackRate;
        if (duration === 0) throw new Error('Playback rate is too high for this clip');
        if (remaining >= duration) remaining %= duration;
      }
      const duration = this.phase === 'hold' ? this.clip.holdMs ?? 2500 : frames[this.index]!.durationMs;
      const rate = this.phase === 'hold' ? 1 : playbackRate;
      const needed = (duration - this.progressMs) / rate;
      if (remaining < needed) { this.progressMs += remaining * rate; break; }
      remaining -= needed;
      this.progressMs = 0;
      if (this.phase !== 'hold' && this.index + 1 < frames.length) {
        this.index++;
        this.lastFrame = frames[this.index]!.frame;
      } else {
        this.boundary();
      }
      if (remaining === 0 && this.phase !== 'hold') break;
    }
    return this.snapshot();
  }

  snapshot(): ClipSnapshot {
    const frame = this.reducedMotion
      ? this.clip.reducedFrame ?? this.clip.entry?.[0]?.frame ?? this.clip.loop?.[0]?.frame ?? this.clip.exit![0]!.frame
      : this.lastFrame;
    return {clip: this.clip.id, phase: this.phase, frame, index: this.index, finished: this.phase === 'complete'};
  }

  private frames(): readonly ClipFrame[] {
    return this.phase === 'entry' ? this.clip.entry ?? []
      : this.phase === 'loop' ? this.clip.loop ?? []
        : this.phase === 'exit' ? this.clip.exit ?? [] : [];
  }

  private start(clip: AnimationClip): void {
    this.clip = clip;
    this.pending = null;
    this.enter(clip.entry?.length ? 'entry' : clip.loop?.length ? 'loop' : 'exit');
  }

  private enter(phase: ClipPhase): void {
    this.phase = phase;
    this.index = 0;
    this.progressMs = 0;
    if (phase !== 'hold' && phase !== 'complete') this.lastFrame = this.frames()[0]!.frame;
  }

  private boundary(): void {
    if (this.phase === 'entry') {
      if (this.clip.loop?.length) {
        if (this.pending) this.leaveLoop(); else this.enter('loop');
      } else this.enter(this.clip.exit?.length ? 'exit' : 'hold');
    } else if (this.phase === 'loop') {
      if (this.pending) this.leaveLoop(); else this.enter('loop');
    } else if (this.phase === 'exit') {
      if (this.clip.loop?.length) {
        if (this.pending) this.start(this.pending); else this.enter('loop');
      } else this.enter('hold');
    } else if (this.phase === 'hold') {
      if (this.pending) this.start(this.pending); else this.enter('complete');
    }
  }

  private leaveLoop(): void {
    if (this.clip.exit?.length) this.enter('exit');
    else this.start(this.pending!);
  }
}

export interface AtlasRect { x: number; y: number; width: number; height: number }
/** One scale per sequence preserves its proportions and contains tall entries and wide tail/prop poses. */
export function atlasSequenceScale(cellHeight:number,frames:readonly Pick<AtlasRect,'width'|'height'>[],maxWidth:number,maxHeight:number):number {
  if(!frames.length||![cellHeight,maxWidth,maxHeight,...frames.flatMap(f=>[f.width,f.height])].every(value=>Number.isFinite(value)&&value>0))throw new Error('Invalid sequence fitting dimensions');
  return Math.min(maxHeight/Math.max(cellHeight,...frames.map(f=>f.height)),maxWidth/Math.max(...frames.map(f=>f.width)));
}
/** Adjacent cells share rounded edges, including atlases whose size is not divisible by the grid. */
export function atlasFrameRect(width: number, height: number, columns: number, rows: number, index: number): AtlasRect {
  if (![width, height, columns, rows].every(value => Number.isSafeInteger(value) && value > 0) ||
      width < columns || height < rows || !Number.isSafeInteger(index) || index < 0 || index >= columns * rows) {
    throw new Error('Invalid atlas dimensions or frame index');
  }
  const column = index % columns, row = Math.floor(index / columns);
  const x = Math.round(column * width / columns), y = Math.round(row * height / rows);
  return {x, y, width: Math.round((column + 1) * width / columns) - x,
    height: Math.round((row + 1) * height / rows) - y};
}
