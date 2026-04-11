# AgentLink 开发任务目标

> 长期任务看板 - 记录项目的功能需求、开发阶段和待办事项
>
> **使用方式**:
> - 在添加新功能点时，在此文件末尾添加新的任务项
> - 完成功能点后，将对应任务项标记为 `[x]` 并移动到"最近完成"区域
> - 定期清理已完成的旧任务

---

## 项目概述

**AgentLink** 是一个 Obsidian 桌面端插件，作为本地 AI Agent 的统一前端。

**核心定位**:
- 连接本地运行的 Agent 进程（Claude Code CLI、Kimi Code、OpenCode Web 等）
- 不是直接调用 LLM API（如 OpenAI API）

---

## 开发阶段

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 0 - 项目基础 | 完成 | 100% |
| Phase 1 - 核心类型定义 | 完成 | 100% |
| Phase 2 - 工具调用机制 | 完成 | 100% |
| Phase 3 - ACP Bridge Mode | 完成 | 100% |
| Phase 4 - 历史对话保存 | 完成 | 100% |
| Phase 5 - agent命令支持 | 完成 | 100% |
| Phase 6 - UI-UX 优化 | 进行中 | 0% |

---

## 当前焦点任务

### Phase 6 - UI-UX 优化（当前重点）

**目标**: 修复 UI 交互问题，并补齐 ACP Slash Commands / Session Modes / Agent Plan / Session Config Options 的用户可见能力

详细任务文档: [phase6-tasks.md](./phase6-tasks.md)

#### UI 修复
- [x] **LED 连接状态指示修复** - 首次打开和切换 agent 时正确显示连接状态
- [x] **新对话预连接与命令预加载** - 新建对话或打开面板时主动准备 ACP session，避免黄灯长期闪烁并提前加载 `availableCommands`
- [x] **切换 Agent 立即预连接** - 聊天窗口切换 agent 后立即开始建立 ACP 连接，不再等待首条消息
- [ ] **输入框快捷键优化** - Enter 发送，Shift/Ctrl+Enter 换行
- [ ] **@ 文件后附件显示** - 选择文件后自动添加到输入状态栏
- [ ] **@current note 整合** - 将 Current note 按钮整合到 @ 菜单中
- [ ] **@ 和 / 整体渲染** - 引用文本以标签样式显示

#### ACP 命令与会话配置
- [x] **/ 命令功能验证** - 区分内建命令与 Agent `availableCommands`，避免将 Agent 命令误当作内建命令执行
- [x] **Agent Slash Command 输入提示** - 支持 `availableCommands.input.hint`，选择后插入 `/command ` 文本而不是直接执行错误动作
- [x] **Slash Commands 动态更新** - 正确处理 `available_commands_update` 的增删改，并在当前会话中即时反映到 UI
- [x] **Session Config Options 完整支持** - 使用官方 SDK 调用 `session/set_config_option`，按 Agent 提供的顺序和 category 渲染
- [x] **Session Config 动态刷新** - 收到 `config_option_update` 后立即刷新工具栏，不再显示伪造默认选项
- [x] **Session Modes 兼容支持** - 当 Agent 未提供 `configOptions` 时回退到 `modes`，支持 `session/set_mode` 与 `current_mode_update`
- [x] **Agent Plan 面板** - 展示 `plan` entries，并按协议使用完整列表替换当前 plan
- [x] **ACP 协议回归测试** - 覆盖 `available_commands_update`、`current_mode_update`、`plan`、`config_option_update` 以及 `set_mode` / `set_config_option`

---

### Phase 5 - Agent 命令支持（已完成）

#### `/` 斜杠命令自动提示
- [x] 在输入框中输入 `/` 时显示命令列表
- [x] 支持键盘导航（↑↓选择，Enter确认，Esc关闭）
- [x] 命令分类：文件操作、搜索、编辑等

#### `@` 引用文件/文件夹
- [x] 在输入框中输入 `@` 时显示文件/文件夹选择器
- [x] 支持模糊搜索匹配文件名/路径
- [x] 引用项以标签形式显示在**输入状态栏**（位于输入框上方，参考 05-ui-ux.md 第 2.4 节）
- [x] 每个引用标签显示类型图标（文件夹/文件）
- [x] 支持点击标签上的删除按钮
- [x] 发送消息时将引用内容作为上下文附加

---

## 待开发功能

暂无（已整合到当前焦点任务）
- [ ] 标题栏的布局结构优化，目前取消无用的嵌套
- [ ] 美化ICON，请先提出ICON的优化方案，从哪里获取ICON资源，风格统一简洁务实


---

## 最近完成

- [x] UI/UX 文档更新 - 明确输入状态栏位置和功能
- [x] Phase 0-4 全部完成

---

## 文档更新任务

### 必须更新
- [ ] **README.md** - 完全重写，反映当前功能
- [ ] **02-progress.md** - 更新到最新进度

---

## 功能需求清单

### 插件基础能力
| 需求 | 状态 |
|------|------|
| Obsidian 社区插件结构 | 已完成 |
| Ribbon Icon | 已完成 |
| Command: Open Local Agent Chat | 已完成 |
| Command: Send selected text to agent | 已完成 |
| Command: Switch backend type | 已完成 |

### 聊天面板
| UI 组件 | 状态 |
|---------|------|
| 标题栏 | 已完成 |
| 后端状态显示 | 已完成 |
| 消息列表区 | 已完成 |
| 输入框 | 已完成 |
| 发送/停止按钮 | 已完成 |
| Agent 工具调用预览 | 已完成 |
| 思维链分离显示 | 已完成 |
| Markdown 渲染支持 | 已完成 |
| 确认/拒绝操作按钮 | 已完成 |

### ACP Bridge Mode
| 功能 | 状态 |
|------|------|
| JSON-RPC 2.0 消息格式 | 已完成 |
| stdio 通信层 | 已完成 |
| 连接管理 | 已完成 |
| 消息处理 | 已完成 |
| 工具调用机制 | 已完成 |
| 会话管理 | 已完成 |

### Agent 命令支持（Phase 5 已完成）
| 功能 | 状态 | 说明 |
|------|------|------|
| `/` 斜杠命令提示 | 已完成 | 输入 `/` 显示可用命令 |
| `@` 文件引用 | 已完成 | 输入 `@` 选择文件/文件夹 |
| 输入状态栏 | 已完成 | 显示引用标签（位于输入框上方） |

### UI-UX 优化（Phase 6 进行中）
| 功能 | 状态 | 说明 |
|------|------|------|
| LED 连接状态 | 已完成 | 首次打开和切换 agent 时正确显示，并随 ACP session 预热更新 |
| 输入框快捷键 | 待实现 | Enter 发送，Shift+Enter 换行 |
| @ 文件自动附加 | 待实现 | 选择后自动添加到输入状态栏 |
| @current note 整合 | 待实现 | 整合到 @ 菜单中 |
| 快捷键冲突修复 | 待实现 | 自动完成菜单打开时不触发发送 |
| / 命令功能完善 | 待实现 | /clear、/help 等命令可执行 |
| / 命令测试脚本 | 待实现 | 创建单元测试 |
| **ACP Slash Commands 动态支持** | 已完成 | `available_commands_update`、`input.hint`、Agent 命令插入与执行语义 |
| **ACP client 能力补齐** | 部分完成 | 已补 `fs` 绝对路径适配、自动建目录、真实 permission 选择，并移除虚假的 `terminal: true`；认证流程待补 |
| **新对话预热建连** | 已完成 | 打开面板/新建对话时主动建立 ACP session，并同步刷新 LED、commands、config |
| **ACP 连接缓存与过期回收** | 已完成 | 按 backend 复用 ACP adapter/连接，切换后立即预热，并支持 TTL 配置清理失活连接 |
| **移除 MockAdapter** | 待实现 | 简化代码库，只保留 ACP Bridge |
| 引用标签渲染 | 待实现 | @ 和 / 以引用块样式显示 |

### ACP 协议能力补齐（2026-04-10 文档复核）
| 功能 | 状态 | 说明 |
|------|------|------|
| Slash Commands 基础列表接收 | 部分完成 | 已能接收 `available_commands_update`，但 Agent 命令选择后的执行语义仍需修正 |
| Slash Commands 动态更新 | 已完成 | 命令增删改可刷新当前自动完成菜单，并支持 `input.hint` |
| Session Config Options UI | 已完成 | 工具栏按 Agent 提供配置渲染，并使用官方 SDK 请求更新 |
| `config_option_update` 即时刷新 | 已完成 | adapter 更新后会通知 UI 重渲染工具栏 |
| Session Modes 兼容回退 | 已完成 | `configOptions` 缺失时回退到 `modes`，并支持 `session/set_mode` |
| `current_mode_update` 同步 | 已完成 | mode 变化会同步到工具栏和 plan 区域 |
| Agent Plan 可视化 | 已完成 | 聊天面板增加 plan 展示区域 |
| ACP 协议测试覆盖 | 已完成 | 已补对 4 类 session update 和设置请求的回归测试 |

---

## 非功能需求

### 平台要求
- 仅支持 Obsidian Desktop
- `isDesktopOnly: true`
- 需要 Node.js child_process 能力

### 安全边界
- 不伪装成其他客户端
- 不绕过订阅限制
- Agent 的 API key 由用户自己配置在本地
- 文件操作需要用户确认（除非明确配置 autoConfirm）
- 终端命令执行需要用户确认

---

## 参考资源

- [Agent Client Protocol](https://agentclientprotocol.com)
- [Obsidian 插件开发文档](https://docs.obsidian.md)

---

*最后更新: 2026-04-10*
