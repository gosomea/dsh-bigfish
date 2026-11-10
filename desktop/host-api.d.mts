import type {SharedPreferenceSnapshot} from '../src/companion/shared-preferences.js';
export interface Connection {url:string;cookie:string}
export function hostResponse(connection:Connection,path:string,init?:RequestInit,transport?:typeof fetch):Promise<Response>;
export function hostJson(connection:Connection,path:string,body?:unknown,transport?:typeof fetch):Promise<any>;
export function nativeRpc(connection:Connection,method:string,args:unknown,transport?:typeof fetch):Promise<any>;
export function readPreferences(connection:Connection,transport?:typeof fetch):Promise<SharedPreferenceSnapshot>;
export function petQuery(query:string,bytes?:Uint8Array):string;
