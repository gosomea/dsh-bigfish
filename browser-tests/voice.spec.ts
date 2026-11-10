import {settingsDisclosure,settingOptions} from './helpers/settings.js';
import {test,expect} from '@playwright/test';
test('voice needs a direct hold, fills text without model calls, and cancels on hiding',async({page})=>{
 let requests=0;page.on('request',r=>{if(r.url().includes('/api/bigfish-companion'))requests++;});
 await page.addInitScript(()=>{
  const w=window as any;w.voiceCalls={start:0,stop:0,abort:0,speak:0};
  class Recognition{lang='';continuous=false;interimResults=false;onresult:any;onerror:any;onend:any;start(){w.voiceCalls.start++;}stop(){w.voiceCalls.stop++;this.onresult?.({results:[{isFinal:true,0:{transcript:'现在有哪些任务要处理？'},length:1}]});this.onend?.();}abort(){w.voiceCalls.abort++;}}
  w.SpeechRecognition=Recognition;
  w.SpeechSynthesisUtterance=class {constructor(public text:string){}voice:any;lang='';rate=1;};
  Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{voiceURI:'local',name:'本机声音',lang:'zh-CN',localService:true},{voiceURI:'remote',name:'远端声音',lang:'zh-CN',localService:false}],addEventListener(){},removeEventListener(){},cancel(){},speak(){w.voiceCalls.speak++;}}});
  localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'assistant',groups:{perception:true}})}));
 });
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();await settingsDisclosure(page,'智能管家','语音与主动分享');
 const v=page.getByTestId('voice-settings');await v.locator('summary').click();const button=v.getByRole('button',{name:'按住说话',exact:true});await expect(button).toBeDisabled();
 await v.getByLabel('允许本次使用浏览器语音识别').check();expect(await page.evaluate(()=>(window as any).voiceCalls.start)).toBe(0);
 await button.focus();await page.keyboard.down('Space');await expect(v.getByRole('button',{name:'正在听，松开结束',exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.up('Space');
 await expect(v.getByLabel('语音识别后的文字')).toHaveValue('现在有哪些任务要处理？');expect(requests).toBe(0);
 await expect((await settingOptions(v.getByLabel('设备本地声音')))).toHaveCount(1);await expect(v.getByRole('combobox',{name:'设备本地声音',exact:true})).toContainText('本机声音');
 await v.getByRole('button',{name:'试听声音'}).click();expect(await page.evaluate(()=>(window as any).voiceCalls.speak)).toBe(1);
 await button.focus();await page.keyboard.down('Space');await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await page.keyboard.up('Space');
 expect(await page.evaluate(()=>(window as any).voiceCalls.abort)).toBe(1);expect(requests).toBe(0);
});
test('unsupported devices show an explanation and never request a microphone',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'SpeechRecognition',{value:undefined});Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined});localStorage.setItem('bigfish.demo.preferences.v1',JSON.stringify({lifestyleJson:JSON.stringify({version:1,preset:'custom',basedOn:'assistant',groups:{perception:true}})}));});
 await page.goto('/');await page.getByRole('button',{name:'完整设置',exact:true}).click();await settingsDisclosure(page,'智能管家','语音与主动分享');const v=page.getByTestId('voice-settings');await v.locator('summary').click();await expect(v).toContainText('当前浏览器没有可用');await expect(v.getByLabel('允许本次使用浏览器语音识别')).toBeDisabled();
});
