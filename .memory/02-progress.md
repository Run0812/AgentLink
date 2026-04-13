# AgentLink 当前开发进度

> 记录项目的详细开发进展和版本迭代历史
> 
> **使用方式**:
> - 每次完成重要功能或修复后，在此文件顶部添加新的进度条目
> - 按日期倒序排列（最新的在最上面）
> - 包含具体变更的文件和简要说明

---

## 2026-04-13 - 架构模块化 I4：提取 Composer / Message Renderer 并补齐会话持久化触发点

**实现范围**:
- ChatView 消息渲染与输入编排进一步拆分
- 会话持久化触发点补齐（发送完成/切换/关闭/兜底）

**完成内容**:
- 新增 `MessageListRenderer`，承接 welcome/message/tool/file/thinking 渲染与重绘
- 新增 `ComposerController`，承接输入文本序列化、光标选择管理、inline token 插入/移除
- `chat-view` 将消息渲染与 composer 核心方法改为委托，保留生命周期与流程编排
- 移除 `chat-view` 中大段重复渲染与输入 DOM 操作细节，职责收敛为 orchestration
- 新增 `persistCurrentSession(reason)` 并接入关键时机：
  - `finishStreaming`（发送完成/中断后）
  - `loadSession`（切换会话前）
  - `createNewSession`（新建前）
  - `onClose`（视图关闭兜底）
  - `clearConversation`（清空后）
- `01-tasks.md` 标记 I4 完成

**测试结果**:
- `npm run lint` 通过
- `npm test -- test/unit/settings.test.ts test/unit/tool-executor.test.ts` 通过（17 tests）

**相关文件**:
- `src/ui/chat-view.ts`
- `src/ui/controllers/message-list-renderer.ts`
- `src/ui/controllers/composer-controller.ts`
- `.memory/01-tasks.md`

---

## 2026-04-13 - 架构模块化 I3：ChatView Header/Toolbar 控制器化

**实现范围**:
- ChatView 的 header/history 与底部 toolbar 下拉逻辑解耦
- 会话删除与切换行为保持不变

**完成内容**:
- 新增 `HeaderSessionController`，承接会话历史下拉与历史列表 modal 渲染
- 新增 `ToolbarController`，承接 Agent/Model/Thinking 下拉渲染
- `chat-view` 中 `openSessionList`、`renderHistoryDropdown`、`renderAgentDropdown`、`renderModelDropdown`、`renderThinkingDropdown` 改为控制器委托
- `chat-view` 新增 `switchBackend` / `handleThinkingModeChange` / `deleteSession`，集中处理副作用与状态更新
- 历史下拉删除按钮保持“原地二次确认”交互（`Delete -> Confirm`）
- `01-tasks.md` 标记 I3 完成

**测试结果**:
- `npm run lint` 通过
- `npm test -- test/unit/settings.test.ts test/unit/tool-executor.test.ts` 通过（17 tests）

**相关文件**:
- `src/ui/chat-view.ts`
- `src/ui/controllers/header-session-controller.ts`
- `src/ui/controllers/toolbar-controller.ts`
- `.memory/01-tasks.md`

---

## 2026-04-13 - 架构模块化 I2：Settings 保存链路收敛与 effect flag 规则

**实现范围**:
- settings patch 副作用判定
- 高频设置项改为 patch 驱动

**完成内容**:
- `main.applySettingsPatch()` 新增自动判定：
  - `backends/activeBackendId` 变更才触发 adapter rebuild
  - `sessionHistoryExpiryDays` 变更才触发 history expiry 更新
- `settings-tab` 新增 `setSetting()` / `applySettingsPatch()` / `scheduleSettingsPatch()`，支持 patch 合并与防抖批量提交
- 高频配置项（timeout/systemPrompt/debug/tool-safety/terminal/history-expiry 等）改为直接发 patch，不再先改全量 settings 再保存
- `01-tasks.md` 标记 I2 完成

**测试结果**:
- `npm run lint` 通过
- `npm test -- test/unit/settings.test.ts test/unit/tool-executor.test.ts` 通过（17 tests）

**相关文件**:
- `src/main.ts`
- `src/settings/settings-tab.ts`
- `.memory/01-tasks.md`

---

## 2026-04-13 - 架构模块化 I1：SettingsStore / SettingsEffects 分层骨架

**实现范围**:
- settings 领域基础分层
- settings-tab 与 plugin 保存链路解耦（骨架阶段）

**完成内容**:
- 新增 `settings-store`：`SettingsPatch`、`SettingsStore`、`InMemorySettingsStore`
- 新增 `settings-effects`：`SettingsEffects`、`SettingsEffectFlags`、`PluginSettingsEffects`
- `main.ts` 接入 settings store/effects，并新增 `applySettingsPatch(patch, options)` 入口
- `settings-tab` 的保存入口改为 `applyCurrentSettings()`，由 patch 流程统一进入 plugin 侧
- 在 `01-tasks.md` 增加“架构模块化 v1”清单，并标记 I1 完成

**测试结果**:
- `npm run lint` 通过
- `npm test -- test/unit/settings.test.ts` 通过（8 tests）

**相关文件**:
- `src/settings/settings-store.ts`
- `src/settings/settings-effects.ts`
- `src/main.ts`
- `src/settings/settings-tab.ts`
- `.memory/01-tasks.md`

---

## 2026-04-13 - 设置页改为四分 Tab（Agent / Agent advanced / History / ACP subscription）

**实现范围**:
- 设置页信息架构重组
- 首页保留高频 Agent 配置

**完成内容**:
- 顶部 Tab 调整为 4 个：`Agent`、`Agent advanced`、`History`、`ACP subscription`
- `Agent` Tab 保留高频项：Backend 管理、Request Timeout、Auto-reconnect、Terminal shell 选择
- `Agent advanced` Tab 聚合低频高级项：System Prompt、Debug Log、ACP connection cache TTL、Tool safety 选项
- `Agent advanced` 中支持 `terminal shell = custom` 时的自定义路径配置（未启用 custom 时显示引导说明）
- `History` 与 `ACP subscription` Tab 保持此前能力，改为在对应专属 Tab 中展示
- Tab 栏支持换行显示，避免窄屏下挤压

**测试结果**:
- `npm run lint` 通过
- `npm run build:quick` 通过

**相关文件**:
- `src/settings/settings-tab.ts`

---

## 2026-04-13 - 设置页新增“对话历史”Tab与terminal shell可配置

**实现范围**:
- 设置页结构优化（Tab 化）
- 对话历史管理能力增强
- terminal 工具 shell 选择策略增强

**完成内容**:
- `settings-tab` 新增顶部 Tab：`General` 与 `Conversation history`
- 将“会话过期时间”迁移到 `Conversation history` 专属 Tab
- 历史 Tab 新增会话列表浏览（标题、更新时间、消息数、首条内容预览）
- 历史 Tab 新增批量操作：全选/反选、批量删除（原地二次确认）、清空历史（保留当前会话，原地二次确认）
- 历史 Tab 新增“立即清理过期会话”按钮
- `SessionManager` 新增 `deleteSessions`、`removeExpiredSessions`，并扩展 `clearAllSessions({ keepCurrent })`
- terminal 工具新增可配置 shell：`auto / pwsh / powershell / cmd / bash / zsh / sh / custom`
- terminal 执行新增自动候选回退逻辑（`ENOENT` 时尝试下一候选 shell）
- 设置页文本数字输入改为防抖保存，避免输入时频繁触发保存流程

**测试结果**:
- `npm run lint` 通过
- `npm test -- test/unit/settings.test.ts test/unit/tool-executor.test.ts` 通过（17 tests）
- `npm run build:quick` 通过

**相关文件**:
- `src/settings/settings-tab.ts`
- `src/settings/settings.ts`
- `src/services/session-manager.ts`
- `src/services/tool-executor.ts`
- `src/ui/chat-view.ts`
- `test/unit/tool-executor.test.ts`

---

## 2026-04-13 - 新增本地 dev 手动发布运行操作（Codex 可直接执行）

**实现范围**:
- 本地发布流程标准化
- 测试文档修正

**完成内容**:
- 在 `package.json` 增加 `npm run sync:dev`（仅同步）与 `npm run publish:dev`（构建+同步）脚本
- 在 `.memory/04-testing.md` 增加 “Codex 运行操作（手动发布到 dev）” 章节
- 修正开发 vault 步骤描述，不再使用“build 后自动复制”的不准确说法，改为显式手动发布命令

**测试结果**:
- `npm run publish:dev` 通过（包含 `build:quick` 与 `sync:dev`）

**相关文件**:
- `package.json`
- `.memory/04-testing.md`

---

## 2026-04-13 - 修复 review commit 引入的 package.json 重复键与 lockfile 版本冲突

**实现范围**:
- 依赖声明修复
- CI 安装一致性恢复

**完成内容**:
- 检查最新 commit（`88324ad`）后确认 `package.json` 的 `devDependencies` 存在重复键（`builtin-modules`、`obsidian`、`typescript`）
- 删除重复键并恢复与 `package-lock.json` 一致的依赖版本（`typescript` 回到 `^6.0.2`）
- 本地执行 `npm ci --ignore-scripts` 验证 lockfile 与 package 声明一致，不再出现 `EUSAGE` 版本不匹配错误

**测试结果**:
- `npm ci --ignore-scripts` 通过
- `npm run lint` 通过

**相关文件**:
- `package.json`

---

## 2026-04-13 - 测试去除硬编码绝对路径，改为动态路径构造

**实现范围**:
- 单元测试稳定性（跨平台）

**完成内容**:
- `vault-paths` 相关测试改为使用 `tmpdir()` + `resolve()` 动态构造 vault 根目录和绝对文件路径，不再硬编码 `D:\\...`
- `AcpBridgeAdapter` 的 workspace URI 测试改为基于动态路径生成 `expectedFileUri`，避免固定盘符路径断言
- 保持原始语义不变：仍校验 vault 内绝对路径映射、vault 外路径拒绝、以及 workspace URI 生成逻辑

**测试结果**:
- `npm run lint` 通过
- `vitest` 在当前本机环境仍受 `spawn EPERM` 限制，需在 CI 完整验证

**相关文件**:
- `test/unit/vault-paths.test.ts`
- `test/unit/acp-bridge-adapter.test.ts`

---

## 2026-04-13 - 修复 Windows 绝对路径在 Linux runner 下的路径归一化问题

**实现范围**:
- Vault 路径解析
- ACP workspace file URI 生成

**完成内容**:
- 重写 `vault-paths` 的绝对路径判定与归一化逻辑，避免在 Linux 环境把 `D:\\...` 误当相对路径
- `resolveVaultRelativePath()` 现在可稳定处理：
  - `D:\\vault\\...` 与 `/D:/vault/...` 这类 Windows 绝对路径
  - 相对路径
  - 越出 vault 的路径拒绝（含 `..`）
- 新增 `buildWorkspaceFileUri(basePath, relativePath)` 工具函数，统一生成跨平台可预期的 `file:///...` URI
- `AcpBridgeAdapter.buildWorkspaceFileUri()` 改为复用上述工具函数，修复 `file:///home/.../D:%5C...` 这类错误 URI

**测试结果**:
- `npm run lint` 通过
- `npm run test -- test/unit/vault-paths.test.ts test/unit/acp-bridge-adapter.test.ts` 在当前环境受 `spawn EPERM` 限制，无法本地执行（需在 CI 验证）

**相关文件**:
- `src/services/vault-paths.ts`
- `src/adapters/acp-bridge-adapter.ts`

---

## 2026-04-13 - 本地构建链路校验与缺失构建依赖修复

**实现范围**:
- 本地构建验证
- 构建依赖修复

**完成内容**:
- 执行 `npm run build`，确认 lint 通过，但测试阶段在当前环境触发 `spawn EPERM`（环境权限问题）
- 执行 `npm run build:quick` 时发现缺少 `builtin-modules` 依赖
- 将 `builtin-modules` 补回 `devDependencies` 并更新 lockfile
- 复跑 `npm run build:quick` 通过，构建产物正常输出到 `build/`

**测试结果**:
- `npm run build`（失败，`vitest` 启动阶段 `spawn EPERM`）
- `npm run build:quick`（通过）

**相关文件**:
- `package.json`
- `package-lock.json`

---

## 2026-04-13 - 修复 CI 中 Obsidian 类型缺失导致的大量 TypeScript 报错

**实现范围**:
- 依赖恢复与 lockfile 同步
- CI 类型检查回归验证

**完成内容**:
- 将 `obsidian` 恢复到 `devDependencies`，修复 `Cannot find module 'obsidian'` 根因
- 重新生成 `package-lock.json`，确保依赖与锁文件一致
- 本地执行 `npm run lint` 验证通过，确认此前连锁的 `Plugin/Modal/View` 相关类型错误已消失

**测试结果**:
- `npm run lint` 通过

**相关文件**:
- `package.json`
- `package-lock.json`

---

## 2026-04-13 - 修复 GitHub CI 的 Node 引擎不匹配与 lockfile 不同步

**实现范围**:
- GitHub Actions Node 版本升级
- npm lockfile 稳定化

**完成内容**:
- 将 `pr-ci.yml`、`build-check.yml`、`tag-release.yml`、`nightly.yml` 的 `actions/setup-node` 版本从 Node 18 升级到 Node 24，匹配 `vite@8` / `vitest@4` 的引擎要求，并对齐最新主线
- `package.json` 新增并提升 `engines.node: >=24.0.0`，避免低版本 Node 继续进入不兼容区间
- 为避免 npm 在不同版本下对 peer 解析差异导致 `npm ci` 报 lockfile 缺项，显式加入 `@emnapi/core` 与 `@emnapi/runtime` 到 `devDependencies`
- 补回 `typescript` 到 `devDependencies`，避免 `npm run lint` 在 CI 中因缺少 `tsc` 失败
- 使用 `npm install --package-lock-only --ignore-scripts --cache .npm-cache` 更新 `package-lock.json`

**测试结果**:
- 进行过依赖解析与 lockfile 更新
- 未在当前沙箱完成完整 `npm ci`（本地环境存在 `spawn EPERM` 权限限制）

**相关文件**:
- `.github/workflows/pr-ci.yml`
- `.github/workflows/build-check.yml`
- `.github/workflows/tag-release.yml`
- `.github/workflows/nightly.yml`
- `package.json`
- `package-lock.json`

---

## 2026-04-13 - 移除外部 AI Review 工作流脚本并同步 CI 文档

**实现范围**:
- GitHub Actions PR workflow 简化
- 外部 AI review 脚本移除
- 贡献文档与当前 CI 对齐

**完成内容**:
- `pr-ci.yml` 已移除第三方模型调用链路，仅保留 `npm ci -> lint -> test -> build:quick -> artifact` 的 CI 门禁
- 删除不再使用的 `.github/scripts/ai-review.mjs`
- 更新 `CONTRIBUTING.md` 的 CI 说明，移除 Claude review 叙述，改为可选的 GitHub Copilot code review 说明（非阻断）

**测试结果**:
- 本次仅包含 workflow / 文档与脚本清理，未运行构建与测试命令

**相关文件**:
- `.github/workflows/pr-ci.yml`
- `.github/scripts/ai-review.mjs`
- `CONTRIBUTING.md`

---

## 2026-04-11 - 修复 inline token 仅能插入行首与样式过重

**实现范围**:
- inline token 插入定位
- token 视觉降噪

**完成内容**:
- 将 trigger 替换逻辑改为优先使用最近一次有效的 composer 选区范围，避免点击自动完成后 token 回退到行首插入
- 改进 `contenteditable` 文本节点定位逻辑，在光标落在元素容器节点时也能回退到正确的前后文本位置
- 下调 inline token 的高度、内边距和圆角，移除边框，仅保留弱背景色区分，降低视觉侵入感

**测试结果**:
- `npm run lint`
- `npm test`
- `npm run build:quick`

**相关文件**:
- `src/ui/chat-view.ts`

---

## 2026-04-11 - 输入区切换为真正的 inline token composer

**实现范围**:
- `contenteditable` 输入区
- inline 引用 / 命令 token
- 自动完成插入链路改造

**完成内容**:
- 将输入区从 `textarea` 改为 `contenteditable` composer，引用文件和 `/command` 不再显示在输入框上方，而是以原子 token 节点直接嵌入文字流
- `@` 文件、`@current note`、selection 和 `/command` 现在都会在光标位置插入 inline token，并保留独立删除能力
- 发送消息时会序列化 inline token 为可读文本，同时继续通过 `attachments` 将文件上下文传给 agent，保证 UI 表现和 ACP 逻辑一致
- 自动完成选择链路改为“保存并恢复编辑器选区”，避免点击 dropdown 后 token 插入到错误位置
- 更新 `05-ui-ux.md` 和任务板，使文档与当前真实实现保持一致

**测试结果**:
- `npm run lint`
- `npm test`
- `npm run build:quick`

**相关文件**:
- `src/ui/chat-view.ts`
- `.memory/01-tasks.md`
- `.memory/05-ui-ux.md`

---

## 2026-04-11 - 输入区改为 composer shell，并同步 UI 文档

**实现范围**:
- 输入区 rich composer 布局
- 输入区 chip 内嵌显示
- UI/UX 文档同步

**完成内容**:
- 将原先“输入状态栏 + textarea + 独立底部工具栏”的三段式结构，重构为单一 `composer shell`
- `@` 引用和当前 `/command` 现在显示在输入框内部顶部的 chip 行，不再出现在输入框外单独状态栏
- 保持现有 `textarea`、发送逻辑、自动完成逻辑不变，仅重做输入区视觉结构，降低回归风险
- 底部 Agent / Model / Context / Think / Send 工具栏移动到 composer shell 内部
- 重写 `05-ui-ux.md`，将输入区设计更新为当前真实实现，并明确“当前仍基于 textarea，而不是 contenteditable”

**测试结果**:
- `npm run lint`
- `npm test`
- `npm run build:quick`

**相关文件**:
- `src/ui/chat-view.ts`
- `src/ui/components/input-state-bar.tsx`
- `.memory/01-tasks.md`
- `.memory/05-ui-ux.md`

---

## 2026-04-11 - 同步任务板与进度文档到当前代码状态

**实现范围**:
- `01-tasks.md` 状态校正
- `02-progress.md` 进度同步

**完成内容**:
- 复核当前代码实现，确认 `registry icon` 回填、上下文 usage 指示器、标题栏结构清理、ACP 连接缓存与 `authenticate` 主链都已落地
- 更新 `01-tasks.md`，将 Phase 6 完成度提升到与当前实现一致的状态，并补充已完成的上下文 usage 显示与 registry agent icon 显示
- 清理 `01-tasks.md` 中已完成但仍重复出现在“待开发功能”的旧条目，保留真正未完成的底部工具栏 icon、扩展认证、README、mock 文案清理和富文本输入方案

**相关文件**:
- `.memory/01-tasks.md`
- `.memory/02-progress.md`

---

## 2026-04-11 - 修复已注册 agent icon 未显示与标题栏旧图标残留

**实现范围**:
- 已配置 registry backend icon 回填
- 标题栏按钮旧样式清理
- 任务板同步

**完成内容**:
- 新增 `enrichBackendsFromRegistry()` 纯逻辑函数，在加载设置时用本地 ACP registry 为已存在的 registry backend 回填 `icon`、`version` 和 `registryAgentId`
- 修复“已注册 agent 没有显示自己的 icon”问题；现有配置无需重建 backend，插件加载后会自动补全并持久化到设置文件
- 清理 `ChatView` 标题栏按钮残留的旧 `innerHTML` 和重复样式覆盖，避免新的 `setIcon()` 图标再次被旧文本按钮样式污染
- 更新 `01-tasks.md`，将 registry icon 回填和标题栏布局清理同步到任务板状态

**测试结果**:
- `npm run lint`
- `npm test`
- `npm run build:quick`

**相关文件**:
- `src/main.ts`
- `src/settings/settings.ts`
- `src/ui/chat-view.ts`
- `test/unit/settings.test.ts`
- `.memory/01-tasks.md`

---

## 2026-04-11 - 统一标题栏按钮图标并接入 registry agent icon

**实现范围**:
- 标题栏按钮图标风格
- registry agent icon 透传
- 标题栏双重下划线修复

**完成内容**:
- 标题栏右上角 3 个按钮改为 Obsidian `setIcon()` 线性图标，统一为同一视觉风格
- `AcpBridgeBackendConfig` 新增 `icon` 字段，registry agent 的 icon 现在会写入 backend 配置并在聊天面板、agent 选择列表、agent 编辑信息卡中优先显示
- registry 同步时会为已有注册 agent 回填/刷新 `icon` 和 `version`
- 覆盖 header 容器默认边框和 padding，移除标题栏双重下划线，仅保留一条分隔线

**测试结果**:
- `npm run lint`
- `npm test`
- `npm run build:quick`

**相关文件**:
- `src/core/types.ts`
- `src/settings/registry-utils.ts`
- `src/settings/settings.ts`
- `src/settings/acp-agent-selector.ts`
- `src/settings/acp-agent-editor.ts`
- `src/ui/chat-view.ts`

---

## 2026-04-11 - 完成 `@` 与 `/` 的标签化预览渲染

**实现范围**:
- 输入状态栏标签预览
- `/command` 预览解析
- 引用渲染回归测试

**完成内容**:
- 保持 `textarea` 输入链路不变，采用 Phase 6 文档建议的分步方案，在输入状态栏中展示更明显的标签化预览
- `@` 选择后的附件继续显示为标签，并与当前 `/command` 预览统一出现在输入状态栏
- 新增当前 slash command 预览 chip，支持区分 built-in / agent，并支持点击删除同步清理输入框中的命令文本
- 输入框内容变化、自动完成选择、发送消息、清空对话、切换会话时都会同步刷新标签预览
- 新增 slash command preview 逻辑测试，覆盖 built-in、agent、未知命令与非命令输入

**测试结果**:
- `npm run lint`
- `npm test`
- `npm run build:quick`

**相关文件**:
- `src/ui/chat-view.ts`
- `src/ui/components/input-state-bar.tsx`
- `src/ui/slash-command-utils.ts`
- `test/unit/slash-commands.test.ts`
- `.memory/01-tasks.md`

---

## 2026-04-11 - 实现 ACP authenticate 主链

**实现范围**:
- ACP 认证错误处理
- authenticate 调用链
- 认证回归测试

**完成内容**:
- `AcpBridgeAdapter.initializeProtocol()` 现在会记录 agent 广播的 `authMethods`，并显式声明 `auth.terminal: false`
- `createSession()` 现在能识别 ACP `Authentication required` 错误，在 `session/new` 失败后触发认证流程
- 新增认证方式选择逻辑：对稳定的 agent auth method 弹出选择 UI，调用 `connection.authenticate()` 后自动重试创建 session
- 对 UNSTABLE 的 `env_var` / `terminal` auth method 明确报“不支持”，避免假实现
- 新增单测覆盖认证错误识别、认证后自动重试建 session、仅有不支持 auth method 时的失败路径

**测试结果**:
- `npm run lint`
- `npm test`
- `npm run build:quick`

**相关文件**:
- `src/adapters/acp-bridge-adapter.ts`
- `test/unit/acp-bridge-adapter.test.ts`
- `.memory/01-tasks.md`

---

## 2026-04-11 - 校正任务板状态并重排剩余优先级

**实现范围**:
- `01-tasks.md` 状态校正
- 剩余工作优先级整理

**完成内容**:
- 将任务板中已落地但仍标记为未完成的项目改为已完成，包括输入框快捷键、自动完成菜单快捷键冲突修复、`@` 自动附加、`@current note`、内建 `/clear` `/help` 及其测试
- 将 `ACP authenticate`、引用标签化渲染、标题栏结构优化、icon 统一方案、README 重写提升为当前剩余重点
- 将 `MockAdapter` 从“待实现”修正为“主流程已移除，残留文案待清理”
- 更新 `01-tasks.md` 的 Phase 6 完成度和最后更新时间

**相关文件**:
- `.memory/01-tasks.md`

---

## 2026-04-11 - 修复通用 dropdown 文本裁切与外部点击关闭

**实现范围**:
- 通用 config dropdown 排版
- dropdown 外部点击关闭

**完成内容**:
- 通用 config dropdown 选项改为稳定的纵向布局，增加统一 `line-height` 和最小高度，修复描述文字显示不全
- `chat-view` 中 model / thinking dropdown 项同步增加最小高度和行高，避免两行内容被压缩
- `ConfigToolbar` 新增 outside click 监听，dropdown 展开后点击外部区域会自动关闭

**测试结果**:
- `npm run lint`
- `npm test`
- `npm run build:quick`

**相关文件**:
- `src/ui/components/config-toolbar.tsx`
- `src/ui/chat-view.ts`

---

## 2026-04-11 - 收敛底部工具栏 dropdown 尺寸与溢出显示

**实现范围**:
- 底部工具栏按钮尺寸
- dropdown 宽度区间
- 长文本溢出处理

**完成内容**:
- 底部 agent、model 和通用 config 按钮统一为相同高度，并增加统一的最小/最大宽度区间
- 底部相关 dropdown 统一最小/最大宽度区间，避免不同菜单的视觉尺寸飘忽
- 长模型名、agent 名和说明文字改为单行省略，修复文本超出边框的问题
- 保留不同按钮按内容伸缩的能力，但限制在一致区间内，避免过窄或过宽

**测试结果**:
- `npm run lint`
- `npm test`
- `npm run build:quick`

**相关文件**:
- `src/ui/chat-view.ts`
- `src/ui/components/config-toolbar.tsx`

---

## 2026-04-11 - 增加 ACP 连接缓存与切换后立即预连接

**实现范围**:
- Agent 切换建连时机
- ACP adapter 缓存
- 过期回收设置

**完成内容**:
- `ChatView.setAdapter()` 现在在切换到新 agent 后会立即调用 `prepareSession()`，不再等首条消息才建连
- 移除聊天窗口切换 agent 时对旧 adapter 的立即断开逻辑，避免无谓重连
- 新增 `AcpAdapterPool`，按 backend id 复用 ACP adapter，并在配置变更时自动替换旧实例
- 插件设置新增 `ACP connection cache TTL (minutes)`，可配置失活 ACP 连接的保留时长，`0` 表示禁用缓存
- 插件层增加周期性过期回收和 `onunload()` 全量断连，避免缓存泄漏

**测试结果**:
- 新增 adapter pool 单测，覆盖连接复用、配置变更重建、TTL 过期回收

**相关文件**:
- `src/main.ts`
- `src/ui/chat-view.ts`
- `src/settings/settings.ts`
- `src/settings/settings-tab.ts`
- `src/services/acp-adapter-pool.ts`
- `test/unit/acp-adapter-pool.test.ts`
- `.memory/01-tasks.md`

---

## 2026-04-11 - 增加 ACP 上下文使用状态指示器

**实现范围**:
- 底部工具栏上下文使用 UI
- ACP usage 数据接收

**完成内容**:
- 在底部工具栏增加小型环形上下文使用指示器，位置符合 `05-ui-ux.md`
- 仅当 agent 返回可计算百分比的上下文用量数据时才显示，不做本地估算占位
- 支持接收非稳定 `usage_update` / usage 响应字段，并在悬停时显示 token 明细
- 无可用数据时完全隐藏该 UI，避免误导

**测试结果**:
- 新增 ACP context usage 单测，覆盖 `used/max` 解析与明细展示数据结构

**相关文件**:
- `src/adapters/acp-bridge-adapter.ts`
- `src/ui/chat-view.ts`
- `src/core/types.ts`
- `test/unit/acp-bridge-adapter.test.ts`

---

## 2026-04-10 - 补齐 ACP 文件系统与权限能力

**实现范围**:
- ACP 文件读写
- permission UI
- terminal 能力声明

**完成内容**:
- 新增 `vault-paths` helper，支持 ACP 绝对路径映射到 vault 相对路径，并拦截越出 vault 的路径
- `readTextFile` / `writeTextFile` 现在使用统一路径解析；写入新文件前会自动创建父目录
- `readTextFile` 补充 `line` / `limit` 的内容切片支持
- `requestPermission` 不再自动选第一个选项；现在会弹出真实权限选择 UI，并返回用户选中的 `optionId`
- 停止向 Agent 宣称 `terminal: true`，避免当前 stub 实现误导 Agent 触发不可用能力

**测试结果**:
- 新增 `vault-paths` 单测，覆盖绝对路径映射、越界拒绝、自动建目录与按行读取切片
- 新增 ACP permission 测试，覆盖“批准指定选项”和“取消请求”

**相关文件**:
- `src/adapters/acp-bridge-adapter.ts`
- `src/services/vault-paths.ts`
- `test/unit/acp-bridge-adapter.test.ts`
- `test/unit/vault-paths.test.ts`
- `.memory/01-tasks.md`

---

## 2026-04-10 - 修复新对话 ACP 预连接与会话预热链路

**实现范围**:
- 新建对话预热
- ACP session 重建
- LED 状态同步

**完成内容**:
- `AcpBridgeAdapter` 新增 `prepareSession()`，支持首次预连接和“新对话重建 ACP session”
- `connect()` 改为复用进行中的连接 Promise，避免后台预热与首条消息发送发生竞态
- `sendMessage()` 现在会等待 `connecting` 状态完成，不会因为预热尚未结束而提前报“session not established”
- `ChatView` 在新建对话和加载历史会话时会主动准备 adapter session，不再等首条消息触发建连
- ACP session 状态变化现在会同步刷新 LED、config、plan 和 slash command 自动完成

**测试结果**:
- 新增逻辑单测覆盖“预热中立即发送首条消息”和“新对话重建 ACP session 清空旧状态”

**相关文件**:
- `src/adapters/acp-bridge-adapter.ts`
- `src/ui/chat-view.ts`
- `src/core/types.ts`
- `test/unit/acp-bridge-adapter.test.ts`
- `.memory/01-tasks.md`
- `.memory/03-bugs.md`

---

## 2026-04-10 - 实现 ACP 会话能力并补齐回归测试

**实现范围**:
- `slash-commands`
- `session-modes`
- `agent-plan`
- `session-config-options`

**完成内容**:
- `AcpBridgeAdapter` 现在真实调用官方 SDK 的 `session/set_config_option` 和 `session/set_mode`
- `configOptions` 支持 `select` 与 `boolean`，并支持分组选项扁平化显示
- 当 Agent 未返回 `configOptions` 时，UI 会自动回退到 `modes` 并继续可切换
- `available_commands_update`、`config_option_update`、`current_mode_update`、`plan` 都会触发 UI 刷新
- Agent slash command 选择后不再误执行内建命令，而是按协议插入 `/command` 文本
- 聊天面板新增 plan 区域，显示当前 plan 和 mode

**测试结果**:
- `npm run lint` 通过
- `npm test` 通过
- `npm run build:quick` 通过
- 全量单测: `9` 个文件，`76` 个测试全部通过

**相关文件**:
- `src/adapters/acp-bridge-adapter.ts`
- `src/ui/chat-view.ts`
- `src/ui/components/config-toolbar.tsx`
- `src/ui/components/input-autocomplete.tsx`
- `src/core/types.ts`
- `test/unit/acp-bridge-adapter.test.ts`
- `test/unit/slash-commands.test.ts`

---

## 2026-04-10 - 复核 ACP 协议任务清单

**复核范围**:
- `slash-commands`
- `session-modes`
- `agent-plan`
- `session-config-options`

**结论**:
- `01-tasks.md` 原先只覆盖了斜杠命令基础提示，缺少 ACP 协议要求的动态更新、真实会话配置切换、mode 兼容层和 plan 可视化任务
- 原有“Skill 支持”表述与本次复核的 ACP 官方章节不完全对应，已调整为 ACP Slash Commands / Session Config Options / Session Modes / Agent Plan 对应任务

**已更新**:
- `.memory/01-tasks.md`
  - 新增 `available_commands_update` 动态更新与 `input.hint` 支持任务
  - 新增 `session/set_config_option`、`config_option_update`、`session/set_mode`、`current_mode_update` 对应任务
  - 新增 Agent Plan 面板和 ACP 协议回归测试任务
  - 新增“ACP 协议能力补齐”状态表，区分部分完成与待实现项

---

## 总体进度概览

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 0 - 项目基础 | ✅ 已完成 | 100% |
| Phase 1 - 核心类型与接口定义 | ✅ 已完成 | 100% |
| Phase 2 - 工具调用机制 | ✅ 已完成 | 100% |
| Phase 3 - ACP Bridge Mode | ✅ 已完成 | 100% |
| Phase 4 - 历史对话保存功能 | ✅ 已完成 | 100% |
| Phase 5 - agent命令支持 | ✅ 已完成 | 100% |
| Phase 6 - UI-UX 优化 | ✅ 已完成 | 95% |

---

## 2026-04-10 - 完整实现 ACP 协议功能 ✅

**错误纠正**: 之前错误地认为 ACP 协议不支持 skills/commands，实际上协议完整支持以下功能：

### 已实现功能

#### 1. Slash Commands (`available_commands_update`) ✅
**协议文档**: https://agentclientprotocol.com/protocol/slash-commands

**实现内容**:
- Agent 可以通过 `available_commands_update` 通知发送可用命令列表
- 在 `AgentLinkAcpClient.sessionUpdate` 中添加处理逻辑
- 在 `AcpBridgeAdapter` 中存储 `availableCommands`
- 添加 `getAvailableCommands()` 方法供 UI 使用
- UI 中 `/` 命令现在显示：
  - 内建命令（/clear、/help）
  - Agent 提供的命令（如 /web、/test、/plan）

**代码变更**:
- `src/adapters/acp-bridge-adapter.ts`: 添加 `AvailableCommand` 类型和处理方法
- `src/ui/chat-view.ts`: 使用 `getAvailableCommands()` 获取命令
- `src/ui/components/input-autocomplete.tsx`: 添加 `createAvailableCommandSuggestions()`

#### 2. Session Modes (`current_mode_update`) ✅
**协议文档**: https://agentclientprotocol.com/protocol/session-modes

**实现内容**:
- 支持 `current_mode_update` 通知
- 存储当前 mode ID
- 添加 `getCurrentMode()` 方法
- 在 session 初始化时保存初始 mode

**代码变更**:
- `src/adapters/acp-bridge-adapter.ts`: 添加 `currentMode` 状态和处理方法

#### 3. Agent Plan (`plan`) ✅
**协议文档**: https://agentclientprotocol.com/protocol/agent-plan

**实现内容**:
- 支持 `plan` 通知接收执行计划
- 存储 plan entries（包含 content、priority、status）
- 添加 `getPlan()` 方法供 UI 显示
- 支持动态更新（Agent 可以随时更新计划）

**代码变更**:
- `src/adapters/acp-bridge-adapter.ts`: 添加 `PlanEntry` 类型和 `handlePlan()` 方法

#### 4. Session Config Options (`config_option_update`) ✅
**协议文档**: https://agentclientprotocol.com/protocol/session-config-options

**实现内容**:
- 已支持初始 session 的 configOptions
- 新增支持 `config_option_update` 动态更新
- Agent 可以主动更新配置选项
- 保持配置选项的完整状态

**代码变更**:
- `src/adapters/acp-bridge-adapter.ts`: 添加 `handleConfigOptionUpdate()` 方法
- 提取 `mapConfigOptions()` 用于统一映射逻辑

### 新增类型定义

```typescript
// AvailableCommand - Slash Commands
interface AvailableCommand {
  name: string;
  description: string;
  input?: { hint: string };
}

// PlanEntry - Agent Plan
interface PlanEntry {
  content: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
}
```

### 新增方法

**AcpBridgeAdapter**:
- `getAvailableCommands(): AvailableCommand[]` - 获取 slash commands
- `getPlan(): PlanEntry[]` - 获取执行计划
- `getCurrentMode(): string | null` - 获取当前模式
- `handleAvailableCommands(commands)` - 处理命令更新
- `handlePlan(entries)` - 处理计划更新
- `handleCurrentModeUpdate(modeId)` - 处理模式更新
- `handleConfigOptionUpdate(configOptions)` - 处理配置更新

### 构建结果

```
✅ Build complete!
Test Files  9 passed (9)
     Tests  68 passed (68)

main.js (854.2 KB)
```

### 测试步骤

1. 连接 ACP Agent（如 Kimi）
2. 输入 `/` 查看命令列表：
   - 应显示内建命令（/clear、/help）
   - 应显示 Agent 提供的命令（如 /web、/test）
3. Agent 发送 plan 时，应在 UI 中显示
4. Agent 切换 mode 时，应更新显示
5. Agent 更新 config options 时，应同步更新

---

## 2026-04-10 - 移除 MockAdapter ✅

**操作**: 移除 MockAdapter 及相关代码

### 移除原因
- ACP 协议目前不支持 skills/commands 的传输
- MockAdapter 主要用于测试，现在不再需要
- 简化代码库，只保留 ACP Bridge Adapter

### 移除的文件
- ✅ `src/adapters/mock-adapter.ts` - 已删除
- ✅ `test/unit/mock-adapter.test.ts` - 已删除

### 修改的文件
- ✅ `src/main.ts` - 移除 MockAdapter 导入和使用
- ✅ `src/core/types.ts` - 移除 `mock` BackendType 和 `MockBackendConfig`
- ✅ `src/settings/settings.ts` - 移除 `createMockBackendConfig()` 函数
- ✅ `src/settings/settings-tab.ts` - 移除 Mock 按钮和相关逻辑
- ✅ `src/ui/chat-view.ts` - 移除 mock 类型判断
- ✅ `test/unit/settings.test.ts` - 移除 mock 相关测试
- ✅ `src/adapters/agent-adapter.ts` - 移除 MockBackendConfig 导出

### 构建产物

```
build/
├── main.js       (850.8 KB) - 移除 MockAdapter 后更小
├── manifest.json (0.3 KB)
└── styles.css    (11.3 KB)
```

### 测试结果

```
Test Files  9 passed (9)
     Tests  68 passed (68)
```

### 影响

- 插件现在**只支持 ACP Bridge** 后端
- 用户需要配置 ACP agent 才能使用
- `/` 命令现在只显示内建命令（/clear、/help）
- 等待 ACP 协议支持 skills 后，可恢复 agent skills 功能

---

## 2026-04-10 - Agent Skills 功能发布到 dev 测试 ✅

**操作**: 将 Agent Skills 功能构建产物发布到 dev vault 进行测试

### 构建产物

```
build/
├── main.js       (867.6 KB) - 包含 Agent Skills 支持
├── manifest.json (0.3 KB)
└── styles.css    (11.3 KB)
```

### 发布位置

复制到: `dev/.obsidian/plugins/agentlink/`

**文件清单**:
- ✅ main.js (867.62 KB) - 包含内建命令 + Agent Skills 合并功能
- ✅ manifest.json (0.33 KB) - 插件清单
- ✅ styles.css (11.30 KB) - 样式文件
- ✅ data.json (3.23 KB) - 用户数据（保留）

### 测试步骤

1. 打开 Obsidian
2. 打开 `dev/` 文件夹作为 vault
3. 进入设置 → 社区插件 → 启用 AgentLink
4. **测试 Mock Adapter**:
   - 选择 Mock Agent
   - 在输入框中输入 `/`
   - 验证显示内容：
     - **Built-in**: /clear (🗑️), /help (❓)
     - **Agent**: /web-search (🌐), /code-analysis (🔍), /run-tests (🧪)
   - 验证分组显示（Built-in 在上，Agent 在下）
   - 选择 /clear → 对话应被清空
   - 选择 /help → 应显示帮助信息
   - 选择 /web-search → 应发送消息给 agent

5. **测试 ACP Bridge Adapter**（如果已配置）:
   - 选择 ACP Agent
   - 输入 `/`
   - 应只看到 Built-in 命令（/clear, /help）
   - 等待 ACP 协议完善后会显示 Agent skills

### 预期行为

| 操作 | 预期结果 |
|------|----------|
| 输入 `/` | 显示命令列表，分 Built-in 和 Agent 两组 |
| 选择 Built-in 命令 | 本地执行（不发送给 agent） |
| 选择 Agent skill | 发送给 agent 处理 |
| 命令过滤 | 输入 `/cl` 应过滤出 /clear |
| Enter 选择 | 在菜单打开时，Enter 应选择命令而非发送消息 |

### 功能验证

- ✅ 构建成功（无错误）
- ✅ 测试通过（78/78）
- ✅ 文件已复制到 dev 目录
- ✅ 准备进行集成测试

---

## 2026-04-10 - 完整实现：从 Agent 获取 Skills + 内建命令 ✅

**目标**: 实现从 ACP Agent 获取 skills，与内建命令合并显示，并区分来源

**状态**: ✅ **已完成**

### 实现内容

#### 1. Skill 类型定义 ✅
**文件**: `src/core/types.ts`

**添加内容**:
- `Skill` 接口：定义 skill 结构（id, name, label, description, category, source, icon, parameters）
- `SkillParameter` 接口：skill 参数定义
- `BUILTIN_COMMANDS` 常量：内建命令列表（/clear, /help）

#### 2. AgentAdapter 接口扩展 ✅
**文件**: `src/core/types.ts`

**添加方法**:
```typescript
getSkills?(): Skill[];
```

#### 3. MockAdapter 实现 ✅
**文件**: `src/adapters/mock-adapter.ts`

**添加 mock skills**:
- `/web-search` - 网页搜索
- `/code-analysis` - 代码分析
- `/run-tests` - 运行测试

#### 4. AcpBridgeAdapter 实现 ✅
**文件**: `src/adapters/acp-bridge-adapter.ts`

**实现 getSkills()**: 返回空数组（等待 ACP 协议完整支持）

#### 5. UI 组件更新 ✅
**文件**: `src/ui/components/input-autocomplete.tsx`

**更新内容**:
- `SuggestionItem` 添加 `source` 字段（'builtin' | 'agent'）
- 按 source 分组显示命令
- **Built-in** 命令显示在顶部，带有 🗑️ ❓ 图标
- **Agent** skills 显示在下部，带有 🌐 🔍 🧪 图标
- 不同来源使用不同样式区分
- 添加 `createSkillSuggestions()` 函数转换 Skill 到 SuggestionItem

#### 6. ChatView 合并逻辑 ✅
**文件**: `src/ui/chat-view.ts`

**更新 `showAutocomplete()`**:
```typescript
// 获取内建命令
const builtinSuggestions = createSlashCommandSuggestions()
  .filter(s => s.label.toLowerCase().includes(query.toLowerCase()));

// 获取 agent skills
const agentSkills = this.adapter?.getSkills?.() || [];
const agentSuggestions = createSkillSuggestions(agentSkills)
  .filter(s => s.label.toLowerCase().includes(query.toLowerCase()));

// 合并：内建命令在前，agent skills 在后
suggestions = [...builtinSuggestions, ...agentSuggestions];
```

### 显示效果

```
┌──────────────────────────────────┐
│ Commands                         │
├──────────────────────────────────┤
│ 🗑️ /clear    Clear conversation │ ← Built-in
│ ❓ /help     Show help           │ ← Built-in
├──────────────────────────────────┤
│ 🌐 /web-search   Web Search      │ ← Agent
│ 🔍 /code-analysis Code Analysis  │ ← Agent
│ 🧪 /run-tests    Run Tests       │ ← Agent
└──────────────────────────────────┘
```

### 文件变更

**修改文件**:
- `src/core/types.ts` - 添加 Skill 类型和 BUILTIN_COMMANDS
- `src/adapters/agent-adapter.ts` - 导出 Skill 类型
- `src/adapters/mock-adapter.ts` - 实现 getSkills()
- `src/adapters/acp-bridge-adapter.ts` - 实现 getSkills()
- `src/ui/components/input-autocomplete.tsx` - 分组显示、样式区分
- `src/ui/chat-view.ts` - 合并内建命令和 agent skills

### 构建产物

```
build/
├── main.js       (867.6 KB)
├── manifest.json (0.3 KB)
└── styles.css    (11.3 KB)
```

### 测试步骤

1. 使用 **Mock Adapter** 测试：
   - 输入 `/` → 应看到内建命令 + Mock Agent 的 skills
   - 内建命令在顶部（/clear, /help）
   - Agent skills 在下部（/web-search, /code-analysis, /run-tests）

2. 使用 **ACP Bridge Adapter** 测试：
   - 输入 `/` → 应只看到内建命令（/clear, /help）
   - 等待 ACP 协议完整支持后，agent 会提供 skills

3. 验证命令执行：
   - 选择内建命令 → 本地执行（清空对话/显示帮助）
   - 选择 agent skill → 通过 sendMessage 发送给 agent

---

## 2026-04-10 - Task 6 完成：/ 命令功能验证与测试脚本 ✅

**目标**: 实现 / 命令的执行逻辑并创建测试脚本

**状态**: ✅ **已完成**

### 实现内容

#### 1. 命令执行逻辑 ✅
**文件**: `src/ui/chat-view.ts`

**添加方法**:
- `executeSlashCommand(commandId: string)` - 执行斜杠命令
- `showHelpMessage()` - 显示帮助信息

**支持的命令**:
| 命令 | 行为 |
|------|------|
| `/clear` | 清空当前对话并显示通知 |
| `/help` | 在对话中显示帮助消息 |
| `/test` | 设置输入框为 "Run project tests" 并发送 |
| `/web` | 设置输入框为 "Search the web for: " 并聚焦 |

**代码示例**:
```typescript
private async executeSlashCommand(commandId: string): Promise<void> {
  switch (commandId) {
    case 'clear':
      this.clearConversation();
      new Notice('Conversation cleared');
      break;
    case 'help':
      this.showHelpMessage();
      break;
    case 'test':
      this.inputEl.value = 'Run project tests';
      await this.handleSend();
      break;
    case 'web':
      this.inputEl.value = 'Search the web for: ';
      this.inputEl.focus();
      break;
  }
}
```

#### 2. 测试脚本 ✅
**文件**: `test/unit/slash-commands.test.ts` (新增)

**测试覆盖**:
- ✅ `createSlashCommandSuggestions()` 返回所有命令
- ✅ 命令结构正确（id, label, description, icon）
- ✅ 命令 ID 唯一性
- ✅ 描述有意义
- ✅ 按 query 过滤命令
- ✅ 大小写不敏感过滤
- ✅ 无匹配时返回空数组

**测试结果**:
```
Test Files  10 passed (10)
     Tests  78 passed (78)
```

### 文件变更

**修改文件**:
- `src/ui/chat-view.ts` - 添加命令执行逻辑

**新增文件**:
- `test/unit/slash-commands.test.ts` - 单元测试

### 构建产物

```
build/
├── main.js       (861.9 KB)
├── manifest.json (0.3 KB)
└── styles.css    (11.3 KB)
```

### 测试步骤

1. 在输入框中输入 `/` → 显示命令列表
2. 选择 `/clear` → 对话被清空，显示通知
3. 选择 `/help` → 显示帮助消息在对话中
4. 选择 `/test` → 自动发送 "Run project tests"
5. 选择 `/web` → 输入框显示 "Search the web for: "

---

## 2026-04-10 - 修复快捷键冲突：Enter 键在自动完成菜单中 ✅

**问题**: 当 @ 或 / 自动完成菜单打开时，按下 Enter 键会触发输入框的发送消息，而不是选择菜单项

**解决方案**: 添加 `isAutocompleteOpen` 标志位，在输入框 keydown 处理中检查此标志

**修改内容**:

### src/ui/chat-view.ts
1. 添加 `isAutocompleteOpen` 私有属性
2. 在 `showAutocomplete()` 中设置为 `true`
3. 在 `hideAutocomplete()` 中设置为 `false`
4. 在输入框 keydown 事件中检查 `isAutocompleteOpen`，当菜单打开时不触发发送

**代码变更**:
```typescript
// 添加标志位
private isAutocompleteOpen = false;

// showAutocomplete 中设置
this.isAutocompleteOpen = true;

// hideAutocomplete 中清除
this.isAutocompleteOpen = false;

// keydown 中检查
if (evt.key === 'Enter') {
    if (this.isAutocompleteOpen) {
        return; // Let autocomplete handle it
    }
    // ... rest of logic
}
```

### 构建产物

```
build/
├── main.js       (860.4 KB)
├── manifest.json (0.3 KB)
└── styles.css    (11.3 KB)
```

### 测试步骤

1. 在输入框中输入 `@` 或 `/`
2. 自动完成菜单应该弹出
3. 按 Enter 键 → 应该选中高亮的菜单项，**而不是发送消息**
4. 按 Esc 或点击其他地方关闭菜单
5. 再次按 Enter 键 → 应该发送消息

---

## 2026-04-10 - Phase 6 发布到 dev 目录测试 ✅

**操作**: 将 Phase 6 UI-UX 优化构建产物发布到 dev vault

### 构建产物

```
build/
├── main.js       (860.2 KB) - 包含 Phase 6 LED 和快捷键优化
├── manifest.json (0.3 KB)
└── styles.css    (11.3 KB)
```

### 发布位置

复制到: `dev/.obsidian/plugins/agentlink/`

**文件清单**:
- ✅ main.js (860.2 KB) - 主程序，包含 Phase 6 功能
- ✅ manifest.json (0.33 KB) - 插件清单
- ✅ styles.css (11.30 KB) - 样式文件
- ✅ data.json (2.3 KB) - 用户数据（保留）

### 测试步骤

1. 打开 Obsidian
2. 打开 `dev/` 文件夹作为 vault
3. 进入设置 → 社区插件 → 启用 AgentLink
4. 测试新功能：
   - **LED 状态**: 打开 chat 面板，观察 LED 是否为黄色闪烁（connecting）
   - **快捷键**: 
     - Enter 发送消息
     - Shift+Enter 换行
     - Ctrl+Enter 换行
   - **@ 文件引用**:
     - 输入 `@` 查看文件列表
     - 选择文件后，观察是否自动添加到输入状态栏
     - 观察 "Current note" 是否显示在 @ 菜单顶部
   - **Agent 切换**: 切换 agent 时观察 LED 状态变化

### 功能验证

- ✅ 构建成功（无错误）
- ✅ 测试通过（71/71）
- ✅ 文件已复制到 dev 目录
- ✅ 准备进行集成测试

---

## 2026-04-10 - Phase 6 UI-UX 优化：核心功能完成 ✅

**目标**: 修复 LED 连接状态、优化输入快捷键、改进 @mention 体验

**状态**: ✅ 高优先级任务已完成

### 已完成功能

#### 1. LED 连接状态修复 ✅
**文件**: `src/ui/chat-view.ts`

**修改内容**:
- 新增 `updateLedState()` 方法统一管理 LED 状态
- 支持状态：connected (绿色)、disconnected (红色)、connecting (黄色闪烁)、busy (黄色闪烁)、error (红色)
- 修改 `onOpen()` 初始化时 LED 显示为 connecting 状态
- 修改 `setBusy()` 使用新的 LED 状态管理
- 修改 `refreshStatus()` 使用新的 LED 状态管理
- 修改 `renderAgentDropdown()` 切换 agent 时先断开旧连接，LED 显示 connecting

**实现细节**:
```typescript
private updateLedState(state: 'connected' | 'disconnected' | 'connecting' | 'busy' | 'error'): void {
  const styles = {
    connected: { bg: '#4ade80', animation: 'none', shadow: '0 0 4px #4ade80' },
    disconnected: { bg: '#f87171', animation: 'none', shadow: '0 0 4px #f87171' },
    connecting: { bg: '#fbbf24', animation: 'agentlink-led-blink 0.6s ease-in-out infinite', ... },
    // ...
  };
}
```

#### 2. 输入框快捷键优化 ✅
**文件**: `src/ui/chat-view.ts`

**修改内容**:
- Enter: 发送消息
- Shift+Enter: 换行
- Ctrl+Enter: 换行
- Alt+Enter: 换行

#### 3. @ 文件后附件显示 ✅
**文件**: `src/ui/chat-view.ts`, `src/ui/components/input-autocomplete.tsx`

**修改内容**:
- 修改 `handleAutocompleteSelect()` 为 async 方法
- 选择文件后自动创建附件并显示在输入状态栏
- 从输入框中移除 @ 触发文本
- 显示通知 "Attached: filename"
- 更新 InputAutocomplete 组件支持异步 onSelect 回调

#### 4. @current note 整合到 @ 菜单 ✅
**文件**: `src/ui/components/input-autocomplete.tsx`, `src/ui/components/input-state-bar.tsx`, `src/ui/chat-view.ts`

**修改内容**:
- 修改 `createFileSuggestions()` 添加 "Current note" 选项（如果有活动文件）
- 在 @ 菜单顶部显示 "Current note" 选项
- 从 InputStateBar 中移除 "Current note" 按钮
- 更新相关 props 和类型定义

### 文件变更

**修改文件**:
- `src/ui/chat-view.ts` - LED 状态、快捷键、@mention 处理
- `src/ui/components/input-autocomplete.tsx` - 异步回调支持、current note 选项
- `src/ui/components/input-state-bar.tsx` - 移除 current note 按钮

### 待完成功能

#### 5. @ 和 / 整体渲染（引用块样式）
- 状态: ⏳ 待开始
- 说明: 需要将 @ 和 / 文本以蓝色标签样式显示（较复杂，需要富文本编辑器）

#### 6. / 命令功能验证与测试脚本
- 状态: ⏳ 待开始
- 说明: 验证 /clear、/help 等命令正常工作

### 测试结果

- ✅ TypeScript 类型检查通过
- ✅ 无编译错误

---

## 2026-04-09 - 发布到 dev 目录测试 ✅

**操作**: 将 Phase 5 构建产物发布到 dev vault

### 构建产物

```
build/
├── main.js       (846.2 KB)
├── manifest.json (0.3 KB)
└── styles.css    (11.3 KB)
```

### 发布位置

复制到: `dev/.obsidian/plugins/agentlink/`

**文件清单**:
- ✅ main.js (846.18 KB) - 主程序，包含 Phase 5 功能
- ✅ manifest.json (0.33 KB) - 插件清单
- ✅ styles.css (11.30 KB) - 样式文件
- ✅ data.json (1.59 KB) - 用户数据（保留）

### 测试步骤

1. 打开 Obsidian
2. 打开 `dev/` 文件夹作为 vault
3. 进入设置 → 社区插件 → 启用 AgentLink
4. 测试新功能：
   - 在输入框中输入 `/` 查看斜杠命令提示
   - 输入 `@` 查看文件引用选择
   - 点击"添加文件"按钮附加文件
   - 发送消息查看附件是否正确传递

### 功能验证

- ✅ 构建成功（无错误）
- ✅ 测试通过（71/71）
- ✅ 文件已复制到 dev 目录
- ✅ 准备进行集成测试

---

## 2026-04-09 - Phase 5 完成：Agent 命令支持 ✅

**目标**: 实现 `/` 斜杠命令自动提示和 `@` 文件引用功能

**状态**: ✅ **已完成**

### 新增功能

#### 1. ContextService 服务 ✅
**文件**: `src/services/context-service.ts` (新增)

**功能**:
- 管理文件附件（读取、缓存、验证）
- 管理文件夹附件
- 管理选中文本附件
- 文件搜索和过滤
- 大小限制检查（单文件 1MB，总计 5MB）

**主要方法**:
- `createFileAttachment(path)` - 从文件路径创建附件
- `createFolderAttachment(path)` - 从文件夹创建附件
- `createSelectionAttachment(text)` - 从选中文本创建附件
- `searchFiles(query)` - 搜索 vault 中的文件
- `searchFolders(query)` - 搜索 vault 中的文件夹

#### 2. InputStateBar 组件 ✅
**文件**: `src/ui/components/input-state-bar.tsx` (新增)

**功能**:
- 显示在输入框上方
- 显示已附加的文件/文件夹/选中文本标签
- 每个标签显示类型图标、名称、大小
- 支持点击 ✕ 删除附件
- 显示总附件数和总大小
- 快速添加按钮（当前笔记、选中文本、文件）

#### 3. InputAutocomplete 组件 ✅
**文件**: `src/ui/components/input-autocomplete.tsx` (新增)

**功能**:
- `/` 斜杠命令提示（支持 /web, /test, /clear, /help）
- `@` 文件/文件夹引用选择
- 键盘导航（↑↓选择，Enter确认，Esc关闭，Tab确认）
- 模糊搜索匹配
- 悬停高亮

#### 4. ChatView 集成 ✅
**文件**: `src/ui/chat-view.ts`

**修改内容**:
- 添加 ContextService 实例
- 在 buildUI() 中添加输入状态栏容器
- 添加自动完成事件监听
- 修改 handleSend() 传递 attachments 到 AgentInput
- 添加文件选择对话框
- 添加选中文本和当前笔记附加功能

#### 5. ACP Bridge Adapter 支持 ✅
**文件**: `src/adapters/acp-bridge-adapter.ts`

**修改内容**:
- 将 attachments 转为 ACP resource ContentBlock
- 补充 Console 日志（terminalOutput, waitForTerminalExit, killTerminal, releaseTerminal）

### 技术细节

**ACP 协议支持**:
- 斜杠命令通过普通 text ContentBlock 发送（ACP 原生支持）
- 文件引用通过 resource ContentBlock 发送（ACP 原生支持）

**UI 布局**（符合 05-ui-ux.md）:
```
┌─────────────────────────────────────────────────────────────┐
│ [附件标签] [附件标签]                      [+ 添加文件]       │ ← InputStateBar
├─────────────────────────────────────────────────────────────┤
│ /web search...                                              │ ← 输入框（输入 / 触发自动完成）
│ @file...                                                    │ ← 输入框（输入 @ 触发文件选择）
└─────────────────────────────────────────────────────────────┘
```

### 文件变更

**新增文件**:
- `src/services/context-service.ts`
- `src/ui/components/input-state-bar.tsx`
- `src/ui/components/input-autocomplete.tsx`

**修改文件**:
- `src/ui/chat-view.ts` - 集成新功能
- `src/adapters/acp-bridge-adapter.ts` - 支持 attachments
- `src/core/types.ts` - 更新 Attachment 类型

### 测试结果

- ✅ 71 个单元测试全部通过
- ✅ TypeScript 类型检查通过
- ✅ 构建成功

---

## 2026-04-09 - Phase 5 启动：Agent 命令支持

**目标**: 实现 `/` 斜杠命令自动提示和 `@` 文件引用功能

### 新增功能规划

#### 1. `/` 斜杠命令自动提示
**功能描述**:
- 用户在输入框中输入 `/` 时，弹出命令列表
- 支持键盘导航（↑↓选择，Enter确认，Esc关闭）
- 命令分类：文件操作、搜索、编辑等

**技术实现要点**:
- 监听输入框的 `input` 事件，检测 `/` 字符
- 使用 Obsidian 的 `SuggestionModal` 或自定义下拉组件
- 命令列表从 Agent 配置动态获取

**涉及文件**:
- `src/ui/chat-view.ts` - 输入框事件监听
- `src/ui/components/slash-command-menu.tsx` (新增)

#### 2. `@` 引用文件/文件夹
**功能描述**:
- 用户在输入框中输入 `@` 时，显示文件/文件夹选择器
- 支持模糊搜索匹配文件名/路径
- 选中后以标签形式显示在**输入状态栏**

**输入状态栏位置**（参考 05-ui-ux.md 第 2.4 节）:
```
┌─────────────────────────────────────────────────────────────┐
│  @xxx(文件夹) @xxx(文件)                                        │   ←输入状态栏 
│ ───────────────────────────────────────────────────────────── │
│                    Input textarea                           │  ← Input Row
└─────────────────────────────────────────────────────────────┘
```

**引用标签样式**:
- 显示类型图标：文件夹 📁 / 文件 📄
- 标签右侧有 ✕ 按钮可删除
- 背景使用 `var(--background-secondary)`
- 圆角 4px，内边距 0.25rem 0.5rem

**技术实现要点**:
- 使用 Obsidian `Vault` API 获取文件列表
- 模糊搜索使用 `fuse.js` 或简单的字符串匹配
- 输入状态栏作为独立 DOM 元素，位于输入框上方
- 发送消息时将引用内容作为上下文附加

**涉及文件**:
- `src/ui/chat-view.ts` - 添加输入状态栏
- `src/ui/components/file-suggest-modal.tsx` (新增)
- `src/services/context-attachment.ts` (新增)

**依赖**: 需要实现上下文附件服务，将引用文件内容附加到消息中

---

## 历史进度

### 2026-04-08 开发进度

#### UI 修复与优化 ✅

**修复内容**:
- ✅ **底部配置选项始终显示**
  - 当 Agent 没有返回 configOptions 时，显示默认值
  - 确保用户始终可以看到并切换配置

- ✅ **顶部按钮右对齐**
  - 标题栏按钮（历史、清空、新对话）现在正确右对齐
  - 状态 LED 和 Backend 名称居中显示

- ✅ **统一图标风格**
  - 历史按钮：🕐（时钟）
  - 清空按钮：✕（叉号）
  - 新对话按钮：＋（加号，新增在顶部）

- ✅ **历史下拉菜单优化**
  - 移除了底部的 "+ New Chat" 按钮
  - 每个历史对话项右侧添加删除按钮（✕）
  - 点击对话标题加载，点击删除按钮删除

**文件变更**:
- `src/ui/chat-view.ts`

---

#### ACP Registry 功能 ✅

**根据 https://agentclientprotocol.com/get-started/registry 实现**:

- ✅ **Registry 数据获取**
  - 支持从 CDN 拉取最新 registry
  - 本地缓存 registry 数据到 `data/acp-registry.json`

- ✅ **自动同步设置**
  - 新增设置项：启用/禁用 Registry 自动同步
  - 可配置同步间隔（1-168 小时）
  - 支持手动 "Sync Now" 立即同步

- ✅ **自定义 ACP 代理**
  - 支持添加自定义 ACP Agent（不通过 Registry）

- ✅ **Registry 集成**
  - Registry 中的 Agent 自动转换为 backend configs
  - 与现有 backend 列表合并显示
  - 支持从 Registry 中选择并配置 Agent

**支持的知名 Agents**:
- Claude Agent, Kimi CLI, OpenCode, Codex CLI
- Cursor, GitHub Copilot, Gemini CLI
- Goose, Junie, Cline, Auggie
- 以及 20+ 其他 ACP 兼容 Agent

**文件变更**:
- `src/services/acp-registry.ts` (新增)
- `src/settings/settings.ts`
- `src/settings/settings-tab.ts`

---

#### Phase 5: 框架迁移（Preact）✅

**目标**: 将 `chat-view.ts` 中最复杂且变化频繁的底部配置栏迁移到组件化框架

**本次迁移内容**:
- ✅ 引入 **Preact** 作为轻量 UI 框架
- ✅ 构建配置调整
  - `tsconfig.json` 启用 JSX
  - `esbuild.config.mjs` 启用 automatic JSX
- ✅ 新增组件: `src/ui/components/config-toolbar.tsx`
  - 将 `mode / model / thought_level` 下拉渲染迁移为组件
- ✅ `ChatView` 接入组件渲染
  - 使用 `preact.render()` 挂载/卸载配置栏
  - 选项变化统一走 `handleConfigOptionChange()`

**文件变更**:
- `src/ui/components/config-toolbar.tsx` (新增)
- `src/ui/chat-view.ts`
- `tsconfig.json`
- `esbuild.config.mjs`

---

#### ACP Session Config Options ✅

**基于 ACP 协议实现的动态底部工具栏**:

- ✅ **AgentAdapter 接口扩展**
  - 新增 `getConfigOptions(): ConfigOption[]` 方法
  - 新增 `setConfigOption(configId, value)` 方法

- ✅ **ACP Bridge Adapter 实现**
  - 从 session 响应中解析 configOptions
  - 存储 mode/model/thought_level 配置

- ✅ **Mock Adapter 测试支持**
  - 内置默认 configOptions

- ✅ **ChatView 动态渲染**
  - 底部工具栏根据 Agent 返回的 configOptions 动态生成
  - 图标根据 category 自动识别

**文件变更**:
- `src/core/types.ts`
- `src/adapters/acp-bridge-adapter.ts`
- `src/adapters/mock-adapter.ts`
- `src/ui/chat-view.ts`

---

#### Phase 4: 快速切换功能 ✅

**新增功能（类似 Cursor AI 的界面）**:

- ✅ **Agent 选择下拉按钮**
  - 头部左侧显示 "🤖 Agent ▾" 按钮
  - 下拉列表显示所有已配置的 Agent

- ✅ **模型选择按钮**
  - 输入框底部工具栏左侧
  - 显示 "⚡ Model ▾"

- ✅ **快捷配置按钮**
  - 底部工具栏中间：✓ Auto、💭 Think

- ✅ **设置快捷入口**
  - 底部工具栏右侧：⚙️ 按钮

**文件变更**:
- `src/ui/chat-view.ts`
- `src/main.ts`

---

#### Terminal 风格 UI 重构 ✅

**布局变更**（模仿 Terminal.app 风格）:

- ✅ **两行紧凑头部设计**
  - Row 1: 🤖 AgentLink | [●] BackendName | 📜 💬 🗑️
  - Row 2: Session Title（灰色背景，可点击编辑）

- ✅ **状态指示灯（HDD 灯风格）**
  - 🟢 绿色: 已连接
  - 🔴 红色: 已断开
  - 🟡 黄色闪烁: 正在生成

- ✅ **输入区布局**
  - 输入框在左，Send/Stop 按钮在右侧垂直堆叠

**文件变更**:
- `src/ui/chat-view.ts`

---

#### 历史对话管理功能 ✅

**新增功能**:

- ✅ **SessionManager 服务**
  - 创建 `src/services/session-manager.ts`
  - 支持会话的创建、保存、加载、删除
  - 自动限制最多保存 50 个会话
  - 自动生成会话标题

- ✅ **标题栏优化**
  - 新布局：🤖 AgentLink | [会话标题] | 📜 💬 🗑️

- ✅ **历史对话列表 UI**
  - 模态框显示所有历史会话
  - 按更新时间倒序排列
  - 支持加载和删除操作

- ✅ **自动保存机制**
  - 每条消息发送后自动保存会话

**文件变更**:
- `src/services/session-manager.ts` (新增)
- `src/main.ts`
- `src/ui/chat-view.ts`

---

#### ACP 交互体验优化 ✅

**修复问题**:
- ✅ **Thinking 显示位置修复**
  - 修复 thinking 内容显示在回答下方的问题
  - 现在 thinking 显示在 assistant 回答上方

- ✅ **Thinking Markdown 渲染支持**
  - thinking 内容现在支持完整的 Markdown 渲染

- ✅ **Tool Use 卡片化显示**
  - Tool use 显示为卡片格式（而非 JSON 代码块）

**文件变更**:
- `src/core/types.ts`
- `src/adapters/acp-bridge-adapter.ts`
- `src/ui/chat-view.ts`

---

#### 设置面板清理 ✅

- ✅ **移除 Max Context Length 设置项**
  - 该配置用于限制文件内容长度，但在当前 ACP 架构下意义不大

**文件变更**:
- `src/settings/settings.ts`
- `src/settings/settings-tab.ts`
- `src/ui/chat-view.ts`

---

## 代码统计

| 指标 | 数值 |
|------|------|
| 源文件数 | 22 |
| 测试文件数 | 10 |
| 单元测试数 | 78 |
| 代码行数（估计） | ~5000 |

---

## 下一步计划

### 近期（本周）- Phase 6 剩余任务

1. **@ 和 / 整体渲染（引用块样式）**
   - 将 @ 和 / 文本以蓝色标签样式显示
   - 可选：使用 contenteditable 实现富文本输入

2. **/ 命令功能验证与测试脚本**
   - 验证 /clear、/help 命令执行
   - 创建单元测试

### 中期（下周）- Phase 6 完成

3. **工程加固与发布**
   - 完善错误处理
   - 更新 README 和文档
   - 准备提交到 Obsidian 社区插件市场

---

## 参考文档

- [01-tasks.md](./01-tasks.md) - 开发任务目标
- [03-bugs.md](./03-bugs.md) - Bug 记录
- [05-ui-ux.md](./05-ui-ux.md) - 交互及界面描述

---

*最后更新: 2026-04-13*
