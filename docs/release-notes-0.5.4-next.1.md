# 0.5.4-next.1 · 双版本 DSH Session Bridge

这是预发布版本，发布到 npm 的 `next` dist-tag，不替换 `latest` 的 0.5.3。

## 支持范围

- DSH `0.1.5-rc.2`：使用 `sessions.list.current` 与 `uiSession.pendingInteractions`。
- DSH `0.1.6-alpha.2`：使用 `uiSession.adapter.current` 与 `uiSession.sessionStatus`，只跟随 DSH UI 已 retain 的前台 binding。
- DSH `master` 不是兼容承诺；每个新 tag 必须重新通过类型探针和原生 smoke。

Bigfish 不安装 DSH 核心依赖，避免在宿主内创建第二套 Cordis/service runtime。未识别的宿主保持 idle，并在宠物和完整设置显示诊断，而不会猜测 session 或任务状态。

## 安装与回退

```sh
dsh plugin --profile web add dsh-bigfish@next
```

如需回到稳定版：

```sh
dsh plugin --profile web add dsh-bigfish@0.5.3
```

在任务空闲后重启 DSH 并刷新浏览器。发布前会分别对两个精确 DSH tag 运行类型探针和隔离浏览器 smoke。
