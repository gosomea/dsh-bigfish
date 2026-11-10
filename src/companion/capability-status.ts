import {groups,type Group,type Lifestyle} from './config.js';

export type CapabilityState='available'|'setup'|'desktop'|'unsupported'|'off'|'demo';
export interface CapabilityStatus {id:Group;name:string;state:CapabilityState;label:string;detail:string}
export interface CapabilityEnvironment {
 demo:boolean;desktop:boolean;host:boolean;modelAvailable:boolean;modelConfigured:boolean;authorizedWorkspaces:boolean;intelligenceEnabled:boolean;budgetRemaining:boolean;
 role:{builtin:boolean;movement:boolean;touch:boolean;home:boolean;paired:boolean;life:boolean};
 perception?:{input:boolean;output:boolean;screenshot:boolean;desktopVoice:boolean};
}
const labels:Record<CapabilityState,string>={available:'可用',setup:'待配置',desktop:'桌面专属',unsupported:'当前角色未支持',off:'已关闭',demo:'模拟演示'};
/** Readiness describes this environment; choosing a preset cannot create grants or spend tokens. */
export function capabilityStatuses(config:Lifestyle,env:CapabilityEnvironment):CapabilityStatus[]{
 const modelReady=env.host&&env.modelAvailable&&env.modelConfigured&&env.authorizedWorkspaces&&env.intelligenceEnabled;
 const smartReason=!env.host?'需连接 DSH Host。':!env.modelAvailable?'Host 未提供兼容模型服务。':!env.modelConfigured?'需选择 DSH 已配置的模型。':!env.authorizedWorkspaces?'需逐项授权工作区。':!env.intelligenceEnabled?'智能模式尚未明确启用。':!env.budgetRemaining?'今日预算不足，普通陪伴仍可用。':'授权摘要与工具事实可用于理解；会消耗额外 token。';
 const rows:Record<Group,[CapabilityState,string]>={
  body:env.role.builtin||env.role.movement?['available','真实步态、坐卧和待机；活跃程度决定自动活动节奏。']:['unsupported','保留原地动作；此角色没有真实行走映射，不平移站立图。'],
  play:env.role.builtin||env.role.touch?['available','摸头、茶点与玩具按当前角色素材回应，不调用模型。']:['unsupported','角色包尚未提供触摸映射；可更换角色包。'],
  steward:env.demo?['demo','这里只模拟任务；真实多会话需安装到 DSH Host。']:env.host?['available',`本地任务状态与额度提醒可用。${modelReady&&env.budgetRemaining?'智能解释已就绪，会消耗 token。':`智能解释待配置：${smartReason}`}`]:['setup','需在 DSH Host 中安装当前开发版；演示页不读取真实会话。'],
  memory:env.demo?['demo','演示不生成真实任务记忆。']:modelReady&&env.budgetRemaining?['available','按授权工作区记录摘要；可查看、删除，模型理解计入预算。']:['setup',smartReason],
  home:env.role.builtin||env.role.home?['available',env.demo?'本地小窝可用；演示不生成真实项目明信片。':env.host?'小窝、家具与真实项目收藏可用，不调用模型。':'本地小窝可用；连接 Host 后查看真实项目收藏。']:['unsupported','此角色没有家园背景；真实收藏数据不受角色切换影响。'],
  growth:env.role.builtin||env.role.life?['available',env.demo?'可预览生活与故事；真实日记、纪念日需连接 Host。':'记录实际互动，阶段故事明确标为宠物剧情；不因离开扣除成长。']:['unsupported','此角色未提供生活动作；可查看已经保存的真实相处记录。'],
  adventures:env.role.builtin?['available',env.desktop?'本地小剧场与受邀双宠可用；跨屏与窗口感知需本机授权。':'本地小剧场与受邀双宠可用；跨屏与窗口感知是桌面专属功能。']:env.role.paired?['available','此包提供双宠映射；内置纸箱、纸船、钓鱼场景尚未映射到外部角色。']:['unsupported','此角色未提供双宠映射；不启动缺失动作的演出。'],
  perception:[env.perception&&(env.perception.input||env.perception.output||env.perception.desktopVoice||env.perception.screenshot&&modelReady&&env.budgetRemaining)?'available':'setup',`录音、朗读和分享图片均需主动操作、逐次同意。${env.desktop?(env.perception?.desktopVoice?'转写服务已配置。':'转写服务尚待配置。'):(env.perception?.input?'浏览器提供按住识别。':'浏览器未提供语音识别。')}${env.perception?.output?'设备本地朗读可用。':'当前没有设备本地声音。'}${env.demo?'演示不会发送给模型。':`图片理解：${env.perception?.screenshot?smartReason:'Host 尚未提供图片服务。'}`}语音服务可能独立收费。`],
 };
 return (Object.keys(groups) as Group[]).map(id=>{const [state,detail]=rows[id];return {id,name:groups[id],state:config.groups[id]?state:'off',label:labels[config.groups[id]?state:'off'],detail:config.groups[id]?detail:'该能力已关闭，保存的偏好保留。'};});
}
