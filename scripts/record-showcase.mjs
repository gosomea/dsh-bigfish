/** Record the real preview renderer in an isolated browser. No DSH account or model calls. */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const output = resolve('docs/media');
const scratch = resolve('artifacts/showcase');
await mkdir(output, { recursive: true });
await mkdir(scratch, { recursive: true });
const html = await readFile('dist/preview.html');
const server = createServer((_, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const errors = [];
const chapters = [];
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
function encode(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'ffmpeg failed');
}
const prefs = {size:260, bubbleWidth:310, bubbleFont:15, richness:1, whipEnabled:false,
  idleMode:'quiet', idleHideMessage:false, mode:'rhythm', autoSpeed:false,
  maxWhipHz:0.8, completionSeconds:5, sound:false};
async function patch(page, values) {
  await page.evaluate(values => {
    const key = 'bigfish.demo.preferences.v1';
    localStorage.setItem(key, JSON.stringify({...JSON.parse(localStorage.getItem(key) || '{}'), ...values}));
    dispatchEvent(new Event('storage'));
  }, values);
}
async function context(viewport) {
  const context = await browser.newContext({viewport, deviceScaleFactor:1, recordVideo:{dir:scratch, size:viewport}});
  await context.addInitScript(prefs => {
    // Select the first eligible existing action for repeatable showcase captures.
    Math.random = () => 0;
    localStorage.setItem('bigfish.demo.preferences.v1', JSON.stringify(prefs));
    localStorage.setItem('bigfish.position.v1', JSON.stringify({right:32, bottom:26}));
  }, prefs);
  const created = Date.now();
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.locator('canvas').waitFor();
  return {context, page, created};
}
try {
  const {context: ctx, page, created} = await context({width:560, height:560});
  await page.getByRole('button', {name:'展开大肥鱼', exact:true}).click();
  // Frame only the actual floating widget. No chat, navigation, or demo controls in recordings.
  await page.addStyleTag({content:'.bf-demo-nav,.bf-demo-main{display:none!important}.bf-demo{padding:0!important;background:#f6f8fc!important}body[data-ds-dark-theme] .bf-demo{background:#151517!important}'});
  await page.waitForTimeout(500);
  const start = (Date.now() - created) / 1000;
  const widget = page.getByTestId('bigfish-widget');
  async function segment(name, state, seconds, shot, extra) {
    if (extra) await extra();
    await page.locator('#demo-state').selectOption(state, {force:true});
    chapters.push({name, seconds:Math.round(((Date.now()-created)/1000-start)*10)/10});
    await page.waitForTimeout(Math.min(1400, seconds*500));
    if (shot) {
      const box=await widget.boundingBox();
      const width=Math.min(345,box.width);
      await page.screenshot({path:resolve(output,shot),clip:{x:box.x+box.width-width,y:box.y,width,height:box.height}});
    }
    await page.waitForTimeout(seconds*1000-Math.min(1400, seconds*500));
  }
  await segment('举牌等你', 'idle', 3, 'waiting.png');
  await segment('开始工作', 'generating', 6, null);
  await segment('速度变化与空挥联动', 'generating', 5, null, async()=>{
    await patch(page, {whipEnabled:true});
    await page.locator('#demo-ratio').evaluate(e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'1.5');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
  });
  await segment('调用工具', 'tool-running', 5, 'tools.png');
  await segment('等你确认', 'waiting-user', 4, 'confirmation.png');
  await segment('任务完成', 'completed', 4, 'completed.png');
  await patch(page, {whipEnabled:false});
  await segment('关闭鞭策，继续工作', 'generating', 4, 'working.png');
  await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
  await segment('深色模式', 'generating', 4, 'dark.png');
  const duration = (Date.now()-created)/1000-start;
  const video = page.video();
  await ctx.close();
  const raw = await video.path();
  encode(['-ss',String(start),'-i',raw,'-t',String(duration),'-an','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',resolve(output,'bigfish-demo.mp4')]);
  // A short highlights loop; the MP4 retains the complete chronological recording.
  const cuts = [[0,3],[chapters[6].seconds+0.8,3],[chapters[2].seconds+1,3],[chapters[3].seconds+1,3],[chapters[5].seconds+0.6,2.5]];
  const trims = cuts.map(([at,len],i)=>`[0:v]trim=start=${at}:duration=${len},setpts=PTS-STARTPTS[v${i}]`).join(';');
  const filter = trims+';'+cuts.map((_,i)=>`[v${i}]`).join('')+'concat=n=5:v=1:a=0,fps=10,scale=400:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3';
  encode(['-i',resolve(output,'bigfish-demo.mp4'),'-filter_complex',filter,'-loop','0',resolve(output,'bigfish-demo.gif')]);

  // Audition existing daily motions. Same Canvas and frame data as the installed pet.
  const daily = await context({width:400,height:360});
  await patch(daily.page, {whipEnabled:false});
  await daily.page.addStyleTag({content:'.bf-demo-nav,.bf-demo-intro,.bf-demo-readout,.bf-demo-footer,.bf-demo-controls,.bf-demo-bubble{display:none!important}.bf-demo{padding:0!important;background:#f6f8fc!important}.bf-demo-main{display:block!important;margin:0!important}.bf-demo-stage{position:fixed!important;inset:0!important;margin:0!important;border:0!important;border-radius:0!important;background:#f6f8fc!important;min-height:0!important;overflow:hidden}.bf-demo-stage:before{display:none}.bf-demo-stage .bf-stage{position:absolute!important;left:-100px!important;top:0!important;width:490px!important;max-width:none!important}'});
  await daily.page.locator('#demo-state').selectOption('idle', {force:true});
  const dailyStart=(Date.now()-daily.created)/1000;
  for (const motion of ['tea','wipe','stretch']) {
    await daily.page.locator('#demo-motion').selectOption(motion, {force:true});
    await daily.page.waitForTimeout(1200);
    await daily.page.screenshot({path:resolve(output,`${motion}.png`)});
    await daily.page.waitForTimeout(2800);
  }
  const dailyVideo=daily.page.video();await daily.context.close();
  encode(['-ss',String(dailyStart),'-i',await dailyVideo.path(),'-t','12','-filter_complex','fps=12,scale=400:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0',resolve(output,'daily-motions.gif')]);
  if(errors.length) throw new Error(errors.join('\n'));
  await writeFile(resolve(output,'capture.json'),JSON.stringify({version:'0.5.0',source:'Built-in offline preview; actual Widget/FishCanvas rendering, simulated task states, real wall-clock recording; random selection fixed to the first eligible existing action for reproducibility.',recordedAt:new Date().toISOString(),durationSeconds:duration,chapters,viewport:{width:560,height:560},audio:false,paidModelCalls:false,privateChatIncluded:false,errors},null,2)+'\n');
  console.log(JSON.stringify({ok:true,durationSeconds:duration,chapters,output}));
} finally {
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
