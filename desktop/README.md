# 大肥鱼桌面端（源码预览版）

独立 Electron 宠物窗口，首发目标为 macOS 和 Windows。浏览器关闭后仍可播放本地动作；连接 DSH Host 后，共用角色库、外观配置、任务账本、智能授权、记忆和预算。本文对应 `0.7.0-dev.0` 开发源码，不属于已发布 npm `0.6.0` 的功能承诺；Windows 实机、签名及 macOS 公证尚未完成验收。

## 本地运行

在插件项目根目录使用 Node 24：

```bash
pnpm desktop:build
cd desktop
npm ci
npm start
```

从托盘打开“完整设置”，粘贴当前 DSH Host 根地址或启动登录链接。启动凭据只在主进程交换成登录会话，使用系统 safeStorage 保存；渲染器不会收到登录 Cookie。远程 Host 必须使用 HTTPS，不跟随登录跳转。

所连 Host 需要安装包含桌面接口的新版 Bigfish。桌面通过 DSH 官方 `bigfish` 设置命名空间读写外观，使用 revision 拒绝覆盖另一窗口的新设置；角色包直接读写 Host 角色库。连接中断时，当前进程保留最后确认的外观和已加载角色，写入设置会明确失败，不创建另一套可编辑配置。离线重新启动时可使用内置角色，等待 Host 重新连接。

## 行为与授权

- 默认在当前显示器附近散步，只有真正的行走帧移动窗口；转身、起步、边缘探头及停步保持位置。
- 主动跨屏默认关闭；启用后，空闲且有行走素材时约每五分钟尝试一次。工作、拖动、打开设置会让出控制。
- 显示器坐标使用 DIP。拔插、缩放或睡醒后重新校正窗口并取消旧路线。放置窗口和改大小共享目标坐标，不在原生 setBounds 后立刻读取过渡位置作为散步起点；“叫回来”与首次外观应用先后顺序已有确定性竞态回归。真实 Electron、多屏和休眠行为仍单独验收。托盘始终提供“叫回来”。
- 窗口边缘互动需要在此设备明确授权。只读取窗口位置、大小，不读取标题、截图或内容。macOS 还可能要求系统自动化与辅助功能权限；拒绝后显示原因并保留普通陪伴。
- 置顶可关闭。登录启动默认关闭，只有安装版中明确操作对应控件才修改系统启动项。

活动范围提供固定、附近、较大范围与全屏自由活动。全屏模式在当前显示器工作区内选择二维目标，沿左右步态斜向移动，单次行走不超过 6 秒后收尾；不会因选择此模式而自动跨屏。可在“活动区域与回家点”绘制矩形允许区和禁行区，保存回家落脚点；只影响本设备，路线按完整宠物窗口避障，不可达时停止自动移动并提示。首页“显示场景”可关闭背景与环境布景，保留角色及动作自带道具，布置偏好会保存。双宠是一名受邀临时登场的伙伴，可选择内置大肥鱼、跟随主角色或本 Host 已安装的其他角色；当前不提供数量配置。

完整设置与 Web 共用 DSH 明暗主题、键盘下拉菜单与分区；“全能型 · 预览版”下逐组展示实际可用条件，不因选择预设自动获得麦克风、窗口感知或模型权限。小窝家具与人物共用舞台比例，局部灯光等随状态变化；安静、减弱动态、设置打开和页面隐藏时暂停环境演出。

桌面专属设置位于 Host 的 `pets/dsh-bigfish/desktop/state.json`，使用独立版本和 revision；本设备窗口感知授权另存于应用用户目录。角色包、类型预设和导入方案不会开启这些授权，也不会改变智能模式或费用上限。

任务卡的“打开会话”只发送一次性导航意图，再打开所连 Host 的网页。已登录且装有相同新版插件的 Web 页面领取后跳转到来源会话；未登录时先完成网页登录。导航意图两分钟后过期，不批准、重试或执行任务。

## 可选的按住录音

在“桌面、显示器与语音服务”中配置兼容 Audio Transcriptions 的完整端点，例如你自行运行的 `http://127.0.0.1:8000/v1/audio/transcriptions`。协议为 multipart 的 `model`、`file`，返回 JSON `{ "text": "识别文字" }`。远程端点要求 HTTPS，不跟随重定向。

录音还需在“语音交流”中明确允许本次使用，并按住按钮；松开、失去焦点、取消、睡眠或二十五秒后停止。单次音频最多 3 MiB，识别结果先填入文字，另按“确认发送”才调用宠物模型。转写服务可能独立收费，不由模型 token 预算覆盖。语音密钥仅保存在本机系统安全存储，不进入 Host、角色包或方案；更换端点不会继承旧端点的密钥。

没有配置服务时不会录音。设备本地朗读仍可独立使用。截图只处理用户本次选取并确认的文件，不做后台看屏。

## 验证边界与安装包

`pnpm test:desktop` 使用真实 Electron 和临时本地 Host 契约服务，验证离线渲染、共享设置与角色库桥接、凭据隔离、动作与位置、睡醒校正和导航。它不是原生 DSH 安装验证。多屏/DPI、窗口几何和录音取消另有针对性测试。

当前源码包含首次放置、外观改大小、叫回顺序、路线重置和显示器移除的确定性回归，用过渡原生读数重现跳顶原因。真实 Electron 与原生 DSH 验证必须针对本次源码重新执行；旧版本的通过数量不能作为本次验收。物理多屏混合 DPI、Windows 硬件、真实麦克风与所选转写服务、真实长时休眠仍需要分别验收。

已有 macOS arm64 DMG 和 Windows x64 NSIS EXE 是历史开发产物。修改源码或 renderer 后，不能把旧二进制当作最新包；重新构建、核对哈希并完成安装检查后才更新交付记录。macOS 启动与归档校验不等于安装向导、Gatekeeper 或系统权限已验收；macOS 上交叉构建 Windows 也不等于 Windows 已运行。未签名、未公证的产物不得作为正式桌面版发布，具体版本、指纹与验证范围以本地 `artifacts/companion/desktop-delivery.json` 为准。

### macOS 权限与签名检查

打包配置保留 hardened runtime，明确写入麦克风和 Apple Events 的中文用途说明。主进程 entitlement 仅包含 Electron JIT、麦克风输入和 Apple Events；继承文件只包含 JIT 与麦克风输入，供 Chromium 的录音辅助进程使用。窗口几何脚本只由主进程发起，因此不把 Apple Events 权限授予渲染器。没有增加摄像头、系统音频或屏幕捕获权限，也没有关闭 library validation。相关配置见 [electron-builder v26](https://www.electron.build/v26/docs/mac/)、[Apple 音频输入权限](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input)与 [Apple Events 权限](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.automation.apple-events)。

这些声明不会代替系统授权或应用内的按住录音、窗口感知门禁。真实录音前仍需用户同意；系统拒绝后可能需要到系统设置修改并重启应用。参见 [Electron 麦克风授权说明](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos)。

在插件根目录检查配置；最终打包后，再传入本次实际 `.app` 路径：

```bash
node --import tsx scripts/check-desktop-permissions.ts
node --import tsx scripts/check-desktop-permissions.ts "desktop/dist/mac-arm64/大肥鱼.app"
```

检查器核对生成的 Info.plist、主程序及 Helper 的实际签名与 entitlement，将结果写入 `artifacts/companion/desktop-permissions.json`。无证书时 builder 会跳过签名，残留的 Electron ad-hoc 签名不能证明本应用 entitlement 已生效；报告会明确标为 unsigned 或 ad-hoc。只有带有效身份的最终安装包，才可继续验收系统麦克风弹窗、自动化授权、拒绝与撤销后的行为及 macOS 公证。配置检查通过和未签名包启动成功均不能代替这些验收。参见 [Electron 签名与公证](https://www.electronjs.org/docs/latest/tutorial/code-signing)。
