# 0.5.4-next.1 · 跨版本 DSH 桥接

这是发布在 npm `next` dist-tag 的预览版，不替换 `latest` 的 0.5.3。

## 支持范围

- DSH `0.1.5-rc.3`：旧 `settingsScope` 设置服务；使用 `sessions.list.current` 与 `uiSession.pendingInteractions`。
- DSH `0.1.6-alpha.2`：旧 `settingsScope` 设置服务；使用 `uiSession.adapter.current` 与 `uiSession.sessionStatus`。
- DSH `0.1.7-rc.2`（当前 npm `latest`）：`configForms` 设置服务与当前会话桥接。
- DSH `0.2.0-rc.1`（当前 npm `next`）：`configForms` 设置服务与当前会话桥接。
- DSH `master` 不是兼容承诺；每个新 tag 必须重新通过类型探针和原生 smoke。

Bigfish 同时导出当前 DSH 所需的 volatile Config schema，并为旧 DSH 注册纯值 schema；客户端再按能力选择 `configForms` 或 `settingsScope`。Bigfish 不安装 DSH 核心依赖，避免在宿主内创建第二套 Cordis/service runtime。未识别的宿主保持 idle，并在宠物和完整设置显示诊断，不猜测 session 或任务状态。

候选包已对上述四个精确 npm 版本运行隔离浏览器 smoke。每次 smoke 均覆盖安装、设置持久化、真实流式任务、并发隔离、角色包、备份恢复、卸载和浏览器运行时错误检查，且未调用付费模型。

## 安装与回退

安装预览版：

```sh
dsh plugin --profile web add dsh-bigfish@next
```

回到稳定版：

```sh
dsh plugin --profile web add dsh-bigfish@0.5.3
```

在任务空闲后重启 DSH 并刷新浏览器。
