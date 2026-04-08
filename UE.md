# AgentLink UI/UX 设计规范 (UE.md)

> 本文档定义 AgentLink 插件的用户界面外观和交互体验规范。

---

## 1. 设计原则

### 1.1 核心设计理念
- **简洁高效**: 界面元素精简，操作路径最短
- **一目了然**: 状态、功能、反馈清晰可见
- **Cursor 风格**: 参考 Cursor AI 的交互设计

### 1.2 视觉风格
- **配色**: 使用 Obsidian 主题变量，确保深色/浅色模式兼容
- **间距**: 紧凑布局，0.25rem - 0.6rem 为主要间距范围
- **字体**: 0.7rem - 0.9rem，以功能性为主

---

## 2. 布局结构

### 2.1 整体布局 (从上到下)

```
┌─────────────────────────────────────────────────────┐
│ 🤖 Agent ▾    [🟢] BackendName        📜 🗑️      │  ← Header Row 1
│ Session Title                                       │  ← Header Row 2
├─────────────────────────────────────────────────────┤
│                                                     │
│   Messages Area                                     │  ← 消息列表区
│                                                     │
├─────────────────────────────────────────────────────┤
│ [Input textarea                ] [Send]             │  ← Input Row
│                                  [Stop]             │
├─────────────────────────────────────────────────────┤
│ ⚡ Model ▾                [✓ Auto] [💭 Think ▾]    │  ← Bottom Toolbar
└─────────────────────────────────────────────────────┘
```

### 2.2 Header Row 1

**左侧 - Agent 选择器**
- 按钮: `🤖 Agent ▾`
- 样式: 背景色 `var(--background-secondary)`，圆角 4px
- 交互: 点击展开下拉列表，显示所有已配置的 Agent
- 功能: 快速切换不同 Agent 配置

**中间 - 状态指示**
- LED 指示灯: 7px 圆形
  - 🟢 `#4ade80`: 已连接
  - 🔴 `#f87171`: 已断开
  - 🟡 `#fbbf24` 闪烁: 正在生成
- 后端名称: 当前 Agent 配置文件名

**右侧 - 操作按钮**
- 📜 历史记录: 展开会话历史下拉
- 🗑️ 清空: 清空当前会话

### 2.3 Header Row 2

**会话标题**
- 样式: 字体 0.8rem，颜色 `var(--text-muted)`
- 背景: `var(--background-secondary)`
- 交互: 点击可重命名

### 2.4 Input Area

**输入框**
- 高度: 2.8rem，可纵向 resize
- 边框: 1px solid `var(--background-modifier-border)`
- 圆角: 6px
- 快捷键: Ctrl+Enter 发送

**Send/Stop 按钮**
- 位置: 输入框右侧，垂直堆叠
- Send: 主题色背景，1.4rem 高
- Stop: 红色背景，生成时显示

### 2.5 Bottom Toolbar

**左侧 - Model 选择**
- 按钮: `⚡ Model ▾`
- 功能: 选择 ACP 后端提供的模型

**右侧 - 快捷配置**
- ✓ Auto: 自动确认只读操作
- 💭 Think ▾: 思考强度选择
  - None: 不显示思考过程
  - Quick: 快速响应
  - Balanced: 默认模式
  - Deep: 深度分析

---

## 3. 交互规范

### 3.1 下拉菜单

**通用样式**
- 背景: `var(--background-primary)`
- 边框: 1px solid `var(--background-modifier-border)`
- 圆角: 6px
- 阴影: `0 4px 16px rgba(0, 0, 0, 0.15)`
- 最小宽度: 160px - 200px

**菜单项**
- 内边距: 0.5rem
- 圆角: 4px
- 悬停背景: `var(--background-modifier-hover)`
- 选中标记: ✓ 符号

### 3.2 按钮状态

**快捷配置按钮 (Toggle)**
- 激活状态:
  - 背景: `var(--interactive-accent)`
  - 文字: `var(--text-on-accent)`
- 非激活状态:
  - 背景: transparent
  - 文字: `var(--text-muted)`
  - 边框: 1px solid `var(--background-modifier-border)`

**图标按钮**
- 默认透明度: 0.7
- 悬停透明度: 1.0
- 无边框，无背景

### 3.3 状态指示

**LED 指示灯动画**
- 常亮: 无动画
- 闪烁(Generating): `animation: agentlink-led-blink 0.6s ease-in-out infinite`
- 发光效果: `box-shadow: 0 0 3px/4px {color}`

---

## 4. 消息显示

### 4.1 消息类型

| 类型 | 角色标签 | 样式特点 |
|------|----------|----------|
| user | You | 用户消息 |
| assistant | Agent | Agent 回复，Markdown 渲染 |
| thinking | 💭 Thinking | 思考过程，可折叠 |
| tool_call | 🛠️ Tool | 工具调用卡片 |
| error | Error | 红色错误提示 |

### 4.2 Thinking 消息

**布局要求**
- 位置: 必须显示在 assistant 消息上方
- 默认状态: 折叠 (内容过长时)
- 展开动画: CSS max-height transition

**样式**
- Header: 可点击，显示 💭 图标 + "Thinking" + 展开/收起箭头
- Body: Markdown 渲染，支持代码块
- 边框: 左侧或背景色区分

### 4.3 Tool Call 卡片

**设计目标**
- 不显示原始 JSON
- 显示为可读的卡片格式
- 显示执行状态

**状态显示**
- 进行中: 加载动画 + "正在执行..."
- 完成: ✅ + 结果摘要
- 失败: ❌ + 错误信息

---

## 5. 响应式行为

### 5.1 侧边栏宽度适配
- 最小宽度: 300px
- 输入框: flex: 1，自适应剩余空间
- 按钮: 固定宽度，不换行

### 5.2 滚动行为
- 消息区域: 独立滚动
- 输入区域: 固定底部
- 自动滚动: 新消息时自动滚动到底部

---

## 6. 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+Enter | 发送消息 |
| Esc | 停止生成 |

---

## 7. 主题适配

### 7.1 深色模式
- 所有颜色使用 Obsidian CSS 变量
- LED 指示灯使用固定色值确保可见性

### 7.2 浅色模式
- 自动适配，无需额外处理

---

## 8. 与 ACP 协议的集成

### 8.1 Agent 切换
- 通过 ACP 协议获取可用 Agent 列表
- 切换时保持当前会话上下文

### 8.2 Model 切换
- 从 ACP 后端获取可用模型列表
- 动态更新 Model 下拉菜单

### 8.3 Thinking 强度
- 通过 ACP 协议设置 thinking 参数
- 不同强度对应不同的推理深度

---

## 9. 设计参考

### 9.1 参考产品
- **Cursor AI**: 主要的 UI/UX 参考
- **Claude Desktop App**: 简洁的对话界面
- **Kimi Code**: Agent 切换和模型选择

### 9.2 相关文档
- ACP 协议文档: https://agentclientprotocol.com
- Obsidian 插件开发文档: https://docs.obsidian.md

---

*最后更新: 2026-04-08*