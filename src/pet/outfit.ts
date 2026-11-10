import type {Outfit} from '../companion/life-options.js';
import type {AccessoryAnchors} from './capabilities.js';
/** Draw small optional props at author-provided body/frame anchors; character pixels stay untouched. */
export function drawOutfit(c:CanvasRenderingContext2D,outfit:Outfit,anchors:AccessoryAnchors){
 const point=outfit==='sailor-bow'?anchors.head:outfit==='winter-scarf'?anchors.neck:anchors.chest;
 if(outfit==='none'||!point)return;
 c.save();c.translate(point.x,point.y);c.lineJoin='round';c.lineWidth=1.4;
 if(outfit==='sailor-bow'){
  c.fillStyle='#86c9df';c.strokeStyle='#385b81';c.beginPath();c.moveTo(0,0);c.lineTo(-12,-7);c.quadraticCurveTo(-17,0,-12,8);c.closePath();c.moveTo(0,0);c.lineTo(12,-7);c.quadraticCurveTo(17,0,12,8);c.closePath();c.fill();c.stroke();c.fillStyle='#edf9fb';c.fillRect(-3,-3,6,6);
 }else if(outfit==='star-pin'){
  c.fillStyle='#ffdd80';c.strokeStyle='#9b7640';c.beginPath();for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,r=i%2===0?7:3.4;const x=Math.cos(angle)*r,y=Math.sin(angle)*r;i?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.fill();c.stroke();
 }else{
  c.fillStyle='#b8dcef';c.strokeStyle='#42688c';c.beginPath();c.roundRect(-17,-4,34,9,4);c.fill();c.stroke();c.beginPath();c.moveTo(9,3);c.lineTo(14,25);c.lineTo(5,25);c.lineTo(1,3);c.closePath();c.fill();c.stroke();
 }
 c.restore();
}
