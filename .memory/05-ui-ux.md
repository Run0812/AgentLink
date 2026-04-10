# AgentLink 交互及界面描述文档

> 定义 AgentLink 插件的用户界面外观和交互体验规范
> 
> **使用方式**:
> - 实现新 UI 功能前阅读此文档了解设计规范
> - 保持与现有设计原则一致
> - 修改 UI 时参考具体的样式参数

---

## 1. 设计原则

### 1.1 核心设计理念
- **简洁高效**: 界面元素精简，操作路径最短
- **一目了然**: 状态、功能、反馈清晰可见
- **类 Cursor 风格**: 参考 Cursor AI 的交互设计，但保持 Obsidian 原生风格

### 1.2 视觉风格
- **配色**: 使用 Obsidian 主题变量，确保深色/浅色模式兼容
- **间距**: 紧凑布局，0.25rem - 0.6rem 为主要间距范围
- **字体**: 0.7rem - 0.9rem，以功能性为主

---

## 2. 布局结构

### 2.1 整体布局 (从上到下)

```
┌─────────────────────────────────────────────────────────────┐
│ Session Title          [历史对话] [清空对话] [新对话]        │  ← Header Row 1
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                      Messages Area                          │  ← 消息列表区
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤  ← 可调整分隔
│  @xxx(文件夹) @xxx(文件)                                        │   ←输入状态栏 
│ ───────────────────────────────────────────────────────────── │
│                    Input textarea                           │  ← Input Row
│                  (可拖动调整高度)                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [🟢] Agent ▾  [Model]  [上下文使用情况]  [💭 Think ▾]  Send │  ← Bottom Toolbar
└─────────────────────────────────────────────────────────────┘
```

**布局说明**:
1. **Header Row 1**: 顶部标题栏，显示会话标题和操作按钮（右对齐）
2. **消息列表区**: 中间消息显示区域，可滚动
3. **Input Row**: 输入框区域，支持用户拖动调整高度
4. **Bottom Toolbar**: 底部工具栏，包含 Agent 选择、模型、上下文状态、思考模式和发送按钮

---

### 2.2 Header Row 1

**左侧 - 会话标题**
- 显示: 当前会话标题（如 "New Chat"）
- 样式: 字体 0.9rem，颜色 `var(--text-normal)`
- 交互: 点击可重命名

**右侧 - 操作按钮（右对齐）**
- [历史对话]: 时钟图标 🕐，点击展开历史会话下拉
- [清空对话]: 叉号图标 ✕，点击清空当前会话
- [新对话]: 加号图标 ＋，点击创建新会话

**按钮样式**:
- 仅显示图标，无边框
- 默认透明度: 0.7
- 悬停透明度: 1.0
- 间距: 0.5rem

---

### 2.3 消息列表区 (Messages Area)

**功能**:
- 显示对话历史消息
- 支持滚动查看历史
- 新消息自动滚动到底部
- 用户滚动时暂停自动滚动

**消息类型**:
| 类型 | 显示方式 |
|------|----------|
| user | 右侧对齐，气泡样式，Markdown 渲染 |
| assistant | 左侧对齐，Markdown 渲染 |
| thinking | 折叠卡片，显示在 assistant 上方 |
| tool_call | 卡片式布局，显示工具调用状态 |
| error | 红色提示，居中显示 |

---

### 2.4 Input Row (输入区域)

**布局**:
- 占据整个宽度和高度
- 最小高度: 80px
- **支持用户拖动调整高度**（可拖动输入区域和消息列表区域之间的分隔符来改变输入框的大小）

**输入框样式**:
- 背景: `var(--background-primary)`
- 边框: 1px solid `var(--background-modifier-border)`
- 圆角: 6px
- 内边距: 0.75rem
- 字体: 0.9rem
- 占位符: "Type a message..."

---

### 2.5 Bottom Toolbar (底部工具栏)

**整体布局**: 单行，从左到右依次排列

```
[状态LED] [Agent名称 ▾]  [Model ▾]  [上下文使用]  [Think ▾]          [Send/Stop]
   ↓           ↓              ↓            ↓            ↓                  ↓
  7px       选择Agent      选择模型    显示token      思考强度         发送/停止
 圆形        下拉菜单       下拉菜单     使用情况       下拉菜单          按钮
```

#### 状态 LED 指示灯

- **尺寸**: 7px 圆形
- **位置**: 工具栏最左侧
- **颜色**:
  - 🟢 `#4ade80`: 已连接
  - 🔴 `#f87171`: 已断开
  - 🟡 `#fbbf24` 闪烁: 正在生成
- **发光效果**: `box-shadow: 0 0 4px currentColor`

#### Agent 选择器

- **显示**: 当前 Agent 名称 + 下拉箭头（如 "Kimi Code (ACP) ▾"）
- **图标**: 左侧显示 Agent 类型图标
- **样式**: 按钮样式，圆角 4px
- **交互**: 点击展开下拉列表，显示所有已配置的 Agent

#### Model 选择器

- **显示**: 当前模型名称（如 "Default"）或模型图标
- **样式**: 简洁按钮样式
- **交互**: 点击展开模型下拉列表

#### 上下文使用情况

- **显示**: 当前上下文使用状态（如 "4k/128k" 或进度条）
- **位置**: Agent 和 Model 之后
- **样式**: 小号字体，muted 颜色
- **提示**: 悬停显示详细 token 统计

#### Think 思考强度选择

- **显示**: 💭 Think + 下拉箭头
- **选项**:
  - Default: 默认强度
  - Low: 低
  - Med: 中
  - High: 高
  - xHigh: 超高
- **样式**: Toggle 按钮 + 下拉

#### Send/Stop 按钮

- **位置**: 工具栏最右侧（右对齐）
- **Send 按钮**:
  - 样式: 主题色背景，白色文字
  - 文字: "Send"
  - 圆角: 4px
  - 尺寸: 自适应文字宽度 + padding
- **Stop 按钮** (生成中时显示):
  - 样式: 红色背景或边框
  - 文字: "Stop" 或方形停止图标
  - 点击中断当前生成

---

## 3. 交互规范

### 3.1 下拉菜单

**通用样式**:
- 背景: `var(--background-primary)`
- 边框: 1px solid `var(--background-modifier-border)`
- 圆角: 6px
- 阴影: `0 4px 16px rgba(0, 0, 0, 0.15)`
- 最小宽度: 160px
- 最大高度: 300px（超出可滚动）

**菜单项**:
- 内边距: 0.5rem 0.75rem
- 圆角: 4px
- 悬停背景: `var(--background-modifier-hover)`
- 选中标记: ✓ 符号

### 3.2 按钮状态

**工具栏按钮 (Agent/Model/Think)**:
- 默认:
  - 背景: transparent
  - 边框: 1px solid `var(--background-modifier-border)`
  - 文字: `var(--text-normal)`
- 悬停:
  - 背景: `var(--background-modifier-hover)`
- 激活/展开:
  - 背景: `var(--background-modifier-active)`

**Send 按钮**:
- 默认:
  - 背景: `var(--interactive-accent)`
  - 文字: `var(--text-on-accent)`
- 悬停:
  - 背景: `var(--interactive-accent-hover)`
- 禁用:
  - 背景: `var(--background-modifier-border)`
  - 文字: `var(--text-muted)`

### 3.3 状态指示

**LED 指示灯动画**:
```css
/* 常亮 */
.agentlink-status-led.connected {
  background-color: #4ade80;
  box-shadow: 0 0 4px #4ade80;
}

/* 闪烁 - 生成中 */
.agentlink-status-led.generating {
  background-color: #fbbf24;
  box-shadow: 0 0 4px #fbbf24;
  animation: agentlink-led-blink 0.6s ease-in-out infinite;
}

@keyframes agentlink-led-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

---

## 4. 消息显示

### 4.1 消息类型

| 类型 | 角色标签 | 样式特点 |
|------|----------|----------|
| user | You | 用户消息，右侧气泡 |
| assistant | Agent | Agent 回复，左侧，Markdown 渲染 |
| thinking | 💭 Thinking | 思考过程，可折叠卡片，显示在 assistant 上方 |
| tool_call | 🛠️ Tool | 工具调用卡片，显示执行状态 |
| error | Error | 红色错误提示 |

### 4.2 Thinking 消息

**布局要求**:
- **位置**: 必须显示在 assistant 消息上方
- **默认状态**: 折叠（仅显示 header）
- **展开**: 点击 header 展开内容

**样式**:
```
┌─────────────────────────────────────────────────────┐
│ 💭 Thought for 6s                              ▼    │  ← Header（可点击）
├─────────────────────────────────────────────────────┤
│ Let me analyze this step by step...                 │  ← Body（Markdown）
│                                                     │
│ 1. First, I need to understand the requirements     │
│ 2. Then, I'll plan the implementation               │
└─────────────────────────────────────────────────────┘
```

**Header 样式**:
- 背景: `var(--background-secondary)`
- 左边框: 3px solid `var(--interactive-accent)`
- 内边距: 0.5rem
- 显示思考时长

**Body 样式**:
- 使用 Obsidian `MarkdownRenderer` 渲染
- `white-space: pre-wrap`
- 最大高度: 400px（超出可滚动）

### 4.3 Tool Call 卡片

**设计目标**:
- 不显示原始 JSON
- 显示为可读的卡片格式
- 实时显示执行状态

**状态显示**:
```
进行中:
┌─────────────────────────────────────────────────────┐
│ 🔍 搜索: "OpenAI API documentation"           ●●●   │
└─────────────────────────────────────────────────────┘

完成:
┌─────────────────────────────────────────────────────┐
│ ✅ 搜索完成                                          │
├─────────────────────────────────────────────────────┤
│ Found 3 relevant results:                            │
│ • OpenAI API Reference                               │
│ • Authentication Guide                               │
└─────────────────────────────────────────────────────┘
```

---

## 5. 响应式行为

### 5.1 侧边栏宽度适配
- 最小宽度: 300px
- 输入框: 自适应剩余空间
- 工具栏: 小宽度时隐藏部分文字，保留图标

### 5.2 高度适配
- 消息区域: 占用剩余空间，可滚动
- 输入区域: 用户可拖动调整高度（80px ~ 50%面板高度）
- 工具栏: 固定高度（约 40px）

### 5.3 滚动行为
- 消息区域: 独立滚动
- 新消息: 自动滚动到底部
- 用户滚动查看历史时: 暂停自动滚动
- 输入区域: 内容超出时内部滚动

---

## 6. 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+Enter | 发送消息 |
| Esc | 停止生成 |
| Ctrl+L | 清空对话 |
| Ctrl+N | 新建对话 |

---

## 7. 主题适配

### 7.1 深色模式
- 所有颜色使用 Obsidian CSS 变量
- LED 指示灯使用固定色值确保可见性

### 7.2 浅色模式
- 自动适配，无需额外处理

---

## 8. CSS 变量参考

### Obsidian 主题变量

```css
/* 背景色 */
var(--background-primary)        /* 主背景 */
var(--background-secondary)      /* 次背景 */
var(--background-modifier-border) /* 边框 */
var(--background-modifier-hover)  /* 悬停背景 */
var(--background-modifier-active) /* 激活背景 */

/* 文字色 */
var(--text-normal)               /* 正常文字 */
var(--text-muted)                /* 次要文字 */
var(--text-on-accent)            /* 强调色上的文字 */

/* 强调色 */
var(--interactive-accent)        /* 主题强调色 */
var(--interactive-accent-hover)  /* 悬停强调色 */
```

### 自定义变量（如需）

```css
/* 建议添加到 styles.css */
.agentlink-sidebar {
  --agentlink-header-height: 40px;
  --agentlink-toolbar-height: 40px;
  --agentlink-input-min-height: 80px;
  --agentlink-led-size: 7px;
}
```

---

## 9. 与 ACP 协议的集成

### 9.1 Agent 切换
- 通过 ACP 协议获取可用 Agent 列表
- 切换时保持当前会话上下文（可选）

### 9.2 Model 切换
- 从 ACP 后端获取可用模型列表
- 动态更新 Model 下拉菜单

### 9.3 上下文使用
- 从 ACP 后端获取 token 使用情况
- 实时更新上下文使用显示

### 9.4 Thinking 强度
- 通过ACP协议获取到的模型支持哪些Think强度，如果没有则只有默认不需要选择
- 通过 ACP 协议设置 thinking 参数
- 不同强度对应不同的推理深度

---

## 10. 设计参考

### 10.1 参考产品
- **Cursor AI**: 主要的 UI/UX 参考
- **Claude Desktop App**: 简洁的对话界面
- **Kimi Code**: Agent 切换和模型选择

### 10.2 相关文档
- ACP 协议文档: https://agentclientprotocol.com
- Obsidian 插件开发文档: https://docs.obsidian.md

---

*最后更新: 2026-04-09*
