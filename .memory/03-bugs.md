# AgentLink Bug 记录

> 记录项目中的已知问题和已修复的 Bug
> 
> **使用方式**:
> - 发现新 Bug 时，在"待修复"区域添加条目
> - 修复 Bug 后，移动到"已修复"区域并注明修复日期和 commit
> - 定期清理过期的已修复 Bug 记录

---

## 当前状态

🟢 **当前无已知严重 Bug**

---

## 待修复

暂无

---

## 已修复

### 2026-04-10

#### 1. 新建对话未预连接，LED 长时间黄灯闪烁

**问题描述**:
新建对话或首次打开聊天面板后，ACP 连接没有立即建立，状态灯持续黄灯闪烁，Agent slash commands 也不会提前加载；往往需要先发送第一句话，ACP session 才真正创建。

**原因**:
- `ChatView.onOpen()` 只把 LED 设成 `connecting`，但没有真正触发 `adapter.connect()`
- `AcpBridgeAdapter.connect()` 没有复用进行中的连接 Promise，预热与首条消息发送容易竞态
- 新建本地对话时没有同步准备新的 ACP session，导致 commands/config 要等首条消息后才刷新

**修复内容**:
1. 为 `AcpBridgeAdapter` 增加 `prepareSession()`，支持首次预热和“新对话重建 session”
2. `connect()` 复用进行中的连接 Promise，`sendMessage()` 在 `connecting` 状态下会等待会话准备完成
3. `ChatView` 在打开面板、加载会话、新建对话时主动准备 session，并随 session 状态刷新 LED、plan、config、slash commands

**相关文件**:
- `src/adapters/acp-bridge-adapter.ts`
- `src/ui/chat-view.ts`
- `test/unit/acp-bridge-adapter.test.ts`

---

### 2026-04-08

#### 1. ACP session/update 消息格式解析错误

**问题描述**: 消息发送成功，模型被调用，但没有回显

**原因**: `session/update` 通知的消息格式解析错误

**修复内容**:
1. 根据官方 ACP 文档重新定义 `SessionUpdate` 类型
2. 重写 `handleSessionUpdate()` 方法处理正确的消息格式
3. 支持所有消息类型：
   - `agent_message_chunk` - 代理文本响应
   - `thought` - 思考过程
   - `tool_call` - 工具调用开始
   - `tool_call_update` - 工具调用状态更新
   - `plan` - 执行计划

**相关文件**:
- `src/adapters/acp-bridge-adapter.ts`

---

#### 2. ACP Bridge "Invalid params" 错误

**问题描述**: 使用 Kimi CLI 测试时出现 "Invalid params" 错误

**原因**:
- `session/new` 请求缺少必需的 `mcpServers` 参数
- 使用了错误的参数名 `workspaceRoot` 而不是 `cwd`

**修复内容**:

1. **修复 `createSession()` 方法**
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

2. **增强错误处理**
   - 添加对 `AUTH_REQUIRED` 错误的特殊处理
   - 提示用户运行 `kimi login` 进行认证
   - 为 "Invalid params" 错误提供更详细的上下文

**相关文件**:
- `src/adapters/acp-bridge-adapter.ts`

---

#### 3. Thinking 显示位置错误

**问题描述**: Thinking 内容显示在回答下方

**原因**: 消息渲染顺序问题

**修复内容**:
- 延迟创建 assistant DOM 元素，直到收到第一个 chunk
- 如果先收到 thinking，会先渲染 thinking，再在其后渲染 assistant

**相关文件**:
- `src/ui/chat-view.ts`

---

### 2026-04-07

#### 4. Object.assign 导致预设配置被覆盖

**问题描述**: 已保存配置覆盖默认预设

**原因**: `Object.assign` 导致预设配置丢失

**修复内容**:
- 新增 `ensurePresetBackends()` 方法
- 自动检测并添加缺失的 Kimi/OpenCode 预设

**相关文件**:
- `src/main.ts`
- `src/settings/settings.ts`

---

## 常见问题和解决方案

### "AUTH_REQUIRED" 错误

**原因**: 未登录 Kimi CLI

**解决**:
```bash
kimi login
```

### 连接超时

**原因**: Kimi CLI 启动慢或进程卡死

**解决**:
```bash
# 检查 kimi 进程
ps aux | grep kimi

# 杀死卡死的进程
killall kimi

# 重新测试
node test-kimi-acp.js
```

---

## Bug 报告模板

发现新 Bug 时，请按以下格式记录:

```markdown
### [日期] - Bug 标题

**问题描述**: 
[简要描述问题现象]

**重现步骤**:
1. [步骤1]
2. [步骤2]
3. [步骤3]

**期望行为**:
[描述期望的正确行为]

**实际行为**:
[描述实际发生的错误行为]

**环境信息**:
- OS: [操作系统]
- Obsidian 版本: [版本号]
- 插件版本: [版本号]
- 后端类型: [Mock/ACP Bridge/etc]

**相关文件**:
- [文件路径]

**备注**:
[其他相关信息]
```

---

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

---

*最后更新: 2026-04-10*
