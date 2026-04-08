# AgentLink 开发进展记录

> 最后更新: 2026-04-08
> 更新内容: UI修复 + ACP Registry功能完成

---

### 2026-04-08 - UI修复与优化 ✅

**修复内容**：

- ✅ **底部配置选项始终显示**
  - 当 Agent 没有返回 configOptions 时，显示默认值（Mode: Ask/Code/Auto, Model: Default/Fast/Quality）
  - 确保用户始终可以看到并切换配置

- ✅ **顶部按钮右对齐**
  - 标题栏按钮（历史、清空、新对话）现在正确右对齐
  - 状态LED和Backend名称居中显示

- ✅ **统一图标风格**
  - 历史按钮：🕐（时钟）
  - 清空按钮：✕（叉号）
  - 新对话按钮：＋（加号，新增在顶部）

- ✅ **历史下拉菜单优化**
  - 移除了底部的 "+ New Chat" 按钮（已在顶部添加）
  - 每个历史对话项右侧添加删除按钮（✕）
  - 点击对话标题加载，点击删除按钮删除

---

### 2026-04-08 - ACP Registry 功能 ✅

**根据 https://agentclientprotocol.com/get-started/registry 实现**：

- ✅ **Registry 数据获取**
  - 支持从 CDN (`https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`) 拉取最新 registry
  - 本地缓存 registry 数据到 `data/acp-registry.json`

- ✅ **自动同步设置**
  - 新增设置项：启用/禁用 Registry 自动同步
  - 可配置同步间隔（1-168 小时）
  - 支持手动 "Sync Now" 立即同步

- ✅ **自定义 ACP 代理**
  - 支持添加自定义 ACP Agent（不通过 Registry）
  - 在设置中点击 "Add Custom ACP Agent" 按钮

- ✅ **Registry 集成**
  - Registry 中的 Agent 自动转换为 backend configs
  - 与现有 backend 列表合并显示
  - 支持从 Registry 中选择并配置 Agent

**Registry 中的知名 Agents**（已支持）：
- Claude Agent, Kimi CLI, OpenCode, Codex CLI
- Cursor, GitHub Copilot, Gemini CLI
- Goose, Junie, Cline, Auggie
- 以及 20+ 其他 ACP 兼容 Agent

---

### 2026-04-08 - Phase 5: 框架迁移（Preact）✅

**目标**：将 `chat-view.ts` 中最复杂且变化频繁的底部配置栏，从原生 DOM 手写渲染迁移到组件化框架渲染。

**本次迁移内容**：

- ✅ 引入 **Preact** 作为轻量 UI 框架（避免引入 React 体积与兼容成本）
- ✅ 构建配置调整：
  - `tsconfig.json` 启用 JSX（`jsx: react-jsx`, `jsxImportSource: preact`）
  - `esbuild.config.mjs` 启用 automatic JSX 并指定 `preact`
- ✅ 新增组件：`src/ui/components/config-toolbar.tsx`
  - 将 `mode / model / thought_level` 下拉渲染迁移为组件
  - 统一选项展示与交互行为
- ✅ `ChatView` 接入组件渲染：
  - 使用 `preact.render()` 挂载/卸载配置栏
  - `setAdapter()` / `refreshSettings()` 自动刷新配置组件
  - 选项变化统一走 `handleConfigOptionChange()`，回调 `adapter.setConfigOption()`

**迁移结果**：

- UI 逻辑由「手写 DOM 拼装」转为「组件化渲染」，后续迭代（新增选项/布局调整/状态联动）维护成本显著降低。
- 不影响现有 AgentAdapter 协议层，保持 ACP 兼容。

---

### 2026-04-08 - ACP Session Config Options ✅

**基于 ACP 协议实现的动态底部工具栏**（参考 https://agentclientprotocol.com/protocol/session-config-options）：

- ✅ **AgentAdapter 接口扩展**
  - 新增 `getConfigOptions(): ConfigOption[]` 方法
  - 新增 `setConfigOption(configId, value): Promise<ConfigOption[]>` 方法

- ✅ **ACP Bridge Adapter 实现**
  - 从 session 响应中解析 configOptions
  - 实现本地状态更新（完整 JSON-RPC 调用待 SDK 支持）
  - 存储 mode/model/thought_level 配置

- ✅ **Mock Adapter 测试支持**
  - 内置默认 configOptions：
    - mode: Ask / Code / Auto
    - model: Default / Fast / Quality
    - thought_level: None / Quick / Balanced / Deep

- ✅ **ChatView 动态渲染**
  - 底部工具栏根据 Agent 返回的 configOptions 动态生成
  - 每个 configOption 渲染为下拉选择按钮
  - 图标根据 category 自动识别：
    - 🛡️ mode
    - ⚡ model
    - 💭 thought_level
  - 点击选项调用 `adapter.setConfigOption()`

- ✅ **ACP 协议支持**
  - Session Config Options 优先于旧的 modes API
  - 支持 config_option_update 通知（会话期间动态更新）
  - 配置选项顺序反映 Agent 优先级

**UI 布局**：
```
┌────────────────────────────────────────────┐
│ 🤖 Agent ▾      [🟢] Backend    📜 🗑    │
│ Session Title                          │
├────────────────────────────────────────────┤
│                                          │
│   Messages...                            │
│                                          │
├────────────────────────────────────────────┤
│ [🛡️ Ask ▾] [⚡ Default ▾]     [✓ Auto]  │
└────────────────────────────────────────────┘
```

---

### 2026-04-08 - Phase 4: 快速切换功能 ✅

**新增功能（类似 Cursor AI 的界面）**：

- ✅ **Agent 选择下拉按钮**
  - 头部左侧显示 "🤖 Agent ▾" 按钮
  - 下拉列表显示所有已配置的 Agent
  - 当前 Agent 高亮显示 ✓
  - 点击切换 Agent，自动保存设置
  - 显示 Agent 类型图标（🧪 mock / 🤖 标准）

- ✅ **模型选择按钮**
  - 输入框底部工具栏左侧
  - 显示 "⚡ Model ▾"
  - 下拉选项：Default / Fast / Quality
  - 底部有 "Configure..." 链接到设置页

- ✅ **快捷配置按钮**
  - 底部工具栏中间：
    - ✓ Auto（自动确认只读操作）
    - 💭 Think（显示思考过程）
  - 点击切换开关状态，实时保存
  - 使用主题色高亮激活状态

- ✅ **设置快捷入口**
  - 底部工具栏右侧：⚙️ 按钮
  - 一键打开插件设置页

**UI 布局**（Cursor 风格）：
```
┌────────────────────────────────────────────┐
│ 🤖 Agent ▾    [🟢] BackendName    📜💬🗑 │
│ Session Title                              │
├────────────────────────────────────────────┤
│                                            │
│   Welcome to AgentLink!                    │
│                                            │
├────────────────────────────────────────────┤
│ [Input textarea                ] [Send]    │
│                                  [Stop]    │
├────────────────────────────────────────────┤
│ ⚡ Model ▾  [✓ Auto] [💭 Think]      ⚙️   │
└────────────────────────────────────────────┘
```

**文件变更**:
- `src/ui/chat-view.ts`:
  - 重写 `buildUI()`: Cursor 风格头部 + 底部工具栏
  - 添加 `renderAgentDropdown()`: Agent 选择下拉
  - 添加 `renderModelDropdown()`: 模型选择下拉
  - 添加 `onSettingsSave` 回调支持
- `src/main.ts`: 更新 ChatView 构造函数，传递 `onSettingsSave`

---

### 2026-04-08 - Terminal 风格 UI 重构 ✅

**布局变更**（模仿 Terminal.app 风格）：

- ✅ **两行紧凑头部设计**
  - Row 1: 🤖 AgentLink | [●] BackendName | 📜 💬 🗑️
  - Row 2: Session Title（灰色背景，可点击编辑）
  - 更紧凑的 padding 和字体大小

- ✅ **状态指示灯（HDD 灯风格）**
  - 🟢 绿色 (#4ade80): 已连接
  - 🔴 红色 (#f87171): 已断开
  - 🟡 黄色闪烁 (#fbbf24): 正在生成
  - 7px 圆形 LED，带发光效果

- ✅ **输入区布局**
  - 输入框在左（flex: 1）
  - Send/Stop 按钮在右侧垂直堆叠
  - 按钮尺寸更小（1.4rem 高）
  - 整体更紧凑

- ✅ **操作按钮优化**
  - 按钮仅显示图标，无文字
  - 悬停时透明度变化
  - 更小的点击区域

**文件变更**:
- `src/ui/chat-view.ts`:
  - 重写 `buildUI()`: Terminal 风格两行头部
  - 修改 `setBusy()`: 控制黄色 LED 闪烁
  - 修改 `refreshStatus()`: 更新 LED 颜色
  - 添加 `statusLed` DOM 引用

---

### 2026-04-08 - UI 优化 ✅

**修复问题**:
- ✅ **精简状态显示**
  - 简化前: `🌙 Kimi Code (ACP) (ACP Bridge) - disconnected [Chat, Read Files, Write Files, Edit Files, Terminal Commands]`
  - 简化后: `🌙 Kimi Code (ACP) • disconnected`
  - 移除了冗余的后端类型和 capabilities 列表
  - 现在只显示配置文件名和连接状态

- ✅ **History chat 改为下拉栏样式**
  - 从模态框改为内联下拉菜单
  - 点击 📜 按钮显示下拉列表
  - 包含 "+ New Chat" 按钮和所有历史会话
  - 当前会话高亮显示
  - 点击外部自动关闭

- ✅ **New Chat 防止重复创建**
  - 如果当前会话已经是空的（无消息），点击 💬 不再创建新会话
  - 直接聚焦输入框，避免重复空会话

- ✅ **Agent 显示使用配置文件名**
  - 显示用户配置的 name（如 "🌙 Kimi Code (ACP)"）
  - 不再显示内部类型 "ACP Bridge"

- ✅ **Generating 显示移到对话列表**
  - 从底部状态栏移到消息列表底部
  - 显示为带旋转动画的 "◐ Generating…" 指示器
  - 生成完成后自动消失

- ✅ **Send 按钮移到输入框下方**
  - 从并排改为垂直布局
  - 输入框在上，Send/Stop 按钮在下
  - 更符合聊天应用的使用习惯

**文件变更**:
- `src/ui/chat-view.ts`:
  - 修改 `refreshStatus()`: 精简状态显示
  - 修改 `buildUI()`: 重新布局 header 和 input area
  - 修改 `setBusy()`: 将 Generating 指示器移到消息列表
  - 添加 `renderHistoryDropdown()`: 下拉菜单渲染
  - 修改 `createNewSession()`: 防止重复创建空会话

---

### 2026-04-08 - 历史对话管理功能 ✅

**新增功能**:
- ✅ **SessionManager 服务**
  - 创建 `src/services/session-manager.ts`
  - 支持会话的创建、保存、加载、删除
  - 使用 Obsidian 插件数据存储持久化（`loadData`/`saveData`）
  - 自动限制最多保存 50 个会话，自动清理旧会话
  - 自动生成会话标题（基于第一条用户消息）

- ✅ **标题栏优化**
  - 新布局：🤖 AgentLink | [会话标题] | 📜 💬 🗑️
  - 会话标题可点击重命名
  - 📜 历史记录按钮：打开会话列表模态框
  - 💬 新建会话按钮：创建空白会话
  - 🗑️ 清空按钮：清空当前会话（保留历史）
  - 底部显示后端连接状态

- ✅ **历史对话列表 UI**
  - 模态框显示所有历史会话
  - 按更新时间倒序排列
  - 显示会话标题、时间、消息数量
  - 当前会话高亮标记
  - 支持加载和删除操作
  - 底部有 "+ New Chat" 按钮

- ✅ **对话标题管理**
  - 自动生成：基于第一条用户消息前 30 字符
  - 手动重命名：点击标题打开重命名对话框
  - 重命名对话框支持 Enter 确认、Esc 取消

- ✅ **自动保存机制**
  - 每条消息发送后自动保存会话
  - 会话状态与后端配置关联

**文件变更**:
- `src/services/session-manager.ts`: 新增会话管理服务
- `src/main.ts`: 
  - 集成 SessionManager
  - 在 plugin 类中添加 `sessionManager` 属性
  - 在 `onload` 中初始化 SessionManager
- `src/ui/chat-view.ts`:
  - 添加 SessionManager 导入和属性
  - 修改构造函数接收 SessionManager
  - 重写 `buildUI()` 创建新标题栏布局
  - 添加会话管理方法：`initializeSession()`, `createNewSession()`, `loadSession()`
  - 添加标题管理：`updateSessionTitle()`, `renameCurrentSession()`, `promptForTitle()`
  - 添加历史列表：`openSessionList()`, `renderSessionListItem()`
  - 添加删除确认：`confirmDelete()`
  - 添加自动保存：`saveCurrentSession()`

---

### 2026-04-08 - ACP 交互体验优化 ✅

**修复问题**:
- ✅ **Thinking 显示位置修复**
  - 修复了 thinking 内容显示在回答下方的问题
  - 现在 thinking 显示在 assistant 回答上方（符合 RPD 规范）
  - 实现方式：延迟创建 assistant DOM 元素，直到收到第一个 chunk
  - 如果先收到 thinking，会先渲染 thinking，再在其后渲染 assistant

- ✅ **Thinking Markdown 渲染支持**
  - thinking 内容现在支持完整的 Markdown 渲染
  - 使用 `MarkdownRenderer.render()` 渲染 thinking body 内容
  - 支持代码块、列表、链接等 Markdown 语法

- ✅ **Tool Use 卡片化显示**
  - 新增 `onToolCall` 回调到 `StreamHandlers` 接口
  - ACP adapter 现在通过 `onToolCall` 而非 `onChunk` 报告 tool use
  - Tool use 显示为卡片格式（而非 JSON 代码块）
  - 卡片显示工具名称、参数、执行状态

**文件变更**:
- `src/core/types.ts`: 添加 `onToolCall` 回调到 `StreamHandlers`
- `src/adapters/acp-bridge-adapter.ts`: 修改 `handleToolCall()` 使用新回调
- `src/ui/chat-view.ts`: 
  - 修改 `handleSend()` 延迟渲染 assistant 消息
  - 添加 `onToolCall` 处理逻辑
  - 添加 `generateId` 导入

### 2026-04-08 - 设置面板清理 ✅

**移除无意义配置**:
- ✅ **移除 Max Context Length 设置项**
  - 该配置用于限制文件内容长度，但在当前 ACP 架构下意义不大
  - 移除后，文件内容将完整发送（由后端自行处理截断）
  - 简化设置面板，减少用户困惑

**文件变更**:
- `src/settings/settings.ts`: 移除 `maxContextLength` 字段
- `src/settings/settings-tab.ts`: 移除 Max Context Length 设置 UI
- `src/ui/chat-view.ts`: 移除文件内容截断逻辑

---

## 📊 总体进度

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 0 - 项目基础 | ✅ 已完成 | 100% |
| Phase 1 - 核心类型与接口定义 | ✅ 已完成 | 100% |
| Phase 2 - 工具调用机制 | ✅ 已完成 | 100% |
| **Phase 3 - ACP Bridge Mode** | ✅ **已完成** | **100%** |
| Phase 4 - 历史对话保存功能 | ✅ **已完成** | **100%** |
| Phase 5 - 工程加固与发布 | 🟡 **进行中** | **20%** |

---

## ✅ 已完成工作

### Phase 0 - 项目基础 ✅

| 任务 | 状态 | 备注 |
|------|------|------|
| 项目初始化与插件结构 | ✅ | manifest, package.json, tsconfig 完整 |
| 基础 UI 组件 | ✅ | ChatView、消息列表、输入框 |
| Ribbon Icon & Commands | ✅ | bot 图标，打开/发送/切换后端命令 |
| MockAdapter 基础功能 | ✅ | 流式响应模拟 |
| 单元测试框架 | ✅ | Vitest 配置完成 |

**日期**: 2026-04-07 之前已完成

---

### Phase 1 - 核心类型与接口定义 ✅

#### 1.1 核心类型扩展

**文件**: `src/core/types.ts`

新增类型定义:
- `AgentResponse` 联合类型: `text` | `thinking` | `tool_call` | `file_edit` | `error`
- `ToolCall` / `ToolResult`: 工具调用标准格式
- `AgentCapability`: `chat` | `file_read` | `file_write` | `file_edit` | `terminal` | `code_index` | `web_search`
- `AgentBackendConfig`: 统一后端配置类型
  - `AcpBridgeBackendConfig`
  - `EmbeddedWebBackendConfig`
  - `MockBackendConfig`

#### 1.2 AgentAdapter 接口扩展

```typescript
interface AgentAdapter {
  // ... 原有方法
  getCapabilities(): AgentCapability[];
  executeTool?(call: ToolCall): Promise<ToolResult>;
}
```

#### 1.3 SessionStore 增强

**文件**: `src/services/session-store.ts`

新增:
- `pendingToolCalls`: 待确认工具调用队列
- `workspaceFiles`: Agent 已读取文件记录
- `agentState`: Agent 状态存储
- `updateMessageMetadata()`: 消息元数据更新

#### 1.4 Settings 重构

**文件**: `src/settings/settings.ts`, `src/settings/settings-tab.ts`

**架构变更**:
- 从单 backendType 改为多 backend 配置
- `activeBackendId`: 当前选中的 backend ID
- `backends`: Backend 配置数组

**新增配置项**:
- Backend 管理（添加/编辑/删除/切换）
- ACP Bridge 配置
- Embedded Web 配置
- 工具调用设置（autoConfirmRead, autoConfirmEdit, showThinking）

#### 1.5 适配器更新

| 适配器 | 更新内容 |
|--------|----------|
| MockAdapter | 新增 `getCapabilities()`, `executeTool()` |
| CliAdapter | 新增 `getCapabilities()` |
| HttpAdapter | 新增 `getCapabilities()` |

#### 1.6 ChatView 增强

**文件**: `src/ui/chat-view.ts`

新增:
- `tool_call` / `file_edit` 消息类型渲染
- 工具调用预览卡片（参数、结果、确认/拒绝按钮）
- 文件修改 diff 预览
- Backend 能力显示

#### 1.7 新增占位文件

| 文件 | 说明 | 阶段 |
|------|------|------|
| `src/services/tool-executor.ts` | 工具执行服务 | Phase 2 |
| `src/adapters/acp-bridge-adapter.ts` | ACP Bridge 适配器 | Phase 3 |
| `src/adapters/embedded-web-adapter.ts` | Embedded Web 适配器 | Phase 4 |

#### 1.8 测试

- 所有 78 个单元测试通过
- TypeScript 编译无错误
- 构建成功

**完成日期**: 2026-04-07

---

## 🟡 部分完成 / 占位完成

### Phase 2 - 工具调用机制 ✅

**状态**: 已完成

**已完成**:
- `ToolExecutor` 类完整实现
  - `read_file`: 通过 Obsidian API 读取文件内容
  - `write_file`: 创建新文件
  - `edit_file`: 支持 search/replace 和 full replace 两种编辑模式
  - `list_dir`: 列出目录内容
  - `search`: 搜索文件内容（基础实现）
  - `terminal`: 通过 Node child_process 执行命令（带超时和安全检查）
- 工具类型定义 (`read_file`, `write_file`, `edit_file`, `list_dir`, `search`, `terminal`)
- 权限分类 (`readonly`, `write`, `dangerous`)
- `canAutoConfirm()` 方法
- **ChatView 工具调用 UI 流程**
  - 工具调用预览卡片（参数、结果、状态显示）
  - 确认/拒绝/执行按钮交互
  - 文件修改 diff 预览和确认
  - 执行状态更新（pending → executing → completed/error）
- **工具结果回传机制**
  - 执行结果添加到 Session 作为系统消息
  - 成功时记录已读取文件到 workspaceFiles
  - 用户通知反馈
- **MockAdapter 增强**
  - 支持终端命令模拟 (`terminal:` 或 `run command`)
  - 工具调用状态管理（pendingToolCall, lastToolResult）
  - 工具结果响应流程

**完成日期**: 2026-04-07

---

### Phase 3 - ACP Bridge Mode ✅ **NEW - 今日完成**

**状态**: 已完成

**文件**: `src/adapters/acp-bridge-adapter.ts` (重构，791行)

**已完成功能**:

#### 1. ACP 协议实现
- ✅ JSON-RPC 2.0 消息格式
- ✅ stdio 通信层（stdin/stdout）
- ✅ 换行分隔的 JSON 消息处理
- ✅ Request/Response/Notification 消息类型

#### 2. 连接管理
- ✅ Bridge 进程启动和管理
- ✅ ACP 协议初始化 (`initialize`)
- ✅ 会话创建 (`session/new`)
- ✅ 连接状态管理 (disconnected/connecting/connected/busy/error)

#### 3. 消息处理
- ✅ 流式响应处理 (`session/update` notifications)
- ✅ 文本内容流式接收
- ✅ Thinking/Reasoning 过程显示
- ✅ 工具调用请求处理
- ✅ 文件读写请求处理
- ✅ 权限请求处理

#### 4. 工具调用机制
- ✅ 工具调用暂停机制
- ✅ `resumeAfterTool()`: 工具执行后恢复对话
- ✅ `rejectTool()`: 拒绝工具调用
- ✅ `hasPendingToolCalls()`: 检查待处理工具
- ✅ `getPendingToolCalls()`: 获取待处理工具列表

#### 5. 错误处理
- ✅ 请求超时处理
- ✅ 连接错误处理
- ✅ 取消操作支持
- ✅ 进程错误处理

**协议规范参考**:
- 创建了 `ACP_PROTOCOL_SPEC.md` - 完整 ACP 协议规范文档
- 创建了 `ACP_RESEARCH_SUMMARY.md` - 快速参考指南
- 参考: https://agentclientprotocol.com

**测试工具**: Kimi Code CLI

**配置示例**:
```typescript
{
  type: 'acp-bridge',
  id: 'kimi-local',
  name: 'Kimi Code',
  bridgeCommand: 'kimi',
  bridgeArgs: ['acp'],
  acpServerURL: 'http://localhost:8080', // 兼容性保留
  workspaceRoot: '/path/to/vault',
  env: {},
  timeoutMs: 120000,
  autoConfirmTools: false
}
```

**测试状态**: 78/78 单元测试通过 ✅

**完成日期**: 2026-04-07

---

### Phase 4 - Embedded Web Mode 🟡

**状态**: 骨架代码完成，iframe 集成待开发

**已完成**:
- `EmbeddedWebAdapter` 类结构
- iframe 创建/销毁方法
- `getCapabilities()` 占位
- OpenCode Web 测试配置文档（RPD.md）

**测试工具**: OpenCode Web（已配置在 RPD.md）

**配置示例**:
```typescript
{
  type: 'embedded-web',
  id: 'opencode-local',
  name: 'OpenCode Web',
  webURL: 'http://127.0.0.1:3000',
  timeoutMs: 120000
}
```

**待实现**:
- [ ] iframe 加载本地 Web UI
- [ ] postMessage 通信机制
- [ ] 消息协议定义
- [ ] 工具调用代理
- [ ] OpenCode Web 适配

**预估工作量**: 2-3 天

---

## ❌ 未开始

### Phase 5 - 工程加固与发布 ❌

| 任务 | 优先级 | 预估工作量 |
|------|--------|-----------|
| Mock 测试增强 | 中 | 1 天 |
| 集成测试 | 中 | 2 天 |
| 错误处理完善 | 高 | 2 天 |
| 性能优化 | 低 | 2 天 |
| 日志系统 | 中 | 1 天 |
| README 文档 | 高 | 1 天 |
| Agent 连接文档 | 高 | 1 天 |
| 社区提交 | 中 | 1 天 |

---

## 🐛 已知问题

暂无

---

## 📝 下一步计划

### 近期（1-2 周）

1. **Phase 4 - Embedded Web Mode** 🔴 当前重点
   - 实现 iframe 嵌入 Web UI
   - 实现 postMessage 双向通信
   - OpenCode Web 适配测试
   - 工具调用代理机制

### 中期（3-4 周）

2. **Phase 5 - 工程加固与发布**
   - 编写 README 和配置指南
   - 错误处理完善
   - 提交到 Obsidian 社区插件市场

---

## 🔧 近期改进

### 2026-04-08 - ACP session/update 消息格式修复 ✅

**问题**: 消息发送成功，模型被调用，但没有回显

**原因**: `session/update` 通知的消息格式解析错误

我之前的实现（错误）：
```typescript
interface SessionUpdate {
  status: 'thinking' | 'generating' | 'tool_calling';
  content?: string;
  // ...
}
```

官方 ACP 格式（正确）：
```typescript
interface SessionUpdate {
  sessionUpdate: 'agent_message_chunk' | 'thought' | 'tool_call' | 'tool_call_update' | 'plan';
  content?: { type: 'text' | 'thinking'; text?: string };
  toolCallId?: string;
  title?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  // ...
}
```

**修复内容**:
1. 根据官方 ACP 文档重新定义 `SessionUpdate` 类型
2. 重写 `handleSessionUpdate()` 方法处理正确的消息格式
3. 支持所有消息类型：
   - `agent_message_chunk` - 代理文本响应
   - `thought` - 思考过程
   - `tool_call` - 工具调用开始
   - `tool_call_update` - 工具调用状态更新
   - `plan` - 执行计划

**参考**: [ACP Prompt Turn 文档](https://agentclientprotocol.com/protocol/prompt-turn)

### 2026-04-08 - ACP Bridge 协议修复 ✅

**问题**: 使用 Kimi CLI 测试时出现 "Invalid params" 错误

**原因**:
- `session/new` 请求缺少必需的 `mcpServers` 参数
- 使用了错误的参数名 `workspaceRoot` 而不是 `cwd`

**修复内容**:

1. **修复 `createSession()` 方法** (`src/adapters/acp-bridge-adapter.ts`)
   ```typescript
   // 修复前
   await this.sendRequest('session/new', {
     workspaceRoot: this.config.workspaceRoot,
   });
   
   // 修复后
   await this.sendRequest('session/new', {
     cwd: this.config.workspaceRoot || process.cwd(),
     mcpServers: [], // 必需参数
   });
   ```

2. **增强错误处理** (`src/adapters/acp-bridge-adapter.ts`)
   - 添加对 `AUTH_REQUIRED` 错误的特殊处理
   - 提示用户运行 `kimi login` 进行认证
   - 为 "Invalid params" 错误提供更详细的上下文

3. **创建测试脚本**
   - `test-kimi-acp.js` - 完整的 ACP 协议测试脚本
   - 测试 initialize → session/new → session/prompt 完整流程
   - 显示详细的请求/响应日志

**验证结果**:
```
✅ Initialize successful
   Agent: Kimi Code CLI x.x.x
   Protocol version: 1

✅ Session created: sess_xxx
   Current mode: default
   Current model: kimi-k2-...

✅ Prompt completed
   Stop reason: end_turn
```

**使用说明**:
```bash
# 先登录 Kimi
kimi login

# 测试 ACP 连接
node test-kimi-acp.js
```

### 2026-04-07 - 构建系统优化 ✅

**新增功能**:
- ✅ **构建产物输出到 build/ 目录**
  - 修改 `esbuild.config.mjs`，生产构建时输出到 `build/` 文件夹
  - 自动复制 `manifest.json` 和 `styles.css` 到 build 目录
  - 构建完成显示产物大小统计

- ✅ **增强 package.json 脚本**
  ```json
  {
    "build": "npm run lint && npm run test && node esbuild.config.mjs production",
    "build:quick": "node esbuild.config.mjs production",
    "clean": "node -e \"require('fs').rmSync('build', {recursive: true, force: true})\""
  }
  ```

**构建产物**:
```
build/
├── main.js       (98.1 KB) - 主程序
├── manifest.json (0.3 KB)  - 插件清单
└── styles.css    (7.4 KB)  - 样式文件
```

**使用方法**:
```bash
# 完整构建（包含检查、测试、构建）
npm run build

# 快速构建（仅构建）
npm run build:quick

# 清理构建目录
npm run clean
```

### 2026-04-07 - 配置系统优化 ✅

**问题修复**:
- ✅ **自动添加缺失的预设配置**
  - 修复了 `Object.assign` 导致已保存配置覆盖默认预设的问题
  - 新增 `ensurePresetBackends()` 方法，自动检测并添加缺失的 Kimi/OpenCode 预设
  - 已安装用户重新启用插件后会自动获得新预设

- ✅ **简化 ACP 配置**
  - `acpServerURL` 现在为可选字段（`acpServerURL?: string`）
  - Kimi Code 预设移除了不必要的 URL 配置
  - 更新设置面板说明，明确说明 URL 只在 HTTP/WebSocket bridge 时需要

**新增功能**:
- ✅ **配置导入/导出（JSON格式）**
  - 设置面板新增 "📥 Import Config" 和 "📤 Export Config" 按钮
  - 导出：将所有后端配置保存为 JSON 文件（`agentlink-config-YYYY-MM-DD.json`）
  - 导入：从 JSON 文件导入后端配置，自动跳过重复的 ID
  - 方便用户备份、分享和批量修改配置

**文件变更**:
- `src/main.ts`: 添加 `ensurePresetBackends()` 和导入
- `src/core/types.ts`: `acpServerURL` 改为可选
- `src/settings/settings.ts`: Kimi 预设移除 URL，添加导出函数
- `src/settings/settings-tab.ts`: 添加导入/导出 UI 和逻辑
- `src/adapters/acp-bridge-adapter.ts`: `acpServerURL` 改为可选

### 2026-04-07 - 内置预设配置 ✅

**新增功能**:
- ✅ 内置 Kimi Code 预设配置 (`kimi-code`)
- ✅ 内置 OpenCode Web 预设配置 (`opencode-web`)
- ✅ 设置面板添加预设配置说明

---

## 📈 代码统计

| 指标 | 数值 |
|------|------|
| 源文件数 | 22 |
| 测试文件数 | 10 |
| 单元测试数 | 78 |
| 代码行数（估计） | ~5000 |

---

## 🔗 参考文档

- [RPD.md](./RPD.md) - 开发需求文档
- [ACP_PROTOCOL_SPEC.md](./ACP_PROTOCOL_SPEC.md) - ACP 协议规范文档
- [ACP_RESEARCH_SUMMARY.md](./ACP_RESEARCH_SUMMARY.md) - ACP 快速参考
- [Kimi CLI ACP 文档](https://www.kimi.com/code/docs/kimi-cli/guides/ides.html)
- [Agent Client Protocol](https://agentclientprotocol.com)
- [OpenCode Web 文档](https://opencode.ai/docs/zh-cn/web/)

---

## 👤 维护者

- **Run0812**
