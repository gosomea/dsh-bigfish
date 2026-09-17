# 实现架构

当前采用 dsh 原生双面插件：Host 注册设置及两个角色库 HTTP 路由（目录/选择与受限上传），Browser 订阅现有公开 Session eventSource。插件不新增模型请求、prompt、工具或生成钩子；角色库路由继承宿主 connection 的访问控制。

```text
Host settings.register('bigfish') → 原生 settingsScope → PreferenceStore
原生 sessions.list / binding(id).eventSource
    ↓ assistant/live-chunk、turn/start/end、tool/call/result、retry
NativeCompanion → HarnessAdapter → SessionTelemetry / Baselines
    ↓ 5 Hz 数值快照，状态变化立即发布
Director → 图集连续帧 + 程序关键帧 + 场景道具 → Canvas 2D
shell.overlay / settings.section ← 同一个 controller/preferences
```

## 模块职责

- `src/contract/`：状态、遥测、用户参数、动作包校验。
- `src/domain/`：纯逻辑速度窗口、模型历史、反馈、状态归约、可重放导演。
- `src/host/plugin.ts`：注册 `bigfish` schema，使用有界 defaults/base/user 解析。
- `src/host/adapter.ts`：公开帧的结构适配，可单独复用于 Host 观察；生产 UI 在浏览器复用该纯适配器。
- `src/client/controller.ts`：当前会话绑定、原生流、用户等待、连接状态、设备速度历史。
- `src/client/ui.tsx`：浮动宠物与交互；`settings-panel.tsx`、`backup-settings.tsx`、`behavior-preview.tsx` 分别负责设置、备份和行为预览；`restore-backup.ts` 独立处理恢复顺序与并发安全的回滚；`fish-canvas.tsx` 选择渲染器。
- `src/client/renderer.ts`：连续帧、独立裁剪、声音、30 FPS/后台停绘；`sprite-assets.ts` 集中资源，`motion-transform.ts` 管理次级位移，`draw-scene.ts` 绘制布景。
- `src/pet/host-store.ts`：带目录 revision 的整批角色写入；`store-lock.ts` 提供跨进程心跳锁；`backup.ts` 是两端共用的有界备份解析；`preview.tsx` 与角色管理界面分离。
- `src/pet/`：角色包解析、归档限制、Host 存储、浏览器加载、通用动作调度及角色库界面。
- `packs/classic/manifest.json`：动作条件、权重、时长、冷却、帧序列、场景状态。

## 原生接口与生命周期

绑定 `ctx.sessions.list` 的 current，调用 `binding(id)`，订阅其 `eventSource`；模型身份读取 `session.projections.faceOf('modelSelection').lastUsed/next`。输出只统计 `assistant/live-chunk`，使用原生 attemptId、turn、step；最终持久文本及 usage 不二次计数。`settle-assistant` 只是一次模型请求结束，只有 `turn/end` 的 completed 触发庆祝。

用户确认由 `uiSession.pendingInteractions` 驱动；连接由 `connection.state` 驱动。hydrate/replace 读取起止时间、工具、重试，以及未结算 attempt 的最新输出通道和原始时间。恢复输出/思考/间歇的动作状态，不把历史文本送入实时计数、速度窗口或学习样本。重连、切会话、禁用会清空短窗和会话临时状态；中途打开页面的工作时长从实际观察起计算，墙钟时长可以从 turn/start 恢复。

只观察当前选中的会话，未观察的后台输出不累计到本插件基线。关闭页面不影响 Host 任务。

settings、locale、槽位、DOM 样式和 controller 均归属插件 fiber；卸载移除观察者、timer、RAF、声音资源。Host 的 `ctx.inject` 回调不返回 settings owner，避免 Cordis 将 owner 作为返回的可释放资源处理。设置写入串行并带 revision；宿主有“拒绝后恢复却 resolve”的行为，因此插件还核对最终确认值。

## 数据与性能

基线仅保存有限数值样本、模型配置 ID、时间和版本，不保存文本/凭据。默认最多 100 模型、每模型 120 样本、单 attempt 20 样本、30 天有效期。速度窗口采用 100 ms 桶，内存不随 chunk 数无限增长。UI 数值稳定输出时最多 5 Hz，动画最多 30 FPS，DPR 上限 2，隐藏标签页暂停绘制。

原生 token 是 weighted-codepoints-v1 估算值，CJK 约 1、普通字符约 0.25、补充平面字符约 1；只用于互动反馈。精确 tokenizer 可通过 TokenCounter 适配并使用独立 counter identity。

## 构建

Host 为 ESM，Browser 用 dsh `window.__ModuleLoader__` factory，React 由宿主提供；插件内嵌六张透明图集和坐标 JSON，不需要外部 CDN。预览单独打包 React 与模拟 controller，和真实会话/存储键隔离。

当前确认的接口版本和安装证据见 [兼容性记录](compatibility.md)。

角色目录快照、锁、合并事务与偏好回滚边界见 [备份与共享存储](backup-and-storage.md)。Host 构建保留 proper-lockfile 为显式运行时依赖，由安装器按锁定版本安装。
