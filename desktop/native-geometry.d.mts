import type {Rect} from './geometry.mjs';
export function parseWindowGeometry(raw:string,ownPid:number):Rect[];
export function readWindowGeometry(platform:string,ownPid?:number,run?:(file:string,args:string[],options:object,callback:(error:Error|null,stdout:string)=>void)=>unknown):Promise<Rect[]>;
