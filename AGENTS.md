# AgentLink Agent指南 (AGENTS.md)

> 本文档说明项目 `.memory/` 目录下各 markdown 文件的使用方式和维护规范


## 开发工作流

### 开始新功能开发

1. 阅读 `01-tasks.md` 了解当前开发重点
2. 查看 `05-ui-ux.md` 确保设计符合规范
3. 阅读 `04-testing.md` 了解如何测试新功能
4. 开发完成后更新 `02-progress.md` 记录进度

### 修复 Bug

1. 在 `03-bugs.md` 中查找是否有相关记录
2. 如无记录，添加到"待修复"区域
3. 修复后更新状态并移动到"已修复"区域
4. 在 `02-progress.md` 中记录修复内容

### 发布前检查

1. 查看 `03-bugs.md` 确认无待修复的严重 Bug
2. 按 `04-testing.md` 中的"发布检查清单"逐项检查
3. 运行完整构建和测试
4. 更新版本号

---

## 实现约束

## 代码风格
- 清晰、明确
- 注重生命周期管理
- 注重数据流管理
- 注重同样语义的代码复用，而不是同样实现的代码复用

## 插件开发规范
- 遵循 obsidian 插件开发规范

## UI框架
- UI 框架使用 **Preact**（React 兼容的轻量替代方案）
- 配置: tsconfig.json 设置 `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`
- 善于利用现成的控件，不要自己造太多轮子

## 必须使用ACP官方 SDK

**约束**: ACP Bridge Adapter 必须使用官方 `@agentclientprotocol/sdk`

**安装**:
```bash
npm install @agentclientprotocol/sdk
```

**参考文档**:
- SDK 文档: https://agentclientprotocol.github.io/typescript-sdk/
- ClientSideConnection: https://agentclientprotocol.github.io/typescript-sdk/classes/ClientSideConnection.html
- 示例代码: https://github.com/agentclientprotocol/typescript-sdk/tree/main/src/examples

---

## 关键要求

### 0. 所有对AGENTS.md的修改都需要我手动确认

### 1. 所有通信必须输出到 Console

为了方便前端开发者调试，所有关键通信步骤必须输出到 console：

```typescript
console.log('[ACP] Connecting to agent...');
console.log('[ACP] Sending prompt:', prompt);
console.log('[ACP] Received response:', response);
console.error('[ACP] Error:', error);
```

### 2. 禁止手写 ACP 协议

❌ **禁止这样写**:
```typescript
// 手写 JSON-RPC
private sendRawMessage(message: JsonRpcRequest) {
  this.process.stdin.write(JSON.stringify(message) + '\n');
}
```

✅ **必须这样写**:
```typescript
import { ClientSideConnection, ndJsonStream } from '@agentclientprotocol/sdk';

const connection = new ClientSideConnection(clientHandler, stream);
```

### 3. 使用 SDK 的标准流程

```typescript
import { 
  ClientSideConnection, 
  ndJsonStream,
  type Client,
  type SessionUpdate 
} from '@agentclientprotocol/sdk';

// 1. 创建 stream
const stream = ndJsonStream(stdin, stdout);

// 2. 创建 Client handler
const client: Client = {
  sessionUpdate: (params) => {
    console.log('[ACP] Update:', params.update?.sessionUpdate);
    // 处理消息更新
    return Promise.resolve();
  },
  // ... 其他必需的方法
};

// 3. 创建连接
const connection = new ClientSideConnection(() => client, stream);

// 4. 初始化
await connection.initialize({
  protocolVersion: 1,
  clientCapabilities: { ... },
  clientInfo: { name: 'AgentLink', version: '1.0.0' }
});

// 5. 创建 session
const session = await connection.newSession({
  cwd: '/path/to/workspace',
  mcpServers: []
});

// 6. 发送 prompt
const response = await connection.prompt({
  sessionId: session.sessionId,
  prompt: [{ type: 'text', text: 'Hello' }]
});
```


---

## Agent 记忆文档结构

项目根目录下的 `.memory/` 文件夹包含 5 个核心文档，用于支持 Agent 开发和项目管理：

```
.memory/
├── 01-tasks.md      # 开发任务目标（长期看板）
├── 02-progress.md   # 当前开发进度
├── 03-bugs.md       # Bug 记录
├── 04-testing.md    # 测试流程文档
└── 05-ui-ux.md      # 交互及界面描述文档
```

---

### 文档使用指南

#### 1. 开发任务目标 (01-tasks.md)

**用途**: 长期任务看板，记录项目的功能需求和开发阶段

**何时更新**:
- 添加新功能点时，在"待开发功能"区域添加条目
- 完成功能点后，将任务标记为 `[x]` 并移动到"最近完成"区域
- 项目阶段变更时更新"开发阶段"表格

**内容结构**:
- 项目概述
- 开发阶段总览
- 当前焦点任务（高优先级）
- 待开发功能（中/低优先级）
- 最近完成的任务
- 功能需求清单

---

#### 2. 当前开发进度 (02-progress.md)

**用途**: 详细的开发进展记录，按时间倒序排列

**何时更新**:
- 每次完成重要功能或修复后，在文件顶部添加新的进度条目
- 按日期倒序排列（最新的在最上面）
- 包含具体变更的文件和简要说明

**内容结构**:
- 总体进度概览
- 按日期的详细进度条目
- 代码统计
- 下一步计划

---

#### 3. Bug 记录 (03-bugs.md)

**用途**: 跟踪项目中的已知问题和已修复的 Bug

**何时更新**:
- 发现新 Bug 时，在"待修复"区域添加条目
- 修复 Bug 后，移动到"已修复"区域并注明修复日期
- 定期清理过期的已修复 Bug 记录

**内容结构**:
- 当前状态概览
- 待修复列表
- 已修复列表（按日期分组）
- 常见问题和解决方案
- Bug 报告模板

**Bug 记录模板**:
```markdown
### [日期] - Bug 标题

**问题描述**: [简要描述]

**原因**: [根本原因]

**修复内容**: [具体修复步骤]

**相关文件**: [文件路径]
```

---

#### 4. 测试流程文档 (04-testing.md)

**用途**: 记录项目的测试方法、调试指南和构建流程

**何时更新**:
- 新成员加入时阅读此文档了解测试流程
- 测试流程变更时更新
- 添加新的测试用例或调试方法时更新

**内容结构**:
- 快速开始指南
- 构建流程说明
- 测试策略（Mock/ACP/单元测试）
- 安装到 Obsidian 的方法
- ACP 协议调试指南
- 故障排除指南
- 发布检查清单

---

#### 5. 交互及界面描述文档 (05-ui-ux.md)

**用途**: 定义用户界面外观和交互体验规范

**何时更新**:
- 实现新 UI 功能前阅读此文档了解设计规范
- UI 设计变更时更新
- 新增交互模式时更新

**内容结构**:
- 设计原则
- 布局结构（含图示）
- 交互规范
- 消息显示规范
- 响应式行为
- 快捷键
- 主题适配
- CSS 变量参考

---

### 文档维护规范

#### 更新频率

| 文档 | 更新时机 |
|------|---------|
| 01-tasks.md | 每周回顾，添加/完成任务时更新 |
| 02-progress.md | 每次提交重要变更后更新 |
| 03-bugs.md | 发现/修复 Bug 时立即更新 |
| 04-testing.md | 流程变更时更新 |
| 05-ui-ux.md | 设计变更时更新 |

#### 格式规范

- 使用 Markdown 格式
- 标题使用 `##` 层级
- 列表使用 `-` 或 `*`
- 表格用于对比和清单
- 代码块标注语言类型

#### 版本标记

每个文档末尾包含最后更新日期：

```markdown
---

*最后更新: YYYY-MM-DD*
```

---

## 快速参考

### 文件对应关系

| 需求 | 查阅文档 |
|------|---------|
| 了解当前开发重点 | 01-tasks.md |
| 查看最近完成了什么 | 02-progress.md |
| 了解如何运行测试 | 04-testing.md |
| 了解 UI 设计规范 | 05-ui-ux.md |
| 查看已知问题 | 03-bugs.md |
| 了解构建流程 | 04-testing.md |

---

## 参考资源

- [Agent Client Protocol](https://agentclientprotocol.com)
- [Obsidian 插件开发文档](https://docs.obsidian.md)

---

*本文档最后更新: 2026-04-09*
