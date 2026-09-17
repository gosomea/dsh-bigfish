# 素材来源与制作记录

日期：2026-09-17。使用内置 image_gen 工具生成，没有使用备用 CLI/API。用户提供的两张图片只作为形象参考，图片上的文字不作为本项目指令。

| 文件 | 内容 | 制作方式 |
| --- | --- | --- |
| assets/sprites/bigfish-atlas.png | 12 种表情与基础姿态 | 内置生成，1448×1086，透明 PNG |
| assets/sprites/bigfish-motions.png | 举牌、打字、侧躲、招手鞠躬 16 帧 | 内置生成，1254×1254，透明 PNG |
| assets/sprites/bigfish-signs.png | 高举、探头、抱尾巴、小跳举牌 16 帧 | 内置生成，1230×1278，透明 PNG |
| assets/sprites/atlas-layout.json | 每帧实际取图矩形 | 根据 alpha 行列间隔校准；原始图集未修改 |

全部生成图集已复制进项目。运行时由 Canvas 按实际矩形取帧，再叠加牌文和场景道具；不依赖生成缓存目录。参考截图不进入安装包。人物沿用用户参考形象，原作者未提供，详见 NOTICE。

## 基础图集的生成规格

蓝发蓝眼、鲸鱼尾巴、海军蓝白边女仆服的同一萌化角色；4 列 3 行、透明背景、全身统一比例和脚底基线。12 格依次为平静、开心、疑惑、认真、紧张、鼓脸、惊讶、抱尾巴委屈、擦汗疲惫、蚊香眼、举纸得意、抱尾巴放松；无鞭子、无文字。此段为生成规格摘要。

## 连续动作图集 · 原始提示词

```text
Create a production animation sprite atlas, 4 columns by 4 rows, exactly 16 equal square cells on a genuinely TRANSPARENT background. Use attached image solely as reference for the SAME blue-haired whale maid chibi character, matching art style outfit eyes face and proportions. Each cell must keep full character inside with 8% padding, centered horizontally, same feet baseline and body scale. No grids, no captions, no text, no watermark, no whip.
Each ROW is a coherent FOUR-FRAME animation of that identical character, left to right; hands, face, hair and tail MUST visibly change as a continuous action, not four unrelated static poses.
Row1 WAITING SIGN: frame1 holding a blank wide rectangular cream sign at waist, frame2 lifting sign with both hands toward chest, frame3 holding sign chest height smiling expectantly, frame4 peeking over sign with eyes blinking. Sign stays blank for live Chinese text overlay by app. Sign horizontal width about half full cell, height about one sixth cell.
Row2 TYPING: seated/standing at a tiny floating light blue keyboard in front of waist, no desk: alternate left and right hand striking keys then both hands tapping, leaning forward concentrated, tail moving. Four distinct arm positions.
Row3 PLAYFUL DODGE: looking left surprised, leaning right with hands up, crouching hugging whale tail, then straightening sheepishly. A pantomime reaction to offscreen sound, no injury or contact.
Row4 GREETING AND CELEBRATION: one hand rises from chest, hand waves outward with bright smile, both hands up with cheerful hop, then little polite bow. Clear limb animation.
Clean crisp beautifully finished 2D anime sticker game sprites. Only this character, transparent gutters and background. Preserve blue whale tail maid visual identity and consistent costume details throughout.
```

## 举牌变体图集 · 原始提示词

```text
Create a transparent production sprite animation atlas, 4 columns x 4 rows exactly 16 equal square cells. Reference image is character identity/style only: same adorable blue-haired blue-eyed whale-tail maid, navy dress white frills. Clean anime chibi illustration, full body same scale and feet baseline each cell. TRUE transparent background, 8% clear margin per cell, no grid, no text anywhere. Signs must be blank cream with thin navy border; live text added in app.
Every row is 4 coherent animation frames left to right, lively moving arms/tail/body, not duplicate standing poses:
ROW1 OVERHEAD SIGN: kneeling slightly sign held forehead-height, straighten and lift blank horizontal sign over head, hold it proudly overhead head tilted left, hold overhead head tilted right. Keep overhead sign inside top 10%-25% cell and full body inside frame; consistent body proportions.
ROW2 PEEK FROM SIGN: wide blank sign at chest mid-height, face peeks to left of board, hides nose behind top of board eyes closed, peeks to right with sparkling eyes. Hands clutch board. Board remains between y50%-70% cell.
ROW3 COZY TAIL SIGN: sitting hugging curved whale tail with small cream blank sign front of chest, sleepy blink, attentive open eyes tail lifts, wink and slight sway. Four different arm/face/tail positions, front facing. Board remains y54%-72% cell.
ROW4 BOUNCY GREETING SIGN: holding blank wide sign chest height with both hands, little right foot step and tilt sign -8degrees, little left foot step tilt +8degrees, cheerful small hop holding sign level. Eyes/hairstyle/outfit same, sign area y50%-68% cell.
All signs wide enough for 5 Chinese characters later, fully blank. Friendly playful company mascot. Absolutely no nudity, no injury, no whip. Match established reference precisely while making these new motion keyframes.
```


## 0.4.0 高频动作精修

新增 `bigfish-work.png`（阅读/修理，各 4 姿态）和 `bigfish-quiet.png`（眨眼/确认，各 4 姿态），共 16 张新绘制姿态。五张内置图集累计 60 姿态，并不等于 60 套独立动画。原始生成 PNG 未改写，Canvas 使用登记的坐标取帧。完整请求见 [polish-generation.json](polish-generation.json)。

源参考只使用项目内原始萌化大肥鱼图集，未使用被否定的成年长裙参考。原作者出处仍未确定；本轮只补充可验证的生成来源，未宣称第三方角色权利归属。

## 0.5.0 日常动作精修

新增 `assets/sprites/bigfish-daily.png`，1448×1086 原生 RGBA PNG，12 个新姿态：喝茶、擦汗、伸懒腰各 4 帧。参考仅为项目原始萌化大肥鱼图集；保留鲸尾、女仆服与围裙鲸鱼标志。未改写生成图像，按 alpha 间隔登记 source rect。累计 6 图集、72 姿态、29 类动作。按透明间隔修正逐行取图边界，避免下一行头饰漏入上一行脚底；daily 全帧使用同一比例与独立脚底锚点，避免各格宽度不同导致左右漂移。以重复帧作自然停留，再放下手或杯子，`loop:false` 收尾保持；完整提示词见 [本轮生成记录](daily-generation.json)。
