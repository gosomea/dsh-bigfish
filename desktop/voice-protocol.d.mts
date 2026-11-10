export function voiceEndpoint(raw:string):string;
export function transcribeAudio(config:{endpoint:string;model:string;key:string},audio:Uint8Array,mediaType:string,signal:AbortSignal,transport?:typeof fetch):Promise<string>;
