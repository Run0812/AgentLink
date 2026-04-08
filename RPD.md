# AgentLink - 开发需求文档 (RPD) v2.0

> 本地 AI Agent 统一前端插件 - 修正版

---

## 1. 项目目标

开发一个 **Obsidian 桌面端社区插件**，作为**本地部署的 AI Agent**的统一前端。

**核心区别：**
- ❌ 不是直接调用 LLM API（如 OpenAI API）
- ✅ 是连接本地运行的 Agent 进程（如 Claude Code CLI、Kimi Code、OpenCode Web 等）

### Agent vs API 的关键差异

| 维度 | Direct API | Local Agent |
|------|-----------|-------------|
| 交互模式 | 单次请求-响应 | 多轮会话、状态维护 |
| 上下文管理 | 需手动传入历史 | Agent 自动管理 workspace 上下文 |
| 工具能力 | 无 | 文件读写、代码执行、终端命令、代码索引 |
| 智能程度 | 纯文本生成 | 可分析、规划、执行、验证 |

### 用户场景

1. 用户在 Obsidian 中打开 AgentLink 侧边栏
2. 选择本地 Agent 后端（如 Claude Code CLI）
3. Agent 自动读取当前 vault/笔记作为 workspace 上下文
4. 用户输入需求："请分析这篇笔记并与我的其他笔记建立链接"
5. Agent 读取相关文件 → 分析内容 → 建议链接 → 用户确认后执行修改
6. 用户可以在侧边栏中和Agent进行对话，查看其显示

---

## 2. 项目范围

### 2.1 支持的后端类型

#### 1. ACP Bridge Mode

**目标:** 通过标准协议连接任何 ACP 兼容 Agent

**实现要求:**
- 本地启动 Agent Bridge 进程
- 插件与 Bridge 通过标准ACP协议通信
- 可以直接利用已有的ACP 兼容方案
- Bridge 负责与具体 Agent 的协议转换

#### 2. Embedded Web Mode

**目标:** 嵌入本地 Agent 的 Web UI

**实现要求:**
- 在 Obsidian view 中嵌入 WebView/Iframe
- 加载本地 Agent Web 界面（如 OpenCode Web）
- 与 Agent Web UI 进行双向通信

### 2.2 明确不做

- ❌ 不直接调用任何 LLM API（OpenAI, Anthropic API 等）
- ❌ 不做多用户/远程共享
- ❌ 不做移动端支持
- ❌ 不做 SaaS 化/云端中继
- ❌ 不做绕过订阅限制/伪装客户端

---

## 3. 用户故事

### 3.1 核心用户故事

1. **作为用户**，我可以在 Obsidian 中打开 AI 侧边栏
2. **作为用户**，我可以选择一个本地 Agent 后端：
   - Mock Agent（测试用）
   - ACP Bridge（通过标准协议连接本地 Agent）
   - Embedded Web（嵌入本地 Agent Web UI）
3. **作为用户**，我可以与 Agent 进行多轮对话，Agent 理解我的 vault 结构
4. **作为用户**，我可以看到 Agent 的思考过程（thinking）和最终回复
5. **作为用户**，当 Agent 建议修改文件时，我可以在 UI 中预览并确认
6. **作为用户**，我可以中断 Agent 的当前任务
7. **作为用户**，我可以在设置中配置 Agent 工作目录、启动参数等
8. **作为开发者**，我可以用 mock backend 测试 UI 流程
9. **作为开发者**，我可以运行自动化测试验证核心功能

### 3.2 非目标用户故事

- 不支持直接填入 OpenAI API key 进行对话
- 不支持多人共享同一 Agent 会话
- 不支持远程 Agent 服务

---

## 4. 功能需求

### 4.1 插件基础能力 ✅ 已完成

| 需求 | 状态 | 说明 |
|------|------|------|
| Obsidian 社区插件结构 | ✅ | manifest, package.json, tsconfig 完整 |
| 插件可正常加载 | ✅ | main.ts 入口正确 |
| Ribbon Icon | ✅ | bot 图标，点击打开侧边栏 |
| Command: Open Local Agent Chat | ✅ | 命令面板可用 |
| Command: Send selected text to agent | ✅ | 支持预填充选中内容 |
| Command: Switch backend type | ✅ | 循环切换后端 |
| isDesktopOnly: true | ✅ | 仅桌面端 |

### 4.2 聊天面板 ✅ 基础完成，需增强

#### 必须实现

| UI 组件 | 状态 | 需求 |
|---------|------|------|
| 标题栏 | ✅ | 显示 AgentLink 标题 |
| 后端状态显示 | ✅ | 显示当前 Agent 类型和连接状态 |
| 消息列表区 | ✅ | 显示对话历史 |
| 输入框 | ✅ | 支持多行，Ctrl+Enter 发送 |
| 发送按钮 | ✅ | 发送消息 |
| 停止按钮 | ✅ | 中断当前生成 |
| 清空会话按钮 | ✅ | 清空当前对话 |

#### 新增需求

| 需求 | 优先级 | 说明 |
|------|--------|------|
| Agent 工具调用预览 | 🔴 高 | 当 Agent 请求操作文件时，显示预览卡片 |
| Agent 思考过程折叠 | 🟡 中 | 可展开/折叠 Agent 的 <thinking> 内容 |
| 文件引用高亮 | 🟡 中 | Agent 提到的文件显示为可点击链接 |
| 确认/拒绝操作按钮 | 🔴 高 | 对 Agent 的工具调用请求进行确认 |

#### 消息类型

| 类型 | 状态 | 用途 |
|------|------|------|
| user | ✅ | 用户输入 |
| assistant | ✅ | Agent 回复 |
| system | ✅ | 系统消息 |
| error | ✅ | 错误提示 |
| status | ✅ | 状态提示 |
| **tool_call** | ❌ 新增 | Agent 请求执行工具 |
| **file_edit** | ❌ 新增 | Agent 建议的文件修改 |

### 4.3 后端适配抽象

#### 统一接口（已有，需扩展）

```typescript
interface AgentAdapter {
  readonly id: string;
  readonly label: string;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(input: AgentInput, handlers: StreamHandlers): Promise<void>;
  cancel(): Promise<void>;
  getStatus(): Promise<AgentStatus>;
  
  // 新增：获取 Agent 能力
  getCapabilities(): AgentCapability[];
  
  // 新增：执行工具调用并返回结果
  executeTool?(call: ToolCall): Promise<ToolResult>;
}

// 新增：Agent 能力定义
type AgentCapability = 
  | 'chat'
  | 'file_read'
  | 'file_write'
  | 'terminal'
  | 'code_index'
  | 'web_search';

// 新增：Agent 回复类型
type AgentResponse =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; id: string; tool: string; params: any }
  | { type: 'file_edit'; path: string; original: string; modified: string }
  | { type: 'error'; message: string };
```

#### Adapter 实现状态

| Adapter | 当前状态 | 修正方向 |
|---------|---------|---------|
| MockAdapter | ✅ 可用 | 增加工具调用模拟 |
| AcpBridgeAdapter | ❌ 待实现 | 通过 ACP 协议连接本地 Agent |
| EmbeddedWebAdapter | ❌ 待实现 | 嵌入本地 Agent Web UI |

### 4.4 ACP Bridge Mode

**目标:** 通过标准 ACP 协议连接任何 ACP 兼容 Agent

**⚠️ 关键约束 - 必须遵守:**
1. **必须使用官方 SDK**: `@agentclientprotocol/sdk` (npm install)
   - SDK 文档: https://agentclientprotocol.github.io/typescript-sdk/
   - 禁止使用手写的 JSON-RPC 协议实现
   - SDK 已处理所有协议细节、错误处理、重连逻辑
   
2. **所有通信日志必须输出到 Console**: 
   - 使用 `console.log()` 输出关键通信步骤
   - 方便前端开发者调试和质问
   - 包括: 发送请求、收到响应、错误信息、状态变化

**实现方式:**
```typescript
import { ClientSideConnection } from '@agentclientprotocol/sdk';

class AcpBridgeAdapter implements AgentAdapter {
  private connection: ClientSideConnection;
  
  async connect(): Promise<void> {
    console.log('[ACP] Connecting to agent...');
    
    this.connection = new ClientSideConnection({
      // 使用 stdio 传输
      transport: 'stdio',
      command: this.config.bridgeCommand,
      args: this.config.bridgeArgs,
      
      // 回调函数
      onNotification: (notification) => {
        console.log('[ACP] Received notification:', notification.method);
        this.handleNotification(notification);
      },
      
      onError: (error) => {
        console.error('[ACP] Connection error:', error);
      }
    });
    
    await this.connection.connect();
    console.log('[ACP] Connected successfully');
  }
  
  async sendMessage(input: AgentInput, handlers: StreamHandlers): Promise<void> {
    console.log('[ACP] Sending prompt:', input.prompt);
    
    // 使用 SDK 发送请求
    const response = await this.connection.request('session/prompt', {
      sessionId: this.sessionId,
      prompt: [{ type: 'text', text: input.prompt }]
    });
    
    console.log('[ACP] Response received:', response);
  }
}
```

**错误的手写方式（禁止）:**
```typescript
// ❌ 禁止这样写！容易出错且难以维护
private sendRawMessage(message: JsonRpcRequest) {
  this.process.stdin.write(JSON.stringify(message) + '\n');
}
```

**配置项:**

| 配置项 | 说明 | 示例 |
|--------|------|------|
| bridgeCommand | ACP Bridge 启动命令 | `acp-bridge` |
| bridgeArgs | 启动参数 | `--port 8080` |
| acpServerURL | ACP Server 地址 | `http://localhost:8080` |
| workspaceRoot | 工作目录（默认 vault 根目录） | `/path/to/vault` |
| env | 环境变量 | `ANTHROPIC_API_KEY=sk-xxx` |
| timeoutMs | 单次响应超时 | 120000 |
| autoConfirmTools | 自动确认工具调用（危险） | false |

**支持的目标 Agent:**

通过 ACP Bridge 可连接任何 ACP 兼容 Agent，包括但不限于：

| Agent | 说明 |
|-------|------|
| Claude Code | 通过 ACP Bridge 连接 |
| Kimi Code | 通过 ACP Bridge 连接 |
| 其他 ACP Agent | 任何实现 ACP 协议的 Agent |

### 4.5 Embedded Web Mode

**目标:** 快速集成已有 Web UI 的 Agent

**实现:**

```typescript
class EmbeddedWebAdapter implements AgentAdapter {
  private webview: Webview;
  
  async connect(): Promise<void> {
    // 在 Obsidian View 中创建 iframe/webview
    // 加载本地 Agent Web UI
    this.webview.src = 'http://localhost:3000';
    
    // 建立与 Web UI 的通信通道（postMessage 或 WebSocket）
  }
  
  async sendMessage(input: AgentInput): Promise<void> {
    // 通过 postMessage 发送消息到 Web UI
    this.webview.postMessage({ type: 'chat', content: input.prompt });
  }
}
```

**适用场景:**
- OpenCode Web 已有完整 UI，直接嵌入最快
- 其他有 Web 界面的本地 Agent

### 4.6 工具调用处理机制 - 新增 🔴 核心

**这是 Agent 与 API 的关键区别**

#### 流程

```
用户输入
   ↓
Agent 处理 → 需要读取 OtherNote.md
   ↓
Agent 返回 tool_call: { tool: 'read_file', params: { path: 'OtherNote.md' } }
   ↓
插件 UI 显示工具调用卡片
   ↓
用户点击"确认"
   ↓
插件执行：读取 vault/OtherNote.md
   ↓
插件返回结果给 Agent
   ↓
Agent 继续处理 → 最终回复
```

#### UI 设计

```
┌─────────────────────────────────────┐
│ 🤖 Agent 请求执行操作                 │
├─────────────────────────────────────┤
│ 读取文件: OtherNote.md               │
│                                     │
│ 预览内容:                           │
│ ┌─────────────────────────────────┐ │
│ │ # Other Note                    │ │
│ │ This is the content...          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [确认并发送] [拒绝] [编辑后发送]      │
└─────────────────────────────────────┘
```

#### 支持的工具类型

| 工具 | 说明 | 权限 |
|------|------|------|
| read_file | 读取文件内容 | 只读，安全 |
| write_file | 写入/创建文件 | 需确认 |
| edit_file | 修改文件内容 | 需确认，显示 diff |
| terminal | 执行终端命令 | 需确认，显示命令 |
| list_dir | 列出目录内容 | 只读，安全 |
| search | 搜索文件内容 | 只读，安全 |

### 4.7 设置页

#### 已有配置项 ✅

- backendType
- requestTimeoutMs
- enableDebugLog

#### 新增/修正配置项

| 配置项 | 类型 | 说明 | 适用后端 |
|--------|------|------|---------|
| workspaceRoot | string | Agent 工作目录（默认 vault 根目录） | 全局 |
| autoConfirmRead | boolean | 自动确认读取操作（默认 true） | 全局 |
| autoConfirmEdit | boolean | 自动确认文件修改（默认 false，危险） | 全局 |
| showThinking | boolean | 显示 Agent 思考过程（默认 true） | 全局 |
| **ACP Bridge** | | | |
| bridgeCommand | string | ACP Bridge 启动命令 | ACP Bridge |
| bridgeArgs | string[] | Bridge 启动参数 | ACP Bridge |
| acpServerURL | string | ACP Server 地址 | ACP Bridge |
| **Embedded Web** | | | |
| webURL | string | Embedded Web 模式地址 | Embedded Web |

### 4.8 会话管理

**当前:** SessionStore 仅存消息历史

**需要增强:**

```typescript
interface AgentSession {
  id: string;
  messages: ChatMessage[];
  
  // 新增
  agentState?: any;           // Agent 自身的状态（如有）
  pendingToolCalls: ToolCall[];  // 待确认的工具调用
  workspaceFiles: string[];   // Agent 已读取的文件
  cost?: {                    // 成本统计（如 Agent 支持）
    inputTokens: number;
    outputTokens: number;
  };
}
```

---

## 5. 非功能需求

### 5.1 平台要求

- 仅支持 Obsidian Desktop
- `isDesktopOnly: true`
- 需要 Node.js child_process 能力

### 5.2 安全边界

- ❌ 不伪装成其他客户端
- ❌ 不绕过订阅限制
- ✅ Agent 的 API key 由用户自己配置在本地
- ✅ 文件操作需要用户确认（除非明确配置 autoConfirm）
- ✅ 终端命令执行需要用户确认

### 5.3 可维护性

- 保持现有分层：UI / Settings / Adapters / Services
- 每个 Adapter 独立文件
- 工具调用机制抽象化，支持不同 Agent 的不同格式

---

## 6. 技术栈

- TypeScript
- Obsidian Plugin API
- Node.js child_process (ACP Bridge mode)
- fetch / WebSocket (ACP Bridge / Embedded Web mode)
- Vitest (测试)
- ESLint + Prettier

---

## 开发工作流

### 构建指令

| 命令 | 说明 | 输出位置 |
|------|------|---------|
| `npm run build` | 完整构建（含类型检查、测试、lint） | `build/` |
| `npm run build:quick` | 快速构建（仅打包，用于开发） | `build/` |
| `npm run dev` | 开发模式（监听文件变化，自动重建） | `./main.js` |

**关键配置** (`esbuild.config.mjs`):
- `outDir`: `prod ? "build" : "."` - 生产构建输出到 `build/` 目录
- `external`: 包含 `zod/v4` 以解决 ACP SDK 依赖问题
- `platform`: `node` - 支持 Node.js API (child_process, stream)

### 开发测试环境

项目包含一个预配置的 Obsidian 开发 vault:

```
dev/
├── .obsidian/
│   ├── app.json              # Obsidian 配置
│   └── plugins/
│       └── agentlink/        # 插件文件（从 build/ 复制）
│           ├── main.js
│           ├── manifest.json
│           └── styles.css
└── Welcome.md                # 测试用的示例笔记
```

**启动测试**:
1. 构建插件: `npm run build:quick`
2. 文件已自动复制到 `dev/.obsidian/plugins/agentlink/`
3. 用 Obsidian 打开 `dev/` 目录作为一个 vault
4. 在 Obsidian 设置中启用 Community Plugins → AgentLink
5. 使用 Ribbon 图标或 Command Palette (`Ctrl+P`) 打开 AgentLink 面板

**热重载开发**:
```bash
# 终端 1: 监听构建
npm run build:quick

# 修改代码后重新运行，文件自动复制到 dev vault
# 然后在 Obsidian 中按 Ctrl+R 重载
```

### 目录结构（更新）

```
project-root/
  manifest.json                 # 插件清单（包含 main: main.js）
  package.json                  # npm 依赖和脚本
  tsconfig.json                 # TypeScript 配置
  esbuild.config.mjs            # 构建配置
  versions.json                 # Obsidian 版本兼容
  styles.css                    # 插件样式
  main.ts                       # 入口文件（esbuild 入口）
  
  build/                        # 构建输出（生产）
    ├── main.js                 # 打包后的主程序
    ├── manifest.json           # 复制的清单文件
    └── styles.css              # 复制的样式文件
  
  dev/                          # 开发测试 vault
    ├── .obsidian/
    │   ├── app.json            # Obsidian 配置
    │   └── plugins/agentlink/  # 插件文件（从 build/ 复制）
    └── Welcome.md              # 测试笔记
  
  src/                          # 源码
    core/                       # 核心类型和工具
    settings/                   # 设置相关
    adapters/                   # Agent 适配器
    ui/                         # UI 组件
    services/                   # 业务服务
  
  test/                         # 测试代码
```

---

## 8. 分阶段 Roadmap

### Phase 0 - 项目基础 ✅ 已完成

| 任务 | 状态 |
|------|------|
| 项目初始化与插件结构 | ✅ |
| 基础 UI 组件（ChatView、消息列表、输入框） | ✅ |
| MockAdapter 基础功能 | ✅ |
| Ribbon Icon & Commands | ✅ |

---

### Phase 1 - 核心类型与接口定义 🔴 当前阶段

**目标:** 统一 Agent 协议的类型系统，为后续实现奠定基础

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 扩展 `AgentResponse` 类型 | 🔴 高 | text / thinking / tool_call / file_edit / error |
| 定义 `ToolCall` / `ToolResult` 类型 | 🔴 高 | 工具调用的标准格式 |
| 定义 `AgentCapability` 类型 | 🔴 高 | chat / file_read / file_write / terminal / code_index |
| 扩展 `AgentAdapter` 接口 | 🔴 高 | 增加 `getCapabilities()` / `executeTool()` |
| 更新 `AgentSession` 类型 | 🟡 中 | 增加 pendingToolCalls / workspaceFiles |
| 更新 Settings 配置项 | 🟡 中 | workspaceRoot / autoConfirmRead / autoConfirmEdit / showThinking |

**验收标准:**
- [ ] 所有类型定义通过 TypeScript 编译
- [ ] MockAdapter 实现新的接口方法
- [ ] 设置面板显示新的配置项
- [ ] **构建产物验证**: `npm run build` 成功，产物在 `build/` 目录
  - `build/main.js` - 主程序
  - `build/manifest.json` - 插件清单
  - `build/styles.css` - 样式文件

---

### Phase 2 - 工具调用机制 🔴 核心能力

**目标:** 实现 Agent 工具调用的完整流程（这是 Agent 与 API 的关键差异）

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 实现 `ToolExecutor` 服务 | 🔴 高 | 执行文件读写、目录列表、终端命令 |
| 实现 `ToolCallCard` UI 组件 | 🔴 高 | 显示工具调用请求卡片 |
| 实现 `FileDiffView` 组件 | 🔴 高 | 显示文件修改的 diff 预览 |
| 实现确认/拒绝/编辑流程 | 🔴 高 | 用户交互决策 |
| 集成到 ChatView | 🔴 高 | 在消息流中显示工具调用 |
| 工具调用结果回传 Agent | 🔴 高 | 将执行结果返回给 Agent |
| 权限控制机制 | 🟡 中 | 区分 readonly / need-confirm 工具 |

**UI 设计:**
```
┌─────────────────────────────────────┐
│ 🤖 Agent 请求执行操作                 │
├─────────────────────────────────────┤
│ 读取文件: OtherNote.md               │
│                                     │
│ 预览内容:                           │
│ ┌─────────────────────────────────┐ │
│ │ # Other Note                    │ │
│ │ This is the content...          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [确认并发送] [拒绝] [编辑后发送]      │
└─────────────────────────────────────┘
```

**验收标准:**
- [ ] Agent 请求 `read_file` → 用户确认 → 返回内容 → Agent 继续
- [ ] Agent 请求 `write_file` → 显示 diff → 用户确认 → 执行修改
- [ ] Agent 请求 `terminal` → 显示命令 → 用户确认 → 执行并返回结果
- [ ] 拒绝操作后，Agent 收到拒绝信息并继续对话
- [ ] `autoConfirmRead: true` 时自动确认只读操作
- [ ] **构建产物验证**: `npm run build` 成功，产物在 `build/` 目录
  - `build/main.js` - 主程序
  - `build/styles.css` - 样式文件

---

### Phase 3 - ACP Bridge Mode 🔴 核心后端

**目标:** 实现 ACP Bridge Adapter，通过标准 ACP 协议连接本地 Agent

ACP Bridge 是项目支持的主要后端类型，由 Bridge 负责与具体 Agent（Claude Code、Kimi Code 等）的协议转换。

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 研究 ACP 协议规范 | 🔴 高 | https://agentclientprotocol.com |
| 实现 AcpBridgeAdapter | 🔴 高 | 连接本地 ACP Bridge 进程 |
| ACP 消息格式解析 | 🔴 高 | 解析 text / thinking / tool_call / file_edit |
| 工具调用暂停机制 | 🔴 高 | 检测到 tool_call 时暂停等待用户确认 |
| 工具调用结果回传 | 🔴 高 | 将执行结果通过 ACP 返回给 Bridge |
| 会话管理 | 🔴 高 | sessionId / workspace 上下文 |
| 流式响应处理 | 🟡 中 | 实时显示 Agent 输出 |
| 错误处理与重连 | 🟡 中 | 连接断开恢复 |

**配置项:**
```typescript
{
  bridgeCommand: string;    // ACP Bridge 启动命令
  bridgeArgs: string[];     // ['--port', '8080']
  workspaceRoot: string;    // vault 根目录
  acpServerURL: string;     // ACP Server 地址
  timeoutMs: number;
  autoConfirmTools: boolean;
}
```

**验收标准:**
- [ ] 可以连接本地 ACP Bridge 进程
- [ ] 可以进行多轮对话，Agent 记忆上下文
- [ ] Agent 通过 ACP 请求读取 vault 文件 → 用户确认 → 返回内容
- [ ] Agent 通过 ACP 请求修改文件 → 显示 diff → 用户确认 → 执行
- [ ] 支持 ACP 协议的流式响应
- [ ] **构建产物验证**: `npm run build` 成功，产物在 `build/` 目录
  - `build/main.js` - 主程序
  - `build/styles.css` - 样式文件

#### Kimi Code CLI 测试配置

Kimi Code CLI 原生支持 ACP 协议，可作为 Phase 3 的主要测试工具。

**前置准备:**
1. 安装 Kimi Code CLI: `pip install kimi-cli` 或参考[官方文档](https://www.kimi.com/code/docs/kimi-cli/quick-start.html)
2. 完成登录配置: `kimi login`

**AgentLink 配置示例:**

在 AgentLink 设置中添加 ACP Bridge 类型的 Backend：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| Backend Name | `Kimi Code` | 显示名称 |
| Bridge Command | `kimi` | CLI 命令，如不在 PATH 中使用完整路径 |
| Bridge Arguments | `acp` | 启动 ACP 模式的参数 |
| ACP Server URL | `http://localhost:8080` | ACP Server 地址（Kimi CLI 默认端口） |
| Workspace Root | (留空) | 使用 Obsidian Vault 根目录 |
| Environment Variables | (留空) | 通常不需要额外环境变量 |

**对应的底层配置结构:**
```typescript
{
  type: 'acp-bridge',
  id: 'kimi-local',
  name: 'Kimi Code',
  bridgeCommand: 'kimi',           // 或完整路径如: ~/.local/bin/kimi
  bridgeArgs: 'acp',               // 启用 ACP 模式
  acpServerURL: 'http://localhost:8080',
  workspaceRoot: '',               // 默认使用 vault 根目录
  env: '',                         // 可选: KIMI_API_KEY=sk-xxx
  timeoutMs: 120000,
  autoConfirmTools: false          // 建议保持 false，手动确认工具调用
}
```

**测试步骤:**
1. 确保 Kimi CLI 已安装并登录: `kimi --version`
2. 在 AgentLink 中添加 Kimi Code Backend
3. 在 AgentLink 侧边栏选择 Kimi Code 作为 active backend
4. 发送测试消息，观察是否能够正常连接和对话
5. 测试工具调用：请求 Kimi "读取当前笔记内容"，确认工具调用预览卡片显示正常

**参考文档:**
- [Kimi CLI ACP 模式文档](https://www.kimi.com/code/docs/kimi-cli/guides/ides.html)
- [Agent Client Protocol](https://agentclientprotocol.com)

---

### Phase 4 - Embedded Web Mode

**目标:** 嵌入本地 Agent 的 Web UI（快速集成方案）

对于已有 Web 界面的本地 Agent（如 OpenCode Web），直接嵌入 iframe 是最快的集成方式。

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 实现 EmbeddedWebAdapter | 🔴 高 | 在 View 中嵌入 iframe |
| iframe 加载与生命周期 | 🔴 高 | 正确加载本地 Web UI |
| postMessage 通信 | 🔴 高 | Obsidian ↔ Web UI 双向通信 |
| 消息协议定义 | 🔴 高 | 统一的消息格式 |
| 工具调用代理 | 🔴 高 | Web UI 请求工具 → 插件执行 → 返回结果 |
| OpenCode Web 适配 | 🟡 中 | 针对 OpenCode Web 优化 |
| 其他 Web UI 适配 | 🟢 低 | 通用适配方案 |

**通信协议:**
```typescript
// Web UI → Plugin
{
  type: 'tool_call',
  id: string,
  tool: 'read_file',
  params: { path: 'note.md' }
}

// Plugin → Web UI
{
  type: 'tool_result',
  id: string,
  result: { content: '...' }
}
```

**验收标准:**
- [ ] iframe 正确加载本地 Agent Web UI
- [ ] 可以在 Obsidian 中与 Web UI 交互
- [ ] Web UI 请求的工具调用经插件确认后执行
- [ ] 工具执行结果正确返回给 Web UI
- [ ] **构建产物验证**: `npm run build` 成功，产物在 `build/` 目录
  - `build/main.js` - 主程序
  - `build/styles.css` - 样式文件

#### OpenCode Web 测试配置

OpenCode Web 是一个可以直接嵌入的本地 Agent Web UI，可作为 Phase 4 的主要测试工具。

**前置准备:**
1. 安装 OpenCode: 参考[官方文档](https://opencode.ai/docs/zh-cn/installation.html)
2. 启动 Web 服务器:
   ```bash
   # 基本启动（自动选择端口）
   opencode --web
   
   # 或指定端口
   opencode --web --port 3000
   
   # 或启用 mDNS（本地网络发现）
   opencode --web --mDNS
   ```

**AgentLink 配置示例:**

在 AgentLink 设置中添加 Embedded Web 类型的 Backend：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| Backend Name | `OpenCode Web` | 显示名称 |
| Web URL | `http://127.0.0.1:3000` | OpenCode Web 地址（根据实际端口调整） |
| Request Timeout (ms) | `120000` | 请求超时时间 |

**对应的底层配置结构:**
```typescript
{
  type: 'embedded-web',
  id: 'opencode-local',
  name: 'OpenCode Web',
  webURL: 'http://127.0.0.1:3000',    // 根据 opencode --web 输出调整
  timeoutMs: 120000
}
```

**高级配置选项:**

如果需要密码保护，先设置环境变量：
```bash
export OPENCODE_SERVER_PASSWORD=your-password
opencode --web --port 3000
```

然后在 AgentLink 中配置：
```typescript
{
  type: 'embedded-web',
  id: 'opencode-secure',
  name: 'OpenCode Web (Secure)',
  webURL: 'http://127.0.0.1:3000',
  timeoutMs: 120000
  // 注意：密码认证将通过 postMessage 或 URL 参数处理
}
```

**测试步骤:**
1. 确保 OpenCode 已安装: `opencode --version`
2. 启动 OpenCode Web 服务: `opencode --web --port 3000`
3. 在 AgentLink 中添加 OpenCode Web Backend，Web URL 填 `http://127.0.0.1:3000`
4. 在 AgentLink 侧边栏选择 OpenCode Web 作为 active backend
5. 发送测试消息，观察 Web UI 是否正确加载
6. 测试工具调用：请求 OpenCode "读取当前笔记内容"，确认插件能拦截工具调用并显示确认对话框

**注意事项:**
- OpenCode Web 默认绑定到 `127.0.0.1`（仅限本地访问），这是安全的
- 如果需要网络访问，使用 `opencode --web --host 0.0.0.0`
- 建议启用密码保护（`OPENCODE_SERVER_PASSWORD`）以防止未授权访问

**参考文档:**
- [OpenCode Web 文档](https://opencode.ai/docs/zh-cn/web/)
- [GitHub: opencode](https://github.com/anomalyco/opencode)

---

### Phase 5 - 工程加固与发布

**目标:** 测试覆盖、文档完善、性能优化

| 任务 | 优先级 | 说明 |
|------|--------|------|
| Mock 测试增强 | 🟡 中 | 模拟 thinking / tool_call / file_edit |
| 集成测试 | 🟡 中 | mock-acp-bridge.js / mock-embedded-web.html |
| 错误处理完善 | 🔴 高 | 网络错误、进程错误、超时处理 |
| 性能优化 | 🟢 低 | 大文件处理、消息列表虚拟滚动 |
| 日志系统 | 🟡 中 | 调试日志、操作审计 |
| README 文档 | 🔴 高 | 安装说明、配置指南 |
| Agent 连接文档 | 🔴 高 | Claude Code、Kimi Code、OpenCode 配置教程 |
| 社区提交 | 🟡 中 | 提交到 Obsidian 社区插件市场 |

**验收标准:**
- [ ] 单元测试覆盖率 > 60%
- [ ] 各 Adapter 有对应的 mock 测试
- [ ] 文档完整覆盖安装、配置、使用
- [ ] 通过 Obsidian 社区审核
- [ ] **构建产物验证**: `npm run build` 成功，产物在 `build/` 目录
  - `build/main.js` - 主程序
  - `build/manifest.json` - 插件清单
  - `build/styles.css` - 样式文件
  - 构建产物可直接安装到 Obsidian

---

## 依赖关系图

```
Phase 0 (项目基础) ✅
    ↓
Phase 1 (类型定义)
    ↓
Phase 2 (工具调用机制)
    ↓
Phase 3 (ACP Bridge Mode) ───────┐
    ↓                             ├── 两者可并行
Phase 4 (Embedded Web Mode) ─────┘
    ↓
Phase 5 (工程加固与发布)
```

## 与原文档的差异总结

| 变更 | 原文档 | 新规划 | 理由 |
|------|--------|--------|------|
| 工具调用机制顺序 | Phase 3 | Phase 2 | 工具调用是核心能力，应提前完成 |
| CLI Mode | 包含 | ❌ 移除 | 不在项目范围内，由 ACP Bridge 替代 |
| HTTP Mode | 包含 | ❌ 移除 | 不在项目范围内，由 ACP Bridge 替代 |
| ACP Bridge | Phase 5.1 / 未明确 | Phase 3 | 作为主要后端优先实现 |
| Embedded Web | Phase 5.2 | Phase 4 | 作为备选集成方案 |
| 阶段总数 | 6 个阶段 | 5 个阶段 | 精简合并，聚焦核心功能 |

## 支持的 Agent 连接方式

根据项目范围 (2.1)，最终支持的后端：

| 后端类型 | 实现方式 | 适用场景 |
|---------|---------|---------|
| **ACP Bridge** | AcpBridgeAdapter | 主要推荐方式，通过标准协议连接任何 ACP 兼容 Agent |
| **Embedded Web** | EmbeddedWebAdapter | 快速集成已有 Web UI 的 Agent |
| **Mock** | MockAdapter | 开发和测试使用 |

---

## 9. 测试策略

### 9.1 Mock 测试

MockAdapter 需要模拟：
- 流式文本回复
- Thinking 过程
- 工具调用请求（read_file, edit_file）

### 9.2 集成测试

- 使用 mock-acp-bridge.js 模拟 ACP Bridge
- 使用 mock-embedded-web.html 模拟 Embedded Web Agent

### 9.3 手动测试

| 后端 | 测试内容 |
|------|---------|
| ACP Bridge | 启动 Bridge → 连接 → 对话 → 文件操作 |
| Embedded Web | 启动本地 Web UI → 嵌入 → 交互 |

---

## 10. 交付物

- 可运行插件源码
- README（安装说明、快速开始）
- ACP Bridge 配置指南（如何连接 Claude Code、Kimi Code 等 Agent）
- Embedded Web Mode 配置指南（OpenCode Web 等）
- 工具调用配置说明
- Mock fixtures

---

## 11. 成功定义

以下条件全部满足：

1. ✅ 插件可在 Obsidian Desktop 成功加载
2. ✅ 可打开 AI 面板
3. ✅ 可通过 MockAdapter 完成演示（含工具调用）
4. 🔴 **可通过 ACP Bridge 连接真实 Agent（Claude Code / Kimi Code 等）**
5. ✅ 可停止生成
6. ✅ 可切换后端
7. 🔴 **Agent 能读取 vault 文件并与用户对话**
8. 🔴 **Agent 建议的文件修改需用户确认**
9. ✅ 基础测试通过
10. ✅ 架构允许接入更多 Agent

---

## 附录：Agent 协议参考

### ACP (Agent Client Protocol)
- https://agentclientprotocol.com/libraries/typescript
- https://agentclientprotocol.com/get-started/registry

### Kimi Code CLI
- https://www.kimi.com/code/docs/kimi-cli/quick-start.html
- https://www.kimi.com/code/docs/kimi-cli/guides/ides.html

### OpenCode
- https://opencode.ai/docs/zh-cn/web/
- https://github.com/anomalyco/opencode