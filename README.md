<div align="center">

# 🐋 大肥鱼 · DSH Bigfish

**让等待 Agent 工作的时间，多一只陪着你的大肥鱼。**

她会敲键盘、翻书、修工具、举牌等你，也会在任务结束时开心收工。<br>
一个装在 **DeepSeek Harness Web** 里的可拖动宠物，支持替换角色、制作动作和自定义台词。

[npm 安装](#快速安装) · [观看录屏](https://github.com/gosomea/dsh-bigfish/blob/main/docs/media/bigfish-demo.mp4) · [制作自己的角色](#做一只属于你的宠物)

**活泼陪伴、随时安静 · 鞭策随时关闭 · 角色包自由替换**

</div>

## 快速安装

需要已经安装 **DeepSeek Harness（DSH）**，并使用它的 Web 界面。当前 npm 版本为 **0.5.1**（体验版）；本地开发版 **0.5.2** 的动画与文案改进见 [本轮说明](docs/review-0.5.2.md)。完整原生安装已验证 DSH `0.1.5-rc.1` / `0.1.5-rc.2`。Node 要求 `^22.19.0 || >=24.0.0`。

直接从 npm 安装到你使用的 Web profile，无需下载源码或手动构建：

```sh
dsh plugin --profile web add dsh-bigfish
dsh --profile web
```

打开或刷新 dsh-web，右下角就能找到她。`web` 请换成你的实际 profile 名称。

**插件里还附带 `dsh-bigfish-pet-maker` Skill，可用来制作、替换和扩展角色包。** 想启用它，再执行一次：

```sh
npx --yes dsh-bigfish install-skill
```

安装后新建 DSH 会话，即可让 Agent 使用 `$dsh-bigfish-pet-maker` 制作新角色或扩展动作，再从「完整设置 → 角色库」导入生成的 `.dshpet`。详见[角色制作示例](#做一只属于你的宠物)。

[详细安装、升级与卸载](https://github.com/gosomea/dsh-bigfish/blob/main/docs/installation.md) · [常见问题](https://github.com/gosomea/dsh-bigfish/blob/main/docs/faq.md) · [npm 包页面](https://www.npmjs.com/package/dsh-bigfish)

## 动画展示

![大肥鱼实际动画：举牌等候、打字、空挥联动与工具执行](https://raw.githubusercontent.com/gosomea/dsh-bigfish/main/docs/media/bigfish-demo.gif)

> 本节 GIF 和下面的录屏来自插件自带预览：使用实际宠物渲染与动画，任务和速度由演示数据驱动。只录制宠物区域，不包含聊天内容。社区独立项目，非 DeepSeek 官方产品。

## 她会做什么？

| 当你…… | 大肥鱼会…… |
| --- | --- |
| 还没开始工作 | 举牌打个招呼，然后安静陪着；也可以设置为偶尔互动 |
| 提交任务、等待首段输出 | 立即切换到工作准备状态，不再举着“我在等哦” |
| 看着模型输出 | 敲键盘、思考，跟随当前模型的相对速度调整节奏 |
| 让 Agent 读文件、搜索、执行工具 | 切换相应动作，在气泡里显示工具状态和可自定义的台词 |
| 需要确认或补充输入 | 停下来等你，不再催促输出 |
| 完成、取消或遇到错误 | 给出不同反馈；完成演出后回到休息 |

**不喜欢鞭策？关掉就好。** 齿轮里取消「启用鞭策动作」，鞭子及配套躲闪会一起关闭，正常工作动画继续。开启时只做非接触空挥，不会打到角色；默认静音。

## 先看看她

下面是宠物区域的使用截图，气泡、状态和控制按钮都是实际插件界面。

<table>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/gosomea/dsh-bigfish/main/docs/media/waiting.png" width="330" alt="举牌等候的大肥鱼"><br><b>我在等哦</b><br>首次问候后安静陪伴</td>
<td align="center"><img src="https://raw.githubusercontent.com/gosomea/dsh-bigfish/main/docs/media/working.png" width="330" alt="大肥鱼打字，气泡显示输出状态和速度"><br><b>认真开工</b><br>气泡、速度和状态放在一起</td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/gosomea/dsh-bigfish/main/docs/media/tools.png" width="330" alt="大肥鱼执行工具时的修理动作"><br><b>工具也有动作</b><br>执行期间暂停空挥</td>
<td align="center"><img src="https://raw.githubusercontent.com/gosomea/dsh-bigfish/main/docs/media/dark.png" width="330" alt="关闭鞭策后的深色模式大肥鱼"><br><b>夜里也陪着你</b><br>跟随明暗主题，鞭策可以关闭</td>
</tr>
</table>

**[▶ 观看 / 下载完整 MP4 录屏](https://github.com/gosomea/dsh-bigfish/blob/main/docs/media/bigfish-demo.mp4)**：举牌 → 工作 → 速度变化 → 调用工具 → 等待确认 → 完成 → 关闭鞭策 → 深色模式。无需声音也能看懂。

### 不止是一张会晃的贴纸

内置大肥鱼有 **29 类动作、72 个绘制姿态、6 个场景、5 种举牌演出**。阅读、工具操作、打字、等待确认等使用连续图像帧；部分动作结合程序位移与场景道具。72 个姿态不等于 72 套独立动画。

最近精修了喝茶、擦汗和伸懒腰，让动作有准备、过程和收尾：

<img src="https://raw.githubusercontent.com/gosomea/dsh-bigfish/main/docs/media/daily-motions.gif" width="400" alt="大肥鱼连续分帧动作：捧杯喝茶、擦汗、伸懒腰">

动作可以在「完整设置 → 角色库」逐个预览，内置大肥鱼也支持。

## 按你的习惯陪伴

- **想看更多互动**：新安装默认「经常互动 + 活泼」，每 20–40 秒来一次举牌或生活小动作；动作展示 12 秒、气泡最多 6 秒。工作时动作完整播放，空挥后保持恢复姿态 2.5 秒。已有设置保留，不强制改动。
- **想安静一点**：选择「安静陪着」，首次问候后不反复举牌、换台词。空闲互动、动作表现和说话频率分别控制。
- **想热闹一点**：开启偶尔互动或更活泼的动作。完整设置里可直接预览行为，先看再选。
- **不喜欢鞭策**：关闭「启用鞭策动作」。设置会保存，刷新或换角色后继续生效。
- **挡住内容了**：拖动宠物或气泡换位置；点 `−` 收起为图标，图标同样可以拖动。支持调整大小和透明度。
- **想换句台词**：在「自定义台词与工具」编辑工作、等待、完成等台词，给工具名称或前缀配置专属规则。
- **想换设备**：「完整设置 → 备份与恢复」导出角色、偏好、台词和编排。导入时先检查并预览，再确认恢复。

**不同模型，不用同一把尺子。** 自动模式按 provider、model、推理配置和统计通道分别学习速度，适配约 20～400 tok/s 等不同量级。显示的 `≈ tok/s` 是估算值；工具等待、首段等待不会简单算成“输出太慢”。可选择“慢了催一催”或“跟着输出节奏动”，也可手动设定目标。

**多个会话同时工作时，跟随你当前打开的会话。** 不叠加后台速度，后台完成不会抢走前台状态；当前会话空闲时，宠物也保持空闲。刷新历史记录不会重播庆祝。

[陪伴与设置说明](https://github.com/gosomea/dsh-bigfish/blob/main/docs/settings-v2.md) · [台词与工具扩展](https://github.com/gosomea/dsh-bigfish/blob/main/docs/dialogue.md) · [备份与恢复](https://github.com/gosomea/dsh-bigfish/blob/main/docs/backup-and-storage.md)

## 做一只属于你的宠物

Bigfish 支持可替换的 **`.dshpet` 角色包**。角色包可以有比内置大肥鱼更多的动作，自定义动作 ID、标签、连续帧、台词和道具，不需要修改插件代码。

1. 在「完整设置 → 角色库」导入 `.dshpet` 或兼容 ZIP。
2. 先预览角色和每个动作，再安装并使用。
3. 切换角色时保留你的陪伴偏好；已安装版本可保留并切换。

Release 另附 **大肥鱼 · 成年版**：沿用原始鲸鱼女仆形象，保留尾巴与围裙标志，包含 8 组动作。

### 用一个 Skill 和 Agent 一起做角色

npm 包已经包含完整 Skill，不必另下 ZIP：

```sh
npx --yes dsh-bigfish install-skill
```

默认安装到 `$DSH_HOME/skills/dsh-bigfish-pet-maker`；未设置 `DSH_HOME` 时使用 `~/.dsh/skills/dsh-bigfish-pet-maker`。已有相同内容会跳过，不同内容会保留并提示，不会覆盖你的修改。安装 Skill 后请新建 DSH 会话；宠物插件本身的安装不会自动修改技能目录。

其他 Agent 可使用 `npx --yes dsh-bigfish install-skill --skills-dir /absolute/path/to/agent/skills` 指定技能目录。也保留 [独立 Skill ZIP](https://github.com/gosomea/dsh-bigfish/releases/download/v0.5.0/dsh-bigfish-pet-maker-1.0.2.zip) 供手工安装。具体宿主的技能目录和发现方式请以其配置为准。

然后直接和 Agent 说：

> 用 $dsh-bigfish-pet-maker 做一只蓝色小狐狸。平时安静，工作时认真。设计打字、读书、搜索、执行工具、等确认、举牌和完成庆祝，再加一些狐狸自己的小动作。交付能导入 DSH 的角色包和预览。

也可以给现有角色加动作：

> 用 $dsh-bigfish-pet-maker 扩展这个角色包，增加喝茶、整理文件和测试完成的动作。保持角色外观一致，保留原有动作，升级角色包版本。

Skill 包含模板、校验器、素材组装、离线预览和打包工具。生成新美术需要 Agent 自身具备图像生成能力；也支持使用已有素材。角色包遵守文件、像素和帧数量上限，加载时不会执行包内脚本或请求远程素材。

[角色包使用指南](https://github.com/gosomea/dsh-bigfish/blob/main/docs/pet-pack/user-guide.md) · [角色包协议](https://github.com/gosomea/dsh-bigfish/blob/main/docs/pet-pack/spec.md) · [Skill 源码](https://github.com/gosomea/dsh-bigfish/blob/main/skills/dsh-bigfish-pet-maker/SKILL.md)

## 从源码运行

```sh
git clone https://github.com/gosomea/dsh-bigfish.git
cd dsh-bigfish
pnpm install --frozen-lockfile
pnpm build
pnpm preview
```

打开 `http://127.0.0.1:4178`。构建也会生成 `dist/preview.html` 和成年版角色包。

检查与打包：

```sh
pnpm check
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm pack --pack-destination dist
python3 scripts/package-release.py
```

Node `^22.19.0 || >=24.0.0`，pnpm `11.7.0`。原生接入探针需要另行准备已构建的 DSH 源码；详情见 [兼容性与验证](https://github.com/gosomea/dsh-bigfish/blob/main/docs/compatibility.md)。录屏复现方法见 [媒体说明](https://github.com/gosomea/dsh-bigfish/blob/main/docs/media/README.md)。

## 验证与边界

0.5.0 已完成 macOS 的 108 项单元测试和 28 项浏览器回归；Linux arm64 的 Node 22.19.0 / 24.21.0 干净安装、构建和单元测试，Node 24 另跑了浏览器回归。两版 DSH 完成原生安装、实时任务、多会话、备份恢复及卸载检查；另有约 30 分钟、180 轮切换的渲染生命周期检查。

这不代表所有平台都已支持：Windows、x86、Safari / Firefox、网络共享文件系统及跨天运行尚未完成验证。共享同一 `DSH_HOME` 的多个实例需要全部升级到支持跨进程锁的版本。备份恢复包含冲突保护与回滚，但跨 Host 和浏览器存储不构成一个整体原子事务。

[验证范围](https://github.com/gosomea/dsh-bigfish/blob/main/docs/compatibility.md) · [五项优化审查](https://github.com/gosomea/dsh-bigfish/blob/main/docs/review-0.5.0.md) · [架构](https://github.com/gosomea/dsh-bigfish/blob/main/docs/architecture.md) · [动作设计](https://github.com/gosomea/dsh-bigfish/blob/main/docs/scene-packs.md) · [速度自适应](https://github.com/gosomea/dsh-bigfish/blob/main/docs/adaptive-speed.md)

## 许可与素材

代码采用 [MIT](https://github.com/gosomea/dsh-bigfish/blob/main/LICENSE)。角色美术和标志另见 [NOTICE](https://github.com/gosomea/dsh-bigfish/blob/main/NOTICE) 与 [素材来源](https://github.com/gosomea/dsh-bigfish/blob/main/docs/asset-provenance.md)：原始参考图作者尚未确认，代码许可不代表对第三方角色或商标权利的授权。本仓库不包含用户原始参考截图、聊天记录或模型凭据。
