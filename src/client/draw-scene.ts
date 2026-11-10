import {drawSceneArt} from './scene-art.js';
import {workFurniture} from './scene-state.js';
/** Workspace decoration uses the same painted material and scale as the home, with local task cues. */
export function drawSceneProps(c:CanvasRenderingContext2D,theme:string,t:number,activity:number,front:boolean){
 c.save();
 if(!front){
  const backdrop=theme==='delivery'?'garden':theme==='library'?'night':'sea';
  c.fillStyle='#5276b51b';c.beginPath();c.ellipse(233,221,89,12,0,0,Math.PI*2);c.fill();
  if(theme==='library'){const p=workFurniture.shelf;drawSceneArt(c,'shelf',p.x,p.y,p.width,p.height);}
  else if(theme==='workshop'||theme==='desk'){const p=workFurniture.desk;drawSceneArt(c,'desk',p.x,p.y,p.width,p.height);}
  else if(theme==='rest'){const p=workFurniture.bed;drawSceneArt(c,'bed',p.x,p.y,p.width,p.height);}
  else if(theme==='delivery'){const p=workFurniture.shelf;drawSceneArt(c,'shelf',p.x,p.y,p.width,p.height);}
  if(theme!=='treadmill'){
   c.save();c.strokeStyle=backdrop==='night'?'#b7c8e6':'#91c6d8';c.lineWidth=.9;
   for(let i=0;i<3;i++){c.globalAlpha=.25+(t?Math.sin(t*.7+i)*.15:0);c.beginPath();c.ellipse(55+i*10,157+i*9,16+i*2,1.1,0,0,Math.PI*2);c.stroke();}c.restore();
  }
 }else{
  if(theme==='desk'||theme==='workshop'){
   const glow=c.createRadialGradient(112,151,2,112,151,32);glow.addColorStop(0,`rgba(255,226,163,${.2+(t?Math.sin(t*.9)*.04:0)})`);glow.addColorStop(1,'rgba(255,226,163,0)');c.fillStyle=glow;c.fillRect(78,117,68,68);
   c.strokeStyle='#d6dfeb';c.lineWidth=1.2;
   for(let i=0;i<2;i++){const drift=t?Math.sin(t*.8+i)*1.8:0;c.beginPath();c.moveTo(137+i*5,169);c.quadraticCurveTo(132+i*5+drift,164,137+i*5,158);c.stroke();}
  }
  if(theme==='treadmill'){
   c.fillStyle='#7b97bf';c.fillRect(141,213,187,13);c.fillStyle='#dbe7f9';const scroll=(t*(15+25*activity))%22;
   for(let i=0;i<8;i++)c.fillRect(146+i*22-scroll,217,12,3);
   c.strokeStyle='#7d92bb';c.lineWidth=2;c.beginPath();c.moveTo(327,214);c.lineTo(327,147);c.lineTo(306,147);c.stroke();
  }
 }
 c.restore();
}
