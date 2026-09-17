import { whipBeat } from './whip-choreography.js';

/** Shared visual, clipped separately from every character frame. */
export function drawAirSwing(c: CanvasRenderingContext2D, beat: ReturnType<typeof whipBeat>) {
    c.save(); c.beginPath(); c.rect(0, 0, 103, 225); c.clip();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const curve = (phase: number) => {
      const b = whipBeat(phase, 0), snap = b.sweep * (1 - b.release);
      const tip = { x: 44 + snap * 55 + b.release * 28, y: 53 + snap * 53 + b.release * 91 };
      const points = [{ x: 51, y: 132 }, { x: 12 + snap * 44, y: 87 - snap * 38 + b.release * 35 },
        { x: 9 + snap * 79, y: 37 + b.release * 76 }, tip];
      const rest = [{ x: 51, y: 132 }, { x: 12, y: 87 }, { x: 9, y: 37 }, { x: 44, y: 53 }];
      const v = Math.max(0, Math.min(1, (phase - .72) / .28)), ease = v * v * (3 - 2 * v);
      return points.map((p, i) => ({ x: p.x + (rest[i]!.x - p.x) * ease, y: p.y + (rest[i]!.y - p.y) * ease }));
    };
    // Short, curved wind traces follow the tip only during the fast sweep.
    if (beat.phase > .29 && beat.phase < .56) {
      for (let i = 3; i >= 1; i--) {
        const points = curve(Math.max(0, beat.phase - i * .025));
        c.strokeStyle = `rgba(126,185,225,${.11 + (3 - i) * .07})`; c.lineWidth = 2;
        c.beginPath(); c.moveTo(points[0]!.x, points[0]!.y);
        c.bezierCurveTo(points[1]!.x, points[1]!.y, points[2]!.x, points[2]!.y, points[3]!.x, points[3]!.y); c.stroke();
      }
    }
    const points = curve(beat.phase);
    const at = (t: number) => { const u = 1 - t; return {
      x: u ** 3 * points[0]!.x + 3 * u * u * t * points[1]!.x + 3 * u * t * t * points[2]!.x + t ** 3 * points[3]!.x,
      y: u ** 3 * points[0]!.y + 3 * u * u * t * points[1]!.y + 3 * u * t * t * points[2]!.y + t ** 3 * points[3]!.y }; };
    for (const outline of [true, false]) for (let i = 0; i < 28; i++) {
      const a = at(i / 28), b = at((i + 1) / 28);
      c.strokeStyle = outline ? '#3f5278' : '#94bfe0';
      c.lineWidth = (outline ? 4.4 : 2.4) * (1 - i / 34);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    // Rounded indigo grip, pale binding, brass collar and a small wrist loop.
    c.save(); c.translate(51, 132); c.rotate(-.35 + beat.sweep * (1 - beat.release) * .7);
    c.strokeStyle = '#6684af'; c.lineWidth = 1.8;
    c.beginPath(); c.ellipse(0, 34, 4, 6, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#344d79'; c.beginPath(); c.roundRect(-4, -2, 8, 33, 4); c.fill();
    c.strokeStyle = '#b6d0e8'; c.lineWidth = 1;
    for (let y = 6; y < 26; y += 5) { c.beginPath(); c.moveTo(-3, y); c.lineTo(3, y - 2); c.stroke(); }
    c.fillStyle = '#d5b686'; c.fillRect(-4, -1, 8, 4); c.fillRect(-4, 26, 8, 3); c.restore();
    c.restore();
}
