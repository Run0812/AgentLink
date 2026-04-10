# AgentLink 当前开发进度

> 记录项目的详细开发进展和版本迭代历史
> 
> **使用方式**:
> - 每次完成重要功能或修复后，在此文件顶部添加新的进度条目
> - 按日期倒序排列（最新的在最上面）
> - 包含具体变更的文件和简要说明

---

## 总体进度概览

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 0 - 项目基础 | ✅ 已完成 | 100% |
| Phase 1 - 核心类型与接口定义 | ✅ 已完成 | 100% |
| Phase 2 - 工具调用机制 | ✅ 已完成 | 100% |
| Phase 3 - ACP Bridge Mode | ✅ 已完成 | 100% |
| Phase 4 - 历史对话保存功能 | ✅ 已完成 | 100% |
| Phase 5 - agent命令支持 | 🟡 **当前重点** | 0% |
| Phase 6 - 工程加固与发布 | 🟡 进行中 | 20% |

---

## 2026-04-09 - Phase 5 启动：Agent 命令支持

**目标**: 实现 `/` 斜杠命令自动提示和 `@` 文件引用功能

### 新增功能规划

#### 1. `/` 斜杠命令自动提示
**功能描述**:
- 用户在输入框中输入 `/` 时，弹出命令列表
- 支持键盘导航（↑↓选择，Enter确认，Esc关闭）
- 命令分类：文件操作、搜索、编辑等

**技术实现要点**:
- 监听输入框的 `input` 事件，检测 `/` 字符
- 使用 Obsidian 的 `SuggestionModal` 或自定义下拉组件
- 命令列表从 Agent 配置动态获取

**涉及文件**:
- `src/ui/chat-view.ts` - 输入框事件监听
- `src/ui/components/slash-command-menu.tsx` (新增)

#### 2. `@` 引用文件/文件夹
**功能描述**:
- 用户在输入框中输入 `@` 时，显示文件/文件夹选择器
- 支持模糊搜索匹配文件名/路径
- 选中后以标签形式显示在**输入状态栏**

**输入状态栏位置**（参考 05-ui-ux.md 第 2.4 节）:
```
┌─────────────────────────────────────────────────────────────┐
│  @xxx(文件夹) @xxx(文件)                                        │   ←输入状态栏 
│ ───────────────────────────────────────────────────────────── │
│                    Input textarea                           │  ← Input Row
└─────────────────────────────────────────────────────────────┘
```

**引用标签样式**:
- 显示类型图标：文件夹 📁 / 文件 📄
- 标签右侧有 ✕ 按钮可删除
- 背景使用 `var(--background-secondary)`
- 圆角 4px，内边距 0.25rem 0.5rem

**技术实现要点**:
- 使用 Obsidian `Vault` API 获取文件列表
- 模糊搜索使用 `fuse.js` 或简单的字符串匹配
- 输入状态栏作为独立 DOM 元素，位于输入框上方
- 发送消息时将引用内容作为上下文附加

**涉及文件**:
- `src/ui/chat-view.ts` - 添加输入状态栏
- `src/ui/components/file-suggest-modal.tsx` (新增)
- `src/services/context-attachment.ts` (新增)

**依赖**: 需要实现上下文附件服务，将引用文件内容附加到消息中

---

## 历史进度

### 2026-04-08 开发进度

#### UI 修复与优化 ✅

**修复内容**:
- ✅ **底部配置选项始终显示**
  - 当 Agent 没有返回 configOptions 时，显示默认值
  - 确保用户始终可以看到并切换配置

- ✅ **顶部按钮右对齐**
  - 标题栏按钮（历史、清空、新对话）现在正确右对齐
  - 状态 LED 和 Backend 名称居中显示

- ✅ **统一图标风格**
  - 历史按钮：🕐（时钟）
  - 清空按钮：✕（叉号）
  - 新对话按钮：＋（加号，新增在顶部）

- ✅ **历史下拉菜单优化**
  - 移除了底部的 "+ New Chat" 按钮
  - 每个历史对话项右侧添加删除按钮（✕）
  - 点击对话标题加载，点击删除按钮删除

**文件变更**:
- `src/ui/chat-view.ts`

---

#### ACP Registry 功能 ✅

**根据 https://agentclientprotocol.com/get-started/registry 实现**:

- ✅ **Registry 数据获取**
  - 支持从 CDN 拉取最新 registry
  - 本地缓存 registry 数据到 `data/acp-registry.json`

- ✅ **自动同步设置**
  - 新增设置项：启用/禁用 Registry 自动同步
  - 可配置同步间隔（1-168 小时）
  - 支持手动 "Sync Now" 立即同步

- ✅ **自定义 ACP 代理**
  - 支持添加自定义 ACP Agent（不通过 Registry）

- ✅ **Registry 集成**
  - Registry 中的 Agent 自动转换为 backend configs
  - 与现有 backend 列表合并显示
  - 支持从 Registry 中选择并配置 Agent

**支持的知名 Agents**:
- Claude Agent, Kimi CLI, OpenCode, Codex CLI
- Cursor, GitHub Copilot, Gemini CLI
- Goose, Junie, Cline, Auggie
- 以及 20+ 其他 ACP 兼容 Agent

**文件变更**:
- `src/services/acp-registry.ts` (新增)
- `src/settings/settings.ts`
- `src/settings/settings-tab.ts`

---

#### Phase 5: 框架迁移（Preact）✅

**目标**: 将 `chat-view.ts` 中最复杂且变化频繁的底部配置栏迁移到组件化框架

**本次迁移内容**:
- ✅ 引入 **Preact** 作为轻量 UI 框架
- ✅ 构建配置调整
  - `tsconfig.json` 启用 JSX
  - `esbuild.config.mjs` 启用 automatic JSX
- ✅ 新增组件: `src/ui/components/config-toolbar.tsx`
  - 将 `mode / model / thought_level` 下拉渲染迁移为组件
- ✅ `ChatView` 接入组件渲染
  - 使用 `preact.render()` 挂载/卸载配置栏
  - 选项变化统一走 `handleConfigOptionChange()`

**文件变更**:
- `src/ui/components/config-toolbar.tsx` (新增)
- `src/ui/chat-view.ts`
- `tsconfig.json`
- `esbuild.config.mjs`

---

#### ACP Session Config Options ✅

**基于 ACP 协议实现的动态底部工具栏**:

- ✅ **AgentAdapter 接口扩展**
  - 新增 `getConfigOptions(): ConfigOption[]` 方法
  - 新增 `setConfigOption(configId, value)` 方法

- ✅ **ACP Bridge Adapter 实现**
  - 从 session 响应中解析 configOptions
  - 存储 mode/model/thought_level 配置

- ✅ **Mock Adapter 测试支持**
  - 内置默认 configOptions

- ✅ **ChatView 动态渲染**
  - 底部工具栏根据 Agent 返回的 configOptions 动态生成
  - 图标根据 category 自动识别

**文件变更**:
- `src/core/types.ts`
- `src/adapters/acp-bridge-adapter.ts`
- `src/adapters/mock-adapter.ts`
- `src/ui/chat-view.ts`

---

#### Phase 4: 快速切换功能 ✅

**新增功能（类似 Cursor AI 的界面）**:

- ✅ **Agent 选择下拉按钮**
  - 头部左侧显示 "🤖 Agent ▾" 按钮
  - 下拉列表显示所有已配置的 Agent

- ✅ **模型选择按钮**
  - 输入框底部工具栏左侧
  - 显示 "⚡ Model ▾"

- ✅ **快捷配置按钮**
  - 底部工具栏中间：✓ Auto、💭 Think

- ✅ **设置快捷入口**
  - 底部工具栏右侧：⚙️ 按钮

**文件变更**:
- `src/ui/chat-view.ts`
- `src/main.ts`

---

#### Terminal 风格 UI 重构 ✅

**布局变更**（模仿 Terminal.app 风格）:

- ✅ **两行紧凑头部设计**
  - Row 1: 🤖 AgentLink | [●] BackendName | 📜 💬 🗑️
  - Row 2: Session Title（灰色背景，可点击编辑）

- ✅ **状态指示灯（HDD 灯风格）**
  - 🟢 绿色: 已连接
  - 🔴 红色: 已断开
  - 🟡 黄色闪烁: 正在生成

- ✅ **输入区布局**
  - 输入框在左，Send/Stop 按钮在右侧垂直堆叠

**文件变更**:
- `src/ui/chat-view.ts`

---

#### 历史对话管理功能 ✅

**新增功能**:

- ✅ **SessionManager 服务**
  - 创建 `src/services/session-manager.ts`
  - 支持会话的创建、保存、加载、删除
  - 自动限制最多保存 50 个会话
  - 自动生成会话标题

- ✅ **标题栏优化**
  - 新布局：🤖 AgentLink | [会话标题] | 📜 💬 🗑️

- ✅ **历史对话列表 UI**
  - 模态框显示所有历史会话
  - 按更新时间倒序排列
  - 支持加载和删除操作

- ✅ **自动保存机制**
  - 每条消息发送后自动保存会话

**文件变更**:
- `src/services/session-manager.ts` (新增)
- `src/main.ts`
- `src/ui/chat-view.ts`

---

#### ACP 交互体验优化 ✅

**修复问题**:
- ✅ **Thinking 显示位置修复**
  - 修复 thinking 内容显示在回答下方的问题
  - 现在 thinking 显示在 assistant 回答上方

- ✅ **Thinking Markdown 渲染支持**
  - thinking 内容现在支持完整的 Markdown 渲染

- ✅ **Tool Use 卡片化显示**
  - Tool use 显示为卡片格式（而非 JSON 代码块）

**文件变更**:
- `src/core/types.ts`
- `src/adapters/acp-bridge-adapter.ts`
- `src/ui/chat-view.ts`

---

#### 设置面板清理 ✅

- ✅ **移除 Max Context Length 设置项**
  - 该配置用于限制文件内容长度，但在当前 ACP 架构下意义不大

**文件变更**:
- `src/settings/settings.ts`
- `src/settings/settings-tab.ts`
- `src/ui/chat-view.ts`

---

## 代码统计

| 指标 | 数值 |
|------|------|
| 源文件数 | 22 |
| 测试文件数 | 10 |
| 单元测试数 | 78 |
| 代码行数（估计） | ~5000 |

---

## 下一步计划

### 近期（1-2 周）- Phase 5

1. **`/` 斜杠命令自动提示**
   - 实现命令列表下拉
   - 键盘导航支持

2. **`@` 文件/文件夹引用**
   - 文件选择器实现
   - 输入状态栏标签显示
   - 上下文附件服务

### 中期（3-4 周）- Phase 6

3. **工程加固与发布**
   - 编写 README 和配置指南
   - 错误处理完善
   - 提交到 Obsidian 社区插件市场

---

## 参考文档

- [01-tasks.md](./01-tasks.md) - 开发任务目标
- [03-bugs.md](./03-bugs.md) - Bug 记录
- [05-ui-ux.md](./05-ui-ux.md) - 交互及界面描述

---

*最后更新: 2026-04-09*
