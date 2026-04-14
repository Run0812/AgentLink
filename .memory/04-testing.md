# AgentLink 测试流程文档

> 记录项目的测试方法、调试指南和构建流程
> 
> **使用方式**:
> - 新成员加入时阅读此文档了解测试流程
> - 发布前按"发布检查清单"逐项检查
> - 遇到问题时参考"故障排除"部分

---

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
npm install

# 确保 Kimi CLI 已安装并登录（用于 ACP 测试）
pip install kimi-cli
kimi login
kimi --version
```

### 2. 运行测试

```bash
# 完整构建（检查 + 测试 + 构建）
npm run build

# 仅运行测试
npm test

# 测试监视模式
npm run test:watch

# 快速构建（仅构建，跳过检查）
npm run build:quick

# 仅同步构建产物到本地 dev vault
npm run sync:dev

# 一键构建并发布到本地 dev vault（手动触发）
npm run publish:dev
```

---

## 构建流程

### 构建产物

构建成功后，产物将输出到 `build/` 目录：

```
build/
├── main.js          # 主程序（约 98 KB）
├── manifest.json    # 插件清单
└── styles.css       # 样式文件（约 7 KB）
```

### 完整构建步骤

```bash
npm run build
```

执行步骤：
1. `npm run lint` - TypeScript 类型检查
2. `npm run test` - 运行所有单元测试
3. `esbuild production` - 打包并输出到 build/ 目录
4. 复制 manifest.json 和 styles.css 到 build/

### 开发模式

```bash
# 开发模式（带热重载）
npm run dev
```

---

## 测试策略

### 1. ACP Bridge 测试

**前置准备**:
1. 确保 Kimi CLI 已安装并登录: `kimi --version`
2. 运行测试脚本: `node test-kimi-acp.js`

**测试脚本**:
```bash
node test-kimi-acp.js
```

预期输出：
```
🧪 Testing ACP connection to Kimi CLI
=====================================

🚀 Starting kimi acp...
✅ Process started, PID: xxxxx

✅ Initialize successful!
   Agent: Kimi Code CLI x.x.x
   Protocol version: 1

✅ Session created: sess_xxx

✅ Prompt completed
   Stop reason: end_turn
```

**Obsidian 中测试**:
1. 构建插件: `npm run build`
2. 复制到 Obsidian 插件目录
3. 启用插件并选择 "🌙 Kimi Code (ACP)" 后端
4. 开始对话

### 2. 单元测试

```bash
# 运行所有测试
npm test

# 调试模式
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

**测试文件位置**:
- `test/unit/` - 单元测试
- `test/fixtures/` - 测试固件

**当前重点覆盖**:
- ACP event normalization
- cancel 后的 pending permission 收敛
- turn state machine 与 stale update 丢弃
- prompt context 采集
- tool executor 的 host 边界行为

---

## 安装到 Obsidian

### 方法 1：符号链接（开发推荐）

```bash
# macOS/Linux:
ln -s "$(pwd)" /path/to/vault/.obsidian/plugins/agentlink

# Windows (PowerShell, 管理员):
New-Item -ItemType SymbolicLink -Path "C:\path\to\vault\.obsidian\plugins\agentlink" -Target "$(Get-Location)"
```

### 方法 2：生产构建

```bash
# 构建插件
npm run build

# 复制 build/ 目录到 Obsidian 插件目录
cp -r build/ /path/to/vault/.obsidian/plugins/agentlink/
```

### 方法 3：开发 vault（项目自带）

项目包含预配置的 Obsidian 开发 vault:

```
dev/
├── .obsidian/
│   ├── app.json
│   └── plugins/
│       └── agentlink/        # 插件文件（从 build/ 复制）
│           ├── main.js
│           ├── manifest.json
│           └── styles.css
└── Welcome.md
```

**启动测试**:
1. 手动发布（推荐，一条命令）: `npm run publish:dev`
2. 或分步执行:
   - `npm run build:quick`
   - `npm run sync:dev`
3. 用 Obsidian 打开 `dev/` 目录作为一个 vault
4. 在 Obsidian 设置中启用 Community Plugins → AgentLink
5. 使用 Ribbon 图标或 Command Palette 打开 AgentLink 面板

### Codex 运行操作（手动发布到 dev）

在 Codex 终端中执行以下命令即可手动发布到本地 `dev/.obsidian/plugins/agentlink/`：

```bash
npm run publish:dev
```

如果你已经构建完成，仅想重新覆盖 dev vault 中的插件文件，执行：

```bash
npm run sync:dev
```

---

## ACP 协议调试

### ACP 协议格式

#### Initialize

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

#### Session/New

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

#### Session/Prompt

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

### 调试工具

#### 打开 Obsidian 控制台

- **Windows/Linux**: `Ctrl + Shift + I`
- **macOS**: `Cmd + Option + I`

#### 查看 ACP 日志

在 Console 中过滤:
```javascript
"[ACP]"
```

#### 开启详细日志

在设置中勾选 **"Enable Debug Log"**，然后在控制台执行:
```javascript
localStorage.setItem('debug', 'AgentLink:*');
```

---

## 故障排除

### 构建失败

1. **检查依赖**
   ```bash
   npm install
   ```

2. **清理缓存**
   ```bash
   npm run clean
   rm -rf node_modules
   npm install
   ```

3. **检查 TypeScript 错误**
   ```bash
   npm run lint
   ```

### 测试失败

```bash
# 运行测试查看详细信息
npm test

# 调试模式
npm run test:watch
```

### 插件无法加载

1. 检查 `manifest.json` 是否存在
2. 确认 `main.js` 不为空
3. 检查 Obsidian 开发者控制台（Ctrl+Shift+I）查看错误

### ACP 连接问题

#### "Invalid params" 错误

**原因**: 缺少必需的参数

**解决**: 确保已更新到最新版本，修复了 `session/new` 的参数问题

#### "AUTH_REQUIRED" 错误

**原因**: 未登录 Kimi CLI

**解决**:
```bash
kimi login
```

#### 连接超时

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

## 发布检查清单

- [ ] 运行 `npm run build` 成功
- [ ] 所有测试通过
- [ ] 构建产物在 `build/` 目录
- [ ] 更新 `manifest.json` 版本号
- [ ] 更新 `versions.json`
- [ ] 测试在干净环境安装

---

## 版本更新

```bash
# 自动更新版本号并提交
npm version patch  # 小版本
npm version minor  # 中版本
npm version major  # 大版本
```

这将：
1. 更新 `package.json` 版本
2. 更新 `manifest.json` 版本
3. 更新 `versions.json`
4. 创建 git 提交

---

## 参考资源

- [Obsidian 插件开发文档](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Agent Client Protocol](https://agentclientprotocol.com)
- [Kimi CLI 文档](https://www.kimi.com/code/docs/kimi-cli/guides/ides.html)

---

*最后更新: 2026-04-14*
