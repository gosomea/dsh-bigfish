# 台词、工具活动与扩展事件

在「设置 → 大肥鱼监工 → 自定义台词与工具」或宠物齿轮的「完整设置」中编辑。台词按分类一行一句，默认仅在事件变化时选句；可开启定期间隔换话，避免连续重复；留空关闭该类台词；支持恢复单类默认。预览使用现有动作素材，不执行模型或工具。可分别关闭台词、活动说明、工具名称、文件短名，调整字体、宽度、停留时间、说话频率。

占位符：`{tool}`、`{file}`、`{elapsed}`、`{activeCount}`、`{completedCount}`。缺少字段自动回退到通用称呼。台词纯文本渲染，不运行 HTML 或脚本；工具参数仅取文件短名，不保留命令、原始结果或敏感字段。

工具专属规则支持精确名称和末尾 `*` 前缀匹配；精确规则优先，其次最长前缀，之后内置名称分类，未知工具使用通用工具台词。工具名称是启发式分类，例如通过 Bash 运行测试时默认显示“执行命令”，不解析命令来猜测任务意图，可由专属规则或扩展事件指定。

## 事件处理

- `tool/call` 使用 `callId`，`tool/result` 从 `message.content` 中的 `tool-result.toolCallId` 配对，并读取 `isError`。
- `tool/ptc-dispatch-start` / `tool/ptc-dispatch` 用 `subCallId` 配对；只把没有运行中子调用的叶子节点计入当前并行数，父调用结束会清理整个子树。
- 任务开始、结束、会话切换清理活动；历史加载仅恢复状态，不回放过期错误。最多保留 256 个活动，不为高频事件堆积台词队列。
- 普通快速切换先显示通用衔接句，活动说明实时更新；确认、失败、任务完成立即响应。单个工具成功不冒充整个任务完成。

## 后续插件接入

其他运行在同一个网页的 dsh 插件可发送以下浏览器事件。这是大肥鱼新增的扩展协议，不是 dsh 核心接口；默认只接受当前选中会话。

```js
window.dispatchEvent(new CustomEvent('dsh-bigfish:activity', {
  detail: {
    version: 1,
    sessionId: currentSessionId,
    id: 'my-plugin:image:42',
    phase: 'start',
    category: 'image',
    label: '正在生成封面',
    progress: 0.25
  }
}));
```

同一 `id` 后续发送 `phase: 'progress'` 更新进度，发送 `phase: 'end'` 结束；失败带 `isError: true`。每次携带 version、sessionId、id、phase、category、label；progress 可选，范围 0..1，没有真实进度则不填。

可选分类：idle、start、thinking、writing、read、search、edit、command、test、web、parallel、tool、waiting、error、complete、stopped、image、export、background、agent。新功能可先使用 tool + 自定义 label，再新增分类和对应素材。label 最长 80 字符，id 最长 100；非法输入忽略。关闭宠物后停止接收，插件卸载时释放监听。

## 空挥播放

频率用于安排完整动作；单次演出约 0.55–1.05 秒，场景过渡不能倒回已开始的动作。少于 0.2 秒的可挥动片段不启动新动作。工具执行时停止新的挥动并用 0.24 秒收势；等待确认、失败、取消、断开连接、减少动态、关闭“启用鞭策动作”立即停止。气泡更新不重置动作。

## 展示布局

消息、状态、按钮和运行数据整合在角色上方的一张卡片中，原底部工具栏移除。台词最多三行，悬停显示全文；关闭消息气泡仍保留紧凑操作条。空闲隐藏速度/计时。原有台词、宽度、字号和开关配置继续生效。
