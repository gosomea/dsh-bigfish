# 安装与卸载

已验证：DeepSeek Harness `0.1.5-rc.1` 与 `0.1.5-rc.2`，macOS / Node 24.19.0 的完整原生安装。Linux 另验证插件构建、单元和浏览器，范围见 [兼容性](compatibility.md)。dsh 公开接口尚未稳定，其他版本先在隔离 profile 验证。

## 从 npm 快速安装（推荐）

```sh
dsh plugin --profile web add dsh-bigfish
dsh --profile web
```

安装指定版本可使用 `dsh-bigfish@0.5.2`。升级运行 `dsh plugin --profile web add dsh-bigfish@latest`，在任务空闲时重启 DSH 并刷新页面。插件必须装在实际使用的 Web profile；无需单独运行 `npm install -g`。

npm 包内含完整 `dsh-bigfish-pet-maker` Skill。按需启用：

```sh
npx --yes dsh-bigfish install-skill
```

默认安装到 `$DSH_HOME/skills/dsh-bigfish-pet-maker`，未设置 DSH_HOME 时使用 `~/.dsh/skills/dsh-bigfish-pet-maker`。安装器校验完整文件，相同版本可重复执行；不同内容不会被覆盖。使用 `--skills-dir /absolute/path/to/skills` 可安装到其他 Agent 的技能目录。在 DSH 中新建会话后，可让 Agent 用这个 Skill 制作新角色或给现有包增加动作，再从角色库导入 `.dshpet`。

这个命令是显式操作，npm 安装 / 升级期间不会自动改动用户技能目录。旧 Skill 有改动时，先备份并移走原目录，或指定另一个技能目录。

## 安装本地交付包

确保使用 Node 22.19+ 或 24+，并已安装 dsh。在联网机器执行 `npm pack dsh-bigfish@0.5.2` 可取得安装包，再用绝对路径传入：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-bigfish-0.5.2.tgz
dsh --profile web
```

`web` 换成你的 Web profile 名称。dsh 插件管理器自动把该包的 `cordis.patch.yml` 加入 bundle 列表，不要另加 `--patch` 重复加载。安装后打开或刷新页面，右下角出现大肥鱼，设置中出现独立分组。有现存浏览器标签页时刷新一次。

## 先在隔离目录体验

```sh
export DSH_HOME=/absolute/path/to/bigfish-trial-home
dsh --profile bigfish-trial --from-default-profile web --dump-config > /dev/null
dsh plugin --profile bigfish-trial add /absolute/path/to/dsh-bigfish-0.5.2.tgz
dsh --profile bigfish-trial --port 4180 --no-open
```

此 shell 中的 DSH_HOME 指向新目录，使用完毕后 `unset DSH_HOME`。隔离目录不会继承日常模型凭据；原生 smoke 脚本使用本地测试模型自动完成联调，不需配置密钥。不要把测试模拟 provider 的 patch 安装到日常环境。

## 设置

右下角齿轮提供快捷控制，“完整设置”显示所有参数；dsh 设置中的“大肥鱼监工”是同一份 Host 参数。在回环地址使用时由 dsh 的 settings provider 保存到其设置文档；LAN/非回环浏览器遵循宿主 memory 策略，界面标明“当前会话有效”。

默认按模型学习速度，累计有效采样后开始相对比较。想立即观察空挥，可在预览调整速度，或暂时关闭自动校准并设手动目标；真实工具执行和等待确认仍然不会挥动。

## 升级、禁用与卸载

多个 Host 共用同一 DSH_HOME 时，一并升级 Bigfish 到 0.5.0，旧插件不参与新文件锁。升级前可在完整设置导出备份；老版可先保留角色目录与 Host 设置。

升级：对新 tarball 再运行 `dsh plugin --profile web add /absolute/path/to/new.tgz`，刷新页面检查。若当前 Host 仍保留旧模块，在任务空闲时重启。旧版若通过本地 tarball 安装，保留原文件到升级成功；包管理器可能需要读取旧依赖，提前移走会导致 ENOENT。

仅关闭鞭策：宠物齿轮 → 取消勾选“启用鞭策动作”；正常工作动画继续。

临时关闭整个宠物：关闭“显示宠物”，会解绑当前会话流并移除角色渲染。恢复开关即可重新显示。折叠仅隐藏动画主体，仍显示可展开按钮。

```sh
dsh plugin --profile web remove dsh-bigfish
dsh --profile web
```

卸载后重启并刷新。保留的 `bigfish` 参数和浏览器速度历史不会影响任务，可在卸载前用“清空速度记录/恢复默认设置”清理。不删除聊天或工作目录。

## 排查

- 看不到入口：确认装在实际启动的 Web profile，重启、刷新；不要只安装到 headless profile。
- `duplicate loader entry id: bigfish`：移除重复手写的 patch，保留插件管理器自动加载的 bundle。
- 没有挥鞭：检查“启用鞭策动作”、角色/档位是否有反应素材、系统减弱动态、工具执行或等待确认。学习期间使用温和的中性节奏，不保证每段短输出都启动空挥。
- 设置保存失败：刷新重新取得 revision 后重试；插件不会把 Host 拒绝伪装为成功。
- 图片错误：重新安装完整 tarball。图集内嵌于 Client bundle，运行时不请求外部图片服务器。
- 版本不兼容：运行源码项目的 `pnpm probe:harness /path/to/built/harness` 以及 `pnpm smoke:native`，查看具体类型/运行失败；不推定其他 rc 版本支持。

## 角色包与 Skill

本版本增加 Host 角色库路由，升级后应刷新页面并确认角色库可访问。若运行进程保留旧模块，需要在任务空闲时重启。角色包通过“完整设置 → 角色库”上传，无需为每个角色安装 npm 插件。Skill 位于安装包 `skills/dsh-bigfish-pet-maker`，可复制到宿主技能目录。见 [使用指南](pet-pack/user-guide.md)。
