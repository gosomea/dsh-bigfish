import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {emptyState} from '../src/companion/state.js';

let html='';
test.beforeAll(async()=>{
 const visuals:Record<string,string>={
  'companion-canvas.js':'export const CompanionCanvas=()=>null; export const CompanionClipPreview=()=>null;',
  'fish-canvas.js':'export const FishCanvas=()=>null;',
  'home-scene.js':'export const HomeScene=()=>null;',
  'adventure-scene.js':'export const AdventureScene=()=>null; export const AdventurePreview=()=>null;',
  'paired-pet-scene.js':'export const PairedPetScene=()=>null;',
  'life-program-preview.js':'export const LifeProgramPreview=()=>null;',
  'home.js':'export const PetHomeLayer=()=>null;',
  'preview.js':'export const PetPreview=()=>null;',
  'builtin-preview.js':'export const BuiltinPreview=()=>null;',
  'renderer.js':'export const classicPack={scenes:[],assets:[]}; export class FishRenderer {}',
  'builtin-extension.js':'export const builtinExtensionData=()=>undefined; export const newBuiltinMotions=[]; export async function loadBuiltinExtension(){throw Error("No visual fixture loading");}',
 };
 const result=await build({entryPoints:[fileURLToPath(new URL('./fixtures/introduction-widget.tsx',import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',loader:{'.css':'text'},plugins:[{name:'unrelated-widget-visuals',setup(builder){
  builder.onResolve({filter:/\/(?:companion-canvas|fish-canvas|home-scene|adventure-scene|paired-pet-scene|life-program-preview|builtin-preview|renderer|builtin-extension)\.js$|\/pet\/(?:home|preview)\.js$/},args=>({path:args.path.split('/').at(-1)!,namespace:'fixture-visual'}));
  builder.onLoad({filter:/.*/,namespace:'fixture-visual'},args=>({contents:visuals[args.path]!,loader:'js'}));
  builder.onResolve({filter:/\.(?:png|webp)$/},args=>({path:args.path,namespace:'fixture-image'}));
  builder.onLoad({filter:/.*/,namespace:'fixture-image'},()=>({contents:'export default "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";',loader:'js'}));
 }}]});
 html='<!doctype html><meta charset="utf-8"><div id="root"></div><script>'+result.outputFiles[0]!.text.replaceAll('</script','<\\/script')+'</script>';
});
async function open(page:Page,initialState:'idle'|'completed'|'cancelled'='idle'){
 const host={...emptyState(),modelAvailable:true,screenshotAvailable:false,today:{used:0,reserved:0,automatic:0,estimated:false}};
 const calls:{op:string;client?:string}[]=[],errors:string[]=[];let reads=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install({time:new Date('2026-10-30T06:00:00Z')});
 await page.route('**/__introduction-widget*',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.route('**/api/bigfish-companion',async route=>{
  const request=route.request();if(request.method()==='GET'){reads++;await route.fulfill({json:host});return;}
  const body=request.postDataJSON();calls.push(body);
  if(body.op==='configuration-options'){await route.fulfill({json:{result:{groups:[{id:'fixture',name:'Fixture',models:[{id:'model',name:'Model'}]}],default:{provider:'fixture',model:'model'},workspaces:[],failures:[],catalogAvailable:true}}});return;}
  if(body.op==='lease')host.display={client:body.client,kind:body.kind,expiresAt:Date.parse('2026-10-30T07:00:00Z')};
  else if(body.op==='release'){if(host.display?.client===body.client)host.display=null;}
  else if(body.op==='introduce'){
   if(host.introducedAt!==null||body.client!==host.display?.client){await route.fulfill({json:{result:false}});return;}
   host.introducedAt=Date.parse('2026-10-30T06:00:16Z');
  }else throw Error(`Unexpected Host operation: ${body.op}`);
  await route.fulfill({json:{result:true}});
 });
 await page.goto(`/__introduction-widget?state=${initialState}`);const widget=page.getByTestId('bigfish-widget');await expect(widget).toBeVisible();
 await page.clock.fastForward(5000);await expect.poll(()=>reads).toBeGreaterThanOrEqual(2);await page.clock.runFor(50);
 await page.clock.fastForward(10100);await expect(widget.getByRole('button',{name:'了解并设置',exact:true})).toBeVisible();
 return {widget,host,calls,errors,readCount:()=>reads};
}

test('the real Widget introduction opens the intelligent settings page and acknowledges without granting model permission',async({page})=>{
 const {widget,host,calls,errors}=await open(page);expect(host.introducedAt).toBeNull();expect(calls.filter(call=>call.op==='introduce')).toEqual([]);
 await widget.getByRole('button',{name:'了解并设置',exact:true}).click();
 const panel=widget.locator('[data-settings-page="intelligence"]');await expect(panel).toBeVisible();
 await expect(widget.getByRole('button',{name:'智能管家',exact:true})).toHaveAttribute('aria-current','page');
 await expect(panel.getByTestId('intelligence-settings')).toContainText('普通模式');
 expect(host.policy.enabled).toBe(false);expect(host.today.used).toBe(0);
 const acknowledgement=calls.filter(call=>call.op==='introduce');expect(acknowledgement).toHaveLength(1);expect(acknowledgement[0]!.client).toBeTruthy();expect(calls.every(call=>['lease','release','introduce','configuration-options'].includes(call.op))).toBe(true);expect(errors).toEqual([]);
});

test('the real Widget normal-mode choice persists without opening settings and does not return after reload',async({page})=>{
 const {widget,host,calls,errors,readCount}=await open(page);
 await widget.getByRole('button',{name:'保持普通模式',exact:true}).click();await expect(widget.getByRole('button',{name:'保持普通模式',exact:true})).toHaveCount(0);
 await expect(widget.locator('.bf-popover')).toHaveCount(0);expect(host.introducedAt).not.toBeNull();
 const leasesBefore=calls.filter(call=>call.op==='lease').length;
 await page.reload();await expect.poll(()=>calls.filter(call=>call.op==='lease').length).toBeGreaterThan(leasesBefore);
 const readsBefore=readCount();await page.clock.fastForward(5000);await expect.poll(readCount).toBeGreaterThan(readsBefore);await page.clock.runFor(100);await expect(widget).toBeVisible();
 await page.clock.fastForward(20000);await page.clock.runFor(50);
 await expect(widget.getByRole('button',{name:'了解并设置',exact:true})).toHaveCount(0);expect(calls.filter(call=>call.op==='introduce')).toHaveLength(1);expect(host.policy.enabled).toBe(false);expect(host.today.used).toBe(0);expect(errors).toEqual([]);
});

test('refresh releases display ownership with a keepalive request before the next page leases',async({page})=>{
 await page.addInitScript(()=>{const original=window.fetch;window.fetch=(input,init)=>{if(typeof init?.body==='string'&&init.body.includes('"op":"release"')){const key='__releaseKeepalive',values=JSON.parse(localStorage.getItem(key)??'[]') as boolean[];values.push(init.keepalive===true);localStorage.setItem(key,JSON.stringify(values));}return original(input,init);};});
 const {calls}=await open(page),leases=calls.filter(call=>call.op==='lease').length;
 await page.reload();await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('__releaseKeepalive')??'[]') as boolean[])).toContain(true);
 await expect.poll(()=>calls.filter(call=>call.op==='release').length).toBeGreaterThan(0);await expect.poll(()=>calls.filter(call=>call.op==='lease').length).toBeGreaterThan(leases);
});


for(const ended of ['completed','cancelled'] as const)test(`the real Widget introduces after browsing a ${ended} conversation settles to idle`,async({page})=>{
 const {widget,host,calls,errors}=await open(page,ended);
 await expect(widget.locator('.bf-dialogue-text')).toContainText('我学会当小管家啦');
 expect(host.introducedAt).toBeNull();expect(calls.filter(call=>call.op==='introduce')).toEqual([]);
 expect(host.policy.enabled).toBe(false);expect(errors).toEqual([]);
});
