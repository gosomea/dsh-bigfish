import {hostAddress,exchangeHost} from './host-connection.mjs';
import {WanderDirector} from './renderer/movement.mjs';
import {activityAreaDefaults,invalidActivityArea,decodeActivityArea,activityHomeTarget,activityPointSafe,activityPositionStatus,activityReturnRoute,activityCandidates} from './renderer/activity-area.mjs';
import {validateSharedPreferenceOps} from './renderer/shared-preferences.mjs';
import {hostJson,hostResponse,nativeRpc,readPreferences,petQuery} from './host-api.mjs';
import {appearanceBounds,recallBounds,placeWindowBounds,CrossScreenTravel,nearWindowEdge,motionChanged} from './geometry.mjs';
import {readWindowGeometry} from './native-geometry.mjs';
import {voiceEndpoint,transcribeAudio} from './voice-protocol.mjs';
import {app,BrowserWindow,Menu,Tray,ipcMain,screen,nativeImage,safeStorage,powerMonitor,shell,systemPreferences} from 'electron';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
let walkBlocked=false,walker=null,motion='rest',lastMotionFrame=null,walkPolicy={mode:'horizontal',enabled:false,capable:false,radius:120,speed:35,restMin:20,restMax:45,readySerial:'',failedSerial:'',ready:false};
let dragActive=false,dragSeen=0,presentationEnabled=true;
let placement=null,resizeOrigin=null;
let activityAreas={revision:0,displays:{}},activityWrite=Promise.resolve(),pendingReturn=false,activityReadError=false;
let pet,settings,tray,regions=[],connection={url:'',cookie:''},anchor=null,quitting=false;
const client=`desktop-${randomUUID()}`;
let desktop={revision:0,settings:{crossScreen:false,windowGeometry:false,alwaysOnTop:true,launchAtLogin:false}},geometry={state:'off',windows:0,message:''},windowBounds=[],geometryBusy=false,lastPeek=0,lastTravel=Date.now(),travel=new CrossScreenTravel();
let voice={endpoint:'',model:'whisper-1',key:''},voiceCaptureUntil=0,voiceCall=null;
let geometryHosts=[];
const geometryAllowed=()=>desktop.settings.windowGeometry&&geometryHosts.includes(connection.url);
function resetVoice(){voiceCaptureUntil=0;voiceCall?.abort();if(settings&&!settings.isDestroyed())settings.webContents.send('bigfish:voice-reset');if(pet&&!pet.isDestroyed())pet.webContents.send('bigfish:voice-display','idle');}
function sender(event){return [pet?.webContents,settings?.webContents].includes(event.sender)&&event.senderFrame===event.sender.mainFrame;}
async function request(op,body={},scope=connection){
 return hostJson(scope,op==='screenshot'?'/api/bigfish-companion-screenshot':'/api/bigfish-companion',op?{op,...body}:undefined);
}
function publishMotion(frame){if(motion!==frame.phase){motion=frame.phase;pet.webContents.send('bigfish:motion',motion);}if(motionChanged(lastMotionFrame,frame)||lastMotionFrame?.areaStatus!==frame.areaStatus){lastMotionFrame=frame;pet.webContents.send('bigfish:motion-state',frame);}}
function resetMotion(bounds=placement??pet?.getBounds()){travel.cancel();if(!pet||!bounds)return;walker?.place({x:bounds.x,y:bounds.y},screen.getDisplayMatching(bounds).workArea,bounds,Date.now());if(walker)publishMotion(walker.snapshot());lastTravel=Date.now();}
function place(requested){if(!pet||pet.isDestroyed())return;travel.cancel();placement=placeWindowBounds(pet,walker,requested,screen.getAllDisplays(),Date.now());if(walker)publishMotion(walker.snapshot());lastTravel=Date.now();windowBounds=[];}
function clamp(){if(!pet||pet.isDestroyed())return;place(pet.getBounds());}
function currentActivity(){const b=placement??pet.getBounds(),display=screen.getDisplayMatching(b);return {revision:activityAreas.revision,config:activityAreas.displays[String(display.id)]??(activityReadError?invalidActivityArea():activityAreaDefaults()),invalid:activityReadError&&!Object.hasOwn(activityAreas.displays,String(display.id)),area:display.workArea,size:{width:b.width,height:b.height},position:{x:b.x,y:b.y},measured:true,displayId:String(display.id)};}
function notifyActivity(){for(const win of [pet,settings])if(win&&!win.isDestroyed())win.webContents.send('bigfish:activity-area-changed');}
function recover(){if(!pet)return;pendingReturn=false;const b=placement??pet.getBounds(),primary=screen.getPrimaryDisplay(),displays=[primary,...screen.getAllDisplays().filter(d=>d.id!==primary.id)];let safe=null;
 for(const display of displays){const a=display.workArea,config=activityAreas.displays[String(display.id)]??(activityReadError?invalidActivityArea():activityAreaDefaults()),target=recallBounds(b,a),size={width:target.width,height:target.height};const p=activityPointSafe(target,a,size,config)?target:activityCandidates(a,size,config).sort((p,q)=>Math.hypot(p.x-target.x,p.y-target.y)-Math.hypot(q.x-target.x,q.y-target.y))[0];if(p){safe={...target,x:p.x,y:p.y};break;}}
 if(safe){walker??=new WanderDirector({x:safe.x,y:safe.y});place(safe);anchor=[safe.x,safe.y];walker.areaStatus='recovered';publishMotion(walker.snapshot());}else{clamp();const b=placement??pet.getBounds();walker??=new WanderDirector({x:b.x,y:b.y});walker.areaStatus='no-space';publishMotion(walker.snapshot());}
 pet.showInactive();pet.webContents.send('bigfish:recalled');notifyActivity();}
function recall(){if(!pet)return;const state=currentActivity();pet.showInactive();pet.webContents.send('bigfish:recalled');if(!state.config.home){recover();return;}walker??=new WanderDirector(state.position);
 if(walkPolicy.recallBlocked||!walkPolicy.capable){walker.areaStatus='unavailable';publishMotion(walker.snapshot());return;}
 const target=activityHomeTarget(state.config,state.area,state.size);if(!target||!activityReturnRoute(state.position,target,state.area,state.size,state.config)){walker.areaStatus='home-blocked';publishMotion(walker.snapshot());return;}
 pendingReturn=true;travel.cancel();walker.areaStatus='queued';publishMotion(walker.snapshot());}

function secure(win){win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===settings?.webContents&&permission==='media'&&voiceCaptureUntil>Date.now()&&details.mediaTypes?.length>0&&details.mediaTypes.every(v=>v==='audio')));win.webContents.session.setPermissionCheckHandler((contents,permission)=>contents===settings?.webContents&&permission==='media'&&voiceCaptureUntil>Date.now());}
async function syncDesktop(){if(!connection.url)return;const source=connection;try{const state=await hostJson(source,'/api/bigfish-desktop');if(source!==connection)return;desktop=state;pet?.setAlwaysOnTop(state.settings.alwaysOnTop);if(!geometryAllowed()){windowBounds=[];geometry={state:'off',windows:0,message:'本设备未授权时不读取窗口几何。'};}if(!state.settings.crossScreen&&travel.active){travel.cancel();clamp();}}catch{/* Host disconnect leaves local companionship and the last explicit grants intact. */}}
function openSettings(page){if(settings&&!settings.isDestroyed()){settings.show();settings.focus();if(page==='activity-area')settings.webContents.send('bigfish:settings-navigate','activity-area');return;}settings=new BrowserWindow({width:640,height:780,title:'大肥鱼设置',webPreferences:{preload:join(root,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});secure(settings);void settings.loadFile(join(root,'renderer/index.html'),{query:{settings:'1',...(page==='activity-area'?{page:'activity-area'}:{})}});settings.on('blur',resetVoice);settings.on('closed',()=>{resetVoice();settings=null;});}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{recall();});
 void app.whenReady().then(async()=>{
 try{const v=JSON.parse(await readFile(join(app.getPath('userData'),'host.json'),'utf8'));connection.url=hostAddress(v.url).url;if(v.cookie&&safeStorage.isEncryptionAvailable())connection.cookie=safeStorage.decryptString(Buffer.from(v.cookie,'base64'));}catch{/* First launch or locked system keychain: remain offline. */}
 try{const v=JSON.parse(await readFile(join(app.getPath('userData'),'voice.json'),'utf8'));voice.endpoint=v.endpoint?voiceEndpoint(v.endpoint):'';voice.model=typeof v.model==='string'?v.model:'whisper-1';if(v.key&&safeStorage.isEncryptionAvailable())voice.key=safeStorage.decryptString(Buffer.from(v.key,'base64'));}catch{/* Voice remains unconfigured until the user chooses a service. */}
 try{const v=JSON.parse(await readFile(join(app.getPath('userData'),'desktop-grants.json'),'utf8'));geometryHosts=Array.isArray(v.geometryHosts)?v.geometryHosts.filter(u=>typeof u==='string'&&hostAddress(u).url===u):[];}catch{/* A new device never inherits another device's geometry authorization. */}
 try{const stored=JSON.parse(await readFile(join(app.getPath('userData'),'activity-areas.json'),'utf8'));if(Object.keys(stored).some(k=>!['revision','displays','blockedFallback'].includes(k))||stored.blockedFallback!==undefined&&typeof stored.blockedFallback!=='boolean'||!Number.isSafeInteger(stored.revision)||stored.revision<0||!stored.displays||typeof stored.displays!=='object'||Array.isArray(stored.displays)||Object.keys(stored.displays).length>50)throw Error('Invalid activity areas');const displays={};for(const [id,value] of Object.entries(stored.displays)){if(!/^-?\d{1,20}$/.test(id))throw Error('Invalid display');displays[id]=decodeActivityArea(value);}activityAreas={revision:stored.revision,displays};activityReadError=stored.blockedFallback===true;}catch(error){activityReadError=error?.code!=='ENOENT';/* Present but invalid geometry fails closed until explicitly saved on this display. */}
 pet=new BrowserWindow({width:420,height:540,transparent:true,frame:false,resizable:false,hasShadow:false,show:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,webPreferences:{preload:join(root,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:true}});secure(pet);

 pet.on('close',event=>{if(!quitting){event.preventDefault();pet.hide();}});
 // A small local icon; no remote resources are loaded by the renderer.
 const icon=nativeImage.createFromPath(join(root,'renderer/icon.png')).resize({width:22,height:22});
 tray=new Tray(icon);tray.setToolTip('大肥鱼');tray.setContextMenu(Menu.buildFromTemplate([{label:'叫回来',click:recall},{label:'完整设置',click:openSettings},{label:'暂时隐藏',click:()=>pet.hide()},{type:'separator'},{label:'退出大肥鱼',click:()=>{quitting=true;app.quit();}}]));tray.on('click',recall);
 ipcMain.handle('bigfish:state',async e=>{if(!sender(e))throw Error('来源无效');const source=connection;let host=null;try{host=await request(undefined,{},source);if(source!==connection)host=null;}catch{}return {url:connection.url,connected:!!host,host,platform:process.platform,clientId:client};});
 ipcMain.handle('bigfish:connect',async(e,data)=>{
  if(!sender(e)||e.sender!==settings?.webContents)throw Error('请在设置窗口连接');
  const candidate=await exchangeHost(data.url,data.token);await request(undefined,{},candidate);
  const previous=connection;resetVoice();
  // Cancellation is addressed to the old Host while its cookie is still owned here.
  if(previous.url)await hostResponse(previous,'/api/bigfish-companion',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'cancel-screenshot'}),signal:AbortSignal.timeout(2000)}).catch(()=>{});
  await mkdir(app.getPath('userData'),{recursive:true});
  if(candidate.cookie&&!safeStorage.isEncryptionAvailable())throw Error('系统凭据存储不可用，未保存新连接');
  await writeFile(join(app.getPath('userData'),'host.json'),JSON.stringify({url:candidate.url,cookie:candidate.cookie?safeStorage.encryptString(candidate.cookie).toString('base64'):''}),{mode:0o600});
  connection=candidate;desktop={revision:0,settings:{crossScreen:false,windowGeometry:false,alwaysOnTop:true,launchAtLogin:false}};geometry={state:'off',windows:0,message:''};windowBounds=[];resetMotion();
  for(const win of [pet,settings])if(win&&!win.isDestroyed())win.webContents.send('bigfish:host-changed');
  void syncDesktop();return true;
 });
 const allowed=new Set(['announce','introduce','configuration-options','configure','forget','preference','understand','collect','remove-collection','interaction','clear-diary','screenshot','cancel-screenshot']);
 ipcMain.handle('bigfish:request',(e,{op,body})=>{if(!sender(e)||!allowed.has(op))throw Error('操作无效');if(op==='screenshot'&&Buffer.byteLength(JSON.stringify(body))>Math.ceil(1048576/3)*4+32768)throw Error('截图请求超过限制');return request(op,body);});
 ipcMain.handle('bigfish:preferences',async e=>{if(!sender(e))throw Error('来源无效');const source=connection,state=await readPreferences(source);if(source!==connection)throw Error('Host 已切换，请重试');return state;});
 ipcMain.handle('bigfish:preferences-mutate',async(e,{ops,revision})=>{if(!sender(e))throw Error('来源无效');const source=connection,current=await readPreferences(source);if(source!==connection)throw Error('Host 已切换，请重试');if(current.revision!==revision)throw Error('设置已在另一窗口更新，请刷新后重试');const safe=validateSharedPreferenceOps(current.value,ops);await nativeRpc(source,'settings/mutate',{ns:'bigfish',ops:safe,expectedRevision:revision});const state=await readPreferences(source);if(source!==connection)throw Error('Host 已切换，请重试');return state;});
 ipcMain.handle('bigfish:pets',async(e,{query,bytes})=>{if(!sender(e))throw Error('来源无效');const path=petQuery(query,bytes);if((bytes||query.includes('op='))&&e.sender!==settings?.webContents)throw Error('请在设置窗口修改角色库');const r=await hostResponse(connection,path,{method:bytes||query.startsWith('?op=')?'POST':'GET',...(bytes?{body:bytes}:{})});if(Number(r.headers.get('content-length'))>128*1024*1024)throw Error('角色回复过大');const body=new Uint8Array(await r.arrayBuffer());if(body.length>128*1024*1024)throw Error('角色回复过大');return {status:r.status,bytes:body,contentType:r.headers.get('content-type')??'application/octet-stream'};});
 ipcMain.handle('bigfish:open-session',async(e,session)=>{if(!sender(e))throw Error('来源无效');const source=connection;await hostJson(source,'/api/bigfish-desktop',{op:'navigate',session});if(source!==connection)throw Error('Host 已切换，请重试');await shell.openExternal(source.url+'/');return true;});
 ipcMain.handle('bigfish:activity-area',e=>{if(!sender(e))throw Error('来源无效');return currentActivity();});
 ipcMain.handle('bigfish:activity-area-configure',(e,{value,revision,displayId})=>{if(!sender(e)||e.sender!==settings?.webContents)throw Error('请在设置窗口修改本设备区域');const config=decodeActivityArea(value);const write=async()=>{if(revision!==activityAreas.revision)throw Error('活动区域已在另一窗口更新，请重新读取后保存');const id=currentActivity().displayId;if(displayId!==undefined&&displayId!==id)throw Error('大肥鱼已移动到其他显示器，请重新读取区域后保存');const next={revision:revision+1,blockedFallback:activityReadError,displays:{...activityAreas.displays,[id]:config}};await mkdir(app.getPath('userData'),{recursive:true});await writeFile(join(app.getPath('userData'),'activity-areas.json'),JSON.stringify(next),{mode:0o600});activityAreas=next;pendingReturn=false;resetMotion();const state=currentActivity();walker??=new WanderDirector(state.position);walker.areaStatus=activityPositionStatus(state.position,state.area,state.size,state.config);publishMotion(walker.snapshot());notifyActivity();return state;};const pending=activityWrite.catch(()=>{}).then(write);activityWrite=pending;return pending;});
 ipcMain.handle('bigfish:environment',async e=>{if(!sender(e))throw Error('来源无效');await syncDesktop();return {...desktop,packaged:app.isPackaged,displays:screen.getAllDisplays().map(d=>({id:d.id,label:d.label,scaleFactor:d.scaleFactor,workArea:d.workArea})),geometry:{...geometry,localGranted:geometryHosts.includes(connection.url)},voice:{configured:!!voice.endpoint,endpoint:voice.endpoint,model:voice.model}};});
 ipcMain.handle('bigfish:desktop-configure',async(e,{value,revision,authorizeGeometry,launchAtLogin})=>{if(!sender(e)||e.sender!==settings?.webContents||authorizeGeometry!==undefined&&typeof authorizeGeometry!=='boolean')throw Error('请在设置窗口授权');if(launchAtLogin!==undefined&&(typeof launchAtLogin!=='boolean'||!app.isPackaged))throw Error('登录启动请在安装版中明确设置');const source=connection;await hostJson(source,'/api/bigfish-desktop',{op:'configure',settings:value,revision});if(source!==connection)throw Error('Host 已切换，请重试');if(authorizeGeometry!==undefined){geometryHosts=geometryHosts.filter(u=>u!==connection.url);if(authorizeGeometry)geometryHosts.push(connection.url);}await mkdir(app.getPath('userData'),{recursive:true});await writeFile(join(app.getPath('userData'),'desktop-grants.json'),JSON.stringify({geometryHosts}),{mode:0o600});if(launchAtLogin!==undefined)app.setLoginItemSettings({openAtLogin:launchAtLogin});await syncDesktop();return true;});
 ipcMain.handle('bigfish:voice-configure',async(e,data)=>{if(!sender(e)||e.sender!==settings?.webContents||typeof data.endpoint!=='string'||typeof data.key!=='string'||data.key.length>8192||/[\r\n]/.test(data.key)||typeof data.model!=='string'||data.model.length>200)throw Error('语音设置无效');const endpoint=data.endpoint?voiceEndpoint(data.endpoint):'',next={endpoint,model:data.model||'whisper-1',key:data.key||(endpoint&&endpoint===voice.endpoint?voice.key:'')};if(next.key&&!safeStorage.isEncryptionAvailable())throw Error('系统安全凭据存储不可用，未保存语音密钥');resetVoice();await mkdir(app.getPath('userData'),{recursive:true});await writeFile(join(app.getPath('userData'),'voice.json'),JSON.stringify({...next,key:next.key?safeStorage.encryptString(next.key).toString('base64'):''}),{mode:0o600});voice=next;return true;});
 ipcMain.handle('bigfish:microphone',async e=>{if(!sender(e)||e.sender!==settings?.webContents||!voice.endpoint)throw Error('请先配置语音服务并在设置窗口按住说话');if(process.platform==='darwin'&&!await systemPreferences.askForMediaAccess('microphone'))throw Error('系统没有允许麦克风');voiceCaptureUntil=Date.now()+30000;return true;});
 ipcMain.handle('bigfish:transcribe',async(e,{audio,mediaType})=>{if(!sender(e)||e.sender!==settings?.webContents||voiceCaptureUntil<Date.now())throw Error('录音授权已结束，请重新按住说话');voiceCaptureUntil=0;voiceCall?.abort();const call=new AbortController();voiceCall=call;const timeout=setTimeout(()=>call.abort(),30000);try{return await transcribeAudio(voice,audio,mediaType,call.signal);}finally{clearTimeout(timeout);if(voiceCall===call)voiceCall=null;}});
 ipcMain.handle('bigfish:voice-cancel',e=>{if(!sender(e))throw Error('来源无效');voiceCaptureUntil=0;voiceCall?.abort();});
 ipcMain.on('bigfish:voice-display',(e,state)=>{if(sender(e)&&e.sender===settings?.webContents&&['listen','speak','idle'].includes(state))pet?.webContents.send('bigfish:voice-display',state);});
 ipcMain.on('bigfish:settings',(e,page)=>{if(sender(e)&&(page===undefined||page==='activity-area'))openSettings(page);});ipcMain.on('bigfish:recall',e=>{if(sender(e))recall();});
 ipcMain.on('bigfish:cancel-recall',e=>{
  if(e.sender!==pet.webContents||!sender(e)||!walker)return;
  if(!pendingReturn&&walker.areaStatus!=='returning')return;
  pendingReturn=false;lastTravel=Date.now();walker.cancelRecall(lastTravel);walker.areaStatus='';publishMotion(walker.snapshot());
 });
 ipcMain.on('bigfish:drag-state',(e,active)=>{if(e.sender!==pet.webContents||!sender(e)||typeof active!=='boolean')return;dragActive=active;dragSeen=Date.now();if(active)pendingReturn=false;if(active){travel.cancel();pet.setIgnoreMouseEvents(false);}else{resetMotion();notifyActivity();}});
 ipcMain.on('bigfish:drag',(e,{dx,dy})=>{if(e.sender!==pet.webContents||!sender(e)||!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>1000||Math.abs(dy)>1000)return;dragSeen=Date.now();resizeOrigin=null;const b=placement??pet.getBounds();place({...b,x:Math.round(b.x+dx),y:Math.round(b.y+dy)});anchor=[placement.x,placement.y];});
 ipcMain.on('bigfish:regions',(e,value)=>{if(e.sender!==pet.webContents||!sender(e)||!Array.isArray(value)||value.length>100)return;regions=value.filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>=0&&r.height>=0);});
 ipcMain.on('bigfish:appearance',(e,{size,enabled,preview=false})=>{
  if(e.sender!==pet.webContents||!sender(e)||!Number.isFinite(size)||size<120||size>300||typeof enabled!=='boolean'||typeof preview!=='boolean')return;
  presentationEnabled=enabled;if(!enabled)void request('release',{client}).catch(()=>{});
  const current=placement??pet.getBounds(),origin=resizeOrigin??current;
  resizeOrigin=preview?origin:null;
  const area=screen.getDisplayMatching(origin).workArea,next=appearanceBounds(origin,area,size);
  if(next.width===current.width&&next.height===current.height&&next.x===current.x&&next.y===current.y)return;
  place(next);
 });
 ipcMain.on('bigfish:walk-policy',(e,p)=>{
  if(e.sender!==pet.webContents||!sender(e)||!p||typeof p.enabled!=='boolean'||typeof p.capable!=='boolean')return;
  for(const [k,min,max] of [['radius',20,600],['speed',10,120],['restMin',5,600],['restMax',5,1200]])if(!Number.isFinite(p[k])||p[k]<min||p[k]>max)return;
  if(p.mode!==undefined&&!['horizontal','screen'].includes(p.mode)||p.recallBlocked!==undefined&&typeof p.recallBlocked!=='boolean')return;
  if(p.availableClips!==undefined&&(!Array.isArray(p.availableClips)||p.availableClips.length>32||p.availableClips.some(v=>typeof v!=='string')))return;
  if([p.readySerial,p.failedSerial].some(serial=>serial!==undefined&&(typeof serial!=='string'||serial.length>100)))return;
  if(p.restMin>p.restMax||typeof p.blockStart!=='boolean'||p.ready!==undefined&&typeof p.ready!=='boolean')return;
  walkBlocked=p.blockStart;
  walkPolicy={mode:p.mode??'horizontal',recallBlocked:p.recallBlocked===true,enabled:p.enabled,capable:p.capable,radius:p.radius,speed:p.speed,restMin:p.restMin,restMax:p.restMax,readySerial:p.readySerial??'',failedSerial:p.failedSerial??'',ready:p.ready===true,...(p.availableClips===undefined?{}:{availableClips:p.availableClips.filter(v=>['walk','turn','start-step','stop','tail-avoid','edge-peek','sit-down','wake-up','tiptoe'].includes(v))})};
 });
 await pet.loadFile(join(root,'renderer/index.html'));recover();
 const walkTimer=setInterval(()=>{
  if(!pet||pet.isDestroyed()||!walker)return;
  const bounds=placement??pet.getBounds(),area=screen.getDisplayMatching(bounds).workArea,areaConfig=currentActivity().config;
  if(pendingReturn&&walkPolicy.recallBlocked){pendingReturn=false;walker.areaStatus='unavailable';}
  if(pendingReturn&&walker.areaStatus!=='returning'&&walkPolicy.enabled&&walkPolicy.capable&&!dragActive&&!settings?.isVisible()){const target=activityHomeTarget(areaConfig,area,bounds);if(!target||!activityReturnRoute(walker.position,target,area,bounds,areaConfig)){pendingReturn=false;walker.areaStatus='home-blocked';}else if(Math.hypot(walker.position.x-target.x,walker.position.y-target.y)<1){pendingReturn=false;walker.areaStatus='';}else walker.requestRecall(target,Date.now());}
  const canMove=(!walkPolicy.availableClips||walkPolicy.availableClips.includes('walk'))&&walkPolicy.enabled&&walkPolicy.capable&&!walkBlocked&&!dragActive&&pet.isVisible()&&!settings?.isVisible();
  if(!canMove&&travel.active){travel.cancel();clamp();}
  if(canMove&&!screen.getAllDisplays().some(display=>activityAreas.displays[String(display.id)]?.enabled||activityReadError&&!Object.hasOwn(activityAreas.displays,String(display.id)))&&desktop.settings.crossScreen&&screen.getAllDisplays().length>1&&Date.now()-lastTravel>300000&&!travel.active&&walker.snapshot().phase==='rest'){const current=screen.getDisplayMatching(bounds),others=screen.getAllDisplays().filter(d=>d.id!==current.id);travel.start(bounds,others[Math.floor(Math.random()*others.length)],Date.now(),walkPolicy.availableClips);lastTravel=Date.now();}
  if(travel.active&&travel.snapshot().serial===walkPolicy.failedSerial){
   travel.cancel();clamp();
   walker.areaStatus='playback-failed';publishMotion(walker.snapshot());
   return;
  }
  if(travel.active){const frame=travel.snapshot(),next=travel.tick(Date.now(),walkPolicy.speed,walkPolicy.ready||frame.serial===walkPolicy.readySerial);placement={...bounds,x:Math.round(next.x),y:Math.round(next.y)};if(frame.moving)pet.setPosition(placement.x,placement.y,false);publishMotion(travel.snapshot());if(!travel.active){clamp();notifyActivity();lastTravel=Date.now();}return;}
  const wasMoving=walker.snapshot().moving,frame=walker.tick(Date.now(),area,bounds,{...walkPolicy,activityArea:areaConfig,quickRecall:true,blockStart:walkBlocked&&!pendingReturn,ready:walkPolicy.ready||walker.snapshot().serial===walkPolicy.readySerial,enabled:walkPolicy.enabled&&!dragActive&&pet.isVisible()&&!settings?.isVisible()});
  if(frame.areaStatus==='playback-failed'||frame.arrivedHome)pendingReturn=false;
  if((frame.moving||wasMoving&&frame.clip==='stop'||frame.arrivedHome)&&walkPolicy.enabled&&walkPolicy.capable&&!dragActive&&pet.isVisible()&&!settings?.isVisible()){placement={...bounds,x:Math.round(walker.position.x),y:Math.round(walker.position.y)};pet.setPosition(placement.x,placement.y,false);}
  if(pendingReturn&&!walkPolicy.enabled){walker.areaStatus='queued';frame.areaStatus='queued';}publishMotion(frame);
 },32);
 const hitTimer=setInterval(()=>{if(!pet||pet.isDestroyed()||!pet.isVisible())return;const p=screen.getCursorScreenPoint(),b=pet.getBounds(),x=p.x-b.x,y=p.y-b.y;if(dragActive&&Date.now()-dragSeen>10000)dragActive=false;const hit=dragActive||regions.some(r=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height);pet.setIgnoreMouseEvents(!hit,{forward:true});},50);
 const leaseTimer=setInterval(()=>{if(presentationEnabled&&pet?.isVisible())void request('lease',{client,kind:'desktop'}).catch(()=>{});},5000);
 const geometryTimer=setInterval(async()=>{if(!geometryAllowed()||geometryBusy||!pet?.isVisible())return;geometryBusy=true;const source=connection.url;try{const windows=await readWindowGeometry(process.platform);if(!geometryAllowed()||source!==connection.url)return;windowBounds=process.platform==='win32'?windows.map(w=>screen.screenToDipRect(null,w)):windows;geometry={state:'ready',windows:windowBounds.length,message:'仅窗口位置和大小；未读取标题、图像或内容。'};if(!walkBlocked&&!dragActive&&!settings?.isVisible()&&Date.now()-lastPeek>120000&&nearWindowEdge(pet.getBounds(),windowBounds)){lastPeek=Date.now();pet.webContents.send('bigfish:geometry-gesture','edge-peek');}}catch(e){windowBounds=[];geometry={state:process.platform==='darwin'?'permission':'unavailable',windows:0,message:e.message};}finally{geometryBusy=false;}},5000);
 const desktopTimer=setInterval(()=>void syncDesktop(),10000);await syncDesktop();
 for(const ev of ['display-added','display-removed','display-metrics-changed'])screen.on(ev,()=>{pendingReturn=false;clamp();notifyActivity();});
 powerMonitor.on('suspend',()=>{resetVoice();resetMotion();});powerMonitor.on('resume',clamp);
 app.on('before-quit',()=>{quitting=true;voiceCall?.abort();clearInterval(geometryTimer);clearInterval(desktopTimer);clearInterval(hitTimer);clearInterval(leaseTimer);clearInterval(walkTimer);void request('release',{client}).catch(()=>{});});
 app.on('window-all-closed',()=>{});
 }).catch(error=>{console.error('Bigfish desktop startup failed:',error);app.exit(1);});
}
