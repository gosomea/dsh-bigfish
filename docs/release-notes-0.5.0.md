# 0.5.0 · 首个公开体验版

大肥鱼是 DeepSeek Harness Web 的可拖动宠物。根据当前会话的输出、工具执行、等待确认和任务结果播放动作，支持自定义台词与可替换角色包。

## 可以体验什么

- 默认安静陪伴，空闲互动、动作表现和说话频率独立设置。
- 内置 29 类动作、72 个绘制姿态；含举牌、打字、阅读、工具操作、喝茶、擦汗和伸懒腰。
- 按模型自适应速度；非接触空挥及配套反应可一键关闭。
- 跟随当前会话，多任务互不抢占；宠物和折叠图标均可拖动。
- 明暗主题、统一气泡、快捷 / 完整设置。
- 导入、逐动作预览和切换角色包；成年版大肥鱼及角色制作 Skill 单独提供。
- 完整备份恢复、冲突预览保护，以及共享 DSH_HOME 的跨进程角色库锁。

## 下载

| 文件 | 用途 |
| --- | --- |
| dsh-bigfish-0.5.0.tgz | 安装到 DSH Web profile 的插件 |
| preview.html | 无模型 API 的单文件离线预览；下载后用浏览器打开 |
| bigfish-adult-1.0.0.dshpet | 在角色库导入的成年版大肥鱼 |
| dsh-bigfish-pet-maker-1.0.2.zip | 用 Agent 制作与扩展角色的 Skill |
| dsh-bigfish-source-0.5.0.zip | 包含素材、源码、文档与测试的开发归档 |
| verification-0.5.0.json / SHA256SUMS-0.5.0 | 验证范围与文件校验值 |

安装：`dsh plugin --profile web add /absolute/path/to/dsh-bigfish-0.5.0.tgz`，再启动目标 Web profile。已运行旧版 Host 时，在任务空闲后重启并刷新页面。

## 已验证范围

macOS arm64 Node 24.19.0；Linux arm64 Node 22.19.0 / 24.21.0；DSH 0.1.5-rc.1 / 0.1.5-rc.2 原生安装。108 项单元、28 项浏览器回归，以及约 30 分钟渲染生命周期检查；详细范围见 [兼容性](compatibility.md)。公开展示材料与 README 在功能验证后补充，未改变运行时代码。

Windows、x86、Safari / Firefox、网络文件系统和跨天运行尚未验证。共享目录的所有写入实例需使用新版锁；跨存储域的备份恢复不保证断电等场景下整体回滚。角色美术说明见 [NOTICE](../NOTICE)。
