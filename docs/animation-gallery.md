# 大肥鱼 · 新增动画目录

安装 `dsh-bigfish` 稳定版后，新动画直接加入内置大肥鱼。打开「完整设置 → 角色库 → 大肥鱼 · 内置 → 预览」，可查看原有 29 类和新增 72 段，共 101 类动作。新增每段六个关键姿态，共 432 个新绘制姿态。

![实际 Canvas 动画预览：翻牌、分饼干、折纸鱼、找线索、画画与庆祝](https://raw.githubusercontent.com/gosomea/dsh-bigfish/main/docs/media/playful-motions.gif)

下面的动作名称和 ID 来自角色包的 `animations.json`；标签决定哪些任务状态可以使用该动作。预览可以查看所有动作，实际轮转还会遵守动作档位、冷却时间与互动预算。

## 举牌等你 · 13 段

| 动作 | 对应状态标签 | 动作 ID |
| --- | --- | --- |
| 牌子拿反了 | greeting, idle | `bigfish:sign-flip` |
| 值班鲸鱼盖章 | greeting, idle | `bigfish:sign-stamp` |
| 尾巴当支架 | greeting, idle | `bigfish:sign-tail-stand` |
| 小幕布揭牌 | greeting, idle | `bigfish:sign-curtain` |
| 纸飞机送信 | greeting, idle | `bigfish:sign-paper-plane` |
| 弹出式请帖 | greeting, idle | `bigfish:sign-pop-up` |
| 牌子太大了 | greeting, idle | `bigfish:easter-oversized-sign` |
| 拼出等候牌 | greeting, idle | `bigfish:sign-puzzle` |
| 翻到等你这一页 | greeting, idle | `bigfish:sign-calendar` |
| 折叠小横幅 | greeting, idle | `bigfish:sign-origami` |
| 气球托起牌 | greeting, idle | `bigfish:sign-balloon` |
| 擦干净再举牌 | greeting, idle | `bigfish:sign-chalkboard` |
| 口袋里掏出小牌 | greeting, idle | `bigfish:sign-pocket` |

## 日常陪伴 · 12 段

| 动作 | 对应状态标签 | 动作 ID |
| --- | --- | --- |
| 擦亮尾巴 | greeting, idle | `bigfish:tail-polish` |
| 分你半块饼干 | greeting, idle | `bigfish:biscuit-share` |
| 追一颗泡泡 | greeting, idle | `bigfish:bubble-chase` |
| 给尾巴铺小窝 | greeting, idle | `bigfish:pillow-nest` |
| 整理鲸鱼徽章 | greeting, idle | `bigfish:badge-care` |
| 折一只纸鱼 | greeting, idle | `bigfish:paper-fish` |
| 浇一盆小水草 | greeting, idle | `bigfish:water-plant` |
| 梳梳尾巴边 | greeting, idle | `bigfish:tail-comb` |
| 织一条鲸鱼围巾 | greeting, idle | `bigfish:knit-scarf` |
| 荷叶小伞 | greeting, idle | `bigfish:leaf-umbrella` |
| 听听贝壳 | greeting, idle | `bigfish:easter-shell-listen` |
| 画一张小自画像 | greeting, idle | `bigfish:easter-self-portrait` |

## 开工与思考 · 12 段

| 动作 | 对应状态标签 | 动作 ID |
| --- | --- | --- |
| 便签打字 | writing, working | `bigfish:typing-notes` |
| 拼起思路 | thinking, working | `bigfish:thinking-puzzle` |
| 挽袖开工 | start | `bigfish:typing-sleeves` |
| 草稿演算 | thinking, working | `bigfish:thinking-scratchpad` |
| 尾巴打拍子 | writing, working | `bigfish:typing-tail-rhythm` |
| 整理便签 | thinking, working | `bigfish:notes-sort` |
| 算盘推演 | thinking, working | `bigfish:thinking-abacus` |
| 观察沙漏 | thinking, working | `bigfish:thinking-sandglass` |
| 书堆找答案 | read, working | `bigfish:read-books-sort` |
| 画一张路线图 | thinking, working | `bigfish:thinking-flowchart` |
| 齿轮咔哒转 | thinking, working | `bigfish:thinking-gears` |
| 蘸墨写草稿 | writing, working | `bigfish:writing-ink` |

## 工具执行 · 12 段

| 动作 | 对应状态标签 | 动作 ID |
| --- | --- | --- |
| 阅读夹书签 | read, working | `bigfish:read-bookmark` |
| 放大镜找线索 | search, working | `bigfish:search-magnifier` |
| 铅笔修改 | edit, working | `bigfish:edit-pencil` |
| 启动小控制台 | command, working | `bigfish:command-lever` |
| 测试巡检 | test, working | `bigfish:test-checklist` |
| 整理交付包 | export, working | `bigfish:export-parcel` |
| 望远镜看网页 | web, working | `bigfish:web-telescope` |
| 调色画画 | image, working | `bigfish:image-palette` |
| 小导演带队 | agent, working | `bigfish:agent-director` |
| 多任务分篮 | parallel, working | `bigfish:parallel-trays` |
| 看守小生态箱 | background, working | `bigfish:background-terrarium` |
| 打包小行李箱 | export, working | `bigfish:export-suitcase` |

## 等待与任务结果 · 12 段

| 动作 | 对应状态标签 | 动作 ID |
| --- | --- | --- |
| 把选择递给你 | attention | `bigfish:attention-choice` |
| 轻摆提示铃 | attention | `bigfish:attention-bell` |
| 鲸鱼验收章 | success | `bigfish:success-whale-stamp` |
| 开心收工 | success | `bigfish:success-desk-tidy` |
| 戴眼镜排查 | error | `bigfish:error-inspect` |
| 清理后再试 | retry | `bigfish:retry-reset` |
| 交付小礼物 | success | `bigfish:success-ribbon` |
| 纸花庆祝 | success | `bigfish:success-paper-confetti` |
| 检查小接线 | error | `bigfish:error-cable-check` |
| 递来确认信 | attention | `bigfish:attention-envelope` |
| 擦掉重画 | retry | `bigfish:retry-eraser` |
| 困惑地图 | error | `bigfish:error-question-map` |

## 彩蛋 · 6 段

| 动作 | 对应状态标签 | 动作 ID |
| --- | --- | --- |
| 小鲸鱼敬礼 | greeting, idle | `bigfish:easter-badge-salute` |
| 转椅半圈 | greeting, idle | `bigfish:easter-chair-spin` |
| 上发条小鲸鱼 | greeting, idle | `bigfish:windup-whale` |
| 贝壳小把戏 | greeting, idle | `bigfish:shell-juggle` |
| 泡泡落在头上 | greeting, idle | `bigfish:easter-bubble-hat` |
| 纸鱼小船队 | greeting, idle | `bigfish:easter-paper-fleet` |

## 空挥反应 · 5 段

| 动作 | 对应状态标签 | 动作 ID |
| --- | --- | --- |
| 先保住茶杯 | near-miss | `bigfish:near-miss-protect-tea` |
| 尾巴先收好 | near-miss | `bigfish:near-miss-tail-hide` |
| 深吸气再开工 | near-miss | `bigfish:near-miss-determined` |
| 扶好眼镜再写 | near-miss | `bigfish:near-miss-glasses` |
| 眨眼稳住节奏 | near-miss | `bigfish:near-miss-startle` |

## 五个基础回退动作

安静眨眼、稳定打字、等待确认、成功收工、困惑检查。它们复用已有美术，不计入 72 段新动画。

举牌和日常动作可以停留再收尾；彩蛋至少间隔十分钟。空挥只在角色身旁发生，关闭「启用鞭策动作」会同时关闭五种对应反应。

[返回 README](../README.md) · [版本说明](release-notes-0.6.0-next.1.md) · [角色包协议](pet-pack/spec.md)
