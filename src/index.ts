import type { Config as DomainConfig } from './domain/config.js';
import { apply, Config as HostConfig } from './host/plugin.js';

export * from './contract/types.js';
export { clamp, resolveConfig } from './domain/config.js';
export * from './domain/baselines.js';
export * from './domain/session.js';
export * from './domain/feedback.js';
export * from './host/adapter.js';
export * from './host/attach.js';
export * from './contract/scenes.js';
export * from './domain/director.js';
export { apply };
// TypeScript keeps type and value namespaces separate. This preserves the
// original `Config` type API while DSH consumes the value export of that name.
export interface Config extends DomainConfig {}
export type BigfishConfig = DomainConfig;
export const Config = HostConfig;
