# 兼容性与验证范围 · 0.6.0-next.1

本轮在 macOS Apple Silicon / Node 24.19.0 验证新的趣味角色包：147 项单元测试、34 项 Chromium 浏览器测试，以及 npm DSH `0.2.0-rc.2` 的 15 组隔离原生流程。原生测试使用无密钥的本地流式 LlmAdapter，确实经过 DSH Host 会话与 Web 客户端，没有调用付费模型。新增角色的逐动作预览、Host 上传、切换、刷新恢复、关闭鞭策、举牌停留和动作台词均有覆盖。

2026-10-08 查验时，DSH 的 npm `latest` 与 `next` 均为 `0.2.0-rc.2`。Bigfish `latest` 保持 `0.5.3`，本轮新增动作版发布到 `next`。以下旧环境矩阵属于 `0.5.4-next.1` 的历史验收；本轮没有重新跑四个旧 DSH 或 Linux，不能把历史结果当成 0.6 的完整实测。

## 历史兼容版验证

| 环境 | 本轮覆盖 | 尚未覆盖 |
| --- | --- | --- |
| macOS Apple Silicon，Node 24.19.0，pnpm 11.7.0 | 142 项单元测试；四个 npm DSH 版本的原生安装、设置、真实流式会话、并发隔离、角色库、备份和卸载；既有 Playwright Chromium 与日常 3080 实例 | Safari、Firefox、Intel Mac |
| Linux arm64，Debian bookworm 容器，Node 22.19.0 | 锁文件干净安装、类型检查、完整构建、单元测试（含多进程锁/异常退出/恢复冲突）、构建后 Host ESM 导入 | Linux 原生 DSH Web Host 完整联调 |
| Linux arm64，Debian bookworm 容器，Node 24.21.0 | 同上，另跑真实 Chromium 浏览器回归；Docker 镜像由实际拉取的 Node 24 tag 提供 | Linux 原生 DSH Web Host、x86_64、NFS/SMB |
| Windows | 已提供下方可复现命令 | 本轮无可用 Windows 执行环境，没有通过结论 |

历史查验（2026-09-29），`@deepseek-ai/dsh` 的 npm `latest` 是 `0.1.7-rc.2`，`next` 是 `0.2.0-rc.1`。候选包的实测矩阵如下：

| DSH | 设置能力 | 会话能力 | 原生验收 |
| --- | --- | --- | --- |
| `0.1.5-rc.3` | `settingsScope` / Host `settings.register` | `sessions.list.current` + `pendingInteractions` | 14 组流程通过 |
| `0.1.6-alpha.2` | `settingsScope` / Host `settings.register` | `uiSession.adapter.current` + `sessionStatus` | 14 组流程通过 |
| `0.1.7-rc.2`（当时 `latest`） | `configForms` / 导出 `Config` | `uiSession.adapter.current` + `sessionStatus` | 14 组流程通过 |
| `0.2.0-rc.1`（当时 `next`） | `configForms` / 导出 `Config` | `uiSession.adapter.current` + `sessionStatus` | 14 组流程通过 |

旧设置服务使用纯值 schema；当前 DSH 使用 volatile Config schema，保存设置时不重启插件。客户端按实际服务选择 `settingsScope` 或 `configForms`。Bigfish 不主动 retain session，也不携带 DSH runtime dependency。移动中的 `master` 只用于持续探测，不构成发布承诺。

无法识别以上任一能力组合时，客户端保持 idle 并展示兼容诊断；不读取不确定的 session stream，也不伪造工作状态。稳定版 `0.5.3` 的历史验证范围仍见其 release 文档。

## 测试范围

- 速度 20/100/400 自适应、计数去重、任务优先级、设置失败恢复、角色包校验、动作循环边界、关键状态抢占、一次性动作不重播、播放时钟连续。
- 原生多会话：两个实际 Host turn 同时运行，前台切换及后台结束隔离；历史恢复不重新计数。
- 角色与设置：明暗主题、窄屏、整体和图标拖动、内置/外部预览、角色切换后固定站位、关闭鞭策立即停止；备份导出/预览/确认/刷新、坏文件和跨窗口冲突。
- 存储：独立 Node 进程共享目录写入，符号链接指向同目录，持锁进程被杀后恢复，批量新增失败不发布半份目录。旧版本 Host 不识别锁，因此共享同一 Home 的实例应一并升级。
- `scripts/soak.ts` 默认 1800 秒真实墙钟（非虚拟快进），轮换任务状态、内置/成年版、折叠恢复；持续采样 GC 后堆、DOM 与 Canvas。最终报告保存实际时长和增长比例。这个时长不等于跨天无泄漏证明。

Linux 报告为 `artifacts/linux-node22.19.0.json`、`artifacts/linux-node24.json`；四个 DSH 版本的原生报告由 `scripts/smoke-native.ts` 生成到 `artifacts/native-smoke*.json`；soak 为 `artifacts/soak.json`；日常实例为 `artifacts/daily-050.json`。`artifacts/` 是本地测试输出，不随 npm 包发布。不要用历史报告代替本轮结果。

## 能力边界

- `.dshpet` 支持独立 PNG/WebP、任意动作 ID/标签/台词/背景。上限见 [协议](pet-pack/spec.md)。旧内置 JSON 支持六张图集；新 daily 12 帧用于喝茶、擦汗、伸展。
- 不提供 Live2D/Spine、任意脚本或远程资源执行。Codex v1/v2 图集可导入；v2 方向帧可预览，尚不自动跟随鼠标。
- 空挥始终不接触，绘制和节拍两种渲染器共用；外部角色自己提供 near-miss 帧，外部暂不播放空挥音效。
- 普通动作尽量在循环结束切换；重要状态即时响应。这是帧调度，不是任意姿态的骨骼插值。
- 只采样当前会话可见输出；速度为估算，不等同 tokenizer 或计费。只显示当前会话，不汇总后台。
- 备份覆盖角色、偏好和当前浏览器编排；不包括聊天、密钥、速度学习历史和位置。跨存储域失败/中断边界见 [备份说明](backup-and-storage.md)。
- 原始参考作者仍未查明，见 NOTICE；生成素材过程已记录，不宣称第三方角色授权已解决。

## 复现

macOS/Linux/Windows 都可在源码根目录执行（先安装受支持的 Node 和 pnpm）：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:soak
pnpm pack --pack-destination dist
```

若默认预览端口 4178 被占用，POSIX shell 使用 `BIGFISH_PREVIEW_PORT=4182 pnpm test:browser`；PowerShell 使用 `$env:BIGFISH_PREVIEW_PORT='4182'; pnpm test:browser`。

Docker Linux 干净检查：`bash scripts/test-linux.sh 22.19.0` 或 `bash scripts/test-linux.sh 24`。宿主源码只读挂载，在临时容器独立安装依赖和构建，报告写入 artifacts。设置 `BIGFISH_LINUX_BROWSER=1` 还会安装 Chromium 及容器内依赖，并运行浏览器回归。

原生 Host 需要相邻的已构建 Harness：

```sh
pnpm probe:harness ../../deepseek-harness
pnpm smoke:native /path/to/npm-dsh-package dist/dsh-bigfish-0.6.0-next.1.tgz
pnpm smoke:native ../../deepseek-harness dist/dsh-bigfish-0.6.0-next.1.tgz
```

smoke 使用隔离 DSH_HOME 和无密钥本地 LlmAdapter，不向日常模型提交任务。测试目录、聊天和日志不会进入交付包。
