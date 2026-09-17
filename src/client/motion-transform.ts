/** Small secondary motion; hand/face actions are drawn in sprite frames. */
export function motionTransform(motion: string, t: number, speed: number) {
  let dx = 0,
    dy = 0,
    rotation = 0,
    sy = 1;
  switch (motion) {
    case "sign-overhead":
      rotation = Math.sin(t * 2) * 0.02;
      break;
    case "sign-peek":
      dx = Math.sin(t * 2) * 3;
      break;
    case "sign-tail":
      rotation = Math.sin(t * 1.6) * 0.02;
      break;
    case "sign-bounce":
      dy = -Math.abs(Math.sin(t * 3)) * 6;
      break;
    case "wait-sign":
      dy = Math.sin(t * 1.8) * 1.4;
      break;
    case "wave":
      rotation = Math.sin(t * 3) * 0.025;
      break;
    case "peek":
      dx = Math.sin(t * 1.8) * 9;
      rotation = Math.sin(t * 1.8) * 0.07;
      break;
    case "stretch":
      break;
    case "tail-wag":
      rotation = Math.sin(t * 4) * 0.028;
      dx = Math.sin(t * 4) * 2;
      break;
    case "look-back":
      rotation = Math.sin(t * 2.8) * 0.035;
      break;
    case "panic":
      dx = Math.sin(t * 9 * speed) * 5;
      dy = -Math.abs(Math.sin(t * 9 * speed)) * 4;
      break;
    case "stumble":
      rotation = Math.sin(t * 4) * 0.075;
      dy = -Math.max(0, Math.sin(t * 4)) * 3;
      break;
    case "sigh":
      sy = 1 - Math.max(0, Math.sin(t * 1.7)) * 0.025;
      break;
    case "tea":
      rotation = Math.sin(t * 1.5) * 0.012;
      break;
    case "stamp":
      dy = Math.max(0, Math.sin(t * 4)) * 3;
      break;
    case "bow":
      sy = 1 - Math.max(0, Math.sin(t * 2)) * 0.06;
      break;
    case "type":
      dy = Math.sin(t * 2) * 0.4;
      break;
    case "flinch":
      dy = -Math.max(0, Math.sin(t * 6)) * 5;
      rotation = Math.sin(t * 3) * 0.025;
      break;
    case "dodge":
      dx = Math.sin(t * 4) * 7;
      rotation = Math.sin(t * 4) * 0.055;
      break;
    case "shuffle":
      dx = Math.sin(t * 8) * 4;
      dy = -Math.abs(Math.sin(t * 8)) * 3;
      break;
    case "run":
      dy = -Math.abs(Math.sin(t * 9 * speed)) * 7;
      rotation = Math.sin(t * 9 * speed) * 0.023;
      break;
    case "wipe":
      break;
    case "hug":
      rotation = Math.sin(t * 1.8) * 0.025;
      sy = 1 + Math.sin(t * 2) * 0.008;
      break;
    case "celebrate":
      dy = -Math.abs(Math.sin(t * 4)) * 10;
      rotation = Math.sin(t * 3) * 0.04;
      break;
    case "repair":
      break;
    case "read":
    case "confirm":
      break;
    case "sleep":
      sy = 1 + Math.sin(t * 1.5) * 0.012;
      break;
    default:
      sy = 1 + Math.sin(t * 2) * 0.009;
  }
  return { dx, dy, rotation, sy };
}
