/* ────────────────────────────────────────────────────────────────────────
 * Core type definitions for AgentLink
 * ──────────────────────────────────────────────────────────────────────── */

// ── Backend types ──────────────────────────────────────────────────────

export type BackendType = 'mock' | 'cli' | 'http' | 'acp-bridge' | 'embedded-web';

// ── Message types ──────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'error' | 'status';

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: number;
}

// ── Agent adapter types ────────────────────────────────────────────────

export type AgentStatusState = 'disconnected' | 'connecting' | 'connected' | 'busy' | 'error';

export interface AgentStatus {
	state: AgentStatusState;
	message?: string;
}

export interface AgentInput {
	prompt: string;
	context?: {
		fileContent?: string;
		selectedText?: string;
	};
	history?: ChatMessage[];
}

export interface StreamHandlers {
	/** Called for each chunk of streaming output. */
	onChunk(chunk: string): void;
	/** Called when the response is fully complete. */
	onComplete(fullText: string): void;
	/** Called when an error occurs during streaming. */
	onError(error: Error): void;
}

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
	sendMessage(input: AgentInput, handlers: StreamHandlers): Promise<void>;
	/** Cancel an in-flight request. */
	cancel(): Promise<void>;
	/** Return the current adapter status. */
	getStatus(): AgentStatus;
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
