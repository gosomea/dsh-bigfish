import {deflateRawSync} from 'node:zlib';
import {crc32} from '../src/pet/archive.js';
/** Deflated archives exercise nested expansion limits; production writes stored ZIPs. */
export function compressedZip(files:Record<string,Uint8Array>):Uint8Array {
 const chunks:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 for(const [path,bytes] of Object.entries(files)){
  const name=new TextEncoder().encode(path),data=deflateRawSync(bytes),crc=crc32(bytes);
  const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(8,8,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,name.length,true);header.set(name,30);
  const directory=new Uint8Array(46+name.length),d=new DataView(directory.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(10,8,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);directory.set(name,46);
  chunks.push(header,data);central.push(directory);offset+=header.length+data.length;
 }
 const size=central.reduce((sum,c)=>sum+c.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
 return Buffer.concat([...chunks,...central,end]);
}
