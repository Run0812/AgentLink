/* ────────────────────────────────────────────────────────────────────────
 * Core type definitions for AgentLink
 * ──────────────────────────────────────────────────────────────────────── */

// ── Backend types ──────────────────────────────────────────────────────

/** Backend implementation types */
export type BackendType = 'mock' | 'acp-bridge';

/** Configuration for an ACP Bridge backend */
export interface AcpBridgeBackendConfig {
	type: 'acp-bridge';
	/** Unique identifier for this backend */
	id: string;
	/** Display name */
	name: string;
	/** Bridge command to start (e.g., 'kimi', 'claude', 'acp-bridge') */
	bridgeCommand: string;
	/** Arguments for bridge command (space-separated string for UI, parsed to array for execution) */
	bridgeArgs: string;
	/** 
	 * Optional: ACP Server URL for HTTP/WebSocket-based bridges.
	 * Most ACP implementations (like Kimi CLI) use stdio and don't need this.
	 * Only required if your bridge uses HTTP/WebSocket transport.
	 */
	acpServerURL?: string;
	/** Workspace root directory (empty = use vault root) */
	workspaceRoot: string;
	/** Environment variables (KEY=VALUE format, one per line) */
	env: string;
	/** Request timeout in ms */
	timeoutMs: number;
	/** Auto-confirm tool calls (DANGEROUS - use with caution) */
	autoConfirmTools: boolean;
}

/** Configuration for Mock backend */
export interface MockBackendConfig {
	type: 'mock';
	/** Unique identifier */
	id: string;
	/** Display name */
	name: string;
}

/** Union type for all backend configurations */
export type AgentBackendConfig = AcpBridgeBackendConfig | MockBackendConfig;

/** Backend summary for UI display */
export interface BackendSummary {
	id: string;
	name: string;
	type: BackendType;
	connected: boolean;
}

// ── Message types ──────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'error' | 'status' | 'tool_call' | 'file_edit' | 'thinking';

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: number;
	/** Optional metadata for special message types */
	metadata?: ToolCallMetadata | FileEditMetadata;
}

/** Metadata for tool_call messages */
export interface ToolCallMetadata {
	toolCallId: string;
	tool: string;
	params: Record<string, unknown>;
	status: 'pending' | 'confirmed' | 'rejected' | 'executing' | 'completed' | 'error';
	result?: ToolResult;
}

/** Metadata for file_edit messages */
export interface FileEditMetadata {
	path: string;
	original: string;
	modified: string;
	status: 'pending' | 'executing' | 'confirmed' | 'rejected' | 'error';
}

// ── Agent adapter types ────────────────────────────────────────────────

export type AgentStatusState = 'disconnected' | 'connecting' | 'connected' | 'busy' | 'error';

export interface AgentStatus {
	state: AgentStatusState;
	message?: string;
}

export interface AgentInput {
	prompt: string;
	attachments?: Attachment[];
	context?: {
		fileContent?: string;
		selectedText?: string;
	};
	history?: ChatMessage[];
}

export interface Attachment {
	id: string;
	type: 'file' | 'selection' | 'note';
	name: string;
	content: string;
	size: number;
}

export interface StreamHandlers {
	/** Called for each chunk of streaming output. */
	onChunk(chunk: string): void;
	/** Called when the response is fully complete. */
	onComplete(fullText: string): void;
	/** Called when an error occurs during streaming. */
	onError(error: Error): void;
	/** Called when a tool call update is received (for UI card display). */
	onToolCall?(tool: string, params: Record<string, unknown>, status: 'pending' | 'executing' | 'completed' | 'error', result?: string): void;
}

// ── Agent Capability Types ─────────────────────────────────────────────

/** Agent capabilities - what the agent can do */
export type AgentCapability =
	| 'chat'
	| 'file_read'
	| 'file_write'
	| 'file_edit'
	| 'terminal'
	| 'code_index'
	| 'web_search';

/** All available capabilities */
export const ALL_CAPABILITIES: AgentCapability[] = [
	'chat',
	'file_read',
	'file_write',
	'file_edit',
	'terminal',
	'code_index',
	'web_search',
];

/** Human-readable labels for capabilities */
export const CAPABILITY_LABELS: Record<AgentCapability, string> = {
	chat: 'Chat',
	file_read: 'Read Files',
	file_write: 'Write Files',
	file_edit: 'Edit Files',
	terminal: 'Terminal Commands',
	code_index: 'Code Index',
	web_search: 'Web Search',
};

// ── Agent Response Types ───────────────────────────────────────────────

/** Agent response types - what the agent can return */
export type AgentResponseType = 'text' | 'thinking' | 'tool_call' | 'file_edit' | 'error';

/** Base agent response */
export interface AgentResponseBase {
	type: AgentResponseType;
}

/** Text response from agent */
export interface AgentTextResponse extends AgentResponseBase {
	type: 'text';
	content: string;
}

/** Thinking/reasoning process from agent */
export interface AgentThinkingResponse extends AgentResponseBase {
	type: 'thinking';
	content: string;
}

/** Tool call request from agent */
export interface AgentToolCallResponse extends AgentResponseBase {
	type: 'tool_call';
	id: string;
	tool: string;
	params: Record<string, unknown>;
}

/** File edit suggestion from agent */
export interface AgentFileEditResponse extends AgentResponseBase {
	type: 'file_edit';
	path: string;
	original: string;
	modified: string;
}

/** Error response from agent */
export interface AgentErrorResponse extends AgentResponseBase {
	type: 'error';
	message: string;
}

/** Union type for all agent responses */
export type AgentResponse =
	| AgentTextResponse
	| AgentThinkingResponse
	| AgentToolCallResponse
	| AgentFileEditResponse
	| AgentErrorResponse;

// ── Tool Types ─────────────────────────────────────────────────────────

/** Tool call definition */
export interface ToolCall {
	/** Unique identifier for this tool call */
	id: string;
	/** Tool name */
	tool: string;
	/** Tool parameters */
	params: Record<string, unknown>;
}

/** Tool execution result */
export interface ToolResult {
	/** Whether the tool execution was successful */
	success: boolean;
	/** Result content (for success) or error message (for failure) */
	content: string;
	/** Optional additional metadata */
	metadata?: Record<string, unknown>;
}

/** Supported tool types */
export type ToolType =
	| 'read_file'
	| 'write_file'
	| 'edit_file'
	| 'terminal'
	| 'list_dir'
	| 'search'
	| 'web_search';

/** Tool permission levels */
export type ToolPermission = 'readonly' | 'write' | 'dangerous';

/** Tool definition */
export interface ToolDefinition {
	name: ToolType;
	description: string;
	permission: ToolPermission;
	parameters: ToolParameter[];
}

/** Tool parameter definition */
export interface ToolParameter {
	name: string;
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	required: boolean;
	description?: string;
}

/** Tool metadata - for UI display */
export const TOOL_METADATA: Record<ToolType, { label: string; description: string; permission: ToolPermission }> = {
	read_file: {
		label: 'Read File',
		description: 'Read the contents of a file',
		permission: 'readonly',
	},
	write_file: {
		label: 'Write File',
		description: 'Create or overwrite a file',
		permission: 'write',
	},
	edit_file: {
		label: 'Edit File',
		description: 'Modify an existing file',
		permission: 'write',
	},
	terminal: {
		label: 'Terminal',
		description: 'Execute a terminal command',
		permission: 'dangerous',
	},
	list_dir: {
		label: 'List Directory',
		description: 'List contents of a directory',
		permission: 'readonly',
	},
	search: {
		label: 'Search',
		description: 'Search for files or content',
		permission: 'readonly',
	},
	web_search: {
		label: 'Web Search',
		description: 'Search the web',
		permission: 'readonly',
	},
};

// ── Session Types ──────────────────────────────────────────────────────

/** Extended session with Agent state */
export interface AgentSession {
	id: string;
	messages: ChatMessage[];
	/** Agent-specific state (if any) */
	agentState?: unknown;
	/** Pending tool calls waiting for user confirmation */
	pendingToolCalls: ToolCall[];
	/** Files that the agent has already read */
	workspaceFiles: string[];
	/** Cost statistics (if supported by agent) */
	cost?: {
		inputTokens: number;
		outputTokens: number;
	};
	/** Currently active backend config ID */
	activeBackendId?: string;
}

// ── The unified adapter interface ──────────────────────────────────────

/**
 * The unified adapter interface.
 *
 * Every backend (mock, cli, http, acp-bridge, embedded-web) must implement
 * this interface.  The UI layer depends **only** on this contract.
 */
export interface AgentAdapter {
	/** Unique identifier for this adapter (e.g. "mock", "cli"). */
	readonly id: string;
	/** Human-readable label shown in the UI. */
	readonly label: string;

	/** Establish a connection / start the backend process. */
	connect(): Promise<void>;
	/** Tear down the connection / kill any running process. */
	disconnect(): Promise<void>;
	/** Send a message and receive a streaming response. */
	sendMessage(input: AgentInput, handlers: StreamHandlers, options?: { onThinkingChunk?: (text: string) => void }): Promise<void>;
	/** Cancel an in-flight request. */
	cancel(): Promise<void>;
	/** Return the current adapter status. */
	getStatus(): AgentStatus;

	/** Get agent capabilities */
	getCapabilities(): AgentCapability[];
	/** Execute a tool call and return result (optional, for adapters that support tool execution) */
	executeTool?(call: ToolCall): Promise<ToolResult>;
}

// ── Utility ────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Generate a lightweight unique message id.
 * Not cryptographically secure – only used for keying DOM elements.
 */
export function generateId(): string {
	return `msg_${Date.now()}_${++_idCounter}`;
}

/**
 * Generate a unique tool call id.
 */
export function generateToolCallId(): string {
	return `tool_${Date.now()}_${++_idCounter}`;
}
