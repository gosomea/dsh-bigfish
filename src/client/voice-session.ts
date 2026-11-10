export interface RecognitionResult {isFinal:boolean;length:number;[index:number]:{transcript:string}}
export interface RecognitionEvent {results:{length:number;[index:number]:RecognitionResult}}
export interface Recognition {
 lang:string;continuous:boolean;interimResults:boolean;
 onresult:((event:RecognitionEvent)=>void)|null;
 onerror:((event:{error:string})=>void)|null;
 onend:(()=>void)|null;
 start():void;stop():void;abort():void;
}
export type RecognitionFactory=()=>Recognition;
export function recognitionFactory(scope:unknown):RecognitionFactory|null {
 const s=scope as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
 const Constructor=s.SpeechRecognition??s.webkitSpeechRecognition;
 return Constructor?()=>new Constructor():null;
}
/** An explicit press owns one capture. Release ends capture; no result is ever sent to a model here. */
export class PushToTalkSession {
 private recognition:Recognition|null=null;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private held=false;
 constructor(private factory:RecognitionFactory,private changed:(listening:boolean)=>void,private transcript:(text:string)=>void,private issue:(text:string)=>void){}
 press():boolean {
  if(this.recognition)return false;
  let r:Recognition;
  try{r=this.factory();}catch{this.issue('当前设备无法启动语音识别。');return false;}
  this.recognition=r;this.held=true;r.lang='zh-CN';r.continuous=false;r.interimResults=false;
  r.onresult=event=>{
   if(this.recognition!==r)return;
   let text='';for(let i=0;i<event.results.length;i++){const item=event.results[i];if(item?.isFinal)text+=item[0]?.transcript??'';}
   if(text.trim())this.transcript(text.trim().slice(0,1000));
  };
  r.onerror=event=>{if(this.recognition!==r)return;this.issue(({ 'not-allowed':'麦克风权限未获允许。','audio-capture':'没有可用的麦克风。',network:'浏览器语音服务无法连接。','no-speech':'这次没有听清，可以再试一次。','service-not-allowed':'浏览器未提供可用的语音服务。'} as Record<string,string>)[event.error]??'语音识别结束，可以继续用文字输入。');this.finish(r);};
  r.onend=()=>this.finish(r);
  try{r.start();this.changed(true);this.timer=setTimeout(()=>this.release(),25000);return true;}
  catch{this.finish(r);this.issue('语音识别启动失败，可检查浏览器支持及麦克风权限。');return false;}
 }
 release():void {
  if(!this.held||!this.recognition)return;this.held=false;this.clearTimer();this.changed(false);
  try{this.recognition.stop();}catch{this.cancel();}
 }
 /** Hidden page, cancelled gesture, permission off or unmount discards late transcripts. */
 cancel():void {
  const r=this.recognition;this.recognition=null;this.held=false;this.clearTimer();this.changed(false);
  if(r){r.onresult=null;r.onerror=null;r.onend=null;try{r.abort();}catch{/* Already ended. */}}
 }
 private finish(r:Recognition):void {if(this.recognition!==r)return;this.recognition=null;this.held=false;this.clearTimer();r.onresult=null;r.onerror=null;r.onend=null;this.changed(false);}
 private clearTimer(){if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
}

/** Restrict reading to voices the browser identifies as device-local; never choose an implicit remote default. */
export function localVoices<T extends {localService:boolean;voiceURI:string;name:string;lang:string}>(voices:readonly T[]):T[] {
 return voices.filter(v=>v.localService).sort((a,b)=>Number(b.lang.startsWith('zh'))-Number(a.lang.startsWith('zh'))||a.name.localeCompare(b.name));
}
