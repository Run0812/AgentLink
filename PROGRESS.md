# AgentLink 开发进展记录

> 最后更新: 2026-04-07
> 更新内容: Phase 3 ACP Bridge Mode 完整实现

---

## 📊 总体进度

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 0 - 项目基础 | ✅ 已完成 | 100% |
| Phase 1 - 核心类型与接口定义 | ✅ 已完成 | 100% |
| Phase 2 - 工具调用机制 | ✅ 已完成 | 100% |
| **Phase 3 - ACP Bridge Mode** | ✅ **已完成** | **100%** |
| Phase 4 - Embedded Web Mode | 🟡 骨架完成 | 15% |
| Phase 5 - 工程加固与发布 | ❌ 未开始 | 0% |

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
