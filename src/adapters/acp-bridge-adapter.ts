/* ────────────────────────────────────────────────────────────────────────
 * AcpBridgeAdapter — connect to local agents via ACP (Agent Client Protocol).
 *
 * Phase 3 implementation: connects to an ACP Bridge process that handles
 * protocol translation between AgentLink and various AI agents.
 *
 * Reference: https://agentclientprotocol.com
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn, ChildProcess } from 'child_process';
import {
	AgentAdapter,
	AgentCapability,
	AgentInput,
	AgentStatus,
	AgentStatusState,
	StreamHandlers,
	ToolCall,
	ToolResult,
	AgentResponse,
} from '../core/types';
import { CancellationError, ConnectionError, TimeoutError } from '../core/errors';
import { logger } from '../core/logger';
import { ProcessManager } from '../services/process-manager';

export interface AcpBridgeAdapterConfig {
	/** Bridge command to start (empty if already running) */
	bridgeCommand: string;
	/** Arguments for bridge command */
	bridgeArgs: string[];
	/** ACP Server URL */
	acpServerURL: string;
	/** Workspace root directory */
	workspaceRoot: string;
	/** Environment variables */
	env: Record<string, string>;
	/** Request timeout in ms */
	timeoutMs: number;
	/** Auto-confirm tool calls (DANGEROUS) */
	autoConfirmTools: boolean;
}

/**
 * ACP Bridge Adapter
 *
 * Connects to local AI agents through the ACP (Agent Client Protocol).
 * The bridge handles protocol translation so this adapter only needs to
 * speak ACP, not individual agent protocols.
 */
export class AcpBridgeAdapter implements AgentAdapter {
	readonly id = 'acp-bridge';
	readonly label = 'ACP Bridge';

	private config: AcpBridgeAdapterConfig;
	private state: AgentStatusState = 'disconnected';
	private bridgeProcess: ChildProcess | null = null;
	private abortController: AbortController | null = null;
	private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
	private processManager = new ProcessManager();
	private sessionId: string | null = null;

	constructor(config: AcpBridgeAdapterConfig) {
		this.config = config;
	}

	updateConfig(config: Partial<AcpBridgeAdapterConfig>): void {
		this.config = { ...this.config, ...config };
	}

	async connect(): Promise<void> {
		this.state = 'connecting';
		logger.debug('AcpBridgeAdapter: connecting...');

		// Phase 3 TODO: Start bridge process if configured
		if (this.config.bridgeCommand) {
			await this.startBridgeProcess();
		}

		// Phase 3 TODO: Establish WebSocket/fetch connection to ACP server
		// For now, simulate connection
		await this.sleep(500);
		this.sessionId = this.generateSessionId();
		this.state = 'connected';
		logger.info('AcpBridgeAdapter: connected, session', this.sessionId);
	}

	async disconnect(): Promise<void> {
		await this.cancel();

		// Phase 3 TODO: Close ACP connection
		this.sessionId = null;

		// Stop bridge process if we started it
		if (this.bridgeProcess) {
			logger.debug('AcpBridgeAdapter: stopping bridge process');
			this.processManager.killAll();
			this.bridgeProcess = null;
		}

		this.state = 'disconnected';
		logger.info('AcpBridgeAdapter: disconnected');
	}

	async sendMessage(input: AgentInput, handlers: StreamHandlers): Promise<void> {
		if (this.state === 'disconnected') {
			await this.connect();
		}

		this.state = 'busy';
		this.abortController = new AbortController();
		logger.debug('AcpBridgeAdapter: sendMessage', input.prompt);

		// Phase 3 TODO: Implement ACP protocol communication
		// 1. Send message to ACP server via WebSocket or HTTP
		// 2. Handle streaming responses (text, thinking, tool_call)
		// 3. Pause on tool_call and wait for user confirmation
		// 4. Send tool results back to continue conversation

		// Placeholder: simulate response
		const mockResponse = `ACP Bridge mode is not yet fully implemented (Phase 3).\n\nYou said: "${input.prompt}"\n\nSession: ${this.sessionId}`;

		handlers.onChunk(mockResponse);
		handlers.onComplete(mockResponse);
		this.state = 'connected';
	}

	async cancel(): Promise<void> {
		logger.debug('AcpBridgeAdapter: cancel requested');
		this.clearTimeout();
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	getStatus(): AgentStatus {
		return { state: this.state };
	}

	getCapabilities(): AgentCapability[] {
		// Phase 3 TODO: Query bridge for actual capabilities
		return ['chat', 'file_read', 'file_write', 'file_edit', 'terminal'];
	}

	async executeTool(call: ToolCall): Promise<ToolResult> {
		logger.debug('AcpBridgeAdapter: executeTool', call.tool);

		// Phase 3 TODO: Send tool result back to ACP server
		return {
			success: false,
			content: 'Tool execution via ACP not yet implemented (Phase 3)',
		};
	}

	// ── Private Helpers ──────────────────────────────────────────────────

	private async startBridgeProcess(): Promise<void> {
		const { bridgeCommand, bridgeArgs, workspaceRoot, env } = this.config;

		logger.debug('AcpBridgeAdapter: starting bridge process', bridgeCommand, bridgeArgs);

		this.bridgeProcess = spawn(bridgeCommand, bridgeArgs, {
			cwd: workspaceRoot || undefined,
			env: { ...process.env, ...env },
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		this.processManager.track(this.bridgeProcess);

		this.bridgeProcess.stdout?.on('data', (data: Buffer) => {
			logger.debug('Bridge stdout:', data.toString());
		});

		this.bridgeProcess.stderr?.on('data', (data: Buffer) => {
			logger.debug('Bridge stderr:', data.toString());
		});

		// Wait a moment for bridge to start
		await this.sleep(1000);
	}

	private clearTimeout(): void {
		if (this.timeoutHandle !== null) {
			clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}
	}

	private generateSessionId(): string {
		return `acp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
