import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

let html='';
test.beforeAll(async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('./fixtures/introduction-components.tsx',import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',loader:{'.css':'text'}});
 html='<!doctype html><meta charset="utf-8"><div id="root"></div><script>'+result.outputFiles[0]!.text.replaceAll('</script','<\\/script')+'</script>';
});
async function open(page:Page,initiallyHidden=false){
 await page.clock.install({time:new Date('2026-10-30T06:00:00Z')});
 await page.route('**/__introduction*',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto(initiallyHidden?'/__introduction?hidden=1':'/__introduction');
 await expect(page.getByTestId('client-owner')).toBeVisible();
}
async function advance(page:Page,ms=10100){await page.clock.fastForward(ms);}
async function state(page:Page){return page.evaluate(()=>(window as any).introductionFixture.state());}
const owner=(page:Page)=>page.getByTestId('client-owner');
const other=(page:Page)=>page.getByTestId('client-other');
const invitation=(page:Page)=>owner(page).getByRole('button',{name:'保持普通模式',exact:true});

test('only the display owner introduces, even with ordinary message text disabled, without consuming or billing',async({page})=>{
 await open(page);await advance(page,9900);await expect(invitation(page)).toHaveCount(0);
 await advance(page,300);await expect(invitation(page)).toBeVisible();
 await expect(owner(page).locator('.bf-dialogue-text')).toContainText('额外消耗模型 token');
 await expect(other(page).locator('.bf-dialogue-text')).toHaveCount(0);
 expect(await state(page)).toMatchObject({introducedAt:null,usedTokens:0,policyEnabled:false,calls:[]});
});

test('backgrounding cancels a pending introduction and a visible page starts its own complete grace period',async({page})=>{
 await open(page);await advance(page,8000);
 await page.evaluate(()=>(window as any).introductionFixture.visibility('hidden'));await advance(page,20000);
 await expect(invitation(page)).toHaveCount(0);expect((await state(page)).introducedAt).toBeNull();
 await page.evaluate(()=>(window as any).introductionFixture.visibility('visible'));await advance(page,9900);await expect(invitation(page)).toHaveCount(0);
 await advance(page,300);await expect(invitation(page)).toBeVisible();expect((await state(page)).calls).toEqual([]);
});

test('a page initially loaded in the background can introduce after becoming visible',async({page})=>{
 await open(page,true);await advance(page,20000);await expect(invitation(page)).toHaveCount(0);
 await page.evaluate(()=>(window as any).introductionFixture.visibility('visible'));await advance(page);
 await expect(invitation(page)).toBeVisible();expect((await state(page)).introducedAt).toBeNull();
});

test('settings or work defer the prompt without acknowledging it, and ownership handover moves the prompt',async({page})=>{
 await open(page);await page.evaluate(()=>(window as any).introductionFixture.eligible(false));await advance(page,20000);await expect(invitation(page)).toHaveCount(0);
 await page.evaluate(()=>(window as any).introductionFixture.eligible(true));await advance(page);await expect(invitation(page)).toBeVisible();
 await page.evaluate(()=>(window as any).introductionFixture.owner('other'));await expect(invitation(page)).toHaveCount(0);
 await advance(page);await expect(other(page).getByRole('button',{name:'保持普通模式',exact:true})).toBeVisible();
 expect((await state(page)).introducedAt).toBeNull();expect((await state(page)).calls).toEqual([]);
 await page.evaluate(()=>(window as any).introductionFixture.expire());await expect(other(page).getByRole('button',{name:'保持普通模式',exact:true})).toHaveCount(0);
});

test('failed acknowledgement retains the introduction for retry; choosing normal mode persists across reload',async({page})=>{
 await open(page);await advance(page);await page.evaluate(()=>(window as any).introductionFixture.reject(true));await invitation(page).click();
 await expect(owner(page).getByRole('alert')).toContainText('测试：确认失败');await expect(invitation(page)).toBeVisible();expect((await state(page)).introducedAt).toBeNull();
 await page.evaluate(()=>(window as any).introductionFixture.reject(false));await invitation(page).click();
 await expect(invitation(page)).toHaveCount(0);expect(await state(page)).toMatchObject({policyEnabled:false,usedTokens:0,settingsPage:'closed',calls:[{op:'introduce',body:{client:'owner'}},{op:'introduce',body:{client:'owner'}}]});
 await page.reload();await expect(owner(page)).toBeVisible();await advance(page,20000);await expect(invitation(page)).toHaveCount(0);expect((await state(page)).introducedAt).not.toBeNull();
});

test('learning more acknowledges once and opens intelligent settings without enabling a model',async({page})=>{
 await open(page);await advance(page);await owner(page).getByRole('button',{name:'了解并设置',exact:true}).click();
 await expect(invitation(page)).toHaveCount(0);expect(await state(page)).toMatchObject({settingsPage:'intelligence',policyEnabled:false,usedTokens:0,calls:[{op:'introduce',body:{client:'owner'}}]});
});


test('an already visible prompt disappears at natural lease expiry without waiting for a Host poll',async({page})=>{
 await open(page);await advance(page);await expect(invitation(page)).toBeVisible();
 await page.evaluate(()=>(window as any).introductionFixture.expireAfter(1000));await advance(page,1100);
 await expect(invitation(page)).toHaveCount(0);expect((await state(page)).introducedAt).toBeNull();expect((await state(page)).calls).toEqual([]);
});


for(const success of [true,false])test(`a previous Host's ${success?'successful':'failed'} confirmation cannot affect a new Host`,async({page})=>{
 await open(page);await advance(page);await page.evaluate(()=>(window as any).introductionFixture.holdConfirm());
 await owner(page).getByRole('button',{name:'了解并设置',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).introductionFixture.heldCount())).toBe(1);
 await page.evaluate(()=>(window as any).introductionFixture.switchHost());await expect(invitation(page)).toHaveCount(0);
 await page.evaluate(value=>(window as any).introductionFixture.settleOld(value),success);await page.clock.runFor(50);
 expect(await state(page)).toMatchObject({introducedAt:null,settingsPage:'closed',policyEnabled:false,usedTokens:0});await expect(owner(page).getByRole('alert')).toHaveCount(0);
 await advance(page);await expect(invitation(page)).toBeVisible();expect((await state(page)).introducedAt).toBeNull();
 expect((await state(page)).calls).toEqual([{op:'introduce',body:{client:'owner'}}]);
});
