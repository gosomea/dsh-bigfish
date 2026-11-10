export interface SignTextLayout {lines:string[];fontSize:number;lineHeight:number;truncated:boolean;original:string}
/** Keep glyph proportions. A small board wraps or ends in an ellipsis instead of squeezing a whole sentence. */
export function layoutSignText(text:string,width:number,height:number,measure:(text:string,fontSize:number)=>number,{minFontSize=10.5,maxFontSize=13}:{minFontSize?:number;maxFontSize?:number}={}):SignTextLayout {
 const original=text,clean=text.replace(/\s+/gu,' ').trim(),room=Math.max(1,width);
 const closing=/^[，。！？、；：…）》】」』”’％,.!?;:%)]$/u;
 const wrap=(fontSize:number)=>{
  const lines:string[]=[];let line='';
  for(const character of Array.from(clean)){
   if(line&&measure(line+character,fontSize)>room){
    const glyphs=Array.from(line);
    // Keep a closing mark with a preceding glyph. Reflow may then select a smaller permitted font.
    if(closing.test(character)&&glyphs.length>1&&measure(glyphs.at(-1)!+character,fontSize)<=room){const carry=glyphs.pop()!;lines.push(glyphs.join('').trim());line=carry+character;}
    else{lines.push(line.trim());line=character.trimStart();}
   }else line+=character;
  }
  if(line||!lines.length)lines.push(line.trim());return lines;
 };
 let fontSize=Math.max(minFontSize,maxFontSize),lines=wrap(fontSize);
 while(fontSize>minFontSize&&lines.length*Math.ceil(fontSize*1.2)>height){fontSize=Math.max(minFontSize,fontSize-.5);lines=wrap(fontSize);}
 const lineHeight=Math.ceil(fontSize*1.2),count=Math.max(1,Math.floor(height/lineHeight)),truncated=lines.length>count;
 if(truncated){lines=lines.slice(0,count);let last=lines[count-1]??'';while(last&&measure(last+'…',fontSize)>room)last=Array.from(last).slice(0,-1).join('');lines[count-1]=last+'…';}
 return {lines,fontSize,lineHeight,truncated,original};
}
export function drawSignText(c:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,height:number,options:{minFontSize?:number;maxFontSize?:number}={}):SignTextLayout {
 const font=(size:number)=>`600 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
 const layout=layoutSignText(text,width,height,(value,size)=>{c.font=font(size);return c.measureText(value).width;},options);
 c.save();c.font=font(layout.fontSize);c.fillStyle='#233b59';c.textAlign='center';c.textBaseline='middle';
 layout.lines.forEach((line,index)=>c.fillText(line,x,y+(index-(layout.lines.length-1)/2)*layout.lineHeight));c.restore();return layout;
}
