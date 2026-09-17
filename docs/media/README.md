# README 展示素材

此目录的 GIF、PNG 与 MP4 由插件自己的离线预览录制。渲染使用实际 Widget / FishCanvas、角色素材、气泡、设置和状态逻辑；任务与速度来自 DemoCompanion 的模拟数据，不是实时模型输出。只显示宠物及其气泡，不录制真实聊天页面。

- `bigfish-demo.gif`：README 首屏精华循环，剪辑举牌、打字、空挥、工具与完成的录屏片段；完整时间顺序保留在 MP4 中。
- `bigfish-demo.mp4`：完整工作流程录屏，H.264、无声、真实时间播放。
- `daily-motions.gif`：喝茶、擦汗、伸懒腰，使用动作预览逐个播放。
- PNG：宠物区域截图；深色图通过插件支持的宿主主题标志切换。
- `capture.json`：录制版本、日期、章节时间与数据来源。

录制在全新的隔离浏览器上下文进行，使用临时本地预览服务，不读取 DSH_HOME、用户 Cookie、聊天记录或模型密钥。录制页只隐藏预览控制区并设置背景 / 裁切范围，不修改角色图像、动画帧或工作气泡。演示使用自然动作档位、保留空闲气泡，先关闭鞭策展示打字，再打开演示联动，最后关闭；固定随机选择为首个符合条件的现有动作，方便复现；安装默认仍为安静陪伴。

## 重新录制

准备 Node / pnpm、Playwright Chromium 和支持 libx264 的 FFmpeg 后，在项目根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec playwright install chromium
node scripts/record-showcase.mjs
```

FFmpeg 默认从 PATH 查找，可用 `FFMPEG=/absolute/path/to/ffmpeg` 指定。原始视频仅写入被 Git 忽略的 `artifacts/showcase/`；压缩后的公开素材输出到此目录。重新录制后需检查 GIF、录屏和关键帧，确认没有角色裁切或界面遮挡。

角色素材来源及权利说明见 [素材来源](../asset-provenance.md) 和 [NOTICE](../../NOTICE)。本录屏不为派生角色新增独立的权利授权。
