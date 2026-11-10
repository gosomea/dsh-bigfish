export function readIntegerDraft(value:string,label:string,min:number,max:number){
 const number=Number(value);
 if(!value.trim()||!Number.isInteger(number)||number<min||number>max)throw Error(`${label}请输入 ${min}–${max} 的整数。`);
 return number;
}
export interface VoiceServiceValues {endpoint:string;model:string;key:string}
type VoiceField=keyof VoiceServiceValues;
/** Device voice drafts preserve intentional empty/default values until saved or the Host changes. */
export class VoiceServiceDraft {
 private generation=0;
 private value:VoiceServiceValues={endpoint:'',model:'whisper-1',key:''};
 private dirty=new Set<VoiceField>();
 get epoch(){return this.generation;}
 snapshot():VoiceServiceValues{return {...this.value};}
 edit(field:VoiceField,value:string){this.value={...this.value,[field]:value};this.dirty.add(field);}
 reset(){this.generation++;this.value={endpoint:'',model:'whisper-1',key:''};this.dirty.clear();}
 load(voice:Pick<VoiceServiceValues,'endpoint'|'model'>,epoch:number){
  if(epoch!==this.generation)return false;
  for(const field of ['endpoint','model'] as const)if(!this.dirty.has(field))this.value[field]=voice[field];
  return true;
 }
 saved(sent:VoiceServiceValues,voice:Pick<VoiceServiceValues,'endpoint'|'model'>,epoch:number){
  if(epoch!==this.generation)return false;
  for(const field of ['endpoint','model'] as const)if(this.value[field]===sent[field])this.dirty.delete(field);
  if(this.value.key===sent.key){this.value.key='';this.dirty.delete('key');}
  return this.load(voice,epoch);
 }
}
