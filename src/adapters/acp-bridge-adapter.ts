/* ────────────────────────────────────────────────────────────────────────
 * AcpBridgeAdapter — connect to local agents via ACP (Agent Client Protocol).
 *
 * 使用官方 @agentclientprotocol/sdk 实现
 * 参考: https://github.com/agentclientprotocol/typescript-sdk
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn, ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { App, TFile } from 'obsidian';

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
import { CancellationError, ConnectionError, TimeoutError } from '../core/errors';
import { logger } from '../core/logger';
import { ProcessManager } from '../services/process-manager';
import { ToolExecutor } from '../services/tool-executor';

// ============================================================================
// Configuration
// ============================================================================

export interface AcpBridgeAdapterConfig {
	/** Bridge command to start (e.g., 'kimi', 'claude') */
	bridgeCommand: string;
	/** Arguments for bridge command */
	bridgeArgs: string[];
	/** 
	 * Optional: ACP Server URL for HTTP/WebSocket-based bridges.
	 * Most ACP implementations use stdio and don't need this.
	 */
	acpServerURL?: string;
	/** Workspace root directory */
	workspaceRoot: string;
	/** Environment variables */
	env: Record<string, string>;
	/** Request timeout in ms */
	timeoutMs: number;
	/** Auto-confirm tool calls (DANGEROUS) */
	autoConfirmTools: boolean;
	/** Obsidian app reference */
	app?: App;
}

// ============================================================================
// Callbacks for UI Integration
// ============================================================================

export interface AcpAdapterCallbacks {
	/** Called when agent requests permission for a tool call */
	onPermissionRequest?: (
		toolCall: { id: string; tool: string; params: Record<string, unknown>; title: string },
		options: Array<{ optionId: string; name: string; kind: string }>,
		resolve: (outcome: { approved: boolean; optionId?: string }) => void
	) => void;
	
	/** Called when agent initiates a tool call */
	onToolCall?: (toolCall: { id: string; tool: string; params: Record<string, unknown>; status: string }) => void;
	
	/** Called when tool call status updates */
	onToolCallUpdate?: (toolCallId: string, status: string, result?: ToolResult) => void;
}

// ============================================================================
// Configuration
// ============================================================================

export interface AcpBridgeAdapterConfig {
	/** Bridge command to start (e.g., 'kimi', 'claude') */
	bridgeCommand: string;
	/** Arguments for bridge command */
	bridgeArgs: string[];
	/** 
	 * Optional: ACP Server URL for HTTP/WebSocket-based bridges.
	 * Most ACP implementations use stdio and don't need this.
	 */
	acpServerURL?: string;
	/** Workspace root directory */
	workspaceRoot: string;
	/** Environment variables */
	env: Record<string, string>;
	/** Request timeout in ms */
	timeoutMs: number;
	/** Auto-confirm tool calls (DANGEROUS) */
	autoConfirmTools: boolean;
}

// ============================================================================
// ACP Client Implementation
// ============================================================================

/**
 * 实现 ACP Client 接口
 * 处理 Agent 发来的通知和请求
 */
class AgentLinkAcpClient implements acp.Client {
	private adapter: AcpBridgeAdapter;
	private app: App | undefined;

	constructor(adapter: AcpBridgeAdapter, app?: App) {
		this.adapter = adapter;
		this.app = app;
	}

	/**
	 * 处理 session/update 通知
	 * 这是最重要的方法，接收 Agent 的回复、工具调用等
	 */
	async sessionUpdate(params: acp.SessionNotification): Promise<void> {
		const update = params.update;
		console.log('[ACP Client] sessionUpdate:', update.sessionUpdate);

		switch (update.sessionUpdate) {
			case 'agent_message_chunk':
				if (update.content.type === 'text' && update.content.text) {
					console.log('[ACP Client] Agent message:', update.content.text.substring(0, 100));
					this.adapter.handleAgentMessage(update.content.text);
				}
				break;

			case 'agent_thought_chunk': {
				// agent_thought_chunk content is also a ContentBlock
				// TextContent has type 'text', not 'thinking'
				const text = update.content.type === 'text' ? update.content.text : null;
				if (text) {
					console.log('[ACP Client] Agent thinking:', text.substring(0, 100));
					this.adapter.handleAgentThinking(text);
				}
				break;
			}

			case 'tool_call':
				console.log('[ACP Client] Tool call:', update.toolCallId, update.title, update.status);
				this.adapter.handleToolCall(update);
				break;

			case 'tool_call_update':
				console.log('[ACP Client] Tool call update:', update.toolCallId, update.status);
				if (update.content && update.content.length > 0) {
					for (const block of update.content) {
						if (block.type === 'content' && block.content?.type === 'text') {
							this.adapter.handleToolResult(update.toolCallId, block.content.text);
						}
					}
				}
				break;

			case 'plan':
				console.log('[ACP Client] Plan update with', update.entries?.length, 'entries');
				break;

			case 'user_message_chunk':
				console.log('[ACP Client] User message echo');
				break;

			default:
				console.log('[ACP Client] Unknown update type:', (update as any).sessionUpdate);
		}
	}

	/**
	 * 处理权限请求
	 * Agent 在执行敏感操作前会调用此方法
	 */
	async requestPermission(
		params: acp.RequestPermissionRequest,
	): Promise<acp.RequestPermissionResponse> {
		console.log('[ACP Client] Permission requested:', params.toolCall.title);
		console.log('[ACP Client] Tool call:', JSON.stringify(params.toolCall, null, 2));
		console.log('[ACP Client] Options:', params.options);

		// TODO: 显示 UI 让用户选择
		// 暂时自动选择第一个选项
		if (params.options.length > 0) {
			const selectedOption = params.options[0];
			console.log('[ACP Client] Auto-selecting option:', selectedOption.name);
			
			return {
				outcome: {
					outcome: 'selected' as const,
					optionId: selectedOption.optionId,
				},
			};
		}

		return { outcome: { outcome: 'cancelled' as const } };
	}

	/**
	 * 读取文本文件
	 * Agent 调用此方法读取文件内容
	 */
	async readTextFile(
		params: acp.ReadTextFileRequest,
	): Promise<acp.ReadTextFileResponse> {
		console.log('[ACP Client] Read file:', params.path);
		
		if (!this.app) {
			console.error('[ACP Client] App not available, cannot read file');
			throw new Error('App not available');
		}

		try {
			// Normalize path and read from vault
			const normalizedPath = params.path.replace(/^\//, '');
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);
			
			if (!file || !('extension' in file)) {
				throw new Error(`File not found: ${params.path}`);
			}

			const content = await this.app.vault.read(file as TFile);
			console.log('[ACP Client] File read success, length:', content.length);
			
			return { content };
		} catch (error) {
			console.error('[ACP Client] Read file failed:', error);
			throw error;
		}
	}

	/**
	 * 写入文本文件
	 * Agent 调用此方法写入文件
	 */
	async writeTextFile(
		params: acp.WriteTextFileRequest,
	): Promise<acp.WriteTextFileResponse> {
		console.log('[ACP Client] Write file:', params.path);
		console.log('[ACP Client] Content length:', params.content.length);
		
		if (!this.app) {
			console.error('[ACP Client] App not available, cannot write file');
			throw new Error('App not available');
		}

		try {
			const normalizedPath = params.path.replace(/^\//, '');
			const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
			
			if (existing && 'extension' in existing) {
				// Update existing file
				await this.app.vault.modify(existing as TFile, params.content);
				console.log('[ACP Client] File updated successfully');
			} else {
				// Create new file
				await this.app.vault.create(normalizedPath, params.content);
				console.log('[ACP Client] File created successfully');
			}
			
			return {};
		} catch (error) {
			console.error('[ACP Client] Write file failed:', error);
			throw error;
		}
	}

	/**
	 * 创建终端
	 */
	async createTerminal(params: acp.CreateTerminalRequest): Promise<acp.CreateTerminalResponse> {
		console.log('[ACP Client] Create terminal:', params.command, params.args);
		return { terminalId: `term_${Date.now()}` };
	}

	async terminalOutput(params: acp.TerminalOutputRequest): Promise<acp.TerminalOutputResponse> {
		return { output: '', truncated: false };
	}

	async waitForTerminalExit(params: acp.WaitForTerminalExitRequest): Promise<acp.WaitForTerminalExitResponse> {
		return { exitCode: 0, signal: null };
	}

	async killTerminal(params: acp.KillTerminalRequest): Promise<acp.KillTerminalResponse> {
		return {};
	}

	async releaseTerminal(params: acp.ReleaseTerminalRequest): Promise<acp.ReleaseTerminalResponse> {
		return {};
	}
}

// ============================================================================
// ACP Bridge Adapter
// ============================================================================

/**
 * ACP Bridge Adapter using official @agentclientprotocol/sdk
 * 
 * 所有关键通信步骤都通过 console.log 输出到 Obsidian 控制台
 * 方便前端开发者调试和查看通信过程
 */
export class AcpBridgeAdapter implements AgentAdapter {
	readonly id = 'acp-bridge';
	readonly label = 'ACP Bridge';

	private config: AcpBridgeAdapterConfig;
	private state: AgentStatusState = 'disconnected';
	private bridgeProcess: ChildProcess | null = null;
	private processManager = new ProcessManager();
	
	// SDK 连接
	private connection: acp.ClientSideConnection | null = null;
	private client: AgentLinkAcpClient;
	
	// Session
	private sessionId: string | null = null;
	private serverCapabilities: AgentCapability[] = [];
	
	// Streaming handlers
	private currentHandlers: StreamHandlers | null = null;
	private responseBuffer: string[] = [];
	private thinkingBuffer: string[] = [];
	private onThinkingChunk?: (text: string) => void;

	constructor(config: AcpBridgeAdapterConfig) {
		this.config = config;
		this.client = new AgentLinkAcpClient(this, config.app);
		
		console.log('[ACP Adapter] Created with config:');
		console.log('  Command:', config.bridgeCommand);
		console.log('  Args:', config.bridgeArgs);
		console.log('  Workspace:', config.workspaceRoot);
	}

	updateConfig(config: Partial<AcpBridgeAdapterConfig>): void {
		this.config = { ...this.config, ...config };
		console.log('[ACP Adapter] Config updated');
	}

	// ── Connection Management ────────────────────────────────────────────────

	async connect(): Promise<void> {
		if (this.state === 'connected' || this.state === 'connecting') {
			console.log('[ACP Adapter] Already connected/connecting');
			return;
		}

		this.state = 'connecting';
		console.log('[ACP Adapter] ========================================');
		console.log('[ACP Adapter] Connecting to ACP Agent...');
		console.log('[ACP Adapter] Command:', this.config.bridgeCommand, this.config.bridgeArgs);

		try {
			// Step 1: 启动 Bridge 进程
			await this.startBridgeProcess();
			
			// Step 2: 创建 SDK 连接
			await this.createConnection();
			
			// Step 3: 初始化 ACP 协议
			await this.initializeProtocol();
			
			// Step 4: 创建 Session
			await this.createSession();

			this.state = 'connected';
			console.log('[ACP Adapter] ========================================');
			console.log('[ACP Adapter] ✅ Connected successfully!');
			console.log('[ACP Adapter] Session ID:', this.sessionId);
		} catch (error) {
			this.state = 'error';
			await this.cleanup();
			const message = error instanceof Error ? error.message : String(error);
			console.error('[ACP Adapter] ❌ Connection failed:', message);
			throw new ConnectionError(`Failed to connect to ACP Bridge: ${message}`);
		}
	}

	async disconnect(): Promise<void> {
		console.log('[ACP Adapter] Disconnecting...');
		await this.cleanup();
		this.state = 'disconnected';
		console.log('[ACP Adapter] Disconnected');
	}

	// ── Message Sending ──────────────────────────────────────────────────────

	async sendMessage(input: AgentInput, handlers: StreamHandlers, options?: { onThinkingChunk?: (text: string) => void }): Promise<void> {
		console.log('[ACP Adapter] ========================================');
		console.log('[ACP Adapter] sendMessage called');
		
		if (this.state === 'disconnected') {
			console.log('[ACP Adapter] Not connected, connecting first...');
			await this.connect();
		}

		if (!this.connection || !this.sessionId) {
			throw new ConnectionError('Connection or session not established');
		}

		this.state = 'busy';
		this.currentHandlers = handlers;
		this.responseBuffer = [];
		this.thinkingBuffer = [];
		this.onThinkingChunk = options?.onThinkingChunk;

		console.log('[ACP Adapter] Sending prompt:', input.prompt);
		console.log('[ACP Adapter] Session ID:', this.sessionId);

		try {
			// 构建 prompt content blocks
			const contentBlocks: acp.ContentBlock[] = [
				{ type: 'text', text: input.prompt },
			];

			// 添加文件上下文
			if (input.context?.fileContent) {
				console.log('[ACP Adapter] Adding file context');
				contentBlocks.push({
					type: 'resource',
					resource: {
						uri: `file://${this.config.workspaceRoot}/current.md`,
						text: input.context.fileContent,
					},
				});
			}

			// 使用 SDK 发送 prompt
			console.log('[ACP Adapter] Calling connection.prompt()...');
			const response = await this.connection.prompt({
				sessionId: this.sessionId,
				prompt: contentBlocks,
			});

			console.log('[ACP Adapter] Prompt response received!');
			console.log('[ACP Adapter] Stop reason:', response.stopReason);

			// 发送完整的响应
			const fullText = this.responseBuffer.join('');
			console.log('[ACP Adapter] Full response length:', fullText.length);
			
			this.state = 'connected';
			handlers.onComplete(fullText || '(No response)');

		} catch (error) {
			this.state = 'connected';
			console.error('[ACP Adapter] Send message failed:', error);
			
			if (error instanceof CancellationError) {
				handlers.onError(error);
			} else {
				const err = error instanceof Error ? error : new Error(String(error));
				handlers.onError(err);
			}
		} finally {
			this.currentHandlers = null;
			console.log('[ACP Adapter] ========================================');
		}
	}

	async cancel(): Promise<void> {
		console.log('[ACP Adapter] Cancel requested');
		
		if (this.connection && this.sessionId) {
			try {
				console.log('[ACP Adapter] Sending cancel notification');
				await this.connection.cancel({
					sessionId: this.sessionId,
				});
				console.log('[ACP Adapter] Cancel sent successfully');
			} catch (error) {
				console.error('[ACP Adapter] Cancel failed:', error);
			}
		}
	}

	// ── Status and Capabilities ──────────────────────────────────────────────

	getStatus(): AgentStatus {
		return { 
			state: this.state,
			message: this.sessionId ? `Session: ${this.sessionId.slice(0, 8)}...` : undefined,
		};
	}

	getCapabilities(): AgentCapability[] {
		if (this.serverCapabilities.length > 0) {
			return this.serverCapabilities;
		}
		return ['chat', 'file_read', 'file_write', 'file_edit', 'terminal'];
	}

	// ── Tool Execution ───────────────────────────────────────────────────────

	async executeTool(call: ToolCall): Promise<ToolResult> {
		console.log('[ACP Adapter] Execute tool:', call.tool);

		return {
			success: false,
			content: 'Tool execution should be handled by ToolExecutor via UI layer',
		};
	}

	async resumeAfterTool(toolCallId: string, result: ToolResult): Promise<void> {
		console.log('[ACP Adapter] Resume after tool:', toolCallId);
	}

	async rejectTool(toolCallId: string, reason: string): Promise<void> {
		console.log('[ACP Adapter] Reject tool:', toolCallId, reason);
	}

	hasPendingToolCalls(): boolean {
		return false;
	}

	getPendingToolCalls(): Array<{ id: string; name: string; arguments: Record<string, unknown> }> {
		return [];
	}

	// ── Internal Methods (called by AgentLinkAcpClient) ──────────────────────

	handleAgentMessage(text: string): void {
		console.log('[ACP Adapter] handleAgentMessage:', text.substring(0, 50));
		this.responseBuffer.push(text);
		if (this.currentHandlers) {
			this.currentHandlers.onChunk(text);
		}
	}

	handleAgentThinking(text: string): void {
		console.log('[ACP Adapter] handleAgentThinking:', text.substring(0, 50));
		this.thinkingBuffer.push(text);
		// 调用 UI 回调来显示 thinking 内容
		if (this.onThinkingChunk) {
			this.onThinkingChunk(text);
		}
	}

	handleToolCall(update: acp.ToolCallUpdate): void {
		console.log('[ACP Adapter] handleToolCall:', (update as any).toolCallId, (update as any).title, (update as any).status);
		
		// Map ACP status to our status type
		let status: 'pending' | 'executing' | 'completed' | 'error';
		switch ((update as any).status) {
			case 'in_progress':
				status = 'executing';
				break;
			case 'completed':
				status = 'completed';
				break;
			case 'failed':
				status = 'error';
				break;
			default:
				status = 'pending';
		}
		
		// Try to parse params from the update
		let params: Record<string, unknown> = {};
		const updateAny = update as any;
		if (updateAny.arguments || updateAny.params) {
			const rawParams = updateAny.arguments || updateAny.params;
			try {
				params = typeof rawParams === 'string' 
					? JSON.parse(rawParams) 
					: rawParams;
			} catch {
				params = { raw: rawParams };
			}
		}
		
		// Call the handler to display as a card in UI
		if (this.currentHandlers?.onToolCall) {
			this.currentHandlers.onToolCall(updateAny.tool || updateAny.toolName || 'unknown', params, status);
		} else {
			// Fallback: show as text if no card handler
			if ((update as any).status === 'in_progress') {
				const toolMsg = `🔍 **${(update as any).title}**...\n\n`;
				this.responseBuffer.push(toolMsg);
				if (this.currentHandlers) {
					this.currentHandlers.onChunk(toolMsg);
				}
			}
		}
	}

	handleToolResult(toolCallId: string, text: string): void {
		console.log('[ACP Adapter] handleToolResult:', toolCallId);
		// Don't output raw tool results - they should be handled by the agent and included in its response
		// If the agent doesn't include the result in its response, we can optionally show a summary
		try {
			// Try to parse as JSON to see if we can extract meaningful info
			const result = JSON.parse(text);
			if (result.query || result.title) {
				// It's a search result - don't show raw JSON, agent will summarize
				return;
			}
		} catch {
			// Not JSON, show as plain text if it looks useful
		}
		// Only show non-JSON results or very short results
		if (!text.startsWith('{') && text.length < 200) {
			const resultMsg = `✅ **Result:** ${text}\n\n`;
			this.responseBuffer.push(resultMsg);
			if (this.currentHandlers) {
				this.currentHandlers.onChunk(resultMsg);
			}
		}
	}

	// ── Private Methods ──────────────────────────────────────────────────────

	private async startBridgeProcess(): Promise<void> {
		const { bridgeCommand, bridgeArgs, workspaceRoot, env } = this.config;

		if (!bridgeCommand) {
			throw new Error('Bridge command is required');
		}

		console.log('[ACP Adapter] Starting bridge process...');
		console.log('[ACP Adapter] Command:', bridgeCommand, bridgeArgs);
		console.log('[ACP Adapter] CWD:', workspaceRoot || process.cwd());

		return new Promise((resolve, reject) => {
			try {
				this.bridgeProcess = spawn(bridgeCommand, bridgeArgs, {
					cwd: workspaceRoot || undefined,
					env: { ...process.env, ...env },
					stdio: ['pipe', 'pipe', 'pipe'],
				});

				this.processManager.track(this.bridgeProcess);

				// Handle stderr (logs)
				this.bridgeProcess.stderr?.on('data', (data: Buffer) => {
					const str = data.toString();
					console.log('[ACP Agent stderr]:', str.trim());
				});

				// Handle process errors
				this.bridgeProcess.on('error', (error) => {
					console.error('[ACP Adapter] Bridge process error:', error);
					reject(new Error(`Failed to start bridge process: ${error.message}`));
				});

				// Handle process exit
				this.bridgeProcess.on('exit', (code) => {
					if (code !== 0 && code !== null && this.state !== 'disconnected') {
						console.error('[ACP Adapter] Bridge process exited with code:', code);
						this.state = 'error';
					}
				});

				// Wait for process to be ready
				setTimeout(() => {
					if (this.bridgeProcess) {
						console.log('[ACP Adapter] Bridge process started, PID:', this.bridgeProcess.pid);
						resolve();
					}
				}, 1000);

			} catch (error) {
				reject(error);
			}
		});
	}

	private async createConnection(): Promise<void> {
		if (!this.bridgeProcess?.stdin || !this.bridgeProcess?.stdout) {
			throw new Error('Bridge process not properly started');
		}

		console.log('[ACP Adapter] Creating SDK connection...');

		// 转换 Node.js streams 到 Web Streams
		const input = Writable.toWeb(this.bridgeProcess.stdin) as WritableStream<Uint8Array>;
		const output = Readable.toWeb(this.bridgeProcess.stdout) as ReadableStream<Uint8Array>;

		// 创建 ndJsonStream
		console.log('[ACP Adapter] Creating ndJsonStream...');
		const stream = acp.ndJsonStream(input, output);

		// 创建 ClientSideConnection
		console.log('[ACP Adapter] Creating ClientSideConnection...');
		this.connection = new acp.ClientSideConnection(
			() => this.client,
			stream
		);

		// 监听连接关闭
		this.connection.signal.addEventListener('abort', () => {
			console.log('[ACP Adapter] Connection aborted/closed');
			this.state = 'disconnected';
		});

		console.log('[ACP Adapter] SDK connection created');
	}

	private async initializeProtocol(): Promise<void> {
		if (!this.connection) {
			throw new Error('Connection not established');
		}

		console.log('[ACP Adapter] Initializing ACP protocol...');
		console.log('[ACP Adapter] Protocol version:', acp.PROTOCOL_VERSION);

		try {
			const response = await this.connection.initialize({
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {
					fs: {
						readTextFile: true,
						writeTextFile: true,
					},
					terminal: true,
				},
				clientInfo: {
					name: 'AgentLink',
					version: '1.0.0',
				},
			});

			console.log('[ACP Adapter] ✅ Initialize successful!');
			console.log('[ACP Adapter] Agent name:', response.agentInfo?.name);
			console.log('[ACP Adapter] Agent version:', response.agentInfo?.version);
			console.log('[ACP Adapter] Protocol version:', response.protocolVersion);

			// Store capabilities
			if (response.agentCapabilities) {
				this.serverCapabilities = this.mapAcpCapabilities(response.agentCapabilities);
				console.log('[ACP Adapter] Capabilities:', this.serverCapabilities);
			}

			// Check if authentication is required
			if (response.authMethods && response.authMethods.length > 0) {
				console.log('[ACP Adapter] Authentication methods available:', 
					response.authMethods.map(m => m.name).join(', '));
				
				// TODO: 如果需要认证，调用 connection.authenticate()
			}

		} catch (error) {
			console.error('[ACP Adapter] Initialize failed:', error);
			throw error;
		}
	}

	private async createSession(): Promise<void> {
		if (!this.connection) {
			throw new Error('Connection not established');
		}

		console.log('[ACP Adapter] Creating session...');

		const cwd = this.config.workspaceRoot || process.cwd();
		console.log('[ACP Adapter] Working directory:', cwd);

		try {
			const response = await this.connection.newSession({
				cwd: cwd,
				mcpServers: [],
			});

			this.sessionId = response.sessionId;
			console.log('[ACP Adapter] ✅ Session created!');
			console.log('[ACP Adapter] Session ID:', this.sessionId);
			console.log('[ACP Adapter] Current mode:', response.modes?.currentModeId);
			console.log('[ACP Adapter] Current model:', response.models?.currentModelId);

		} catch (error) {
			console.error('[ACP Adapter] Create session failed:', error);
			throw error;
		}
	}

	private mapAcpCapabilities(acpCaps: acp.AgentCapabilities): AgentCapability[] {
		// AgentCapabilities tells us what the AGENT can do
		// We return the intersection of what we support and what agent supports
		const capabilities: AgentCapability[] = ['chat'];

		// Agent supports loading sessions - we can use that
		if (acpCaps.loadSession) {
			console.log('[ACP Adapter] Agent supports loadSession');
		}

		// Agent supports MCP servers
		if (acpCaps.mcpCapabilities) {
			console.log('[ACP Adapter] Agent supports MCP:', acpCaps.mcpCapabilities);
		}

		// We support fs and terminal as a client, so we always add them
		// (these are client capabilities, not agent capabilities)
		capabilities.push('file_read', 'file_write', 'file_edit', 'terminal');

		return capabilities;
	}

	private async cleanup(): Promise<void> {
		console.log('[ACP Adapter] Cleaning up...');

		if (this.connection) {
			console.log('[ACP Adapter] Closing connection...');
			this.connection = null;
		}

		if (this.bridgeProcess) {
			console.log('[ACP Adapter] Killing bridge process...');
			this.processManager.killAll();
			this.bridgeProcess = null;
		}

		this.sessionId = null;
		this.serverCapabilities = [];
		this.currentHandlers = null;
		this.responseBuffer = [];
		this.thinkingBuffer = [];
		this.onThinkingChunk = undefined;

		console.log('[ACP Adapter] Cleanup complete');
	}
}