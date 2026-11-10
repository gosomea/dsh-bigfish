/** Explicit user-configured OpenAI-compatible transcription endpoint; credentials never enter the renderer or Host presets. */
export function voiceEndpoint(raw){const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw Error('转写端点须为 HTTPS，或本机 HTTP；不要把凭据放在 URL 中');return u.href;}
export async function transcribeAudio(config,audio,mediaType,signal,transport=fetch){
 if(!config.endpoint||!(audio instanceof Uint8Array)||audio.length<1||audio.length>3*1024*1024||!['audio/webm','audio/ogg','audio/wav','audio/mp4'].includes(mediaType))throw Error('录音格式无效或超过 3 MiB');
 const endpoint=voiceEndpoint(config.endpoint),form=new FormData();form.set('model',config.model||'whisper-1');form.set('file',new Blob([audio],{type:mediaType}),'speech.'+({['audio/webm']:'webm',['audio/ogg']:'ogg',['audio/wav']:'wav',['audio/mp4']:'m4a'}[mediaType]));
 const r=await transport(endpoint,{method:'POST',headers:config.key?{authorization:'Bearer '+config.key}:{},body:form,signal,redirect:'error'});if(!r.ok)throw Error(`语音转写服务拒绝了请求 (${r.status})；语音费用独立于宠物模型预算`);
 if(Number(r.headers.get('content-length'))>32768)throw Error('转写回复过大');const reader=r.body?.getReader();if(!reader)throw Error('转写没有返回内容');let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw Error('转写回复过大');}chunks.push(value);}}finally{reader.releaseLock();}
 const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(typeof result.text!=='string'||!result.text.trim())throw Error('转写服务没有返回 text');return result.text.trim().slice(0,1000);
}
