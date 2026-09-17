# Phase 1 · 实时接入契约与可验证核心

> 历史规划/阶段记录。当前已完成 v0.1.0，实际交付与验证以 [交付记录](../../delivery.md) 为准。
状态：核心实现与 Host 类型/总线探针已完成；浏览器/设置运行探针待 phase 3。本文保留阶段计划，实际完成范围与 33 项测试结果见 [交付记录](../../phase-1-results.md)。

## 目标

先证明真实 dsh 状态能可靠转换成动画输入，20～400 tok/s 的不同模型可获得一致的相对反馈；将图像制作和运行时适配的不确定性隔离。

## 1. 兼容性探针

读取锁定 Harness checkout 的适用 AGENTS 和客户端/设置/agent 契约，记录版本和所需包。用隔离测试宿主或合成 agent 运行：

- `agent/assistant-stream` start/chunk/end 的订阅与释放；agent scope、epoch、attempt、revision/index 作用域。
- turn 开始/正常结束/取消/错误原因映射；不得把单次 attempt/end 当成 turn 完成。
- 活动主面板对应的 session 选择与切换。
- 实际或可见模型、端点和推理配置的获取。
- 工具生命周期、等待用户、重试、连接状态获取；标注缺失能力。
- Remote 初始快照、增量、重连；浮层与设置槽位注册、热卸载。
- 设置持久 provider、schema、revision 写入能力。

输出拟建 `docs/compatibility.md`：已验证版本、包版本、接口与小型 probe 位置、验证命令、限制。先确认依赖再生成 package manifest，禁止假定 rc.8 兼容。

## 2. 项目骨架

建立 package.json、独立 tsconfig、构建配置、测试配置、.gitignore 与格式检查；Host/Client 分面，domain 不依赖 dsh runtime/React。源码模块按 architecture.md 的边界组织。

此阶段形成真实可运行脚本后再在 README 中列命令：建议 check、test、build、demo:replay；这些名称尚非现存命令。版本、平台约束来自兼容性探针，不盲目复制相邻项目。

## 3. 状态与速度核心

实现内部事件→snapshot reducer、单调时钟、attempt 去重、模型分桶、generation 区间、短窗/EMA、长期统计、置信度、两种模式映射、fatigue 和档位滞回。

显式处理 unknown/unavailable；取消和等待状态绕过动画强度最短保持。模拟数据中提供精确 token 增量，真实计数适配器与纯算法分开。持久化先定义读写边界，阶段 3 完成 host provider 接入。

## 4. 场景协议与导演最小核心

实现 manifest/action schema 的解析与版本检查，最小动作占用/冷却/状态选择。用纯数据的打字台 fixture 验证 action 选择，不要求此阶段生成正式角色图。

注入时钟和随机种子，保证相同输入选择一致。先定义 renderer 接口，不在未比较素材工作流前绑定第三方骨骼运行库。

## 5. 合成轨迹

至少建立以下 fixture：

1. baseline=20/100/400，r=1→0.5→1.25→1，包含冷启动与成熟基线两种运行。
2. 慢首段、稳定输出、短暂停顿、长 gap、恢复成批输出。
3. 一 turn 多 step/attempt，工具与模型交替，工具结果文本很大但不计 token。
4. 重复 chunk、重连终态快照、切换会话、agent 重建/attempt 计数复用。
5. 用户等待、取消、失败、重试、无可见 token/隐藏推理。
6. 同名模型不同端点、计数方式变化、长任务持续降速、极短任务。

回放导出时间/state/rate/baseline/confidence/pressure/fatigue/action 表供检查。回放读取 fixture，不触发真实 API，不进入用户校准存储。

## 完成标准

- 新建包能运行实际声明的 typecheck、focused tests 和 build。
- 验收矩阵 A1～A6、L1～L5 的核心逻辑部分通过；包协议能拒绝缺失必要资源/版本并选择基础回退。
- 不依赖全仓修改，不影响当前用户环境。
- docs/compatibility.md 与 README 准确说明已支持能力与未完成美术/UI 部分。
- 记录每个运行命令与结果，缺真实联调不得宣称已真实联调。

## 需要通过本阶段解决的未知项

tokenizer/精确增量可用性；模型身份字段；agent 重建的 epoch 获取；等待/重试的事件来源；Remote 传输与 settings namespace 的具体注册代码。优先源码和实验求证，不把可查事实转成用户选择题。
