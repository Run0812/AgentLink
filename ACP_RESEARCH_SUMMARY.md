# ACP Protocol Research & Implementation Summary
For Obsidian Plugin + Kimi CLI Integration

**Date**: April 7, 2026 | **Status**: Complete | **Files**: ACP_PROTOCOL_SPEC.md (503 lines)

## RESEARCH COMPLETE

✅ Official ACP specification (agentclientprotocol.com)
✅ Kimi CLI documentation (kiro.dev/docs/cli/acp/)
✅ TypeScript/Python/Go SDK implementations
✅ JSON-RPC 2.0 message format
✅ Complete prompt turn flow (initialize → send → stream → tool calls → complete)
✅ Permission handling and file system access
✅ Session management and cancellation

## KEY PROTOCOL FACTS

- **Transport**: stdio (subprocess stdin/stdout, newline-delimited JSON)
- **Standard**: JSON-RPC 2.0 compliant
- **Bidirectional**: Client sends requests, agent sends notifications
- **Methods**: initialize, session/new, session/prompt, session/cancel, fs/read_text_file, fs/write_text_file
- **Notifications**: session/update (streaming response), session/request_permission (ask user)
- **File Paths**: Always absolute
- **Session ID**: Format "sess_" + random string

## MESSAGE FLOW (Simple)

1. Initialize: Client → Agent (negotiate protocol version)
2. Create Session: Client → Agent (get sessionId)
3. Send Prompt: Client → Agent (user message)
4. Stream Response: Agent → Client (via session/update notifications)
5. If Tools: Agent requests execution via tool_call updates
6. If Sensitive: Agent asks permission via request_permission
7. Complete: Agent responds to session/prompt with stopReason

## DOCUMENTATION PROVIDED

**ACP_PROTOCOL_SPEC.md** contains:

Section 1: Executive Summary
Section 2: Quick Start Flow (visual diagram)
Section 3: Message Format (JSON-RPC examples)
Section 4: Connection Initialization
Section 5: Sending Prompts (complete flow)
Section 6: Tool Calls (status updates)
Section 7: Permission Requests (dialog handling)
Section 8: File System Access (read/write)
Section 9: Cancellation
Section 10: Kimi CLI Integration
Section 11: Key Concepts & Definitions
Section 12: Error Codes Reference
Plus: Implementation Checklist (15 items)

## READY TO IMPLEMENT

Next steps for Obsidian plugin:

Phase 1: Spawn subprocess (kiro-cli acp) + parse JSON-RPC
Phase 2: Implement initialize, session/new, session/prompt
Phase 3: Handle session/update notifications (streaming text)
Phase 4: Show tool calls and permissions
Phase 5: Implement fs/read_text_file, fs/write_text_file

All message formats and examples are in ACP_PROTOCOL_SPEC.md

## KIMI CLI SPECIFICS

Command: kiro-cli acp
Sessions: ~/.kiro/sessions/cli/
Methods: initialize, session/new, session/load, session/prompt, session/cancel
Capabilities: loadSession=true, promptCapabilities.image=true, mcpCapabilities.http=true
Extensions: _kiro.dev/commands/*, _kiro.dev/mcp/*

## FILES CREATED

✅ ACP_PROTOCOL_SPEC.md (503 lines, complete reference)
✅ ACP_RESEARCH_SUMMARY.md (this file, quick reference)