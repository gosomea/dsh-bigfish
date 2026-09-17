# 兼容性与验证范围 · 0.5.0

本版本面向首版体验发布。实际验证与计划验证分开记录，最终时间、数量、安装包 SHA256 见 `dist/verification-0.5.0.json`。

| 环境 | 本轮覆盖 | 尚未覆盖 |
| --- | --- | --- |
| macOS Apple Silicon，Node 24.19.0，pnpm 11.7.0 | 类型检查、单元、Playwright Chromium、DSH 原生安装/升级/会话/角色库/备份/卸载、日常 3080 实例 | Safari、Firefox、Intel Mac |
| Linux arm64，Debian bookworm 容器，Node 22.19.0 | 锁文件干净安装、类型检查、完整构建、单元测试（含多进程锁/异常退出/恢复冲突）、构建后 Host ESM 导入 | Linux 原生 DSH Web Host 完整联调 |
| Linux arm64，Debian bookworm 容器，Node 24.21.0 | 同上，另跑真实 Chromium 浏览器回归；Docker 镜像由实际拉取的 Node 24 tag 提供 | Linux 原生 DSH Web Host、x86_64、NFS/SMB |
| Windows | 已提供下方可复现命令 | 本轮无可用 Windows 执行环境，没有通过结论 |

原生 DSH 实测两版：日常本地构建 `0.1.5-rc.2`（`c291e7961a515f6d7af9304e7fd1d257929aef26`），以及从本地 Git 标签隔离构建的 `0.1.5-rc.1`（`183f08e9c6dde7e36cd2318eaee70b0da08fb35e`）。两版均执行公开类型探针和 tarball 原生安装/双会话/角色/备份/卸载检查；更早的 rc/alpha 不推定兼容。

## 测试范围

- 速度 20/100/400 自适应、计数去重、任务优先级、设置失败恢复、角色包校验、动作循环边界、关键状态抢占、一次性动作不重播、播放时钟连续。
- 原生多会话：两个实际 Host turn 同时运行，前台切换及后台结束隔离；历史恢复不重新计数。
- 角色与设置：明暗主题、窄屏、整体和图标拖动、内置/外部预览、角色切换后固定站位、关闭鞭策立即停止；备份导出/预览/确认/刷新、坏文件和跨窗口冲突。
- 存储：独立 Node 进程共享目录写入，符号链接指向同目录，持锁进程被杀后恢复，批量新增失败不发布半份目录。旧版本 Host 不识别锁，因此共享同一 Home 的实例应一并升级。
- `scripts/soak.ts` 默认 1800 秒真实墙钟（非虚拟快进），轮换任务状态、内置/成年版、折叠恢复；持续采样 GC 后堆、DOM 与 Canvas。最终报告保存实际时长和增长比例。这个时长不等于跨天无泄漏证明。

Linux 报告为 `artifacts/linux-node22.19.0.json`、`artifacts/linux-node24.json`；原生报告为 `artifacts/native-smoke*.json`（rc.1 专项为 native-smoke-rc1-050.json）；soak 为 `artifacts/soak.json`；日常实例为 `artifacts/daily-050.json`。不要用历史报告代替本轮结果。

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
pnpm smoke:native ../../deepseek-harness dist/dsh-bigfish-0.5.0.tgz
pnpm smoke:native ../../deepseek-harness dist/dsh-bigfish-0.5.0.tgz dist/dsh-bigfish-0.4.3.tgz
```

smoke 使用隔离 DSH_HOME 和无密钥本地 LlmAdapter，不向日常模型提交任务。测试目录、聊天和日志不会进入交付包。
