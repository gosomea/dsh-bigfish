const smooth = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };
/** Shared timeline: the rope, pose, body response, wind marks and audio read one clock. */
export function whipBeat(cycles: number, pressure: number) {
  const phase = cycles % 1, variant = Math.floor(cycles) % 3;
  const sweep = smooth((phase - .26) / .18);
  const release = smooth((phase - .48) / .52);
  const reaction = smooth((phase - .36) / .1) * (1 - smooth((phase - .65) / .35));
  const strength = .45 + Math.max(0, Math.min(1, pressure)) * .55;
  const stage = phase < .26 ? 'windup' : phase < .46 ? 'sweep' : phase < .72 ? 'react' : 'recover';
  const pose = phase < .32 ? 4 : phase < .43 ? 5 : phase < .51 ? 8
    : phase < .72 ? [9, 10, 6][variant]! : phase < .87 ? [11, 11, 7][variant]! : 4;
  return { phase, variant, stage, pose, reaction, sweep, release,
    dx: reaction * strength * (variant === 0 ? 12 : 5),
    dy: reaction * strength * (variant === 1 ? 5 : -6),
    rotation: reaction * strength * (variant === 0 ? .055 : -.025),
    squash: 1 - reaction * strength * (variant === 1 ? .04 : .02),
  };
}
