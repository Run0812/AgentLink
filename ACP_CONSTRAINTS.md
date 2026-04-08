# ACP 实现约束

## 必须使用官方 SDK

**约束**: ACP Bridge Adapter 必须使用官方 `@agentclientprotocol/sdk`

**安装**:
```bash
npm install @agentclientprotocol/sdk
```

**参考文档**:
- SDK 文档: https://agentclientprotocol.github.io/typescript-sdk/
- ClientSideConnection: https://agentclientprotocol.github.io/typescript-sdk/classes/ClientSideConnection.html
- 示例代码: https://github.com/agentclientprotocol/typescript-sdk/tree/main/src/examples

## 关键要求

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

## 调试指南

### 打开 Obsidian 控制台

- **Windows/Linux**: `Ctrl + Shift + I`
- **macOS**: `Cmd + Option + I`

### 查看 AgentLink 日志

在 Console 中过滤:
```javascript
// 只看 ACP 相关日志
"[ACP]"
```

### 开启详细日志

在设置中勾选 **"Enable Debug Log"**，然后在控制台执行:
```javascript
localStorage.setItem('debug', 'AgentLink:*');
```

## 参考实现

查看官方示例:
- https://github.com/agentclientprotocol/typescript-sdk/tree/main/src/examples/client.ts
- https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/zed-integration/zedIntegration.ts
