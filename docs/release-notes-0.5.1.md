# 0.5.1 · npm 快速安装与角色制作 Skill

## 快速安装

```sh
dsh plugin --profile web add dsh-bigfish
dsh --profile web
```

这是 Bigfish 的首个 npm 版本，沿用 0.5.0 的宠物动画和交互。无需手动下载 tarball 或构建源码。

## 启用随包 Skill

```sh
npx --yes dsh-bigfish install-skill
```

将完整 `dsh-bigfish-pet-maker` 安装到 `$DSH_HOME/skills` 或 `~/.dsh/skills`；支持 `--skills-dir` 指定其他 Agent 的技能目录。安装会校验所有文件、协调并发安装，重复执行相同内容会跳过，不会覆盖已有修改。npm 安装本身不写入用户技能目录。

在 DSH 新建会话后可以说：

> 用 $dsh-bigfish-pet-maker 制作一只新的桌面宠物，或给现有角色包增加动作。保留已有角色外观，交付新版 .dshpet 和可检查的预览。

生成的角色包在宠物「完整设置 → 角色库」导入。动作可以超过内置预设；绘制新素材需要 Agent 具备图像生成能力。

## 分发调整

- 配置公开 npm 包名、仓库、问题反馈与 CLI 入口。
- README 将 npm 安装置于首选，明确内置 Skill 的启用与扩展方式。
- README 媒体改为完整 GitHub 地址，供 npm 页面显示。
- npm 安装包保留运行时、角色制作 Skill、协议文档和成年版素材；展示 GIF / MP4 和重复图集由 GitHub 提供，减少下载体积。
- 打包前自动执行类型检查与构建，避免发出缺少编译产物的包。

此前平台与生命周期验证范围仍见 [兼容性](compatibility.md)，原始参考及素材声明仍见 [NOTICE](../NOTICE)。
