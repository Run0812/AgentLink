# AgentLink 开发进展记录

> 最后更新: 2026-04-07
> 更新内容: 添加 OpenCode Web 作为 Embedded Web 测试方案

---

## 📊 总体进度

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 0 - 项目基础 | ✅ 已完成 | 100% |
| Phase 1 - 核心类型与接口定义 | ✅ 已完成 | 100% |
| Phase 2 - 工具调用机制 | ✅ 已完成 | 100% |
| Phase 3 - ACP Bridge Mode | 🟡 骨架完成 | 15% |
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

### Phase 3 - ACP Bridge Mode 🟡

**状态**: 骨架代码完成，协议实现待开发

**已完成**:
- `AcpBridgeAdapter` 类结构
- 配置类型定义
- `getCapabilities()` 占位

**待实现**:
- [ ] ACP 协议 WebSocket/HTTP 通信
- [ ] ACP 消息格式解析
- [ ] 工具调用暂停机制
- [ ] 工具结果回传
- [ ] 会话管理（sessionId）
- [ ] 流式响应处理
- [ ] 错误处理与重连

**测试工具**: Kimi Code CLI（已配置在 RPD.md）

**配置示例**:
```typescript
{
  type: 'acp-bridge',
  id: 'kimi-local',
  name: 'Kimi Code',
  bridgeCommand: 'kimi',
  bridgeArgs: 'acp',
  acpServerURL: 'http://localhost:8080'
}
```

**预估工作量**: 3-5 天

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

1. **Phase 3 - ACP Bridge Mode** 🔴 当前重点
   - 研究 ACP 协议细节 (https://agentclientprotocol.com)
   - 实现 WebSocket/HTTP 通信
   - ACP 消息格式解析（text/thinking/tool_call/file_edit）
   - 工具调用暂停机制
   - 工具结果回传
   - 使用 Kimi CLI 进行测试

### 中期（3-4 周）

2. **Phase 4 - Embedded Web Mode**
   - 完成 iframe 集成
   - 实现 postMessage 通信
   - OpenCode Web 适配

3. **Phase 5 - 工程加固与发布**
   - 编写 README 和配置指南
   - 错误处理完善
   - 提交到 Obsidian 社区插件市场

---

## 📈 代码统计

| 指标 | 数值 |
|------|------|
| 源文件数 | 22 |
| 测试文件数 | 10 |
| 单元测试数 | 78 |
| 代码行数（估计） | ~4000 |

---

## 🔗 参考文档

- [RPD.md](./RPD.md) - 开发需求文档
- [Kimi CLI ACP 文档](https://www.kimi.com/code/docs/kimi-cli/guides/ides.html)
- [Agent Client Protocol](https://agentclientprotocol.com)
- [OpenCode Web 文档](https://opencode.ai/docs/zh-cn/web/)

---

## 👤 维护者

- **Run0812**
