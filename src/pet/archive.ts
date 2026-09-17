/** Portable bounded ZIP reader. Files remain in memory; paths are never extracted. */
export const MAX_ARCHIVE = 32 * 1024 * 1024;
export const MAX_EXPANDED = 64 * 1024 * 1024;
export function safePath(path: string): boolean {
  return typeof path==='string' && /^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith('/') && path.split('/').every(p=>p!=='.'&&p!=='..'&&p!=='');
}
export function crc32(bytes: Uint8Array): number {
  let crc=0xffffffff;
  for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
export async function readZip(bytes: Uint8Array, limits = {archive: MAX_ARCHIVE, expanded: MAX_EXPANDED}): Promise<Record<string,Uint8Array>> {
  if(bytes.length>limits.archive||bytes.length<22)throw Error(limits.archive===MAX_ARCHIVE?'角色包大小无效（最大 32 MB）':`备份大小无效（最大 ${limits.archive/1024/1024} MB）`);
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), files:Record<string,Uint8Array>=Object.create(null);
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('不支持的 ZIP 格式');
  const count=v.getUint16(end+10,true),centralSize=v.getUint32(end+12,true);let at=v.getUint32(end+16,true),expanded=0;
  if(count>256||count!==v.getUint16(end+8,true)||at+centralSize!==end)throw Error('ZIP 目录无效或文件过多');
  for(let i=0;i<count;i++){
    if(at+46>end||v.getUint32(at,true)!==0x02014b50)throw Error('ZIP 目录损坏');
    const flags=v.getUint16(at+8,true),method=v.getUint16(at+10,true),crc=v.getUint32(at+16,true),packed=v.getUint32(at+20,true),size=v.getUint32(at+24,true),n=v.getUint16(at+28,true),extra=v.getUint16(at+30,true),comment=v.getUint16(at+32,true),offset=v.getUint32(at+42,true);
    if(at+46+n+extra+comment>end)throw Error('ZIP 目录越界');
    const path=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+n));at+=46+n+extra+comment;
    if(path.endsWith('/')&&size===0&&safePath(path.slice(0,-1)))continue;
    expanded+=size;
    if(!safePath(path)||Object.hasOwn(files,path)||flags&1||![0,8].includes(method)||expanded>limits.expanded||((v.getUint32(at-46-n-extra-comment+38,true)>>>16)&0xf000)===0xa000)throw Error('ZIP 路径、压缩方式或展开大小无效');
    if(offset+30>bytes.length||v.getUint32(offset,true)!==0x04034b50)throw Error('ZIP 文件头无效');
    const start=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);
    if(start+packed>v.getUint32(end+16,true))throw Error('ZIP 文件越界');
    const compressed=bytes.slice(start,start+packed);let out:Uint8Array;
    if(method===0)out=compressed;
    else {
      const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const reader=stream.getReader(),chunks:Uint8Array[]=[];let total=0;
      try{while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.length;if(total>size||total>limits.expanded)throw Error('ZIP 实际展开大小超限');chunks.push(chunk.value);}}finally{await reader.cancel();}
      out=new Uint8Array(total);let pos=0;for(const c of chunks){out.set(c,pos);pos+=c.length;}
    }
    if(out.length!==size||crc32(out)!==crc)throw Error('ZIP 文件校验失败');files[path]=out;
  }
  if(at!==end)throw Error('ZIP 目录长度不一致');return files;
}
export function writeZip(files:Record<string,Uint8Array>):Uint8Array {
  const chunks:Uint8Array[]=[],directories:Uint8Array[]=[];let offset=0;
  for(const [path,data]of Object.entries(files)){
    if(!safePath(path))throw Error('Invalid path');const name=new TextEncoder().encode(path),crc=crc32(data);
    const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);
    const dir=new Uint8Array(46+name.length),d=new DataView(dir.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);dir.set(name,46);
    chunks.push(local,data);directories.push(dir);offset+=local.length+data.length;
  }
  const central=directories.reduce((n,d)=>n+d.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,directories.length,true);e.setUint16(10,directories.length,true);e.setUint32(12,central,true);e.setUint32(16,offset,true);
  const result=new Uint8Array(offset+central+22);let at=0;for(const c of [...chunks,...directories,end]){result.set(c,at);at+=c.length;}return result;
}
