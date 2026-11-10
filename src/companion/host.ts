import {ScreenshotService,readCompanionBody,CompanionBodyLimitError,type ScreenshotAttachments} from './screenshot.js';
import {modelLimitKind} from './model-errors.js';
import {presetConfig,type Lifestyle} from './config.js';
import {CompanionHostStore} from './host-store.js';
import {IntelligenceService,projectTask,restoreLiveTask,runtimeSampleWindow,type HostAgent,type HostEvent,type HostSession,type ModelService,type TaskProjection} from './intelligence.js';
import {taskStatusKey} from './state.js';
import {readConfigurationOptions} from './configuration-options.js';
interface HostContext {inject(keys:string[],callback:(ctx:any)=>void):unknown}
/** DSH's HTTP carrier uses dsh.internal as Request.url; the admitted Host header keeps the public authority. */
function sameOrigin(request:Request):boolean {
  if(request.headers.get('sec-fetch-site')==='cross-site')return false;
  const origin=request.headers.get('origin');if(!origin)return true;
  try{
    const parsed=new URL(origin);
    if(!['http:','https:'].includes(parsed.protocol)||parsed.origin!==origin)return false;
    const authority=request.headers.get('host')??new URL(request.url).host;
    return new URL(`${parsed.protocol}//${authority}`).origin===parsed.origin;
  }catch{return false;}
}
export function installCompanion(ctx:HostContext,store=new CompanionHostStore(),lifestyle:()=>Lifestyle=()=>presetConfig('balanced')){
  // A malformed external config must fail closed rather than escape a timer.
  const enabled=(group:keyof Lifestyle['groups'])=>{try{return lifestyle().groups[group]===true;}catch{return false;}};
  let model:ModelService|undefined,attachments:ScreenshotAttachments|undefined;
  let modelCatalog:{modelCatalog():Promise<unknown>}|undefined,modelRegistry:{listProviders():unknown;listModels(provider:string):Promise<unknown>}|undefined;
  let defaultModel:{currentSelection():unknown}|undefined,workspaceRegistry:{list():unknown}|undefined;
  const screenshot=new ScreenshotService(store,()=>model,()=>attachments);
  const intelligence=new IntelligenceService(store,()=>model,()=>enabled('memory'));
  const dirty=new Set<string>();let queue:Promise<unknown>=Promise.resolve();
  ctx.inject(['llm'],c=>{const service=c.llm;if(typeof service?.prepareCall==='function')model=service;if(typeof service?.listProviders==='function'&&typeof service?.listModels==='function')modelRegistry=service;c.effect(()=>()=>{model=undefined;if(modelRegistry===service)modelRegistry=undefined;intelligence.cancel();screenshot.cancel();},'bigfish model adapter');});
  ctx.inject(['sessionController'],c=>{const service=c.sessionController;if(typeof service?.modelCatalog==='function')modelCatalog=service;c.effect(()=>()=>{if(modelCatalog===service)modelCatalog=undefined;},'bigfish model directory');});
  ctx.inject(['agentDefaultModel'],c=>{const service=c.agentDefaultModel;if(typeof service?.currentSelection==='function')defaultModel=service;c.effect(()=>()=>{if(defaultModel===service)defaultModel=undefined;},'bigfish default model reader');});
  ctx.inject(['workspaceRegistry'],c=>{const service=c.workspaceRegistry;if(typeof service?.list==='function')workspaceRegistry=service;c.effect(()=>()=>{if(workspaceRegistry===service)workspaceRegistry=undefined;},'bigfish workspace directory');});
  ctx.inject(['attachments'],c=>{if(typeof c.attachments?.validateImage==='function'&&typeof c.attachments?.admitPromptContent==='function')attachments=c.attachments;c.effect(()=>()=>{attachments=undefined;screenshot.cancel();},'bigfish screenshot attachments');});
  ctx.inject(['connection'],c=>{
    const fetch=async(request:Request,screenshotUpload=false)=>{
      try{
        if(request.method==='GET')return Response.json({...await store.snapshot(),modelAvailable:intelligence.available(),screenshotAvailable:screenshot.available()},{headers:{'cache-control':'no-store'}});
        if(request.method!=='POST')return new Response(null,{status:405});
        if(!sameOrigin(request))return new Response(null,{status:403});
        if(!request.headers.get('content-type')?.startsWith('application/json'))return new Response(null,{status:415});
        const body=await readCompanionBody(request,screenshotUpload?undefined:32768);if(screenshotUpload&&body.op!=='screenshot')throw Error('此端点只接受截图分享');let result:unknown;
        switch(body.op){
          case 'configuration-options':{
            const state=await store.snapshot(),catalog=modelCatalog,registry=modelRegistry,defaults=defaultModel,workspaces=workspaceRegistry;
            result=await readConfigurationOptions({knownWorkspaces:[...state.tasks.map(task=>task.workspace),...state.policy.workspaces],
              ...(catalog?{catalog:()=>catalog.modelCatalog()}:{}),...(registry?{providers:()=>registry.listProviders(),models:(provider:string)=>registry.listModels(provider)}:{}),
              ...(defaults?{defaultSelection:()=>defaults.currentSelection()}:{}),...(workspaces?{workspaces:()=>workspaces.list()}:{}),
            });break;
          }
          case 'interaction':if(!enabled('growth'))throw Error('成长记录已关闭');result=await store.recordInteraction(body.kind);break;
          case 'clear-diary':result=await store.clearDiary();break;
          case 'introduce':if(typeof body.client!=='string')throw Error('介绍确认无效');result=await store.introduce(body.client);break;
          case 'screenshot':result=await screenshot.understand(body,request.signal);break;
          case 'cancel-screenshot':screenshot.cancel();result=true;break;
          case 'configure':intelligence.cancel();screenshot.cancel();result=await store.configure(body.policy,body.revision);break;
          case 'announce':if(typeof body.id!=='string'||typeof body.client!=='string')throw Error('提醒领取无效');result=await store.announce(body.id,body.client);break;
          case 'lease':result=await store.lease(body.client,body.kind);break;
          case 'release':result=await store.release(body.client);break;
          case 'forget':if(typeof body.workspace!=='string'||(body.id!==undefined&&typeof body.id!=='string'))throw Error('删除范围无效');intelligence.cancel();screenshot.cancel();result=await store.forget(body.workspace,body.id);break;
          case 'preference':if(!enabled('memory'))throw Error('记忆功能已关闭');if(typeof body.workspace!=='string'||typeof body.text!=='string'||body.confirmed!==true)throw Error('请确认这条长期偏好');result=await store.memory({workspace:body.workspace,text:body.text,kind:'preference',confirmed:true,expiresAt:null,sources:[]});break;
          case 'understand':if(typeof body.workspace!=='string')throw Error('工作区无效');result=await intelligence.understand(body.workspace,false,body.question??'');break;
          case 'collect':if(!body.source||typeof body.source.workspace!=='string'||typeof body.source.session!=='string'||!Number.isSafeInteger(body.source.seq))throw Error('来源无效');result=await store.collect(body.source);break;
          case 'remove-collection':if(typeof body.id!=='string')throw Error('收藏无效');result=await store.removeCollection(body.id);break;
          default:return Response.json({error:'未知宠物操作'},{status:400});
        }
        return Response.json({result:result??null},{headers:{'cache-control':'no-store'}});
      }catch(e){return Response.json({error:e instanceof Error?e.message:'宠物操作失败'},{status:e instanceof CompanionBodyLimitError?413:400,headers:{'cache-control':'no-store'}});}
    };
    c.effect(()=>c.connection.fetch.register({path:'/api/bigfish-companion',methods:['GET','POST'],requestBody:'buffered',fetch:(request:Request)=>fetch(request)}),'bigfish companion');
    c.effect(()=>c.connection.fetch.register({path:'/api/bigfish-companion-screenshot',methods:['POST'],requestBody:'streaming',fetch:(request:Request)=>fetch(request,true)}),'bigfish screenshot upload');
  });
  ctx.inject(['sessions'],c=>{
    let disposed=false,busy=false;
    c.on('session/event',(session:HostSession,event:HostEvent)=>{
      if(!session.header?.cwd)return;
      if(!['user/message','assistant/message','turn/start','turn/end','approval/asked','approval/decided','tool/call','tool/result'].includes(event.type)&&!(event.surfaceOp&&typeof event.surfaceOp==='object'&&event.surfaceOp.op==='replace'))return;
      queue=queue.then(async()=>{
        if(disposed)return;
        if(!enabled('steward')&&!enabled('memory')){
          const reason=event.type==='turn/end'?event.data?.reason:null;
          const limit=reason?.kind==='max-tokens'?'output-limit':reason?.kind==='error'?modelLimitKind(reason.error):undefined;
          const source={workspace:session.header.cwd!,session:session.id,seq:event.seq};
          if(limit)await store.taskLimit(source,limit,event.time);
          else if(event.type==='turn/start'||event.type==='turn/end')await store.clearTaskLimits(source);
          return;
        }
        const previous=(await store.snapshot()).tasks.find(t=>t.workspace===session.header.cwd&&t.session===session.id);
        const task=projectTask(previous,session,event);if(!task)return;
        if(await store.observe(task,{eventTime:event.time,cursorOnly:!!previous&&taskStatusKey(previous)===taskStatusKey(task)}))dirty.add(task.workspace);
      }).catch(()=>{});
    });
    c.effect(()=>{
      const timer=setInterval(async()=>{
        if(disposed||busy||!dirty.size||!intelligence.available()||(!enabled('steward')&&!enabled('memory')))return;busy=true;
        try{
          const s=await store.snapshot();if(!s.policy.enabled)return;
          if(Date.now()-s.lastAutomatic<s.policy.intervalSeconds*1000)return;
          const workspace=[...dirty].find(w=>s.policy.workspaces.includes(w));if(!workspace)return;
          dirty.delete(workspace);await intelligence.understand(workspace,true);
        }catch{/* Model failures never escape into DSH task execution. */}finally{busy=false;}
      },5000);timer.unref?.();
      return()=>{disposed=true;clearInterval(timer);intelligence.cancel();};
    },'bigfish task observer');
  });
  // These optional read faces expose current facts without replaying the full log,
  // claiming an answerer, or retaining another session controller.
  ctx.inject(['agents'],c=>{
    let disposed=false,sampling=false,offset=0;
    let projections:{snapshot(session:HostSession,keys:readonly string[]):TaskProjection}|undefined;
    let gateway:{getPendingRemoteEvents():readonly {event:string;agentId:unknown}[]}|undefined;
    c.inject(['sessionProjections'],(p:any)=>{
      if(typeof p.sessionProjections?.snapshot==='function')projections=p.sessionProjections;
      p.effect(()=>()=>{projections=undefined;},'bigfish projection reader');
    });
    c.inject(['typertGateway'],(g:any)=>{
      if(typeof g.typertGateway?.getPendingRemoteEvents==='function')gateway=g.typertGateway;
      g.effect(()=>()=>{gateway=undefined;},'bigfish pending interaction reader');
    });
    const sample=():Promise<unknown>=>{
      if(disposed||sampling||typeof c.agents.list!=='function'||(!enabled('steward')&&!enabled('memory')))return queue;
      sampling=true;
      queue=queue.then(async()=>{
        if(disposed||(!enabled('steward')&&!enabled('memory')))return;
        const state=await store.snapshot();
        const pending=gateway?.getPendingRemoteEvents();
        const counts=new Map<string,{question:number;approval:number}>();
        for(const item of pending??[]){const key=String(item.agentId),count=counts.get(key)??{question:0,approval:0};
          if(item.event==='user-questions/request')count.question++;else if(item.event==='approval/request')count.approval++;
          counts.set(key,count);
        }
        const window=runtimeSampleWindow(c.agents.list() as HostAgent[],offset);offset=window.next;
        for(const agent of window.selected){
          const session=agent.session,workspace=session.header.cwd;if(!workspace)continue;
          const previous=state.tasks.find(t=>t.workspace===workspace&&t.session===session.id);
          // A user deletion is stronger than startup recovery; only a new committed
          // event may reintroduce this workspace's content.
          if(!previous&&state.forgotBefore[workspace]!==undefined)continue;
          try{
            const projection=projections?.snapshot(session,['title','userQuestions','turnOutline']);
            const inputs=pending===undefined?undefined:counts.get(session.id)??{question:0,approval:0};
            const task=restoreLiveTask(previous,agent,projection,inputs,Date.now());
            if(!task||previous&&taskStatusKey(previous)===taskStatusKey(task))continue;
            if(await store.observe(task,{runtime:true,notify:previous!==undefined||task.state==='waiting'}))dirty.add(workspace);
          }catch{/* A retiring or unavailable source cannot invent a task outcome. */}
        }
      }).catch(()=>{}).finally(()=>{sampling=false;});
      return queue;
    };
    c.on('agent/status',sample);c.on('agent/created',sample);
    c.effect(()=>{sample();const timer=setInterval(sample,1000);timer.unref?.();return()=>{disposed=true;clearInterval(timer);};},'bigfish live task recovery');
  });
}
