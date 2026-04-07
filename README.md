# AgentLink

An [Obsidian](https://obsidian.md) plugin that links your vault to local AI coding agents — **Claude Code**, **Kimi Code**, **Codex** (OpenAI), and **OpenCode**.

> **Desktop only** — requires Obsidian on macOS, Windows, or Linux.

---

## Features

- 💬 **Chat panel** in the right sidebar — send messages and see markdown-rendered responses
- 🤖 **Four agent backends** — choose the one that fits your workflow:
  | Agent | Mode | Notes |
  |-------|------|-------|
  | Claude Code | CLI | Requires `claude` CLI from [claude.ai/code](https://claude.ai/code) |
  | Kimi Code | HTTP | Requires API key from [Moonshot AI](https://platform.moonshot.cn/console/api-keys) |
  | Codex | HTTP | Requires OpenAI API key or a local [Ollama](https://ollama.com) endpoint |
  | OpenCode | CLI / HTTP | [opencode.ai](https://opencode.ai) — local server or CLI |
- 📄 **Context options** — optionally include the current file or selected text in your prompt
- 🔄 **Conversation history** — multi-turn dialogue within a session
- ⌨️ **Keyboard shortcut** — `Ctrl/Cmd + Enter` to send
- ⚙️ **Settings tab** — configure binary paths, API keys, endpoints, and models per agent

---

## Installation

### From source

```bash
# 1. Clone into your vault's plugins folder
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/Run0812/AgentLink agentlink

# 2. Install dependencies and build
cd agentlink
npm install
npm run build

# 3. Enable in Obsidian → Settings → Community plugins
```

---

## Agent Setup

### Claude Code

```bash
# Install the CLI
curl -fsSL https://claude.ai/install.sh | bash

# Authenticate
claude auth login
```

In AgentLink settings, set **Mode** to `CLI` and **Binary path** to `claude`.

### Kimi Code (Moonshot AI)

1. Get an API key at <https://platform.moonshot.cn/console/api-keys>
2. In AgentLink settings, set **Mode** to `HTTP`, paste your API key, and choose a model (e.g. `moonshot-v1-8k`).

### Codex / OpenAI

1. Get an API key at <https://platform.openai.com/api-keys>
2. In AgentLink settings, set **Mode** to `HTTP`, paste your API key, choose model (e.g. `gpt-4o`).

For a **local model via Ollama**:

```bash
ollama pull llama3
```

Set endpoint to `http://localhost:11434/v1` and model to `llama3`.

### OpenCode

```bash
# Install
npm install -g opencode-ai

# Start the local server (optional — for HTTP mode)
opencode serve
```

In AgentLink settings use **Mode** `CLI` (binary: `opencode`) or **Mode** `HTTP` (endpoint: `http://localhost:3000`).

---

## Commands

| Command | Description |
|---------|-------------|
| `AgentLink: Open panel` | Open the chat sidebar |
| `AgentLink: Send selected text to active agent` | Prefill the input with your selection |
| `AgentLink: Send current file to active agent` | Open panel with "Include file" checked |
| `AgentLink: Switch active agent` | Cycle through all configured agents |

---

## Development

```bash
npm install       # install dependencies
npm run dev       # watch mode (rebuilds on save)
npm run build     # production build
```

---

## License

MIT

