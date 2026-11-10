import type {HostSnapshot} from './companion-host.js';
/** Saved Host state only: a browser draft never claims permission has already been granted. */
export function intelligenceStatus(state:HostSnapshot|null,demo=false){
 if(demo)return {label:'模拟演示',missing:['请在 DSH 中连接 Host 后配置；演示不会调用模型。']};
 if(!state)return {label:'等待 Host',missing:['尚未连接兼容 Host，普通陪伴仍可用。']};
 const missing:string[]=[];
 if(!state.modelAvailable)missing.push('Host 尚未提供兼容模型服务');
 if(!state.policy.provider.trim()||!state.policy.model.trim())missing.push('尚未选择模型');
 if(!state.policy.workspaces.length)missing.push('尚未授权任何工作区');
 if(!state.policy.enabled)missing.push('尚未明确允许模型调用');
 const remaining=Math.max(0,state.policy.dailyTokens-state.today.used-state.today.reserved);
 return {label:missing.length?'普通模式':remaining===0?'今日预算已用完':'智能模式已启用',missing,remaining};
}
