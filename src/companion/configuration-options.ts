export interface ConfigurationModel {id:string;name:string}
export interface ConfigurationGroup {id:string;name:string;models:ConfigurationModel[]}
export interface ConfigurationSelection {provider:string;model:string}
export interface ConfigurationWorkspace {path:string;title:string}
export interface ConfigurationOptions {
 groups:ConfigurationGroup[];default:ConfigurationSelection|null;workspaces:ConfigurationWorkspace[];
 failures:{id:string;name:string}[];catalogAvailable:boolean;
}
export interface ConfigurationReaders {
 catalog?:()=>Promise<unknown>;
 providers?:()=>unknown;
 models?:(provider:string)=>Promise<unknown>;
 defaultSelection?:()=>unknown;
 workspaces?:()=>unknown;
 knownWorkspaces:readonly string[];
}
const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=160&&value.trim()===value;
const workspacePath=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=2000&&value.trim().length>0;
const name=(value:unknown,fallback:string)=>typeof value==='string'&&value.trim()?value.trim().slice(0,200):fallback;
function selection(value:unknown):ConfigurationSelection|null {
 const item=record(value);return item&&identifier(item.provider)&&identifier(item.model)?{provider:item.provider,model:item.model}:null;
}
function models(value:unknown):ConfigurationModel[]{
 if(!Array.isArray(value))return [];
 const seen=new Set<string>();return value.flatMap(raw=>{
  const item=record(raw);if(!item||!identifier(item.id)||seen.has(item.id))return [];
  seen.add(item.id);return [{id:item.id,name:name(item.name,item.id)}];
 });
}
function groups(value:unknown):ConfigurationGroup[]{
 if(!Array.isArray(value))return [];
 const seen=new Set<string>();return value.flatMap(raw=>{
  const item=record(raw);if(!item||!identifier(item.id)||seen.has(item.id))return [];
  seen.add(item.id);const entries=models(item.models);return entries.length?[{id:item.id,name:name(item.name,item.id),models:entries}]:[];
 });
}
function failures(value:unknown):ConfigurationOptions['failures']{
 if(!Array.isArray(value))return [];
 const seen=new Set<string>();return value.flatMap(raw=>{
  const item=record(raw);if(!item||!identifier(item.id)||seen.has(item.id))return [];
  seen.add(item.id);return [{id:item.id,name:name(item.name,item.id)}];
 });
}
/** Read the same model directory as DSH without preparing a call or returning provider configuration. */
export async function readConfigurationOptions(readers:ConfigurationReaders):Promise<ConfigurationOptions>{
 const result:ConfigurationOptions={groups:[],default:null,workspaces:[],failures:[],catalogAvailable:false};
 if(readers.catalog)try{
  const catalog=record(await readers.catalog());
  if(catalog&&Array.isArray(catalog.groups)){
   result.groups=groups(catalog.groups);result.default=selection(catalog.default);
   result.failures=failures(catalog.failures);result.catalogAvailable=true;
  }
 }catch{/* A missing catalog contribution can fall back to the live LLM registry. */}
 if(!result.catalogAvailable&&readers.providers&&readers.models)try{
  const providers=readers.providers();
  if(Array.isArray(providers)){
   const seen=new Set<string>(),entries=providers.flatMap(raw=>{
    const provider=record(raw);if(!provider||!identifier(provider.id)||seen.has(provider.id))return [];
    seen.add(provider.id);return [{id:provider.id,name:name(provider.name,provider.id)}];
   });
   const resolved=await Promise.all(entries.map(async provider=>{
    try {return {provider,models:models(await readers.models!(provider.id))};}
    catch{return {provider,models:null};}
   }));
   for(const entry of resolved){
    if(entry.models===null)result.failures.push(entry.provider);
    else if(entry.models.length)result.groups.push({...entry.provider,models:entry.models});
   }
   result.catalogAvailable=true;
  }
 }catch{/* Catalog failures are metadata failures, not model or task failures. */}
 if(!result.default&&readers.defaultSelection)try{result.default=selection(readers.defaultSelection());}catch{/* A deployment may have no default model. */}
 const workspaces=new Map<string,ConfigurationWorkspace>();
 if(readers.workspaces)try{
  const listed=readers.workspaces();
  if(Array.isArray(listed))for(const raw of listed){const item=record(raw);if(item&&workspacePath(item.path)&&!workspaces.has(item.path))workspaces.set(item.path,{path:item.path,title:name(item.title,item.path)});}
 }catch{/* Retain task and saved-policy workspaces if the optional registry is unavailable. */}
 for(const path of readers.knownWorkspaces)if(workspacePath(path)&&!workspaces.has(path))workspaces.set(path,{path,title:path});
 result.workspaces=[...workspaces.values()];return result;
}
