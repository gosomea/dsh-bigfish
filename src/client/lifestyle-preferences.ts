import {decodeLifestyle,editLifestyle,type Lifestyle} from '../companion/config.js';
import type {Preferences} from '../contract/preferences.js';
export type LifestyleEdit=Omit<Partial<Lifestyle>,'groups'>&{groups?:Partial<Lifestyle['groups']>};
/** Resolve nested choices inside the serialized write queue, preserving other controls' edits. */
export function lifestylePreferencePatch(patch:LifestyleEdit){
 return (preferences:Readonly<Preferences>):Partial<Preferences>=>{
  const current=decodeLifestyle(JSON.parse(preferences.lifestyleJson));
  const {groups,...fields}=patch;
  return {lifestyleJson:JSON.stringify(editLifestyle(current,{...fields,groups:{...current.groups,...groups}}))};
 };
}
