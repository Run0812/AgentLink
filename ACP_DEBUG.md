# ACP 协议调试指南

## 快速测试

### 1. 确保 Kimi CLI 已安装并登录

```bash
# 安装 Kimi CLI
pip install kimi-cli

# 登录（必需）
kimi login

# 验证登录状态
kimi --version
```

### 2. 运行测试脚本

```bash
# 使用项目提供的测试脚本
node test-kimi-acp.js
```

预期输出：
```
🧪 Testing ACP connection to Kimi CLI
=====================================

🚀 Starting kimi acp...
✅ Process started, PID: xxxxx

⏳ Waiting for kimi to initialize...

=== Test 1: Initialize ===
📤 [Sending]: {
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    ...
  }
}
📥 [Received]: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,...}}
✅ [Success]: {"protocolVersion":1,...}

✅ Initialize successful!
   Agent: Kimi Code CLI x.x.x
   Protocol version: 1

=== Test 2: Create Session ===
...
✅ Session created: sess_xxxxxxxx

=== Test 3: Send Prompt ===
...
✅ Prompt completed!
   Stop reason: end_turn
```

### 3. 在 Obsidian 中测试

1. 构建插件：
```bash
npm run build
```

2. 复制到 Obsidian：
```bash
cp -r build/ /path/to/vault/.obsidian/plugins/agentlink/
```

3. 启用插件并选择 "🌙 Kimi Code (ACP)" 后端

4. 开始对话！

## 常见问题

### "Invalid params" 错误

**原因**：缺少必需的参数

**解决**：确保已更新到最新版本，修复了 `session/new` 的参数问题

### "AUTH_REQUIRED" 错误

**原因**：未登录 Kimi CLI

**解决**：
```bash
kimi login
```

### 连接超时

**原因**：Kimi CLI 启动慢或进程卡死

**解决**：
```bash
# 检查 kimi 进程
ps aux | grep kimi

# 杀死卡死的进程
killall kimi

# 重新测试
node test-kimi-acp.js
```

## ACP 协议格式

### Initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {
      "fs": {
        "readTextFile": true,
        "writeTextFile": true
      }
    },
    "clientInfo": {
      "name": "AgentLink",
      "version": "1.0.0"
    }
  }
}
```

### Session/New

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/new",
  "params": {
    "cwd": "/absolute/path/to/workspace",
    "mcpServers": []
  }
}
```

### Session/Prompt

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "session/prompt",
  "params": {
    "sessionId": "sess_xxxxxx",
    "prompt": [
      {
        "type": "text",
        "text": "Hello, how are you?"
      }
    ]
  }
}
```

## 参考

- [Kimi CLI 文档](https://www.kimi.com/code/docs/kimi-cli/guides/ides.html)
- [Agent Client Protocol](https://agentclientprotocol.com)
