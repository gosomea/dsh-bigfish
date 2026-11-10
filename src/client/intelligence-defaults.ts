import type {ConfigurationOptions,ConfigurationSelection} from '../companion/configuration-options.js';
import type {IntelligencePolicy} from '../companion/state.js';

export const modelSelectionKey=(value:ConfigurationSelection)=>JSON.stringify([value.provider,value.model]);
export const modelInOptions=(options:ConfigurationOptions|null,value:ConfigurationSelection)=>!!options?.groups.some(g=>g.id===value.provider&&g.models.some(m=>m.id===value.model));
/** Defaults are editable suggestions. They never change the saved permission or widen an existing scope. */
export function initialIntelligencePolicy(saved:IntelligencePolicy,options:ConfigurationOptions|null,current:ConfigurationSelection|null):IntelligencePolicy {
 const emptyModel=!saved.provider&&!saved.model;
 const fresh=emptyModel&&!saved.workspaces.length&&!saved.enabled;
 const selection=emptyModel&&options?(current&&modelInOptions(options,current)?current:options.default&&modelInOptions(options,options.default)?options.default:null):null;
 return {...saved,...selection,workspaces:fresh&&options?options.workspaces.map(w=>w.path):[...saved.workspaces]};
}
