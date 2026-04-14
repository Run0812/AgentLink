# Developer Guide

README 只保留产品定位、能力边界和文档入口；人类文档统一放在 `Doc/`，Agent 工作记忆统一放在 `.memory/`。

## 文档分层

- `.memory/`：给 agent 看的任务、进度、Bug、测试和 UI 约束
- `Doc/`：给人类看的说明文档、贡献指南、发布流程和开发入口

## 核心约束

- ACP Bridge Adapter 必须使用官方 `@agentclientprotocol/sdk`
- 禁止手写 ACP 协议
- Dev 或 Debug 模式下，所有 ACP 通信必须输出到 Console
- 修改 `AGENTS.md` 前必须获得维护者手动确认

## 阅读入口

- [贡献说明](./CONTRIBUTING.md)
- [发布流程](./RELEASE.md)
- [任务看板](../.memory/01-tasks.md)
- [开发进度](../.memory/02-progress.md)
- [Bug 记录](../.memory/03-bugs.md)
- [测试流程](../.memory/04-testing.md)
- [UI / UX 说明](../.memory/05-ui-ux.md)

## 说明

- 根目录 [README.md](../README.md) 是对外简介，不承载详细实现细节。
- 新的开发说明优先放在 `Doc/` 目录，项目过程文档继续放在 `.memory/`。
