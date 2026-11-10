import React,{Children,Fragment,isValidElement,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import type {CSSProperties,KeyboardEvent,ReactNode} from 'react';

export interface SettingsOption {value:string;label:ReactNode;text:string;disabled:boolean;group?:string}
type OptionNode={children?:ReactNode;value?:string|number;disabled?:boolean;label?:string};
const textContent=(node:ReactNode):string=>Children.toArray(node).map(child=>typeof child==='string'||typeof child==='number'?String(child):isValidElement<OptionNode>(child)?textContent(child.props.children):'').join('');
/** Keep the existing option/optgroup declarations while rendering a themed, accessible listbox. */
export function settingsOptions(children:ReactNode,group?:string,disabled=false):SettingsOption[]{
 return Children.toArray(children).flatMap(child=>{
  if(!isValidElement<OptionNode>(child))return [];
  if(child.type===Fragment)return settingsOptions(child.props.children,group,disabled);
  if(child.type==='optgroup')return settingsOptions(child.props.children,child.props.label,disabled||!!child.props.disabled);
  if(child.type!=='option')return [];
  const text=child.props.label??textContent(child.props.children);
  return [{value:String(child.props.value??text),label:child.props.label??child.props.children,text,disabled:disabled||!!child.props.disabled,...group===undefined?{}:{group}}];
 });
}

export function selectPopupPosition(anchor:{left:number;right:number;top:number;bottom:number;width:number},viewport:{width:number;height:number;top?:number;left?:number},contentHeight:number){
 const inset=12,gap=4,vtop=viewport.top??0,vleft=viewport.left??0;
 const width=Math.min(Math.max(anchor.width,144),Math.max(0,viewport.width-inset*2));
 const below=vtop+viewport.height-inset-anchor.bottom-gap,above=anchor.top-vtop-inset-gap;
 const side=below>=Math.min(contentHeight,240)||below>=above?'bottom':'top';
 const maxHeight=Math.max(0,Math.min(340,side==='bottom'?below:above));
 return {left:Math.max(vleft+inset,Math.min(anchor.left,vleft+viewport.width-inset-width)),top:side==='bottom'?anchor.bottom+gap:Math.max(vtop+inset,anchor.top-gap-Math.min(contentHeight,maxHeight)),width,maxHeight,side};
}

type Change={target:{value:string};currentTarget:{value:string}};
type Props=Omit<React.SelectHTMLAttributes<HTMLSelectElement>,'onChange'|'onKeyDown'|'multiple'|'size'|'defaultValue'|'value'|'onBlur'|'onFocus'> & {value:string|number;onChange?:(event:Change)=>void};
type PopoverElement=HTMLDivElement&{showPopover?:()=>void;hidePopover?:()=>void};
/** The popup stays in the trigger's DOM tree. The top layer escapes scrolling dialogs without losing Host theme variables. */
export function SettingsSelect({children,value,onChange,disabled=false,className='',style,id,name,required,...attributes}:Props){
 const uid=useId().replace(/:/g,''),listId=`bf-select-${uid}`,button=useRef<HTMLButtonElement>(null),popup=useRef<PopoverElement>(null);
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1),[position,setPosition]=useState<CSSProperties>({visibility:'hidden'});
 const options=settingsOptions(children),selected=options.findIndex(option=>option.value===String(value)),typeahead=useRef({text:'',time:0});
 const optionsRef=useRef(options);optionsRef.current=options;
 const close=(restore=false)=>{setOpen(false);if(restore)button.current?.focus({preventScroll:true});};
 const openMenu=()=>{if(disabled)return;setActive(selected>=0&&!options[selected]?.disabled?selected:options.findIndex(option=>!option.disabled));setOpen(true);};
 const choose=(index:number)=>{const option=options[index];if(!option||option.disabled)return;if(option.value!==String(value))onChange?.({target:{value:option.value},currentTarget:{value:option.value}});close(true);};
 const move=(direction:1|-1)=>{
  const enabled=options.map((option,index)=>option.disabled?-1:index).filter(index=>index>=0);
  if(!enabled.length)return;
  const index=enabled.indexOf(active);setActive(enabled[(index+direction+enabled.length)%enabled.length]!);
 };
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useLayoutEffect(()=>{
  if(!open||!button.current||!popup.current)return;
  const target=button.current,list=popup.current;
  // The native popover is a top-layer surface, so it is not clipped by overflow or transformed ancestors.
  list.setAttribute('popover','manual');list.showPopover?.();
  const layout=()=>{
   const rect=target.getBoundingClientRect(),view=window.visualViewport,viewTop=view?.offsetTop??0;
   const top=Math.max(viewTop,parseFloat(getComputedStyle(target).getPropertyValue('--dsh-frame-overlay-top'))||0);
   const viewport={width:view?.width??innerWidth,height:Math.max(0,(view?.height??innerHeight)-(top-viewTop)),top,left:view?.offsetLeft??0};
   let clip={left:viewport.left,right:viewport.left+viewport.width,top,bottom:top+viewport.height};
   for(let ancestor=target.parentElement;ancestor;ancestor=ancestor.parentElement){
    const css=getComputedStyle(ancestor),bounds=ancestor.getBoundingClientRect();
    if(css.overflowX!=='visible')clip={...clip,left:Math.max(clip.left,bounds.left),right:Math.min(clip.right,bounds.right)};
    if(css.overflowY!=='visible')clip={...clip,top:Math.max(clip.top,bounds.top),bottom:Math.min(clip.bottom,bounds.bottom)};
   }
   if(!target.isConnected||rect.width===0||rect.height===0||rect.bottom<=clip.top||rect.top>=clip.bottom||rect.right<=clip.left||rect.left>=clip.right){setOpen(false);return;}
   const next=selectPopupPosition(rect,viewport,list.scrollHeight);
   setPosition({left:next.left,top:next.top,width:next.width,maxHeight:next.maxHeight,visibility:'visible'});
  };
  layout();
  const outside=(event:PointerEvent)=>{if(!list.contains(event.target as Node)&&!target.contains(event.target as Node))close();};
  const onScroll=(event:Event)=>{if(!list.contains(event.target as Node))layout();};
  const observer=new ResizeObserver(layout);observer.observe(target);
  window.addEventListener('resize',layout);window.addEventListener('scroll',onScroll,true);window.visualViewport?.addEventListener('resize',layout);window.visualViewport?.addEventListener('scroll',layout);
  document.addEventListener('pointerdown',outside,true);
  return()=>{observer.disconnect();window.removeEventListener('resize',layout);window.removeEventListener('scroll',onScroll,true);window.visualViewport?.removeEventListener('resize',layout);window.visualViewport?.removeEventListener('scroll',layout);document.removeEventListener('pointerdown',outside,true);if(list.isConnected&&list.matches(':popover-open'))list.hidePopover?.();};
 },[open]);
 useLayoutEffect(()=>{
  if(!open)return;const list=popup.current,row=list?.querySelector<HTMLElement>(`[data-option-index="${active}"]`);if(!list||!row)return;
  if(row.offsetTop<list.scrollTop)list.scrollTop=row.offsetTop;
  else if(row.offsetTop+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=row.offsetTop+row.offsetHeight-list.clientHeight;
 },[open,active,position.maxHeight]);
 const onKeyDown=(event:KeyboardEvent<HTMLElement>)=>{
  if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close(true);return;}
  if(event.key==='Tab'){close(event.currentTarget===popup.current);return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();if(!open){openMenu();if(event.key==='Home')setActive(options.findIndex(o=>!o.disabled));else if(event.key==='End')setActive(options.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0).at(-1)??-1);return;}
   if(event.key==='Home')setActive(options.findIndex(o=>!o.disabled));else if(event.key==='End')setActive(options.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0).at(-1)??-1);else move(event.key==='ArrowDown'?1:-1);return;
  }
  if(event.key==='Enter'||event.key===' '){event.preventDefault();if(open)choose(active);else openMenu();return;}
  if(event.key.length===1&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
   event.preventDefault();const now=Date.now(),previous=typeahead.current;const text=now-previous.time<700?previous.text+event.key:event.key;typeahead.current={text,time:now};const prefix=[...text].every(char=>char===event.key)?event.key:text;
   const pool=optionsRef.current;const start=open&&active>=0?active:Math.max(selected,0),ordered=Array.from({length:pool.length},(_,i)=>(start+i+1)%pool.length);
   const found=ordered.find(index=>!pool[index]!.disabled&&pool[index]!.text.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()));
   if(!open)openMenu();if(found!==undefined)setActive(found);
  }
 };
 const current=options[selected];
 const sections: {name?:string;rows:{option:SettingsOption;index:number}[]}[]=[];
 options.forEach((option,index)=>{let section=sections.at(-1);if(!section||section.name!==option.group){section={rows:[],...option.group===undefined?{}:{name:option.group}};sections.push(section);}section.rows.push({option,index});});
 return <span className={`bf-select ${className}`} style={style}>
  <button {...attributes as React.ButtonHTMLAttributes<HTMLButtonElement>} id={id} ref={button} type="button" role="combobox" className="bf-select-trigger" disabled={disabled} aria-expanded={open} aria-controls={open?listId:undefined} aria-haspopup="listbox" aria-activedescendant={open&&active>=0?`${listId}-${active}`:undefined} aria-required={required||undefined} data-value={String(value)} onKeyDown={onKeyDown} onBlur={event=>{if(!popup.current?.contains(event.relatedTarget as Node))close();}} onClick={event=>{event.preventDefault();event.stopPropagation();if(open)close();else openMenu();}}>
   <span className="bf-select-value">{current?.label??String(value)}</span><svg className="bf-select-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
  {name&&<input type="hidden" name={name} value={String(value)}/>}
  {open&&<div ref={popup} id={listId} role="listbox" tabIndex={-1} aria-activedescendant={active>=0?`${listId}-${active}`:undefined} onKeyDown={onKeyDown} aria-label={attributes['aria-label']} className="bf-select-popup" style={position} onPointerDown={event=>{if(event.pointerType==='mouse'&&(event.target as Element).closest('[role=option]'))event.preventDefault();}} onClick={event=>{event.preventDefault();event.stopPropagation();}}>
   {sections.map((section,sectionIndex)=><div key={sectionIndex} role={section.name?'group':'presentation'} aria-label={section.name} className="bf-select-option-group">
    {section.name&&<div className="bf-select-group" role="presentation">{section.name}</div>}
    {section.rows.map(({option,index})=><div key={`${index}-${option.value}`} role="option" id={`${listId}-${index}`} aria-selected={index===selected} aria-disabled={option.disabled||undefined} data-option-index={index} data-value={option.value} data-active={index===active||undefined} className="bf-select-option" title={option.text} onPointerMove={()=>{if(!option.disabled)setActive(index);}} onClick={()=>choose(index)}>
     <span>{option.label}</span>{index===selected&&<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>)}
   </div>)}
   {!options.length&&<div className="bf-select-empty">暂无选项</div>}
  </div>}
 </span>;
}
