export type ModelLimitKind = 'credit'|'context'|'output-limit';
const creditCodes = new Set(['quota','account_quota','insufficient_quota','insufficient_balance','credit_balance_too_low','billing_hard_limit_reached']);
const contextCodes = new Set(['context_window_exceeded','context_length_exceeded']);
/** Only structured provider codes establish exhausted credit; HTTP 429 and arbitrary text do not. */
export function modelLimitKind(error: unknown): ModelLimitKind|undefined {
  const pending:unknown[]=[error],seen=new Set<unknown>();
  for(let count=0;pending.length&&count<16;count++){
    const current=pending.shift();
    if(!current||typeof current!=='object'||seen.has(current))continue;
    seen.add(current);
    const e=current as {code?:unknown;error?:unknown;failure?:unknown;cause?:unknown};
    if(typeof e.code==='string'){
      const code=e.code.toLowerCase();
      if(creditCodes.has(code))return 'credit';
      if(contextCodes.has(code))return 'context';
      if(code==='max_tokens'||code==='max-tokens')return 'output-limit';
    }
    pending.push(e.error,e.failure,e.cause);
  }
  return undefined;
}
export const creditExhausted=(error:unknown)=>modelLimitKind(error)==='credit';
export const modelLimitText:Record<ModelLimitKind,string>={
  credit:'模型服务明确返回额度或余额不足，智能理解暂时无法继续。请检查 DSH 的模型账户；我仍会普通陪伴，不会自动重试扣费。',
  context:'这次理解超出模型上下文容量啦，请缩小理解范围或换用更大窗口的模型。这不表示账户余额不足，普通陪伴继续～',
  'output-limit':'这次理解达到输出 token 上限啦，结果还不完整；这不表示账户余额不足，普通陪伴继续～',
};
export class PetBudgetError extends Error {
  constructor(){super('宠物今日 token 预算不足，继续普通陪伴');this.name='PetBudgetError';}
}
/** Preserve typed in-band failures; DSH adapters report errors in finish chunks as well as throws. */
export function modelFinishError(reason:{kind:string;failure?:unknown}):Error {
  const error=Object.assign(new Error('模型未正常完成；保留普通陪伴'),{failure:reason.failure});
  return reason.kind==='max-tokens'?Object.assign(error,{code:'MAX_TOKENS'}):error;
}
