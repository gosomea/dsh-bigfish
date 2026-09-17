export const categories = ['idle','start','thinking','writing','read','search','edit','command','test','web','parallel','tool','waiting','error','complete','stopped','image','export','background','agent'] as const;
export type Category = typeof categories[number];
export const categoryLabels: Record<Category,string> = {idle:'空闲等候',start:'收到任务',thinking:'思考',writing:'输出内容',read:'读取文件',search:'搜索内容',edit:'修改文件',command:'执行命令',test:'运行测试',web:'浏览网页',parallel:'并行处理',tool:'其他工具',waiting:'等待确认',error:'遇到问题',complete:'任务完成',stopped:'已经停止',image:'生成图片',export:'导出文件',background:'后台任务',agent:'子代理协作'};
export const defaultLines: Record<Category,string[]> = {
 idle:['我在等哦～','有任务就叫我呀！','准备好啦，随时开工～'],start:['收到，马上开工！','让我看看这次做什么～'],thinking:['让我认真想一想……','思路正在整理中～'],writing:['在写了在写了……','正在把想法变成文字～'],
 read:['正在认真读 {file}～','我去 {file} 里翻翻线索～','看看 {file} 能帮上什么忙～'],search:['让我找找看……','目标锁定，开始搜寻！'],edit:['正在修改 {file}～','这里修一下：{file}～'],command:['{tool} 跑起来啦！','我盯着 {tool} 的执行结果呢～'],test:['检查一下有没有小问题！','正在逐项检查～'],web:['我去网上看看～','正在翻阅网页～'],parallel:['分头忙起来啦！','正在并行处理 {activeCount} 项～'],tool:['工具箱拿来啦！','正在使用 {tool}～'],waiting:['这一步要你点头哦～','我在这里等你确认～'],error:['这一步出了点问题……','让我看看哪里卡住了～'],complete:['做好啦，来看看！','完成！给我放个小假吧～'],stopped:['已经停下啦～'],image:['正在画画，稍等一下～'],export:['正在整理交付文件～'],background:['后台任务还在忙哦～'],agent:['小伙伴们一起开工啦！'] };
export const categoryMotions: Record<Category,string> = {idle:'wait-sign',start:'wave',thinking:'read',writing:'type',read:'read',search:'peek',edit:'type',command:'repair',test:'read',web:'read',parallel:'shuffle',tool:'repair',waiting:'wait-sign',error:'wipe',complete:'celebrate',stopped:'sigh',image:'type',export:'stamp',background:'breathe',agent:'wave'};
export interface ToolRule { pattern: string; category: Category; label: string }
export function parseLines(raw: string): Partial<Record<Category,string[]>> {
 if(raw.length>64000)throw Error('台词库过大');const v:unknown=JSON.parse(raw);
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('台词库无效');
 for(const [key,lines] of Object.entries(v))if(!categories.includes(key as Category)||!Array.isArray(lines)||lines.length>30||lines.some(x=>typeof x!=='string'||x.length>160||!x.trim()||/\{(?!task\}|tool\}|file\}|elapsed\}|activeCount\}|completedCount\})[^}]*\}/.test(x)))throw Error('台词或占位符无效');
 return v as Partial<Record<Category,string[]>>;
}
export function parseRules(raw: string): ToolRule[] {
 if(raw.length>32000)throw Error('工具规则过大');const v:unknown=JSON.parse(raw);
 if(!Array.isArray(v)||v.length>100||v.some(r=>!r||typeof r.pattern!=='string'||!r.pattern.trim()||r.pattern.length>100||!/^[-\w./:@]+\*?$/.test(r.pattern)||!categories.includes(r.category)||typeof r.label!=='string'||r.label.length>60))throw Error('工具规则无效');
 return v as ToolRule[];
}
export function classifyTool(name: string, rules: ToolRule[]): {category:Category;label:string} {
 const exact=rules.find(r=>r.pattern===name),prefix=rules.filter(r=>r.pattern.endsWith('*')&&name.startsWith(r.pattern.slice(0,-1))).sort((a,b)=>b.pattern.length-a.pattern.length)[0];
 const match=exact??prefix;if(match)return {category:match.category,label:match.label||name};
 const n=name.toLowerCase();let category:Category='tool';
 if(/test|pytest|vitest/.test(n))category='test';else if(/read|open_file|cat_file/.test(n))category='read';else if(/search|grep|find|glob/.test(n))category='search';else if(/edit|write_file|patch|replace/.test(n))category='edit';else if(/browser|browse|web|fetch|navigate/.test(n))category='web';else if(/spawn|delegate|subagent/.test(n))category='agent';else if(/exec|bash|shell|terminal|run_code|command/.test(n))category='command';
 return {category,label:category==='tool'?name:categoryLabels[category]};
}
export function formatLine(line:string, values:Record<string,string|number>):string {
 return line.replace(/\{(task|tool|file|elapsed|activeCount|completedCount)\}/g,(_,key)=>String(values[key]??({task:'这次任务',file:'这个文件',tool:'工具',elapsed:'片刻',activeCount:1,completedCount:0} as Record<string,string|number>)[key])).slice(0,240);
}
