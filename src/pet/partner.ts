import {validatePartnerRole} from '../companion/life-options.js';
import {lifeProgramClips} from '../companion/life-programs.js';
import {availableCompanionClips,resolveCompanionBehavior,petAnimationUnlocked} from './behaviors.js';
import {decodePet,type PetBundle} from './contract.js';
import type {PetCatalog} from './host-store.js';
import {loadImages,type LoadedPet} from './library.js';

export interface PartnerSelection {kind:'builtin'|'pack'|'missing';key:string;name:string}
export function resolvePartnerSelection(role:string,catalog:Pick<PetCatalog,'entries'>,active:Pick<LoadedPet,'key'|'pet'>|null):PartnerSelection {
 validatePartnerRole(role);
 if(role==='follow-main')return active?{kind:'pack',key:active.key,name:active.pet.manifest.name}:{kind:'builtin',key:'builtin',name:'大肥鱼 · 内置'};
 if(role==='builtin')return {kind:'builtin',key:'builtin',name:'大肥鱼 · 内置'};
 const entry=catalog.entries.find(e=>e.key===role);
 return entry?{kind:'pack',key:entry.key,name:entry.name}:{kind:'missing',key:role,name:'尚未安装的伙伴角色'};
}
type PairOptions={interactions:number;growthUnlocks:boolean;richness?:number};
function rolePairClips(pet:PetBundle|null,options:PairOptions):string[] {
 if(!pet)return [...lifeProgramClips];
 if(!pet.manifest.capabilities.includes('paired')||!pet.manifest.body||!pet.manifest.behaviors?.paired)return [];
 const own=(phase:'greet'|'exchange'|'part')=>pet.animations.find(a=>a.id===pet.manifest.behaviors!.paired![phase]);
 // Each phase must have real differing artwork. A repeated standing crop is not an interaction.
 if((['greet','exchange','part'] as const).some(phase=>{const a=own(phase);return !a||a.intensity>(options.richness??2)||!petAnimationUnlocked(a,options.interactions,options.growthUnlocks)||new Set(a.frames.map(f=>JSON.stringify([f.asset,f.rect]))).size<2;}))return [];
 return availableCompanionClips(pet,{...options,paired:true});
}
/** Both actors must provide their own real, unlocked artwork for every shared semantic step. */
export function jointPairedClips(primary:PetBundle|null,secondary:PetBundle|null,options:PairOptions):string[] {
 const a=rolePairClips(primary,options),b=new Set(rolePairClips(secondary,options));return a.filter(id=>b.has(id));
}
const pairRequired=['wave','ball-catch','fish-toy','tea','biscuit'];
export function pairedRoleIssue(primary:PetBundle|null,secondary:PetBundle|null,options:PairOptions):string {
 const clips=jointPairedClips(primary,secondary,options);
 return pairRequired.every(id=>clips.includes(id))?'':'主角色或伙伴缺少当前动作档位下已解锁的招呼、互动或告别序列；已暂停邀请，可换角色、调高动作表现或调整成长解锁。';
}
export function partnerMotion(pet:PetBundle,clip:string,exit:boolean){return resolveCompanionBehavior(pet,clip,{paired:exit?'part':true});}

export interface PartnerAssetSource {readonly scope:number;catalog:Pick<PetCatalog,'entries'>;bytes:(key:string)=>Promise<Uint8Array>}
interface AssetDependencies {decode:(bytes:Uint8Array)=>Promise<PetBundle>;load:(key:string,pet:PetBundle)=>Promise<LoadedPet>}
/** An asset-only read. No selection, Host mutation, model call, or shared owner release occurs. */
export async function loadPartnerAsset(source:PartnerAssetSource,key:string,scope:number,current:()=>boolean,dependencies:AssetDependencies={decode:decodePet,load:loadImages}):Promise<LoadedPet> {
 const check=()=>{if(!current()||source.scope!==scope||!source.catalog.entries.some(e=>e.key===key))throw Error('伙伴角色或 Host 已变化，未使用过期素材');};
 check();const bytes=await source.bytes(key);check();const pet=await dependencies.decode(bytes);check();
 if(`${pet.manifest.id}@${pet.manifest.version}`!==key)throw Error('伙伴素材与角色标识不匹配，未使用素材');
 const loaded=await dependencies.load(key,pet);
 try{check();return loaded;}catch(error){loaded.release();throw error;}
}
