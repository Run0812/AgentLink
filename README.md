# AgentLink

> 以下 README 文案为当前对外说明的待核准版本。

AgentLink 是一个 Obsidian 桌面插件，用来在 Obsidian 中方便、快速地调用本地 Agent。

## 文档分层

- `.memory/` 是给 agent 看的项目记忆和执行文档。
- `Doc/` 是给人类看的说明文档和开发文档。

## 声明

- 插件目标是在 Obsidian 中提供方便快捷的本地 Agent 调用能力。
- 通过连接用户已经安装和维护的 Agent，尽量降低因订阅限制、策略变化或服务拒绝带来的使用中断风险。
- 插件复用各类 Agent 自身的能力与优化，而不是在插件中内嵌一个质量不佳的 Agent。

## 边界

- 不内置 Agent。
- 无意作为 Agent 的通用前端，只聚焦在 Obsidian 中的轻量使用场景。
- 当前只支持 ACP（Agent Client Protocol）。
- 未来可能支持部分 CLI 的 SDK 接入，以便使用更高级的能力。

## 当前能做什么

- 在 Obsidian 中连接本地 ACP Agent。
- 在笔记工作流里直接发起对话，减少窗口切换。
- 让插件作为 Obsidian 内的一个轻量入口，而不是另起一套 Agent UI。
- 在开发或调试模式下，将 ACP 通信输出到 Console。
- 当前代码结构已开始收敛到 `host + acp + core + ui` 的渐进分层。

## 适用场景

- 写笔记时顺手调用本地 Agent。
- 在当前 vault 上下文中做简单问答、整理和辅助操作。
- 希望继续使用已有 Agent，而不是迁移到插件内置实现。

## 文档入口

- [开发者指南](./Doc/Developer-Guide.md)
- [贡献说明](./Doc/CONTRIBUTING.md)
- [发布流程](./Doc/RELEASE.md)

---

仅支持 Obsidian Desktop。
