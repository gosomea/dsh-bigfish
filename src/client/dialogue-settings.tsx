import React,{useState} from 'react';
import {categories,categoryLabels,defaultLines,formatLine,parseLines,parseRules,type Category,type ToolRule} from '../contract/dialogue.js';
import type {Preferences} from '../contract/preferences.js';
export function DialogueSettings({prefs,save,preview,recentTools}:{recentTools:readonly string[];prefs:Preferences;save:(p:Partial<Preferences>)=>Promise<void>;preview:(category:Category,text:string)=>React.ReactNode}) {
 const [category,setCategory]=useState<Category>('read'),[draft,setDraft]=useState<string|null>(null),[message,setMessage]=useState(''),[audition,setAudition]=useState<{category:Category;text:string}|null>(null);
 const [pattern,setPattern]=useState(''),[label,setLabel]=useState(''),[ruleCategory,setRuleCategory]=useState<Category>('tool');
 const library=parseLines(prefs.dialogueJson),rules=parseRules(prefs.toolRulesJson);const lines=draft??(library[category]??defaultLines[category]).join('\n');
 const commit=async(p:Partial<Preferences>)=>{try{await save(p);setMessage('已保存');return true;}catch{setMessage('保存失败，请检查内容或刷新后重试');return false;}};
 return <fieldset className="bf-dialogue-settings"><legend>自定义台词</legend>
 <p className="bf-help">空闲等候类同时用于气泡和举牌。何时出现由“空闲互动”决定；固定文字时使用第一句。其他类别用于工作提示。</p>
 <label className="bf-field"><span>台词分类</span><select aria-label="台词分类" value={category} onChange={e=>{setCategory(e.target.value as Category);setDraft(null);setMessage('');}}>{categories.map(c=><option key={c} value={c}>{categoryLabels[c]}</option>)}</select></label>
 <label className="bf-lines-label">台词列表 · 每行一句<textarea aria-label="台词列表" rows={5} maxLength={4800} value={lines} onChange={e=>setDraft(e.target.value)}/></label>
 <p className="bf-help">随机轮换且避免连着重复。留空可关闭此类台词。变量：{'{task} {tool} {file} {elapsed} {activeCount} {completedCount}'}</p>
 <div className="bf-button-row"><button onClick={async()=>{const next={...library,[category]:lines.split('\n').map(s=>s.trim()).filter(Boolean)};if(await commit({dialogueJson:JSON.stringify(next)}))setDraft(null);}}>保存这一类台词</button>
 <button onClick={()=>{const candidates=lines.split('\n').map(s=>s.trim()).filter(Boolean);setAudition({category,text:formatLine(candidates[Math.floor(Math.random()*candidates.length)]??'',{task:'制作一个小游戏',tool:'示例工具',file:'example.ts',elapsed:'12 秒',activeCount:3,completedCount:5})});}}>预览气泡与动作</button>
 <button onClick={async()=>{const next={...library};delete next[category];if(await commit({dialogueJson:JSON.stringify(next)}))setDraft(null);}}>恢复这一类默认</button></div>
 {audition&&<div className="bf-dialogue-preview" aria-label="台词动作预览"><small>模拟预览 · 不调用工具</small>{preview(audition.category,audition.text)}<button onClick={()=>setAudition(null)}>关闭预览</button></div>}
 <details className="bf-disclosure"><summary>工具与扩展 · 专属规则</summary><h3>工具专属规则</h3><p className="bf-help">精确名称优先；末尾 * 匹配同一组工具。未知工具会自动使用通用台词。</p>
 {rules.map((r,i)=><div className="bf-rule" key={r.pattern}><code>{r.pattern}</code><span>{r.label||categoryLabels[r.category]}</span><button aria-label={'删除规则 '+r.pattern} onClick={()=>void commit({toolRulesJson:JSON.stringify(rules.filter((_,j)=>i!==j))})}>删除</button></div>)}
 <label className="bf-field"><span>最近观察到的工具</span><select aria-label="最近观察到的工具" value="" onChange={e=>setPattern(e.target.value)}><option value="">{recentTools.length?'选择后自动填写名称':'尚未观察到工具调用'}</option>{recentTools.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
 <label className="bf-field"><span>工具名称或前缀</span><input aria-label="工具名称或前缀" maxLength={100} value={pattern} placeholder="mcp__search__*" onChange={e=>setPattern(e.target.value)}/></label>
 <label className="bf-field"><span>显示名称</span><input aria-label="工具显示名称" maxLength={60} value={label} onChange={e=>setLabel(e.target.value)}/></label>
 <label className="bf-field"><span>工具分类</span><select aria-label="工具分类" value={ruleCategory} onChange={e=>setRuleCategory(e.target.value as Category)}>{categories.map(c=><option key={c} value={c}>{categoryLabels[c]}</option>)}</select></label>
 <button onClick={async()=>{const rule:ToolRule={pattern:pattern.trim(),category:ruleCategory,label:label.trim()};if(await commit({toolRulesJson:JSON.stringify([...rules.filter(r=>r.pattern!==rule.pattern),rule])})){setPattern('');setLabel('');}}}>保存工具规则</button>
 </details><p role="status">{message}</p>
 </fieldset>;
}
