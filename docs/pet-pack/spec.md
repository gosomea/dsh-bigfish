# DSH Pet Pack 1.0

状态：随 dsh-bigfish 0.3.0 发布的可执行协议。权威校验源码：`src/pet/contract.ts`、`src/pet/archive.ts`。Skill 中的 `scripts/pet-core.mjs` 由构建脚本生成，禁止手改。协议和角色版本分开，现有 ScenePack v1 继续作为大肥鱼专用动作编排。

## 文件

`.dshpet` 是 ZIP，也接受 `.zip`。根目录必须有 `pet.json`；图片仅 PNG/WebP，JSON 仅数据，路径只允许英文字母、数字、下划线、横线、点和目录分隔符。无绝对路径、`.`/`..`、重复路径、链接和加密文件。支持 stored/deflate，不支持 ZIP64。所有资源在包内，不执行任何代码。

压缩包 ≤32 MiB，展开 ≤64 MiB，≤256 文件，单个 JSON ≤4 MiB；1–64 张资源图片，单边 ≤8192，总资源像素 ≤32 Mi；缩略图 ≤32 Mi 像素。≤2048 动作，单动作 ≤512 帧，总帧引用 ≤32768。这些是资源保护边界，不是大肥鱼的预设数量限制。帧序列可任意复用图集中的矩形。

## pet.json

```json
{
  "format": "dsh-pet", "formatVersion": 1,
  "id": "my-robot", "name": "小机器人", "version": "1.0.0",
  "author": "作者", "description": "角色说明",
  "canvas": {"width": 128, "height": 144},
  "assets": {"main": {"path": "atlas.png", "width": 1024, "height": 720}},
  "thumbnail": "thumbnail.png", "animations": "animations.json",
  "fallbacks": {"idle": "idle", "working": "work", "attention": "wait", "success": "done", "error": "error"},
  "dialogue": "dialogue.json", "capabilities": []
}
```

这是清单示例，必须配合真实存在且尺寸匹配的资源与五类动作。id/动作/标签是 1–100 位 `[a-zA-Z0-9][a-zA-Z0-9_.:-]*`，`bigfish-classic` 为保留 ID。version 为三个非负整数段。name ≤60 字符，author ≤100，description ≤500，均非空。

canvas 每边 32–2048；所有角色帧矩形大小必须等于 canvas。制作阶段将不同姿态对齐到相同画布，保留完整角色和道具、不截去极端帧。运行时按整个画布等比例放入舞台，气泡在舞台外。动作中的落脚位置由素材对齐保证；1.0 不接受任意骨骼或逐帧缩放脚本。

`capabilities` 可为 `sign`（需牌面）、`air-swing`（需 near-miss 动作）、`scenes`、`look`（Codex 方向帧保留与预览）。未知必要能力拒绝导入。当前 look 帧可以逐个预览，未启用鼠标自动视线跟随。未知清单附加字段忽略；增加破坏性要求必须升级 formatVersion。

## animations.json

顶层数组，每项例如：

```json
{
 "id": "robot:read-manual", "label": "翻阅手册",
 "tags": ["read", "working"], "intensity": 1,
 "loop": true, "weight": 1, "cooldownMs": 12000,
 "speed": [0.8, 1.3],
 "frames": [
  {"asset": "main", "rect": [0, 0, 128, 144], "durationMs": 160},
  {"asset": "main", "rect": [128, 0, 128, 144], "durationMs": 240}
 ]
}
```

动作 ID 不受内置枚举约束。tags 必须有 1–32 项。intensity 为 0/1/2，表示允许在轻柔/自然/活泼开始出现。五个 fallback 都必须存在、含同名 role 标签、intensity=0。减弱动态显示当前 role fallback 的第一帧；因此成功 fallback 的第一帧也要有可识别语义。

frame.durationMs 为 16–10000；weight 为 0.01–100；cooldownMs 为 0–3600000；speed 是活动强度从 0 到 1 时的播放倍率范围，0.5–2，默认 [1,1]。场景可用动作可选字段 `scene` 指向清单 `scenes` 中的一项 `{ "asset": "backgroundAssetId" }`，背景整张图适配舞台。

role：idle、working、attention、success、error。常见 tags：greeting、thinking、writing、read、search、edit、command、test、web、parallel、tool、image、export、background、agent、near-miss。作者可以增加 `vendor:semantic` 等命名空间标签；未来事件通过 semantic 选择它，无匹配时退回 working 或其他当前 role。

待机与用户确认分开；取消/中断退回安静，失败/断线/重试/未知结束退回 error，不播放成功。quiet 待机固定 idle fallback，不定时轮换。空闲互动预算到达时才从 greeting 候选选取，遵守最大 6 秒；静默期间再多动作也不轮播。正式运行自然档至少约 12 秒切换，活泼档至少约 6 秒；到期后等待循环边界。一次性动作 loop:false 播完后保持末帧，不因定时轮换重新播放同一 ID。工具语义变化等待当前循环边界，最长 1.2 秒；一次性动作最长等待 6 秒。确认、失败、完成、取消等角色状态切换及用户改变动作设置立即响应，并优先于残留工具标签。播放时钟累积速度变化，恢复后台页面不追赶暂停时间。选择会优先避开最近 3 个动作，候选不足时按冷却和当前动作回退。逐个动作预览允许完整展示所有强度，与实际设置的策略预览区分。

可选 frame.sign：`{"x":25,"y":88,"width":78,"height":18,"angle":0}`，角色画布内的文字矩形，角度 -45..45。素材中的牌面应为空白；文字由程序绘制，最多显示 20 字符并适配宽度。字体/文字颜色由插件统一提供，1.0 不支持透视变形。举牌角色不用绑定大肥鱼的手/尾巴结构。

near-miss 是专用互动反应标签，不进入普通工作动作随机池；作者不要把五类角色回退指向 near-miss，应提供无鞭策也能独立工作的普通素材。明确点选该素材的预览仍可查看。near-miss 按空挥统一时间轴播放完整反应帧。角色全帧固定在 x≥124，绳子及线宽固定裁剪到 x≤103，始终保留空隙。未声明互动能力或被用户关闭时不显示绳子。声明 air-swing 的角色始终保留同一绘制区域，关闭互动或降低动作档位不会改变站位和尺寸。绳子与内置角色共用绘制与节拍；建议 0–26% 准备、26–46% 察觉、46–72% 躲避、72–100% 恢复。1.0 新角色不带自定义音效，保留原有声音偏好供大肥鱼使用。

## dialogue.json

对象，键为事件类别，值为最多 30 条非空短句，每句 ≤160 字符。支持 `{tool}`、`{file}`、`{elapsed}`、`{activeCount}`、`{completedCount}`。当前显示类别与插件一致：idle/start/thinking/writing/read/search/edit/command/test/web/parallel/tool/waiting/error/complete/stopped/image/export/background/agent。未知键保留作未来扩展；不执行模板代码。

用户显式台词（包括 [] 关闭） > 当前角色台词 > 插件通用台词。切换不覆盖用户自定义。频率、静默、声音、位置、大小和速度基准仍归用户设置。

## 扩展事件

已有 `dsh-bigfish:activity` 的 detail 继续包含 version:1/sessionId/id/phase/category/label，增加可选 `semantic`（相同 ID 格式）。例如 category:"tool", semantic:"acme:deploy", label:"部署预览"；角色 tags:["acme:deploy","working"] 可响应它。没有匹配素材的旧角色仍显示事件文字并播放通用工作动作。事件只描述展示，不触发模型或工具。

## 导入、更新与保存

浏览器先校验并解码全部图片，再显示逐动作预览。安装写入 Host，使用操作单独选择；导入页提供“安装并使用”。Host 存放于 `$DSH_HOME/pets/dsh-bigfish`（未配置 DSH_HOME 时 ~/.dsh）。同一 Host 家目录的 profile 共用库，选中角色也共用。演示页使用 IndexedDB，标注浏览器本地。

id@version 唯一。同版本不同内容拒绝，更新请提升版本。多版本可同时保留，选择上一版本即回退。不能移除当前使用中的版本。切换加载失败保留当前角色和选择，不静默清空配置。其他浏览器在刷新或最多约 15 秒后同步。首次加载损坏的选择时保留内置角色并在角色库显示错误。

## Codex 适配

输入根目录 pet.json + spritesheetPath 指向图片；v1（省略 spriteVersionNumber 或=1）1536×1872，v2=2 为 1536×2288，均 192×208 单元格。适配器生成语义映射，不修改原图；v2 的 16 个方向帧作为扩展动作保留。工具专属动作、牌面、近失反应缺失时回退或关闭该能力。

双目标输出是条件能力：只有完整提供目标格式的所有标准行和 16 方向时，使用 Skill 的 export-codex 脚本组装 v2。不得把缺帧包标作完整 Codex v2。
