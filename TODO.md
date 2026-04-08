# AgentLink 待办事项

> 创建于: 2026-04-08
> 基于 RPD.md v2.0 和当前开发进度

---

## 🔴 高优先级（正在进行）

### ACP 交互体验优化
- [ ] **思维链显示优化** - 确保显示在回答上方，支持Markdown渲染
- [ ] **工具调用卡片化** - 移除JSON显示，使用卡片式布局
- [ ] **Thinking 组件美化** - 引用框样式，自动折叠，平滑动画

### 设置面板清理
- [ ] **移除 maxContextLength** - 该配置项当前无实际意义
- [ ] **简化设置界面** - 隐藏/移除未使用的配置

---

## 🟡 中优先级（下阶段开发）

### 历史对话保存功能
- [ ] **设计会话存储格式** - JSON结构，包含消息、元数据、时间戳
- [ ] **实现 SessionManager 服务** - 保存、加载、列出、删除会话
- [ ] **添加会话切换UI** - 侧边栏会话列表，新建/切换/删除会话
- [ ] **自动保存机制** - 消息变更时自动持久化到文件
- [ ] **会话导出/导入** - 支持导出为JSON，从文件导入

**设计草案：**
```typescript
interface SavedSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  backendId: string;
  messages: ChatMessage[];
  metadata?: {
    description?: string;
    tags?: string[];
  };
}
```

**存储位置：**
- 使用 Obsidian 的 `saveData`/`loadData` API
- 存储在 `.obsidian/plugins/agentlink/` 下的 `sessions/` 目录

### 消息操作增强
- [ ] **消息复制按钮** - 每条消息右上角添加复制按钮
- [ ] **消息删除功能** - 删除单条消息
- [ ] **重新生成** - 重新发送最后一条用户消息

---

## 🟢 低优先级（后续迭代）

### UI/UX 优化
- [ ] **虚拟滚动** - 大量消息时的性能优化
- [ ] **代码块高亮** - 增强代码显示
- [ ] **文件链接可点击** - Agent提到的文件显示为链接

### 配置管理
- [ ] **模型切换UI** - 标题栏添加模型选择下拉框
- [ ] **思考强度切换** - quick/balanced/deep 三种模式
- [ ] **配置预设** - 保存常用配置组合

### 上下文附件
- [ ] **附件按钮** - 输入框添加附件按钮
- [ ] **支持文件类型** - 当前笔记、选中文本、指定文件
- [ ] **附件列表显示** - 显示已附加的文件和大小

---

## 📝 文档更新任务

### 必须更新
- [ ] **README.md** - 完全重写，反映当前功能（移除CLI/HTTP描述，添加ACP功能）
- [ ] **PROGRESS.md** - 更新到最新进度

### 可选归档
- [ ] **ACP_PROTOCOL_SPEC.md** - 已实现，可考虑归档到 docs/ 目录
- [ ] **ACP_RESEARCH_SUMMARY.md** - 研究阶段完成，可归档

---

## ✅ 最近完成（已验证）

- [x] ACP Bridge 适配器完整实现
- [x] 思维链(thinking)分离显示
- [x] 工具调用处理机制
- [x] Markdown 渲染支持
- [x] 文本可选中和复制
- [x] 构建系统优化

---

## 🗂️ 文件归档建议

以下文件已过时，建议移动到 `docs/archive/` 或删除：

| 文件 | 状态 | 建议操作 |
|------|------|---------|
| ACP_PROTOCOL_SPEC.md | 已实现 | 归档到 docs/archive/ |
| ACP_RESEARCH_SUMMARY.md | 研究完成 | 归档到 docs/archive/ |
| ACP_CONSTRAINTS.md | 部分过时 | 更新或归档 |
| ACP_DEBUG.md | 仍有用 | 保留，更新测试脚本路径 |

---

## 📊 开发进度总览

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 0 - 项目基础 | ✅ 完成 | 100% |
| Phase 1 - 核心类型定义 | ✅ 完成 | 100% |
| Phase 2 - 工具调用机制 | ✅ 完成 | 100% |
| Phase 3 - ACP Bridge | ✅ 完成 | 100% |
| Phase 4 - 历史对话保存 | 🟡 计划中 | 0% |
| Phase 5 - 工程加固与发布 | ❌ 未开始 | 0% |

---

## 🎯 当前焦点

1. **修复 ACP 交互体验问题** - thinking位置、tool use显示
2. **清理设置面板** - 移除 maxContextLength
3. **开始历史对话功能设计** - 确定存储格式和API

---

## 📚 参考文档

- [RPD.md](./RPD.md) - 开发需求文档（最新v2.0）
- [PROGRESS.md](./PROGRESS.md) - 开发进展记录
- [BUILD.md](./BUILD.md) - 构建说明
