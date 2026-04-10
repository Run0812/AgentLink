# AgentLink UI-UX 优化阶段 (Phase 6) - 任务与排期

> **阶段目标**: 修复 UI 交互问题，完善 Phase 5 的 @mention 和 /command 功能
> **预计工期**: 2-3 周
> **优先级**: 高 → 中 → 低

---

## 📊 任务总览

| # | 任务 | 优先级 | 状态 | 预估工时 |
|---|------|--------|------|---------|
| 1 | LED 连接状态指示修复 | 🔴 高 | ⏳ 待开始 | 4h |
| 2 | 输入框快捷键优化 | 🔴 高 | ⏳ 待开始 | 3h |
| 3 | @ 文件后附件显示在上方 | 🔴 高 | ⏳ 待开始 | 6h |
| 4 | @current note 整合到 @ 菜单 | 🟡 中 | ⏳ 待开始 | 4h |
| 5 | @ 和 / 整体渲染（引用块样式） | 🟡 中 | ⏳ 待开始 | 8h |
| 6 | / 命令功能验证与测试脚本 | 🟡 中 | ⏳ 待开始 | 6h |
| 7 | Skill 支持（从 MCP 获取 skills） | 🟢 低 | ⏳ 待开始 | 10h |

---

## 详细任务描述与实现方案

### Task 1: LED 连接状态指示修复 [🔴 高]

**问题描述**:
- 当前 LED 指示灯仅在调用 `refreshStatus()` 时更新
- 首次打开 chat 面板后未主动初始化默认 agent，LED 状态不正确
- 切换 agent 时 LED 状态未及时更新

**预期行为**:
1. 首次打开 chat 面板 → 初始化默认 agent → 连接成功 LED 变绿，失败变红
2. 切换 agent 时 → 断开旧连接 → 连接新 agent → LED 相应变化
3. 生成中时 → LED 黄色闪烁
4. 空闲/已连接 → LED 绿色常亮
5. 断开/错误 → LED 红色

**实现方案**:
```typescript
// 修改位置: src/ui/chat-view.ts

// 1. 在 onOpen() 中添加自动初始化逻辑
async onOpen(): Promise<void> {
  // ... existing buildUI code ...
  
  // 自动连接默认 agent（如果未连接）
  await this.initializeDefaultAgent();
}

// 2. 新增 initializeDefaultAgent 方法
private async initializeDefaultAgent(): Promise<void> {
  if (!this.adapter) return;
  
  this.updateLedState('connecting'); // 黄色闪烁
  
  try {
    // 调用 adapter.connect() 或检查连接状态
    if (this.adapter.connect) {
      await this.adapter.connect();
    }
    this.updateLedState('connected'); // 绿色
  } catch (error) {
    this.updateLedState('disconnected'); // 红色
    console.error('[ChatView] Failed to initialize agent:', error);
  }
}

// 3. 新增 updateLedState 方法统一管理 LED 状态
private updateLedState(state: 'connected' | 'disconnected' | 'connecting' | 'busy'): void {
  if (!this.statusLed) return;
  
  const styles = {
    connected: { bg: '#4ade80', animation: 'none', shadow: '0 0 4px #4ade80' },
    disconnected: { bg: '#f87171', animation: 'none', shadow: '0 0 4px #f87171' },
    connecting: { bg: '#fbbf24', animation: 'agentlink-led-blink 0.6s ease-in-out infinite', shadow: '0 0 4px #fbbf24' },
    busy: { bg: '#fbbf24', animation: 'agentlink-led-blink 0.6s ease-in-out infinite', shadow: '0 0 4px #fbbf24' },
  };
  
  const style = styles[state];
  this.statusLed.style.background = style.bg;
  this.statusLed.style.animation = style.animation;
  this.statusLed.style.boxShadow = style.shadow;
}

// 4. 修改 renderAgentDropdown 中的切换逻辑
item.addEventListener('click', async () => {
  if (backend.id !== this.settings.activeBackendId) {
    // 先断开旧连接
    if (this.adapter?.disconnect) {
      await this.adapter.disconnect();
    }
    
    // 更新设置
    this.settings.activeBackendId = backend.id;
    await this.onSettingsSave();
    
    // 重新初始化 adapter
    // 注意: 这里需要通知 plugin 层重新创建 adapter
    this.updateLedState('connecting');
    
    // 触发 adapter 重新连接
    // ... 需要与 plugin.ts 协调 ...
    
    new Notice(`Switched to ${backend.name}`);
  }
  container.style.display = 'none';
});
```

**涉及的文件**:
- `src/ui/chat-view.ts` - 主要修改
- `src/main.ts` - 可能需要添加 adapter 重新创建逻辑

---

### Task 2: 输入框快捷键优化 [🔴 高]

**问题描述**:
- 当前仅支持 Ctrl/Cmd+Enter 发送
- 用户期望: Enter 发送，Shift/Ctrl+Enter 换行（符合常见 IM 习惯）

**预期行为**:
| 快捷键 | 行为 |
|--------|------|
| Enter | 发送消息 |
| Shift+Enter | 插入换行符 |
| Ctrl+Enter | 插入换行符 |
| Alt+Enter | 插入换行符 |

**实现方案**:
```typescript
// 修改位置: src/ui/chat-view.ts 中的 inputEl keydown 事件

this.inputEl.addEventListener('keydown', (evt) => {
  if (evt.key === 'Enter') {
    if (evt.shiftKey || evt.ctrlKey || evt.metaKey || evt.altKey) {
      // 有修饰键: 插入换行
      // 不阻止默认行为，让 textarea 正常换行
      return;
    } else {
      // 无修饰键: 发送消息
      evt.preventDefault();
      this.handleSend();
    }
  }
});
```

**涉及的文件**:
- `src/ui/chat-view.ts` - 修改 keydown 事件处理

---

### Task 3: @ 文件后附件显示在上方 [🔴 高]

**问题描述**:
- 当前 @mention 选择文件后，只是在输入框中添加了文本（如 `@path/to/file.md`）
- 需要将选中的文件作为附件添加到输入状态栏显示
- 参考 GitHub Copilot 的风格，附件以标签形式显示

**预期行为**:
1. 用户输入 `@` 选择文件
2. 文件自动添加到附件列表（输入状态栏显示）
3. 输入框中保留 `@path` 文本（作为占位符显示）
4. 发送时从附件列表读取文件内容作为上下文

**实现方案**:
```typescript
// 修改位置: src/ui/chat-view.ts

// 1. 修改 handleAutocompleteSelect 方法
private async handleAutocompleteSelect(
  item: { id: string; label: string; description?: string; icon?: string; data?: unknown },
  trigger: AutocompleteTrigger
): Promise<void> {
  const value = this.inputEl.value;
  const cursorPos = this.inputEl.selectionStart || 0;
  const textBeforeCursor = value.substring(0, cursorPos);
  const textAfterCursor = value.substring(cursorPos);

  if (trigger === 'slash') {
    // 斜杠命令保持原有逻辑
    const lastSlash = textBeforeCursor.lastIndexOf('/');
    const newText = textBeforeCursor.substring(0, lastSlash) + item.label + ' ' + textAfterCursor;
    this.inputEl.value = newText;
    this.inputEl.focus();
    
  } else if (trigger === 'mention') {
    // 文件引用: 添加到附件 + 在输入框中显示引用文本
    const file = item.data as TFile;
    const lastAt = textBeforeCursor.lastIndexOf('@');
    
    // 添加文件到附件
    const attachment = await this.contextService.createFileAttachment(file.path);
    if (attachment) {
      this.renderInputStateBar();
      new Notice(`Attached: ${attachment.name}`);
    }
    
    // 将 @path 替换为特殊标记（如可点击的标签占位符）
    // 方案 A: 直接删除文本，用户看到附件在上方
    // 方案 B: 保留简化文本如 @filename
    const newText = textBeforeCursor.substring(0, lastAt) + textAfterCursor;
    this.inputEl.value = newText;
    this.inputEl.focus();
    
  } else if (trigger === 'topic') {
    // 话题引用保持原有逻辑
    const lastHash = textBeforeCursor.lastIndexOf('#');
    const newText = textBeforeCursor.substring(0, lastHash) + '#' + item.label + ' ' + textAfterCursor;
    this.inputEl.value = newText;
    this.inputEl.focus();
  }
}

// 2. 可能需要修改 send 时的附件处理逻辑
// 当前已支持通过 contextService.listAttachments() 获取附件
// handleSend 中已正确使用:
// const input: AgentInput = {
//   prompt,
//   attachments: this.contextService.listAttachments(),
//   ...
// };
```

**涉及的文件**:
- `src/ui/chat-view.ts` - 修改 handleAutocompleteSelect
- `src/ui/components/input-state-bar.tsx` - 确保正确显示文件附件

---

### Task 4: @current note 整合到 @ 菜单 [🟡 中]

**问题描述**:
- 当前 "Current note" 是输入状态栏中的一个按钮
- 期望将其作为 @ 菜单的一个特殊选项

**预期行为**:
1. 用户输入 `@` 后，自动完成列表顶部显示 "Current note" 选项
2. 选择后添加当前文件作为附件
3. 从输入状态栏移除 "Current note" 按钮

**实现方案**:
```typescript
// 修改位置: src/ui/components/input-autocomplete.tsx

// 1. 修改 createFileSuggestions 函数，添加 current note 选项
export function createFileSuggestions(files: TFile[], includeCurrentNote: boolean = false, currentFile?: TFile | null): SuggestionItem[] {
  const suggestions: SuggestionItem[] = [];
  
  // 添加 Current note 选项（如果有当前文件）
  if (includeCurrentNote && currentFile) {
    suggestions.push({
      id: 'current_note',
      label: 'Current note',
      description: currentFile.path,
      icon: '📄',
      data: { type: 'current_note', file: currentFile },
    });
  }
  
  // 添加普通文件
  suggestions.push(...files.map(file => ({
    id: `file_${file.path}`,
    label: file.name,
    description: file.path,
    icon: '📄',
    data: { type: 'file', file },
  })));
  
  return suggestions;
}

// 2. 修改 showAutocomplete 调用，传入当前文件
private showAutocomplete(trigger: AutocompleteTrigger, query: string): void {
  // ... existing code ...
  
  if (trigger === 'mention') {
    const activeFile = this.app.workspace.getActiveFile();
    const files = this.contextService.searchFiles(query, 10);
    const folders = this.contextService.searchFolders(query, 5);
    suggestions = [
      ...createFileSuggestions(files, true, activeFile),
      ...createFolderSuggestions(folders),
    ];
  }
  
  // ... rest of code ...
}

// 3. 修改 handleAutocompleteSelect 处理 current_note 类型
private async handleAutocompleteSelect(...): Promise<void> {
  // ... existing code ...
  
  } else if (trigger === 'mention') {
    const data = item.data as { type: string; file: TFile };
    const file = data.file;
    
    // 添加文件到附件
    const attachment = await this.contextService.createFileAttachment(file.path);
    if (attachment) {
      this.renderInputStateBar();
      new Notice(`Attached: ${attachment.name}`);
    }
    
    // 删除 @ 文本
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const newText = textBeforeCursor.substring(0, lastAt) + textAfterCursor;
    this.inputEl.value = newText;
    this.inputEl.focus();
  }
  
  // ... rest of code ...
}

// 4. 修改 InputStateBar 组件，移除 Current note 按钮
// src/ui/components/input-state-bar.tsx
// 删除 onAttachCurrentNote prop 和相关按钮
```

**涉及的文件**:
- `src/ui/components/input-autocomplete.tsx` - 添加 current note 选项
- `src/ui/chat-view.ts` - 修改调用和处理逻辑
- `src/ui/components/input-state-bar.tsx` - 移除按钮

---

### Task 5: @ 和 / 整体渲染（引用块样式） [🟡 中]

**问题描述**:
- 用户在输入框中输入 `@filename` 或 `/command` 后
- 期望这些文本以一个整体显示，类似引用块或标签样式
- 参考截图中的样式（蓝色背景，看起来像是一个整体标签）

**预期行为**:
- `@path/to/file.md` 显示为蓝色背景的引用标签
- `/command` 显示为蓝色背景的命令标签
- 可点击或删除

**实现方案**:
这是一个较复杂的富文本编辑器功能，有两种方案:

**方案 A: 简单方案（伪标签）**
```typescript
// 使用 background-colored span 模拟标签效果
// 输入框仍然是普通 textarea，但显示时特殊处理

// 这种方法限制较多，textarea 不支持富文本
```

**方案 B: contenteditable 方案（推荐）**
```typescript
// 将 textarea 替换为 contenteditable div
// 支持富文本渲染和交互

// 1. 创建新的输入组件 src/ui/components/rich-input.tsx
import { h, FunctionComponent } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';

interface RichInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  mentions: Array<{ id: string; type: 'file' | 'command' | 'topic'; text: string }>;
}

export const RichInput: FunctionComponent<RichInputProps> = ({
  value,
  onChange,
  onSend,
  mentions,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  
  // 将 plain text 转换为带标签的 HTML
  const renderContent = (text: string): string => {
    let html = escapeHtml(text);
    
    // 渲染 @mentions
    mentions.forEach(mention => {
      const escapedText = escapeHtml(mention.text);
      const tagClass = mention.type === 'file' ? 'agentlink-tag-file' : 
                      mention.type === 'command' ? 'agentlink-tag-command' : 
                      'agentlink-tag-topic';
      html = html.replace(
        escapedText,
        `<span class="agentlink-tag ${tagClass}" contenteditable="false">${escapedText}</span>`
      );
    });
    
    return html;
  };
  
  return (
    <div
      ref={editorRef}
      className="agentlink-rich-input"
      contentEditable
      dangerouslySetInnerHTML={{ __html: renderContent(value) }}
      onInput={(e) => onChange(e.currentTarget.textContent || '')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSend();
        }
      }}
    />
  );
};

// 2. CSS 样式
// styles.css
.agentlink-tag {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.85em;
  margin: 0 2px;
}

.agentlink-tag-file {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

.agentlink-tag-command {
  background: var(--interactive-accent-hover);
  color: var(--text-on-accent);
}
```

**方案 C: 分步实现（折中）**
```typescript
// 短期内: 保持 textarea，但在输入状态栏更明显地显示引用
// 长期: 迁移到方案 B

// 修改 InputStateBar 组件，添加引用预览区域
// 在输入框上方显示当前引用的文件/命令列表
```

**建议**: 采用方案 C（分步实现），因为方案 B 改动较大，可能引入稳定性问题。

**涉及的文件**:
- `src/ui/components/rich-input.tsx`（如采用方案 B）
- `src/ui/components/input-state-bar.tsx`（如采用方案 C）
- `styles.css` - 添加标签样式

---

### Task 6: / 命令功能验证与测试脚本 [🟡 中]

**问题描述**:
- 用户反馈 / 命令列表功能无法正常工作
- 需要验证功能并创建测试脚本

**当前实现分析**:
```typescript
// src/ui/components/input-autocomplete.tsx
export function createSlashCommandSuggestions(): SuggestionItem[] {
  return [
    { id: 'web', label: '/web', description: 'Search web for information', icon: '/' },
    { id: 'test', label: '/test', description: 'Run project tests', icon: '/' },
    { id: 'clear', label: '/clear', description: 'Clear conversation', icon: '/' },
    { id: 'help', label: '/help', description: 'Show help', icon: '/' },
  ];
}
```

**问题定位**:
1. 当前只是静态列表，没有实际执行功能
2. 选择 /clear 等命令后没有对应处理逻辑
3. 需要添加命令执行逻辑

**预期行为**:
| 命令 | 功能 |
|------|------|
| `/clear` | 清空当前对话 |
| `/help` | 显示帮助信息 |
| `/test` | 运行项目测试 |
| `/web` | 打开网络搜索 |

**实现方案**:
```typescript
// 修改位置: src/ui/chat-view.ts

// 1. 修改 handleAutocompleteSelect 添加命令执行
private handleAutocompleteSelect(...): void {
  if (trigger === 'slash') {
    const lastSlash = textBeforeCursor.lastIndexOf('/');
    const commandId = item.id;
    
    // 执行命令
    this.executeSlashCommand(commandId);
    
    // 清除命令文本
    const newText = textBeforeCursor.substring(0, lastSlash) + textAfterCursor;
    this.inputEl.value = newText;
    this.inputEl.focus();
  }
  // ... rest ...
}

// 2. 添加命令执行方法
private executeSlashCommand(commandId: string): void {
  switch (commandId) {
    case 'clear':
      this.clearConversation();
      new Notice('Conversation cleared');
      break;
      
    case 'help':
      this.showHelpMessage();
      break;
      
    case 'test':
      // 实际执行需要在 Agent 端处理
      // 这里只是发送提示
      this.appendStatusMessage('Running tests... (send a message to execute)');
      break;
      
    case 'web':
      this.appendStatusMessage('Web search: (send a message to execute)');
      break;
      
    default:
      console.warn('Unknown command:', commandId);
  }
}

// 3. 添加帮助信息显示
private showHelpMessage(): void {
  const helpText = `
## Available Commands

- **/clear** - Clear current conversation
- **/help** - Show this help message
- **/test** - Run project tests
- **/web** - Search web for information

## Shortcuts

- **Enter** - Send message
- **Shift+Enter** - New line
- **Ctrl+Enter** - New line
- **@** - Reference a file
- **#** - Reference a topic
`;
  
  const msg = this.session.addMessage('assistant', helpText);
  this.renderMessage(msg);
}
```

**测试脚本**:
```typescript
// test/unit/slash-commands.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSlashCommandSuggestions } from '../../src/ui/components/input-autocomplete';

describe('Slash Commands', () => {
  describe('createSlashCommandSuggestions', () => {
    it('should return all available commands', () => {
      const commands = createSlashCommandSuggestions();
      
      expect(commands).toHaveLength(4);
      expect(commands.map(c => c.id)).toContain('web');
      expect(commands.map(c => c.id)).toContain('test');
      expect(commands.map(c => c.id)).toContain('clear');
      expect(commands.map(c => c.id)).toContain('help');
    });
    
    it('should have correct command structure', () => {
      const commands = createSlashCommandSuggestions();
      
      commands.forEach(cmd => {
        expect(cmd).toHaveProperty('id');
        expect(cmd).toHaveProperty('label');
        expect(cmd).toHaveProperty('description');
        expect(cmd).toHaveProperty('icon');
        expect(cmd.label).toMatch(/^\//); // 以 / 开头
      });
    });
  });
  
  // 集成测试: 测试命令执行
  describe('executeSlashCommand', () => {
    // 需要在 ChatView 中导出或重构以便测试
  });
});
```

**涉及的文件**:
- `src/ui/chat-view.ts` - 添加命令执行逻辑
- `test/unit/slash-commands.test.ts` - 新建测试文件

---

### Task 7: Skill 支持（从 MCP 获取 skills） [🟢 低]

**问题描述**:
- 用户期望 / 命令能筛选到 skills
- Skills 应该来自 MCP (Model Context Protocol) 服务器
- 这是较复杂的功能，需要与 ACP 协议集成

**概念说明**:
- **Skills**: Agent 的能力集合，如 "web_search", "code_analysis" 等
- **MCP**: Model Context Protocol，用于标准化 Agent 能力描述
- **Tools**: Agent 可调用的具体工具

**预期行为**:
1. 连接 Agent 后，获取其支持的 skills 列表
2. 输入 `/` 时显示 skills 和本地命令
3. Skills 显示为分类（如 "Search", "Code", "File"）
4. 选择 skill 后，Agent 执行相应功能

**实现方案**:
```typescript
// 这是一个较大的功能，需要多文件修改

// 1. 扩展 types.ts 添加 Skill 类型
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
}

// 2. 修改 AcpBridgeAdapter 获取 skills
// src/adapters/acp-bridge-adapter.ts

class AgentLinkAcpClient implements acp.Client {
  // ... existing code ...
  
  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update;
    
    switch (update.sessionUpdate) {
      // ... existing cases ...
      
      case 'skills_updated':
        // Agent 通知 skills 已更新
        console.log('[ACP Client] Skills updated:', update.skills);
        this.adapter.updateSkills(update.skills);
        break;
    }
  }
}

// 在 AcpBridgeAdapter 中添加
private skills: Skill[] = [];

updateSkills(skills: Skill[]): void {
  this.skills = skills;
  console.log('[ACP Adapter] Skills updated:', skills.length);
}

getSkills(): Skill[] {
  return this.skills;
}

// 3. 修改 createSlashCommandSuggestions 支持动态 skills
export function createSlashCommandSuggestions(localCommands: SuggestionItem[], skills?: Skill[]): SuggestionItem[] {
  const suggestions = [...localCommands];
  
  // 添加 skills
  if (skills) {
    const skillSuggestions = skills.map(skill => ({
      id: `skill_${skill.id}`,
      label: `/${skill.id}`,
      description: skill.description,
      icon: '🛠️',
      data: { type: 'skill', skill },
      category: skill.category, // 用于分组显示
    }));
    
    suggestions.push(...skillSuggestions);
  }
  
  return suggestions;
}

// 4. 修改 ChatView 动态获取 skills
private showAutocomplete(trigger: AutocompleteTrigger, query: string): void {
  // ... existing code ...
  
  if (trigger === 'slash') {
    const localCommands = createSlashCommandSuggestions();
    const skills = this.adapter?.getSkills?.() || [];
    suggestions = createSlashCommandSuggestions(localCommands, skills)
      .filter(s => s.label.toLowerCase().includes(query.toLowerCase()));
  }
  
  // ... rest ...
}
```

**涉及的文件**:
- `src/core/types.ts` - 添加 Skill 类型
- `src/adapters/acp-bridge-adapter.ts` - 获取和存储 skills
- `src/adapters/agent-adapter.ts` - 添加 getSkills 接口
- `src/ui/components/input-autocomplete.tsx` - 支持 skills 显示
- `src/ui/chat-view.ts` - 集成 skills 到自动完成

---

## 实施排期建议

### Week 1: 核心修复
- **Day 1-2**: Task 1 - LED 连接状态修复
- **Day 3**: Task 2 - 输入框快捷键优化
- **Day 4-5**: Task 3 - @ 文件后附件显示

### Week 2: 体验优化
- **Day 1-2**: Task 4 - @current note 整合
- **Day 3-4**: Task 5 - @ 和 / 整体渲染
- **Day 5**: Task 6 - / 命令测试与修复

### Week 3: 高级功能
- **Day 1-5**: Task 7 - Skill 支持（如时间允许）

---

## 依赖关系图

```
Task 1 (LED) ─────────────────────────────┐
                                           │
Task 2 (快捷键) ───────────────────────────┤
                                           ├──→ 可并行
Task 3 (@附件) ────────────────────────────┤
                                           │
Task 4 (@current note) ────────────────────┘
              │
              ▼
Task 5 (整体渲染) ─────────────────────────┐
              │                            │
              ▼                            │
Task 6 (/命令) ────────────────────────────┤──→ 建议顺序执行
              │                            │
              ▼                            │
Task 7 (Skills) ───────────────────────────┘
```

---

## 验收标准

### Task 1
- [ ] 打开 chat 面板后 LED 自动变为绿色（连接成功）
- [ ] 切换 agent 时 LED 先变黄再变绿
- [ ] 生成消息时 LED 黄色闪烁
- [ ] 连接失败时 LED 红色

### Task 2
- [ ] Enter 发送消息
- [ ] Shift+Enter 换行
- [ ] Ctrl+Enter 换行

### Task 3
- [ ] 选择 @ 文件后附件显示在输入状态栏
- [ ] 发送消息时附件内容包含在上下文中

### Task 4
- [ ] @ 菜单顶部显示 "Current note" 选项
- [ ] 输入状态栏不再显示 "Current note" 按钮

### Task 5
- [ ] @ 和 / 文本显示为蓝色背景标签样式
- [ ] 标签可以点击删除

### Task 6
- [ ] /clear 正常工作
- [ ] /help 显示帮助信息
- [ ] 测试脚本通过

### Task 7
- [ ] 连接 MCP Agent 后能获取 skills 列表
- [ ] / 菜单显示 skills
- [ ] 选择 skill 后执行相应功能

---

*创建日期: 2026-04-10*
*最后更新: 2026-04-10*
