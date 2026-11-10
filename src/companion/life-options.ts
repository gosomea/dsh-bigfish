export const outfits={none:'原始装扮','sailor-bow':'浅海蝴蝶结','star-pin':'贝壳星徽','winter-scarf':'暖冬围巾'} as const;
export type Outfit=keyof typeof outfits;
export interface LifeOptions {outfit:Outfit;growthUnlocks:boolean;pairEnabled:boolean;partnerRole:string;storyAutomatic:boolean;storyMinutes:number}
export const lifeOptionDefaults:LifeOptions={outfit:'none',growthUnlocks:false,pairEnabled:false,partnerRole:'follow-main',storyAutomatic:false,storyMinutes:60};
/** A portable reference to an already installed role. It is never a download URL or a grant. */
export function validatePartnerRole(value:unknown):string {
 if(value==='follow-main'||value==='builtin')return value;
 if(typeof value==='string'&&value.length<140&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*@\d+\.\d+\.\d+$/.test(value))return value;
 throw Error('小伙伴只能选择跟随主角色、内置大肥鱼或已安装的角色标识');
}
/** Group switches suspend optional behavior without discarding the user's saved choices. */
export function effectiveLifeOptions(config:LifeOptions&{groups:{growth:boolean;adventures:boolean}}):LifeOptions{
 return {outfit:config.outfit,growthUnlocks:config.groups.growth&&config.growthUnlocks,pairEnabled:config.groups.adventures&&config.pairEnabled,partnerRole:config.partnerRole,storyAutomatic:config.groups.growth&&config.storyAutomatic,storyMinutes:config.storyMinutes};
}
/** Only new optional leisure actions are gated. Core reactions and the five role fallbacks remain usable. */
export const actionUnlocks:Readonly<Record<string,number>>={'head-pat':0,'ball-catch':5,'fish-toy':10,tiptoe:5,'edge-peek':5,nest:10,postcard:20,'pair-exchange':20,'season-story':10,'stage-story':1};
export const actionUnlockAt=(id:string)=>actionUnlocks[id.replace(/^companion:/,'')]??0;
export function actionUnlocked(id:string,count:number,enabled:boolean){return !enabled||actionUnlockAt(id)<=Math.max(0,Number.isFinite(count)?count:0);}
export function unlockedClips(clips:readonly string[],count:number,enabled:boolean){return clips.filter(id=>actionUnlocked(id,count,enabled));}
