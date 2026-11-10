import type {DesktopBridge} from './desktop-bridge.js';
/** Capture is explicitly held; stop releases every microphone track before optional transcription. */
export class DesktopVoiceSession {
 private epoch=0;private held=false;private recorder:MediaRecorder|null=null;private stream:MediaStream|null=null;private timer:ReturnType<typeof setTimeout>|null=null;
 constructor(private bridge:DesktopBridge,private changed:(listening:boolean)=>void,private transcript:(text:string)=>void,private issue:(message:string)=>void){}
 async press(){if(this.held||this.recorder)return false;const epoch=++this.epoch;this.held=true;
  try{
   if(!await this.bridge.microphone?.())throw Error('麦克风未获允许');
   if(epoch!==this.epoch||!this.held)return false;
   const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
   if(epoch!==this.epoch||!this.held){stream.getTracks().forEach(t=>t.stop());return false;}
   this.stream=stream;const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(v=>MediaRecorder.isTypeSupported(v));if(!mime)throw Error('当前桌面没有受支持的录音格式');
   const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:32000}),chunks:Blob[]=[];let size=0;this.recorder=recorder;
   recorder.ondataavailable=e=>{if(epoch!==this.epoch)return;size+=e.data.size;if(size>3*1024*1024){this.issue('录音超过 3 MiB，已取消');this.cancel();return;}if(e.data.size)chunks.push(e.data);};
   recorder.onerror=()=>{if(epoch===this.epoch){this.issue('录音失败，可以继续文字输入');this.cancel();}};
   recorder.onstop=()=>{this.stopTracks();if(this.recorder===recorder)this.recorder=null;if(epoch!==this.epoch)return;void (async()=>{try{const audio=new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer());if(epoch!==this.epoch||!audio.length)return;const text=await this.bridge.transcribe?.(audio,mime.split(';')[0]!);if(epoch===this.epoch&&text)this.transcript(text);}catch(e){if(epoch===this.epoch)this.issue((e as Error).message);}})();};
   recorder.start(500);this.changed(true);this.timer=setTimeout(()=>this.release(),25000);return true;
  }catch(e){if(epoch===this.epoch){this.issue((e as Error).message);this.cancel();}return false;}
 }
 release(){if(!this.held)return;this.held=false;this.clearTimer();this.changed(false);if(this.recorder&&this.recorder.state!=='inactive')this.recorder.stop();else this.stopTracks();}
 cancel(){this.epoch++;this.held=false;this.clearTimer();const recorder=this.recorder;this.recorder=null;if(recorder){recorder.onstop=null;recorder.ondataavailable=null;recorder.onerror=null;if(recorder.state!=='inactive')recorder.stop();}this.stopTracks();this.changed(false);void this.bridge.cancelTranscription?.().catch(()=>{});}
 private stopTracks(){this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
 private clearTimer(){if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
}
