import type {PetBundle,PetAnimation} from './contract.js';
/** Resolve declarative life semantics to this character's own real animation. Missing capabilities return null. */
export function resolvePetBehavior(pet:PetBundle,kind:'life'|'home'|'voice'|'paired'|'interactions',key:string):PetAnimation|null {
 const values=pet.manifest.behaviors?.[kind] as Record<string,string>|undefined;
 const id=values?.[key];return id?pet.animations.find(a=>a.id===id)??null:null;
}
export function availablePetLifeClips(pet:PetBundle){return [...new Set([...Object.keys(pet.manifest.behaviors?.life??{}),...Object.keys(pet.manifest.behaviors?.home??{}),...Object.keys(pet.manifest.behaviors?.interactions??{})])];}
export function petAnimationUnlocked(animation:PetAnimation,count:number,enabled:boolean){return !enabled||(animation.unlockAt??0)<=Math.max(0,Number.isFinite(count)?count:0);}
export function petMovementAvailable(pet:PetBundle,options:{interactions:number;growthUnlocks:boolean}){
 const movement=pet.manifest.behaviors?.movement;
 return !!movement&&[movement.left,movement.right,movement.stop].every(id=>{const animation=pet.animations.find(a=>a.id===id);return !!animation&&petAnimationUnlocked(animation,options.interactions,options.growthUnlocks);});
}
const interactionAliases:Readonly<Record<string,string>>={wave:'wave',tea:'tea',biscuit:'biscuit','head-pat':'head','tail-comb':'tail','ball-catch':'ball','fish-toy':'toy',click:'click'};
const criticalRoles:Readonly<Record<string,keyof PetBundle['manifest']['fallbacks']>>={'task-cards':'working','confirm-card':'attention','success-bow':'success','failure-check':'error'};
/** Root scheduling uses common semantics; rendering always uses THIS character's declared artwork.
 * paired=true infers a greeting/exchange; paired='part' selects the explicit farewell mapping. */
export function resolveCompanionBehavior(pet:PetBundle,clip:string,options:{paired?:boolean|'greet'|'exchange'|'part'}={}):string|null {
 const key=clip.replace(/^companion:/,'');
 if(options.paired){const phase=typeof options.paired==='string'?options.paired:key==='wave'||key==='point'?'greet':'exchange';return resolvePetBehavior(pet,'paired',phase)?.id??null;}
 const declared=resolvePetBehavior(pet,'life',key)??resolvePetBehavior(pet,'home',key)??(interactionAliases[key]?resolvePetBehavior(pet,'interactions',interactionAliases[key]!):null)??(key==='voice-listen'?resolvePetBehavior(pet,'voice','listen'):key==='voice-speak'?resolvePetBehavior(pet,'voice','speak'):null);
 if(declared)return declared.id;
 const role=criticalRoles[key];if(role)return pet.manifest.fallbacks[role];
 return pet.animations.find(a=>a.id===key)?.id??null;
}
export function availableCompanionClips(pet:PetBundle,options:{interactions?:number;growthUnlocks?:boolean;paired?:boolean}={}){
 const clips=new Set([...Object.keys(pet.manifest.behaviors?.life??{}),...Object.keys(pet.manifest.behaviors?.home??{}),...Object.keys(criticalRoles)]);
 for(const [semantic,key]of Object.entries(interactionAliases))if(resolvePetBehavior(pet,'interactions',key))clips.add(semantic);
 if(options.paired)for(const semantic of Object.keys(interactionAliases))clips.add(semantic);
 if(pet.manifest.behaviors?.voice){clips.add('voice-listen');clips.add('voice-speak');}
 const unlocked=(id:string|null)=>{const animation=pet.animations.find(a=>a.id===id);return !!animation&&petAnimationUnlocked(animation,options.interactions??0,options.growthUnlocks??false);};
 return [...clips].filter(clip=>options.paired
  ?unlocked(resolveCompanionBehavior(pet,clip,{paired:true}))&&(clip!=='wave'||unlocked(resolveCompanionBehavior(pet,clip,{paired:'part'})))
  :unlocked(resolveCompanionBehavior(pet,clip)));
}
