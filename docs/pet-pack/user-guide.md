# 可替换角色与角色制作 Skill

打开宠物齿轮 → 完整设置 → 角色库；或在 dsh 插件设置中展开角色库。

1. 选择 `.dshpet` / `.zip` 文件。
2. 导入预览显示角色信息、全部动作列表和兼容回退说明。
3. 可以逐个检查包括预设以外的动作；选择“安装并使用”。
4. 已安装的各版本保留在库里，点击“使用”切换；选中旧版本即可回退。

切换保留大小、位置、空闲频率、声音偏好和自定义台词。当前版本不能移除；先切到别的角色再移除。Host 库跨浏览器共用，演示页的库仅在该浏览器保存。内置 JSON 编排入口位于“高级与重置 → 内置大肥鱼动作编排（JSON）”，仅作用于大肥鱼。

动作可以多于大肥鱼的 29 类预设；没有按大肥鱼数量截断的逻辑。协议允许最多 2048 个动作（另有文件大小/像素/帧引用上限）。角色制作成本和实际姿态变化由作者决定，不能用重复别名虚报新动作。

随版本交付的“大肥鱼 · 成年版”沿用原始鲸鱼女仆造型，保留尾巴与围裙标志，提供 8 组动作；包为 `dist/bigfish-adult-1.0.0.dshpet`。


## 和 Agent 制作角色

插件的 npm 包已包含完整 Skill，推荐一条命令安装：

```sh
npx --yes dsh-bigfish install-skill
```

默认使用 `$DSH_HOME/skills` 或 `~/.dsh/skills`；其他 Agent 可通过 `--skills-dir /absolute/path/to/skills` 指定目录。相同内容跳过，不同内容不会覆盖；重新启用已修改的 Skill 前请先备份。

也可以将 `dsh-bigfish-pet-maker` Skill 文件夹手动放入 Agent 的技能目录。DSH 用户目录为 `~/.dsh/skills/dsh-bigfish-pet-maker`；Codex 本地可发现目录为 `~/.codex/skills/dsh-bigfish-pet-maker`。具体宿主是否需要新会话刷新技能列表，取决于其技能发现机制。

可直接说：

> 用 $dsh-bigfish-pet-maker 做一只蓝色小狐狸。默认安静，工作时认真。加上读书、画画、整理文件、等确认、举牌和完成庆祝，再设计一些符合狐狸性格的动作。交付能导入 DSH 的角色包和预览。

扩充已有角色：

> 用 $dsh-bigfish-pet-maker 给这个包增加 15 个有明显不同姿态的动作，包括搜索、测试和部署。保留已有外观和动作，升级版本，不修改插件代码。

Skill 带五类动作的 starter、权威校验器、图集组装工具、离线预览、ZIP 打包和 Codex 格式转换说明。新美术使用宿主提供的图像生成工具；没有生成能力时可以加工现有素材，但不能假装已生成角色。

## 命令工具

Node 22.19+ 或 24+；Python 素材组装需要 Pillow。以下命令相对 Skill 文件夹运行：

```sh
node scripts/pet-tool.mjs validate assets/starter
node scripts/pet-tool.mjs build assets/starter /absolute/output/my-pet.dshpet
node scripts/pet-tool.mjs preview /absolute/output/my-pet.dshpet /absolute/output/preview.html
```

校验成功之后还需在浏览器打开预览检查实际动画。`preview` 离线工作，不调用模型。制作源文件和验证报告应另外保留，供后续增量改动作。

## 1.0 的明确范围

- 任意动作 ID、标签、连续帧、可选背景、牌面文字、角色台词与非接触空挥反应。
- 动作强度标签控制候选素材；每个角色自行提供真实的轻柔/自然/活泼变体。程序不强行变形自定义帧。
- 新角色空挥目前无声。原有声音设置保留，大肥鱼继续支持音效。
- Codex 已知 v1/v2 图集可导入；v2 的方向帧可预览，尚未自动跟随鼠标。完整 Codex v2 导出需要真实齐全的目标行和方向素材。
- 图片使用透明 PNG/WebP，暂不加载 Live2D、视频、可执行脚本或远程资源。

制作标准：[spec.md](spec.md)。
