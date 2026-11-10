import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {selectSetting,selectControl,settingOptions} from './helpers/settings.js';
let fixture='';
test.beforeAll(async()=>{
 const output=await build({entryPoints:[fileURLToPath(new URL('./fixtures/settings-select.tsx',import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',loader:{'.css':'text'}});
 fixture='<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root"></div><script>'+output.outputFiles[0]!.text.replaceAll('</script','<\\/script')+'</script></body></html>';
});
async function open(page:Page,long=false){await page.route('**/__settings_select**',route=>route.fulfill({contentType:'text/html',body:fixture}));await page.goto('/__settings_select'+(long?'?long':''));}
test('the real listbox uses Host light/dark tokens and selects exactly once without native options',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await open(page);
 await page.addStyleTag({content:'body {--dsw-alias-label-primary:rgb(31,42,53);--dsw-menu-surface-fill:rgb(252,251,250);}body[data-ds-dark-theme] {--dsw-alias-label-primary:rgb(240,241,242);--dsw-menu-surface-fill:rgb(29,30,31);}'});
 const combo=page.getByRole('combobox',{name:'活动范围',exact:true});await combo.click();const list=page.getByRole('listbox');
 await expect(list).toBeVisible();await expect(list).toHaveCSS('background-color','rgb(252, 251, 250)');await expect(list).toHaveCSS('color','rgb(31, 42, 53)');
 await expect(list.getByRole('option',{selected:true})).toHaveText('附近散步');await expect(list.getByRole('group',{name:'本地活动'})).toBeVisible();await expect(page.locator('select')).toHaveCount(0);
 await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
 await expect(list).toHaveCSS('background-color','rgb(29, 30, 31)');await expect(list).toHaveCSS('color','rgb(240, 241, 242)');
 await list.getByRole('option',{name:'较大范围',exact:true}).click();await expect(combo).toHaveAttribute('data-value','wide');await expect(combo).toBeFocused();await expect(page.getByTestId('count')).toHaveText('1');
 await selectSetting(page,'活动范围','fixed');await expect(combo).toHaveAttribute('data-value','fixed');await expect(page.getByTestId('count')).toHaveText('2');await selectSetting(page,'活动范围','fixed');await expect(page.getByTestId('count')).toHaveText('2');expect(errors).toEqual([]);
});
test('keyboard selection skips disabled rows, Escape cancels and disabled triggers stay closed',async({page})=>{
 await open(page);const combo=page.getByRole('combobox',{name:'活动范围',exact:true});await combo.focus();await combo.press('ArrowDown');await combo.press('ArrowDown');await combo.press('Enter');
 await expect(combo).toHaveAttribute('data-value','wide');await expect(combo).toBeFocused();await combo.press('ArrowUp');await combo.press('Home');await combo.press('Escape');
 await expect(combo).toHaveAttribute('data-value','wide');await expect(combo).toHaveAttribute('aria-expanded','false');await expect(page.getByTestId('count')).toHaveText('1');await expect(page.getByRole('combobox',{name:'声音'})).toBeDisabled();
 await combo.press('ArrowDown');await combo.press('Home');await combo.press('Enter');await expect(combo).toHaveAttribute('data-value','fixed');
});
test('the top-layer menu escapes a transformed scrolling modal and fits narrow viewport edges',async({page})=>{
 await page.setViewportSize({width:320,height:540});await open(page);const combo=page.getByRole('combobox',{name:'活动范围',exact:true});await combo.click();const list=page.getByRole('listbox');
 const geometry=await list.evaluate(el=>{const r=el.getBoundingClientRect(),m=document.querySelector('.bf-modal')!.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,modalTop:m.top,topLayer:el.matches(':popover-open')};});
 expect(geometry.topLayer).toBe(true);expect(geometry.left).toBeGreaterThanOrEqual(11);expect(geometry.right).toBeLessThanOrEqual(309);expect(geometry.top).toBeGreaterThanOrEqual(11);expect(geometry.bottom).toBeLessThanOrEqual(529);
 // The transformed overflow ancestor cannot clip the menu's viewport-level hit target.
 await list.getByRole('option',{name:'固定位置',exact:true}).click();await expect(combo).toHaveAttribute('data-value','fixed');
 await combo.click();await page.locator('.bf-modal').evaluate(el=>el.scrollTop+=30);await expect(list).toBeVisible();await list.getByRole('option',{name:'较大范围',exact:true}).click();await expect(combo).toHaveAttribute('data-value','wide');
});

test('long animation lists reveal the current selection and scroll with keyboard navigation',async({page})=>{
 await page.setViewportSize({width:500,height:700});await open(page,true);const combo=page.getByRole('combobox',{name:'活动范围',exact:true});await combo.click();const list=page.getByRole('listbox');
 const inList=()=>list.getByRole('option',{selected:true}).evaluate(el=>{const row=el.getBoundingClientRect(),list=el.closest('[role=listbox]')!.getBoundingClientRect();return row.top>=list.top&&row.bottom<=list.bottom;});
 await expect.poll(inList).toBe(true);await combo.press('Home');await combo.press('Enter');await expect(combo).toHaveAttribute('data-value','motion-0');await combo.click();await expect.poll(inList).toBe(true);
 await combo.press('End');await combo.press('Enter');await expect(combo).toHaveAttribute('data-value','motion-39');
});

test('scrolling a trigger fully out of its settings viewport dismisses the detached menu',async({page})=>{
 await open(page);const combo=page.getByRole('combobox',{name:'活动范围',exact:true});await combo.click();await expect(page.getByRole('listbox')).toBeVisible();
 await page.locator('.bf-modal').evaluate(el=>el.scrollTop=el.scrollHeight);await expect(combo).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('listbox')).toHaveCount(0);
});
test('Escape dismisses the menu before the enclosing settings handler receives it',async({page})=>{
 await open(page);await page.evaluate(()=>{(window as any).escapeCount=0;window.addEventListener('keydown',event=>{if(event.key==='Escape')(window as any).escapeCount++;});});
 const combo=page.getByRole('combobox',{name:'活动范围',exact:true});await combo.click();await combo.press('Escape');await expect(combo).toBeFocused();expect(await page.evaluate(()=>(window as any).escapeCount)).toBe(0);
 await combo.click();const list=page.getByRole('listbox');await list.focus();await list.press('Escape');await expect(combo).toBeFocused();expect(await page.evaluate(()=>(window as any).escapeCount)).toBe(0);await combo.press('Escape');expect(await page.evaluate(()=>(window as any).escapeCount)).toBe(1);
});
test('help text remains readable with the real DSH light and dark text aliases including tertiary',async({page})=>{
 await open(page);await page.addStyleTag({path:fileURLToPath(new URL('./fixtures/dsh-theme.css',import.meta.url))});
 for(const dark of [false,true]){
  await page.evaluate(value=>document.body.toggleAttribute('data-ds-dark-theme',value),dark);
  const ratio=await page.locator('.bf-help').evaluate(el=>{const css=getComputedStyle(el),bg=getComputedStyle(el.closest('.bf-modal')!),l=(value:string)=>{const c=value.match(/[\d.]+/g)!.slice(0,3).map(n=>{const v=Number(n)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]!* .2126+c[1]!* .7152+c[2]!* .0722;},a=l(css.color),b=l(bg.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
  expect(ratio).toBeGreaterThanOrEqual(4.5);
 }
});

test('selection helpers narrow a shared accessible label to its combobox while the listbox is open',async({page})=>{
 await open(page);const labelled=page.getByLabel('活动范围',{exact:true});
 await expect(await settingOptions(labelled)).toHaveCount(4);await expect(page.getByLabel('活动范围',{exact:true})).toHaveCount(2);
 await selectControl(labelled,'wide');await expect(page.getByRole('combobox',{name:'活动范围',exact:true})).toHaveAttribute('data-value','wide');
 await expect(await settingOptions(labelled)).toHaveCount(4);await selectControl(labelled,'fixed');await expect(page.getByTestId('count')).toHaveText('2');
});
