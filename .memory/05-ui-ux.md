# AgentLink 交互及界面描述文档

> 定义 AgentLink 插件的用户界面外观和交互体验规范

---

## 1. 设计原则

### 1.1 核心设计理念
- 简洁高效
- 一目了然
- 参考 Cursor/Copilot 的 composer 交互，但保持 Obsidian 原生主题兼容

### 1.2 视觉风格
- 配色统一使用 Obsidian 主题变量
- 主要间距范围控制在 `0.25rem - 0.6rem`
- 主要文字尺寸控制在 `0.72rem - 0.9rem`
- 输入区优先呈现为单一 composer shell，而不是多层分离面板

---

## 2. 布局结构

### 2.1 整体布局

```text
┌─────────────────────────────────────────────────────────────┐
│ Session Title          [历史对话] [清空对话] [新对话]        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                      Messages Area                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ FILE: xxx.cs   FILE: RuntimeMirrorHelper.cs            │ │
│ │                                                         │ │
│ │ Ask anything. Use @ for files and / for commands.       │ │
│ │                                                         │ │
│ │ [LED] [Agent] [Model] [Context] [Think]         [Send] │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 顶部标题栏

**左侧**
- 当前会话标题
- 点击可重命名

**右侧**
- 历史对话
- 清空对话
- 新对话

**按钮样式**
- 使用 Obsidian `setIcon()` 线性图标
- 同一尺寸和边框风格
- 保持单分隔线，不允许双重下划线

### 2.3 消息列表区

- 支持滚动
- 新消息默认滚到底部
- 用户手动滚动时暂停自动滚动
- `thinking` 必须显示在对应 `assistant` 消息上方

### 2.4 Composer Shell

输入区采用单一 `composer shell`，由三部分组成：

1. `context chips` 行
2. `textarea` 文本输入区
3. `composer footer toolbar`

**Composer shell 样式**
- 背景: `var(--background-primary)`
- 边框: `1px solid var(--background-modifier-border)`
- 圆角: `10px`
- 与消息区之间保留紧凑留白
- 支持整体拖动调整高度

### 2.5 Context Chips 行

**显示内容**
- `@` 引用文件
- `@` 引用文件夹
- selection
- 当前 `/command`

**布局要求**
- chip 必须属于输入框内部视觉区域
- 不能再放在输入框外单独一栏
- 支持自动换行
- 右侧可保留轻量的附加入口，如 `+ File`、`+ Selection`

**交互要求**
- 每个 chip 可单独移除
- `/command` chip 移除时要同步清理输入框中的命令文本
- 无 chip 时显示轻量提示文案

### 2.6 Textarea

**样式**
- 无独立边框
- 背景透明，嵌入 composer shell
- 字体: `0.9rem`
- 行高: `1.5`
- 占位符: `Ask anything. Use @ for files and / for commands.`

**输入行为**
- `Enter` 发送
- `Shift/Ctrl/Meta/Alt + Enter` 换行
- 自动完成菜单打开时，`Enter` 优先交给自动完成

### 2.7 Composer Footer Toolbar

**位置**
- 位于 composer shell 内部底部

**布局**
```text
[LED] [Agent] [Model] [Context usage] [Think]           [Send/Stop]
```

**元素说明**
- `LED`: 7px 圆形状态灯
- `Agent`: 当前 agent + icon + dropdown
- `Model`: 仅在 agent 提供多选时显示
- `Context usage`: 仅在 ACP 返回 usage 数据时显示
- `Think`: 仅在 agent 提供多选时显示
- `Send/Stop`: 右对齐

---

## 3. 交互规范

### 3.1 Dropdown

**通用样式**
- 背景: `var(--background-primary)`
- 边框: `1px solid var(--background-modifier-border)`
- 圆角: `6px`
- 阴影: `0 4px 16px rgba(0, 0, 0, 0.15)`
- 最小宽度和最大宽度应保持统一范围

**行为要求**
- `↑/↓` 键选择时自动滚动到可见区域
- 点击外部区域自动关闭
- 两行说明文字不得被裁切

### 3.2 Slash / Mention 自动完成

- `/` 展示 built-in 和 agent commands
- `@` 展示文件、文件夹、current note 等上下文项
- 选择 agent slash command 后只插入文本，不直接发送
- built-in command 也必须等待用户确认发送

### 3.3 状态指示

**LED**
- 已连接: 绿色
- 已断开: 红色或灰红
- 连接中 / 生成中: 黄色闪烁

**Context usage**
- 无数据时完全隐藏
- 有数据时显示小饼图
- 悬停显示详细 token/section 信息

---

## 4. 消息显示

| 类型 | 角色标签 | 样式特点 |
|------|----------|----------|
| user | You | 右侧气泡 |
| assistant | Agent | 左侧 Markdown |
| thinking | Thinking | 可折叠卡片 |
| tool_call | Tool | 卡片状态 |
| error | Error | 红色提示 |

---

## 5. 响应式行为

- 最小宽度按 Obsidian 侧栏可用宽度适配
- 长 agent/model 名称使用单行省略
- chip 允许换行，但底部工具栏保持单行优先

---

## 6. 当前实现约束

- 当前输入区已切换为 `contenteditable` inline token composer
- `@` 引用和 `/command` 以原子 token 节点插入到文字流中
- 现阶段优先保证 inline token、自动完成、发送链路稳定，不引入完整第三方富文本编辑器

---

*最后更新: 2026-04-11*
