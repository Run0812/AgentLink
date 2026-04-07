/* ────────────────────────────────────────────────────────────────────────
 * EmbeddedWebAdapter — embed a local agent's Web UI in an iframe.
 *
 * Phase 4 implementation: loads a local web-based agent interface
 * (e.g., OpenCode Web) inside an iframe and communicates via postMessage.
 *
 * Reference: https://opencode.ai/docs/zh-cn/web/
 * ──────────────────────────────────────────────────────────────────────── */

import {
	AgentAdapter,
	AgentCapability,
	AgentInput,
	AgentStatus,
	AgentStatusState,
	StreamHandlers,
	ToolCall,
	ToolResult,
} from '../core/types';
import { logger } from '../core/logger';

export interface EmbeddedWebAdapterConfig {
	/** URL of the local agent Web UI */
	webURL: string;
	/** Request timeout in ms */
	timeoutMs: number;
}

/**
 * Embedded Web Adapter
 *
 * Embeds an existing web-based agent UI (like OpenCode Web) inside Obsidian
 * using an iframe. Communication with the web UI happens via postMessage.
 */
export class EmbeddedWebAdapter implements AgentAdapter {
	readonly id = 'embedded-web';
	readonly label = 'Embedded Web';

	private config: EmbeddedWebAdapterConfig;
	private state: AgentStatusState = 'disconnected';
	private iframe: HTMLIFrameElement | null = null;
	private messageQueue: Array<{ type: string; data: unknown }> = [];
	private pendingHandlers: StreamHandlers | null = null;

	constructor(config: EmbeddedWebAdapterConfig) {
		this.config = config;
		this.setupMessageListener();
	}

	updateConfig(config: Partial<EmbeddedWebAdapterConfig>): void {
		this.config = { ...this.config, ...config };
	}

	async connect(): Promise<void> {
		this.state = 'connecting';
		logger.debug('EmbeddedWebAdapter: connecting to', this.config.webURL);

		// Phase 4 TODO: Create and load iframe
		// For now, simulate connection
		await this.sleep(500);
		this.state = 'connected';
		logger.info('EmbeddedWebAdapter: connected');
	}

	async disconnect(): Promise<void> {
		// Phase 4 TODO: Remove iframe, cleanup listeners
		this.iframe = null;
		this.state = 'disconnected';
		logger.info('EmbeddedWebAdapter: disconnected');
	}

	async sendMessage(input: AgentInput, handlers: StreamHandlers): Promise<void> {
		if (this.state === 'disconnected') {
			await this.connect();
		}

		this.state = 'busy';
		this.pendingHandlers = handlers;
		logger.debug('EmbeddedWebAdapter: sendMessage', input.prompt);

		// Phase 4 TODO: Send message to iframe via postMessage
		// 1. Post message to iframe
		// 2. Listen for responses via message listener
		// 3. Handle tool_call requests from web UI
		// 4. Stream chunks back to handlers

		// Placeholder
		const mockResponse = `Embedded Web mode is not yet fully implemented (Phase 4).\n\nYou said: "${input.prompt}"\n\nWeb URL: ${this.config.webURL}`;

		handlers.onChunk(mockResponse);
		handlers.onComplete(mockResponse);
		this.state = 'connected';
	}

	async cancel(): Promise<void> {
		logger.debug('EmbeddedWebAdapter: cancel requested');
		// Phase 4 TODO: Send cancel message to iframe
	}

	getStatus(): AgentStatus {
		return { state: this.state };
	}

	getCapabilities(): AgentCapability[] {
		// Phase 4 TODO: Query web UI for actual capabilities
		return ['chat'];
	}

	async executeTool(call: ToolCall): Promise<ToolResult> {
		logger.debug('EmbeddedWebAdapter: executeTool', call.tool);

		// Phase 4 TODO: Execute tool locally and return result to web UI
		return {
			success: false,
			content: 'Tool execution not yet implemented for Embedded Web (Phase 4)',
		};
	}

	/**
	 * Create an iframe element for embedding the web UI.
	 * Called by ChatView when this adapter is active.
	 */
	createIframe(container: HTMLElement): HTMLIFrameElement {
		this.iframe = container.createEl('iframe', {
			cls: 'agentlink-embedded-web',
			attr: {
				src: this.config.webURL,
				sandbox: 'allow-scripts allow-same-origin allow-forms',
			},
		});
		return this.iframe;
	}

	/**
	 * Remove the iframe.
	 */
	destroyIframe(): void {
		if (this.iframe) {
			this.iframe.remove();
			this.iframe = null;
		}
	}

	// ── Private Helpers ──────────────────────────────────────────────────

	private setupMessageListener(): void {
		// Phase 4 TODO: Listen for postMessage from iframe
		// Only run in browser environment
		if (typeof window === 'undefined') {
			return;
		}
		window.addEventListener('message', (event) => {
			// Verify origin matches webURL
			// Handle different message types:
			// - tool_call: Request to execute a tool
			// - chunk: Streaming response chunk
			// - complete: Response complete
			// - error: Error occurred
			logger.debug('EmbeddedWebAdapter: received message', event.origin, event.data);
		});
	}

	private postMessage(type: string, data: unknown): void {
		if (!this.iframe?.contentWindow) {
			// Queue message if iframe not ready
			this.messageQueue.push({ type, data });
			return;
		}

		this.iframe.contentWindow.postMessage(
			{ type, data, source: 'agentlink' },
			this.config.webURL
		);
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
