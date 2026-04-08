# Welcome to AgentLink Dev Vault

This is a development vault for testing the AgentLink Obsidian plugin.

## About AgentLink

AgentLink connects your Obsidian vault to local AI agents like:
- Claude Code
- Kimi Code
- OpenCode

## Quick Start

1. Open the AgentLink sidebar by clicking the 🤖 icon in the ribbon
2. Or use the command palette: `Ctrl+P` → "Open Local Agent Chat"
3. Configure your backend in Settings → AgentLink

## Test Files

This vault contains sample notes you can use to test Agent's file reading capabilities:

- [[Welcome]] - This file
- Create more notes to test the agent's ability to read and link your knowledge

## Development

Build the plugin:
```bash
npm run build:quick
```

The build files are automatically copied to `.obsidian/plugins/agentlink/`.

Reload Obsidian to see changes (Command Palette → "Reload app without saving").