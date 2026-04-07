# AgentLink

An [Obsidian](https://obsidian.md) desktop plugin that turns your vault into a **unified frontend for local AI agents**.

Connect to any local CLI tool, HTTP server, or mock backend — all from a single chat sidebar.

> **Desktop only** — requires Obsidian on macOS, Windows, or Linux.

---

## Features

- 💬 **Streaming chat panel** — messages stream in real-time, with a stop button to interrupt
- 🔌 **Pluggable adapter architecture** — UI layer depends only on an `AgentAdapter` interface:
  | Backend | Mode | Description |
  |---------|------|-------------|
  | **Mock** | Built-in | Simulates streaming output for testing & development |
  | **CLI** | `child_process.spawn` | Run any local CLI agent (Claude Code, custom scripts) |
  | **HTTP** | `fetch` + SSE | Connect to any OpenAI-compatible local server (Ollama, LM Studio) |
  | ACP Bridge | Reserved | Future: connect via ACP protocol bridge |
  | Embedded Web | Reserved | Future: embed a local agent web UI |
- 🛑 **Cancel support** — stop generation mid-stream for any backend
- 📝 **Session history** — multi-turn conversation within a session
- ⌨️ **Keyboard shortcut** — `Ctrl/Cmd + Enter` to send
- 🐛 **Debug logging** — toggle verbose logging in developer console
- ⚙️ **Full settings** — backend type, command, args, cwd, env vars, base URL, API key, model, timeout
- ✅ **55 unit tests** — covering adapters, parsers, session store, logger, settings, errors

---

## Architecture

```
src/
  core/       types.ts, logger.ts, errors.ts      ← shared types & utilities
  adapters/   mock-adapter, cli-adapter, http-adapter  ← backend implementations
  services/   session-store, process-manager, stream-parser  ← support services
  settings/   settings.ts, settings-tab.ts         ← configuration
  ui/         chat-view.ts                         ← Obsidian ItemView
  main.ts                                          ← plugin entry point
test/
  unit/       7 test files, 55 tests
  fixtures/   mock-cli.js, mock-http-server.js
```

The UI layer (`chat-view.ts`) depends **only** on the `AgentAdapter` interface — swapping backends requires zero UI changes.

---

## Installation

### From source

```bash
# Clone into your vault's plugins folder
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/Run0812/AgentLink agentlink

# Install dependencies and build
cd agentlink
npm install
npm run build

# Enable in Obsidian → Settings → Community plugins
```

---

## Quick Start

1. Enable the plugin in Obsidian
2. Click the 🤖 ribbon icon (or run command `Open Local Agent Chat`)
3. The default backend is **Mock** — try sending a message to see streaming output
4. Open Settings → AgentLink to switch to **CLI** or **HTTP** mode

---

## Backend Setup

### Mock (default)

No configuration needed. Simulates streaming output for UI testing.

- Type "error" in a prompt to simulate error handling
- Cancel mid-stream with the Stop button

### CLI Mode

Configure in Settings → AgentLink → Backend type: "Local CLI"

| Setting | Description | Example |
|---------|-------------|---------|
| Command | CLI executable | `claude`, `python`, `node` |
| Arguments | CLI flags | `-p` |
| Working directory | cwd for the process | `/home/user/project` |
| Environment variables | `KEY=VALUE` per line | `ANTHROPIC_API_KEY=sk-…` |

The plugin writes the prompt to the process's **stdin** and streams **stdout** back as the response.

### HTTP Mode

Configure in Settings → AgentLink → Backend type: "Local HTTP"

| Setting | Description | Example |
|---------|-------------|---------|
| Base URL | Server endpoint | `http://127.0.0.1:11434/v1` |
| API key | Bearer token (optional) | `sk-…` |
| Model | Model identifier | `llama3`, `gpt-4o` |

Supports **SSE streaming** (OpenAI-compatible `/chat/completions`).

#### Example: Ollama

```bash
ollama pull llama3
# Ollama runs on http://localhost:11434 by default
```

Set Base URL to `http://127.0.0.1:11434/v1`, Model to `llama3`.

---

## Commands

| Command | Description |
|---------|-------------|
| `Open Local Agent Chat` | Open the chat sidebar |
| `Send selected text to agent` | Prefill input with editor selection |
| `Switch backend type` | Cycle through mock → cli → http |

---

## Development

```bash
npm install          # install dependencies
npm run build        # production build (type-check + esbuild)
npm run dev          # watch mode (rebuilds on save)
npm run test         # run all 55 unit tests
npm run test:watch   # watch mode for tests
npm run lint         # type-check only
```

### Running the mock fixtures

```bash
# Test CLI adapter manually
echo "hello" | node test/fixtures/mock-cli.js

# Start mock HTTP server for manual testing
node test/fixtures/mock-http-server.js
# → listening on http://127.0.0.1:17432
```

---

## Known Limitations

- **No ACP bridge** — the `acp-bridge` and `embedded-web` backends are reserved stubs
- **No multi-session** — one conversation per panel (clear to start over)
- **No mobile** — `isDesktopOnly: true` (requires Node.js child_process)
- **No cloud sync** — API keys stored in local Obsidian data, never synced

---

## License

MIT

