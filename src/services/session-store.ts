/* ────────────────────────────────────────────────────────────────────────
 * SessionStore — in-memory conversation management.
 * ──────────────────────────────────────────────────────────────────────── */

import {
	ChatMessage,
	generateId,
	MessageRole,
	ToolCall,
	ToolResult,
	ToolCallMetadata,
	FileEditMetadata,
} from '../core/types';

export class SessionStore {
	private messages: ChatMessage[] = [];
	private pendingToolCalls: ToolCall[] = [];
	private workspaceFiles: string[] = [];
	private agentState: unknown = undefined;

	/** Add a message and return the created ChatMessage. */
	addMessage(role: MessageRole, content: string, metadata?: ToolCallMetadata | FileEditMetadata): ChatMessage {
		const msg: ChatMessage = {
			id: generateId(),
			role,
			content,
			timestamp: Date.now(),
			metadata,
		};
		this.messages.push(msg);
		return msg;
	}

	/** Update the content of an existing message (used for streaming appends). */
	updateMessage(id: string, content: string): void {
		const msg = this.messages.find((m) => m.id === id);
		if (msg) {
			msg.content = content;
		}
	}

	/** Update message metadata. */
	updateMessageMetadata(id: string, metadata: ToolCallMetadata | FileEditMetadata): void {
		const msg = this.messages.find((m) => m.id === id);
		if (msg) {
			msg.metadata = metadata;
		}
	}

	/** Get all messages in the current session. */
	getMessages(): ChatMessage[] {
		return [...this.messages];
	}

	/** Get the last N messages (useful for limiting context). */
	getRecentMessages(count: number): ChatMessage[] {
		return this.messages.slice(-count);
	}

	/** Clear the session history. */
	clear(): void {
		this.messages = [];
		this.pendingToolCalls = [];
		this.workspaceFiles = [];
		this.agentState = undefined;
	}

	/** Get the total number of messages. */
	get length(): number {
		return this.messages.length;
	}

	// ── Pending Tool Calls ───────────────────────────────────────────────

	/** Add a pending tool call. */
	addPendingToolCall(toolCall: ToolCall): void {
		this.pendingToolCalls.push(toolCall);
	}

	/** Get all pending tool calls. */
	getPendingToolCalls(): ToolCall[] {
		return [...this.pendingToolCalls];
	}

	/** Remove a pending tool call by id. */
	removePendingToolCall(id: string): void {
		this.pendingToolCalls = this.pendingToolCalls.filter((tc) => tc.id !== id);
	}

	/** Clear all pending tool calls. */
	clearPendingToolCalls(): void {
		this.pendingToolCalls = [];
	}

	// ── Workspace Files ──────────────────────────────────────────────────

	/** Mark a file as read by the agent. */
	addWorkspaceFile(path: string): void {
		if (!this.workspaceFiles.includes(path)) {
			this.workspaceFiles.push(path);
		}
	}

	/** Get all workspace files that the agent has read. */
	getWorkspaceFiles(): string[] {
		return [...this.workspaceFiles];
	}

	/** Check if a file has been read by the agent. */
	hasWorkspaceFile(path: string): boolean {
		return this.workspaceFiles.includes(path);
	}

	// ── Agent State ──────────────────────────────────────────────────────

	/** Set agent-specific state. */
	setAgentState(state: unknown): void {
		this.agentState = state;
	}

	/** Get agent-specific state. */
	getAgentState(): unknown {
		return this.agentState;
	}
}
