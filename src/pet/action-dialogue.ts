import type { IdlePresentation } from '../domain/idle.js';
import { parseLines } from '../contract/dialogue.js';

/** An explicit user idle category, including [], wins over action-specific pack dialogue. */
export function actionIdle(idle: IdlePresentation, dialogue: Record<string, string[]>, animation: string, userJson: string): IdlePresentation {
  if (!idle.active || Object.hasOwn(parseLines(userJson), 'idle')) return idle;
  const lines = dialogue[animation];
  if (!lines?.length) return idle;
  return { ...idle, text: lines[idle.serial % lines.length]!, showText: idle.showText };
}
