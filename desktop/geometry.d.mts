export interface Rect{x:number;y:number;width:number;height:number}
export interface Display{id?:number;scaleFactor?:number;workArea:Rect}
export function reconcileBounds(bounds:Rect,displays:Display[]):Rect;
export function appearanceBounds(bounds:Rect,area:Rect,size:number):Rect;
export function recallBounds(size:Pick<Rect,'width'|'height'>,area:Rect):Rect;
export function placeWindowBounds(window:{setBounds(bounds:Rect,animate?:boolean):void},walker:{place(point:{x:number;y:number},area:Rect,size:Pick<Rect,'width'|'height'>,now:number):void}|null,requested:Rect,displays:Display[],now:number):Rect;
export function nearWindowEdge(pet:Rect,windows:Rect[]):boolean;
export function motionChanged(before:Record<string,unknown>|null,after:Record<string,unknown>):boolean;
export class CrossScreenTravel{active:boolean;position:{x:number;y:number}|null;motion:string;start(bounds:Rect,display:Display,now:number,available?:readonly string[]):void;tick(now:number,speed:number,ready?:boolean):{x:number;y:number};snapshot():{clip:string|null;serial:string;phase:string};cancel():void}
