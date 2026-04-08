# Agent Client Protocol (ACP) Specification Guide
## Comprehensive Reference for Implementing an Obsidian Plugin ACP Client

**ACP Version**: 1.x (Latest - April 2026)
**Official Documentation**: https://agentclientprotocol.com

---

## EXECUTIVE SUMMARY

The Agent Client Protocol (ACP) enables standardized communication between code editors (Clients) and AI agents. For your Obsidian plugin + Kimi CLI integration:

- **Transport**: stdio (Agent subprocess communicates via stdin/stdout)
- **Protocol**: JSON-RPC 2.0 with newline-delimited messages
- **Message Types**: Requests (methods), Responses, Notifications
- **Key Methods**: initialize, session/new, session/prompt, session/update (notifications)
- **Core Flow**: Initialize → Create Session → Send Prompts → Handle Updates/Tool Calls → Respond to Permissions

---

## 1. QUICK START FLOW

\\\
User sends message (e.g., "Analyze this code")
           ↓
Client sends session/prompt request
           ↓
Agent receives and processes with LLM
           ↓
Agent sends session/update notifications (streaming response)
           ↓
If tools needed: Agent sends tool_call update
           ↓
If sensitive: Agent requests permission via request_permission
           ↓
Tool executes (client may handle fs/read_text_file)
           ↓
Agent sends tool_call_update with results
           ↓
LLM processes results, may request more tools
           ↓
When done: Agent responds to session/prompt with stopReason
           ↓
User sees complete response
\\\

---

## 2. MESSAGE FORMAT

All messages are UTF-8 JSON-RPC 2.0 delimited by newlines.

### Request (Method Call)
\\\json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/prompt",
  "params": { "sessionId": "sess_123", "prompt": [...] }
}
\\\

### Response (Success)
\\\json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "stopReason": "end_turn" }
}
\\\

### Notification (One-way, no id)
\\\json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": { "sessionId": "sess_123", "update": { ... } }
}
\\\

---

## 3. CONNECTION INITIALIZATION

### Step 1: Initialize (Negotiate Protocol)

**Client sends:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {
      "fs": { "readTextFile": true, "writeTextFile": true },
      "terminal": false
    },
    "clientInfo": {
      "name": "obsidian-acp-plugin",
      "title": "Obsidian",
      "version": "1.0.0"
    }
  }
}
\\\

**Agent responds:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": { "image": true, "embeddedContext": true },
      "mcpCapabilities": { "http": true }
    },
    "agentInfo": { "name": "kiro-cli", "version": "1.5.0" },
    "authMethods": []
  }
}
\\\

### Step 2: Create Session

**Client sends:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/absolute/path/to/vault",
    "mcpServers": []
  }
}
\\\

**Agent responds:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "sessionId": "sess_abc123def456" }
}
\\\

**Now ready for prompts!**

---

## 4. SENDING PROMPTS

### Send User Message

\\\json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/prompt",
  "params": {
    "sessionId": "sess_abc123",
    "prompt": [
      { "type": "text", "text": "Analyze this code" },
      {
        "type": "resource",
        "resource": {
          "uri": "file:///vault/main.py",
          "mimeType": "text/x-python",
          "text": "def foo():\\n    pass"
        }
      }
    ]
  }
}
\\\

### Receive Streaming Response

Agent sends multiple session/update notifications:

**Plan:**
\\\json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "update": {
      "sessionUpdate": "plan",
      "entries": [
        { "content": "Analyze code", "priority": "high", "status": "pending" }
      ]
    }
  }
}
\\\

**Message chunks (streaming):**
\\\json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "content": { "type": "text", "text": "I found an issue..." }
    }
  }
}
\\\

**Turn completes when:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": { "stopReason": "end_turn" }
}
\\\

---

## 5. TOOL CALLS

### Agent Reports Tool Needed

\\\json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "update": {
      "sessionUpdate": "tool_call",
      "toolCallId": "call_001",
      "title": "Read config file",
      "kind": "read",
      "status": "pending"
    }
  }
}
\\\

### Tool In Progress

\\\json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "update": {
      "sessionUpdate": "tool_call_update",
      "toolCallId": "call_001",
      "status": "in_progress"
    }
  }
}
\\\

### Tool Completed

\\\json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "update": {
      "sessionUpdate": "tool_call_update",
      "toolCallId": "call_001",
      "status": "completed",
      "content": [
        {
          "type": "content",
          "content": { "type": "text", "text": "Config found: Python 3.9" }
        }
      ]
    }
  }
}
\\\

---

## 6. PERMISSION REQUESTS

If agent needs permission before executing sensitive operation:

**Agent requests:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "session/request_permission",
  "params": {
    "sessionId": "sess_abc123",
    "toolCall": { "toolCallId": "call_001" },
    "options": [
      { "optionId": "allow", "name": "Allow", "kind": "allow_once" },
      { "optionId": "deny", "name": "Deny", "kind": "reject_once" }
    ]
  }
}
\\\

**Client responds:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": { "outcome": { "outcome": "selected", "optionId": "allow" } }
}
\\\

---

## 7. FILE SYSTEM ACCESS

### Agent Reads File

**Agent requests:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "fs/read_text_file",
  "params": {
    "sessionId": "sess_abc123",
    "path": "/absolute/path/file.txt",
    "line": 1,
    "limit": 100
  }
}
\\\

**Client responds:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": { "content": "file contents..." }
}
\\\

### Agent Writes File

**Agent requests:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "fs/write_text_file",
  "params": {
    "sessionId": "sess_abc123",
    "path": "/absolute/path/file.txt",
    "content": "new content"
  }
}
\\\

**Client responds:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 11,
  "result": {}
}
\\\

---

## 8. CANCELLATION

**Client cancels turn (notification, no response needed):**
\\\json
{
  "jsonrpc": "2.0",
  "method": "session/cancel",
  "params": { "sessionId": "sess_abc123" }
}
\\\

**Agent responds to original prompt with:**
\\\json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": { "stopReason": "cancelled" }
}
\\\

---

## 9. RUNNING KIMI CLI AS AGENT

\\\ash
# Start Kimi in ACP mode
kiro-cli acp

# Or with specific agent
kiro-cli acp --agent my-agent
\\\

### Kimi Methods Supported
- initialize, session/new, session/load, session/prompt, session/cancel
- session/set_mode (switch agent mode), session/set_model (change LLM)

### Session Storage
\\\
~/.kiro/sessions/cli/
  ├── <session-id>.json      # Metadata
  └── <session-id>.jsonl     # Conversation history
\\\

### Logging
\\\ash
tail -f \/kiro-log/kiro-chat.log
KIRO_LOG_LEVEL=debug kiro-cli acp
\\\

---

## 10. KEY CONCEPTS

### Session ID
Unique identifier for a conversation thread. Used in all subsequent requests for that conversation. Format: "sess_" + random string.

### Stop Reasons
- **end_turn**: LLM finished normally
- **max_tokens**: Token limit reached
- **max_turn_requests**: Too many LLM calls
- **refusal**: Agent refused
- **cancelled**: User cancelled

### Tool Kinds (UI hints)
read | edit | delete | move | search | execute | think | fetch | other

### Content Block Types
- **text**: Plain text
- **image**: Base64 image data (requires capability)
- **audio**: Base64 audio data (requires capability)
- **resource**: Embedded file content (preferred for context)
- **resource_link**: File reference (agent fetches independently)

### Tool Status
pending → in_progress → completed (or failed)

---

## 11. ERROR CODES

| Code | Meaning |
|------|---------|
| -32700 | Parse error (invalid JSON) |
| -32600 | Invalid Request (malformed JSON-RPC) |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |

---

## 12. OBSIDIAN PLUGIN IMPLEMENTATION CHECKLIST

**Core**:
- [ ] Spawn kiro-cli subprocess with stdio
- [ ] Parse newline-delimited JSON from stdout
- [ ] Send JSON-RPC requests via stdin
- [ ] Correlate responses by ID
- [ ] Handle notifications without ID

**UI Components**:
- [ ] Chat message display with streaming support
- [ ] Tool call progress indicators
- [ ] Permission request dialog
- [ ] Plan/thinking display
- [ ] Error handling

**Integration**:
- [ ] Implement initialize
- [ ] Implement session/new
- [ ] Implement session/prompt
- [ ] Handle all session/update types
- [ ] Handle session/request_permission
- [ ] Implement session/cancel
- [ ] Implement fs/read_text_file
- [ ] Implement fs/write_text_file
- [ ] Graceful cleanup on unload

---

## RESOURCES

- **Official Spec**: https://agentclientprotocol.com
- **TypeScript SDK**: https://github.com/agentclientprotocol/typescript-sdk (reference implementation)
- **Python SDK**: https://github.com/agentclientprotocol/python-sdk
- **Kiro CLI Docs**: https://kiro.dev/docs/cli/acp/

**Last Updated**: April 7, 2026