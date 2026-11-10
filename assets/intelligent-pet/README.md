# 智能宠物动作素材

本目录保留 32 段已生成的透明背景动作源图，共 256 帧，使用大肥鱼原始幼态身份：蓝色长发、鱼鳍耳、鲸鱼尾巴、女仆服与鲸鱼标志。没有用成年参考图替代身份。32 段包含原先的行走试作和本轮新增 31 段；镜像方向不另计数。

## 内容与验收

`catalog.json` 是动作名称、帧数和播放时长的来源；`production.json` 记录原 PNG 的 SHA256 与生成来源。`runtimeReviewed` 表示已验证加载、裁切和播放到末帧。32 段的全部 256 帧已逐帧检查并修正裁边，`artAccepted: true` 的范围为 `runtime-usability`（基础显示可用），不是最终美术定稿。`authorFinalApproval` 仍为 `pending`；蓝描边与生成帧之间的透视、比例变化仍保留，不能把基础可用检查理解为最终审美确认或骨骼动画精度。逐帧方法、修正与合成图见[验收记录](review/review.json)。

设置中的“智能宠物新动作”提供 32 段独立预览，支持深浅背景与减弱动态。浏览器检查会保存行走循环代表帧与其余单次序列的真实末帧截图；本地汇总为 `artifacts/companion/animation-gallery.html` 与 `runtime-32-contact.png`，这些测试证据不进入 npm 包。

## 日常触发入口

| 入口 | 素材 ID | 触发条件 |
| --- | --- | --- |
| 散步与回家路线 | `walk`、`start-step`、`turn`、`stop`、`tail-avoid`、`tiptoe`、`edge-peek` | 可安全行走时播放起停和步态，转向或抵达边缘时按需选择额外姿态。 |
| 回家按钮 | `recall` | 回家请求已接收，且本地互动可用时先回应。 |
| 本地互动 | `head-pat`、`ball-catch`、`fish-toy`、`tea`、`biscuit`、`tail-comb`、`wave` | 摸头、梳尾、分享、玩具或招手时播放，按功能开关、冷却和成长规则筛选。 |
| 小剧场与故事 | `point` | 纸箱、纸船或季节与成长故事的开场。 |
| 空闲生活 | `sit-down`、`stretch`、`lie-down`、`sleep`、`wake-up`、`nest`、`desk-tidy`、`lamp` | 按生活轮次、场景家具和空闲时长选择。睡眠需要一段稳定空闲。 |
| 会话事实与提醒 | `task-cards`、`confirm-card`、`book-close`、`postcard`、`success-bow`、`failure-check` | 管家提醒、请求确认及观察到的完成或失败。明信片依赖小窝能力。 |
| 思考、语音和图片 | `think`、`screen-read` | 思考状态的开场姿态，按住说话的收听提示，或用户分享图片后的查看姿态。 |

既有 101 类动作仍按场景、标签和强度决定候选，见 [经典编排](../../packs/classic/manifest.json)和[趣味动作定义](../../examples/bigfish-playful/animations.json)。同一候选池优先选择最久未播的动作。持续符合条件的动作在后续演出中会轮到，动作冷却、安静设置和任务抢占仍可推迟播放。

## 源图与运行资产

PNG 原图保留不变。WebP 是运行时编码版本，保持透明通道；源图约 62.1 MB，运行编码约 14.0 MB。生成图的帧间隔并非完全均匀，`frame-bounds.json` 记录实际取样矩形及排除邻帧的区域；播放器按整段序列统一缩放并使用共同落脚点，不修改原 PNG／WebP 像素。

在插件项目目录运行：

```sh
python3 scripts/encode-companion-clips.py
node --import tsx scripts/sync-companion-clips.ts
```

两个脚本分别转码并核对透明通道、同步编译导入。构建也会执行导入同步，不重新计算已验收的帧边界。`companion-frame-bounds.py` 仅用于重新提取基础矩形，会覆盖现有边界与排除区域；修改源图或重算矩形后，必须重新执行邻帧隔离并逐帧检查，不能直接沿用本次验收状态。躺下等相连姿态还包含已核对的手工区域。

外部角色使用自己的包内动作 ID，通过[角色包规范](../../docs/pet-pack/spec.md)中的语义映射接入。本开发版已实现 `life`、`home`、`voice-display` 和 `paired` 的运行时支持；缺少必要素材时明确降级，不借用这些内置素材假装具备能力。新增声明尚未发布到 npm 0.6.0，制作和安装前应核对插件版本。
