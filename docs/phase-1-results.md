# 第一阶段交付记录

> 历史规划/阶段记录。当前已完成 v0.1.0，实际交付与验证以 [交付记录](delivery.md) 为准。
日期：2026-09-17。

## 已实现

- 独立 ESM/TypeScript 工程，固定开发依赖与 lockfile，构建输出 JS 和声明。
- `src/domain/session.ts`：turn/attempt 归约、去重、工具集合、等待/重试/连接输入、三种计时、终态分类、恢复不重播完成。
- `src/domain/rate-window.ts` 与 `baselines.ts`：有界时间桶、EMA、模型分桶、冷启动/置信度、attempt 内冻结基线、结算渐变、TTL/LRU。
- `src/domain/feedback.ts`：催更/节奏模式、手动/自动基线、疲惫和可选时长催促。
- `src/host/adapter.ts` 与 `attach.ts`：真实接口形状的观察适配，agent epoch/revision/index 去重，默认显式估算，不累加 usage/内嵌 stream，事件释放与错误报告。
- `src/contract/scenes.ts` 与 `domain/director.ts`：v1 基础数据解析、资源/版本检查、回退、动作占用/冷却/随机种子、强度档位滞回、保守空间边界与过渡确认。
- 合成场景包、确定性轨迹与实际 Cordis 总线探针。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `pnpm install` | 成功，使用 Node 24；esbuild 构建脚本显式允许 |
| `pnpm check` | 通过 |
| `pnpm test` | 33/33 通过 |
| `pnpm build` | 通过，生成 lib/ |
| `pnpm demo:replay` | 成功生成 576 行轨迹、24 行阶段摘要 |
| `pnpm probe:harness` | 本地 0.1.5-rc.2 类型兼容与真实 Cordis emitter 通过 |

实际测试 Node 为 v24.19.0。Harness commit 和验证层级详见 [compatibility.md](compatibility.md)。没有运行真实模型 API、浏览器联调或用户 profile 安装。

成熟校准的合成回放：

| 相对速度 | 20 基准 | 100 基准 | 400 基准 | 催促压力（0～1） |
| --- | --- | --- | --- | --- |
| 正常 1.0× | 20 | 100 | 400 | 均约 0.15 |
| 降为 0.5× | 10 | 50 | 200 | 均约 0.75 |
| 升为 1.25× | 25 | 125 | 500 | 均约 0.05 |
| 恢复 1.0× | 20 | 100 | 400 | 均约 0.15 |

表中速率是精确合成输入的稳态近似值，不是 DeepSeek 实测速率。冷启动时反馈较温和，样本不足时显示学习状态；不以这些结果保证真实估算 token 的绝对误差。

测试发现并修复：模型切换沿用旧 baseline 的空值回退错误；速率窗口左边界多保留一个桶；重复 index 在进入有状态 counter 前未去重；场景过渡时必须等待 renderer 确认后恢复挥鞭。

## 验收覆盖

A1～A6、L1～L5 的纯逻辑路径及 V1/V3/V4 的协议/调度部分已有测试。V1 目前只验证传入的保守 hull，不代表正式角色素材及所有渲染轨迹已验证。

原 phase 1 的浏览器 Remote/当前面板绑定、审批 owner 与设置接口已做源码调查，未做运行探针。这些运行验收随 phase 3 的真实 Browser 入口完成，不将“源码存在”标为“联调成功”。目前可以进入 phase 2 的独立视觉原型。

## 下一阶段

制作打字台的小规模一致角色素材与 renderer，完成待机→输出→变慢→催促→恢复→完成的可见演出。渲染器必须调用 completeTransition 确认过渡完成，不能忽略导演的禁挥标记。

第一批视觉原型之后再完成 dsh 客户端入口、完整设置、实际模型身份解析、匹配计数器、持久化基线、多窗口与发布。当前没有把首版 3 场景/12 表情/8 主动作目标缩减为逻辑样例。
