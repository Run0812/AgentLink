/* ────────────────────────────────────────────────────────────────────────
 * AcpBridgeAdapter — connect to local agents via ACP (Agent Client Protocol).
 *
 * 使用官方 @agentclientprotocol/sdk 实现
 * 参考: https://github.com/agentclientprotocol/typescript-sdk
 * ──────────────────────────────────────────────────────────────────────── */

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
	ConfigOption,
	AcpBridgeBackendConfig,
	Skill,
	AvailableCommand,
	PlanEntry,
	SessionModeOption,
	ContextUsageState,
} from '../core/types';
import { CancellationError, ConnectionError, TimeoutError } from '../core/errors';
import { logger } from '../core/logger';
import {
	buildWorkspaceFileUri as buildVaultWorkspaceFileUri,
	ensureVaultParentFolders,
	resolveVaultRelativePath,
	sliceFileContent,
} from '../services/vault-paths';
import { AcpTransport } from './acp/acp-transport';
import { AcpProtocolMapper } from './acp/acp-protocol-mapper';
import { AcpSessionState } from './acp/acp-session-state';

// ============================================================================
// Adapter Configuration (using shared types)
// ============================================================================

// Re-export the type from core/types for convenience
export type AcpBridgeAdapterConfig = AcpBridgeBackendConfig & {
	/** Obsidian app reference */
	app?: App;
};

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
				this.adapter.handlePlan(update.entries);
				break;

			case 'available_commands_update':
				console.log('[ACP Client] Available commands update:', update.availableCommands?.length ?? 0);
				this.adapter.handleAvailableCommands(update.availableCommands);
				break;

			case 'current_mode_update':
				console.log('[ACP Client] Current mode update:', update.currentModeId);
				this.adapter.handleCurrentModeUpdate(update.currentModeId);
				break;

			case 'config_option_update':
				console.log('[ACP Client] Config option update:', update.configOptions?.length ?? 0);
				this.adapter.handleConfigOptionUpdate(update.configOptions);
				break;

			case 'usage_update':
				console.log('[ACP Client] Usage update received');
				this.adapter.handleContextUsageUpdate(update as unknown);
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

		return this.adapter.handlePermissionRequest(params);
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
			const normalizedPath = resolveVaultRelativePath(this.app, params.path);
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);
			
			if (!file || !('extension' in file)) {
				throw new Error(`File not found: ${params.path}`);
			}

			const content = await this.app.vault.read(file as TFile);
			const slicedContent = sliceFileContent(content, params.line ?? undefined, params.limit ?? undefined);
			console.log('[ACP Client] File read success, length:', slicedContent.length);
			
			return { content: slicedContent };
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
			const normalizedPath = resolveVaultRelativePath(this.app, params.path);
			const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
			
			if (existing && 'extension' in existing) {
				// Update existing file
				await this.app.vault.modify(existing as TFile, params.content);
				console.log('[ACP Client] File updated successfully');
			} else {
				// Create new file
				await ensureVaultParentFolders(this.app, normalizedPath);
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
		console.log('[ACP Client] terminalOutput:', params.terminalId);
		return { output: '', truncated: false };
	}

	async waitForTerminalExit(params: acp.WaitForTerminalExitRequest): Promise<acp.WaitForTerminalExitResponse> {
		console.log('[ACP Client] waitForTerminalExit:', params.terminalId);
		return { exitCode: 0, signal: null };
	}

	async killTerminal(params: acp.KillTerminalRequest): Promise<acp.KillTerminalResponse> {
		console.log('[ACP Client] killTerminal:', params.terminalId);
		return {};
	}

	async releaseTerminal(params: acp.ReleaseTerminalRequest): Promise<acp.ReleaseTerminalResponse> {
		console.log('[ACP Client] releaseTerminal:', params.terminalId);
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
	private transport = new AcpTransport();
	private protocolMapper = new AcpProtocolMapper();
	private sessionState = new AcpSessionState();
	private callbacks: AcpAdapterCallbacks = {};
	
	// SDK 连接
	private connection: acp.ClientSideConnection | null = null;
	private client: AgentLinkAcpClient;
	private connectionPromise: Promise<void> | null = null;
	
	// Session
	private serverCapabilities: AgentCapability[] = [];
	private authMethods: acp.AuthMethod[] = [];
	private sessionStateListeners = new Set<() => void>();
	
	// Streaming handlers
	private currentHandlers: StreamHandlers | null = null;
	private responseBuffer: string[] = [];
	private thinkingBuffer: string[] = [];
	private onThinkingChunk?: (text: string) => void;

	// Backward-compatible field access used by existing tests/internal callers.
	private get sessionId(): string | null {
		return this.sessionState.sessionId;
	}

	private set sessionId(value: string | null) {
		this.sessionState.sessionId = value;
	}

	private get configOptions(): ConfigOption[] {
		return this.sessionState.configOptions;
	}

	private set configOptions(value: ConfigOption[]) {
		this.sessionState.configOptions = value;
	}

	private get sessionModes(): SessionModeOption[] {
		return this.sessionState.sessionModes;
	}

	private set sessionModes(value: SessionModeOption[]) {
		this.sessionState.sessionModes = value;
	}

	private get availableCommands(): AvailableCommand[] {
		return this.sessionState.availableCommands;
	}

	private set availableCommands(value: AvailableCommand[]) {
		this.sessionState.availableCommands = value;
	}

	private get plan(): PlanEntry[] {
		return this.sessionState.plan;
	}

	private set plan(value: PlanEntry[]) {
		this.sessionState.plan = value;
	}

	private get currentMode(): string | null {
		return this.sessionState.currentMode;
	}

	private set currentMode(value: string | null) {
		this.sessionState.currentMode = value;
	}

	private get contextUsage(): ContextUsageState | null {
		return this.sessionState.contextUsage;
	}

	private set contextUsage(value: ContextUsageState | null) {
		this.sessionState.contextUsage = value;
	}

	constructor(config: AcpBridgeAdapterConfig) {
		this.config = config;
		this.client = new AgentLinkAcpClient(this, config.app);
		
		console.log('[ACP Adapter] Created with config:');
		console.log('  ID:', config.id);
		console.log('  Command:', config.command);
		console.log('  Args:', config.args);
	}

	updateConfig(config: Partial<AcpBridgeAdapterConfig>): void {
		this.config = { ...this.config, ...config };
		console.log('[ACP Adapter] Config updated');
	}

	setCallbacks(callbacks: Partial<AcpAdapterCallbacks>): void {
		this.callbacks = { ...this.callbacks, ...callbacks };
	}

	subscribeSessionState(listener: () => void): () => void {
		this.sessionStateListeners.add(listener);
		return () => {
			this.sessionStateListeners.delete(listener);
		};
	}

	// ── Connection Management ────────────────────────────────────────────────

	async connect(): Promise<void> {
		if ((this.state === 'connected' || this.state === 'busy') && this.connection && this.sessionState.sessionId) {
			console.log('[ACP Adapter] Already connected');
			return;
		}

		if (this.connectionPromise) {
			console.log('[ACP Adapter] Connection is already in progress');
			return this.connectionPromise;
		}

		this.connectionPromise = this.establishConnection();
		try {
			await this.connectionPromise;
		} finally {
			this.connectionPromise = null;
		}
	}

	async disconnect(): Promise<void> {
		console.log('[ACP Adapter] Disconnecting...');
		await this.cleanup();
		this.setState('disconnected');
		console.log('[ACP Adapter] Disconnected');
	}

	async prepareSession(options?: { reset?: boolean }): Promise<void> {
		const reset = options?.reset ?? false;
		console.log('[ACP Adapter] Preparing session. Reset:', reset);

		if (!reset) {
			await this.connect();
			return;
		}

		if (this.connectionPromise) {
			await this.connectionPromise;
		}

		if (!this.connection || !this.sessionState.sessionId || this.state === 'disconnected' || this.state === 'error') {
			await this.connect();
			return;
		}

		if (this.state === 'busy') {
			console.warn('[ACP Adapter] Skipping session reset while adapter is busy');
			return;
		}

		this.connectionPromise = this.resetSession();
		try {
			await this.connectionPromise;
		} finally {
			this.connectionPromise = null;
		}
	}

	// ── Message Sending ──────────────────────────────────────────────────────

	async sendMessage(input: AgentInput, handlers: StreamHandlers, options?: { onThinkingChunk?: (text: string) => void }): Promise<void> {
		console.log('[ACP Adapter] ========================================');
		console.log('[ACP Adapter] sendMessage called');
		
		if (this.state === 'disconnected' || this.state === 'connecting' || !this.connection || !this.sessionState.sessionId) {
			console.log('[ACP Adapter] Session not ready, connecting first...');
			await this.connect();
		}

		if (!this.connection || !this.sessionState.sessionId) {
			throw new ConnectionError('Connection or session not established');
		}

		this.setState('busy');
		this.currentHandlers = handlers;
		this.responseBuffer = [];
		this.thinkingBuffer = [];
		this.onThinkingChunk = options?.onThinkingChunk;

		console.log('[ACP Adapter] Sending prompt:', input.prompt);
		console.log('[ACP Adapter] Session ID:', this.sessionState.sessionId);

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
						uri: this.buildWorkspaceFileUri('current.md'),
						text: input.context.fileContent,
					},
				});
			}

			// 使用 SDK 发送 prompt
			console.log('[ACP Adapter] Calling connection.prompt()...');
			const response = await this.connection.prompt({
				sessionId: this.sessionState.sessionId,
				prompt: contentBlocks,
			});

			console.log('[ACP Adapter] Prompt response received!');
			console.log('[ACP Adapter] Stop reason:', response.stopReason);
			this.handlePromptUsage(response as unknown);

			// 发送完整的响应
			const fullText = this.responseBuffer.join('');
			console.log('[ACP Adapter] Full response length:', fullText.length);
			
			this.setState('connected');
			handlers.onComplete(fullText || '(No response)');

		} catch (error) {
			this.setState('connected');
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
		
		if (this.connection && this.sessionState.sessionId) {
			try {
				console.log('[ACP Adapter] Sending cancel notification');
				await this.connection.cancel({
					sessionId: this.sessionState.sessionId,
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
			message: this.sessionState.sessionId ? `Session: ${this.sessionState.sessionId.slice(0, 8)}...` : undefined,
		};
	}

	getCapabilities(): AgentCapability[] {
		if (this.serverCapabilities.length > 0) {
			return this.serverCapabilities;
		}
		return ['chat', 'file_read', 'file_write', 'file_edit'];
	}

	// ── Skills (ACP Skills) ────────────────────────────────────────────────

	/**
	 * Get available skills from the ACP agent.
	 * Currently returns empty array as skills need to be fetched from the agent.
	 * TODO: Implement actual skill fetching from ACP protocol.
	 */
	getSkills(): Skill[] {
		// In the future, this should fetch skills from the ACP agent
		// via the connection. For now, return empty array as ACP SDK
		// doesn't have a direct skills endpoint yet.
		console.log('[ACP Adapter] getSkills called (not implemented - waiting for ACP spec)');
		return [];
	}

	// ── Config Options (ACP Session Config Options) ────────────────────────

	getConfigOptions(): ConfigOption[] {
		if (this.sessionState.configOptions.length > 0) {
			return this.sessionState.configOptions;
		}

		if (this.sessionState.sessionModes.length === 0) {
			return [];
		}

		return [{
			id: 'mode',
			name: 'Mode',
			description: 'Agent session mode',
			category: 'mode',
			type: 'select',
			currentValue: this.sessionState.currentMode ?? this.sessionState.sessionModes[0]?.id ?? '',
			options: this.sessionState.sessionModes.map((mode) => ({
				value: mode.id,
				name: mode.name,
				description: mode.description,
			})),
		}];
	}

	getAvailableCommands(): AvailableCommand[] {
		return this.sessionState.availableCommands;
	}

	getPlan(): PlanEntry[] {
		return this.sessionState.plan;
	}

	getCurrentMode(): string | null {
		return this.sessionState.currentMode;
	}

	getSessionModes(): SessionModeOption[] {
		return this.sessionState.sessionModes;
	}

	getContextUsage(): ContextUsageState | null {
		return this.sessionState.contextUsage;
	}

	async setConfigOption(configId: string, value: string | boolean): Promise<ConfigOption[]> {
		console.log('[ACP Adapter] Setting config option:', configId, '=', value);
		
		if (!this.connection || !this.sessionState.sessionId) {
			throw new Error('Not connected');
		}

		if (this.shouldUseModeFallback(configId, value)) {
			const modeId = String(value);
			console.log('[ACP Adapter] Using session/set_mode fallback:', modeId);
			await this.connection.setSessionMode({
				sessionId: this.sessionState.sessionId,
				modeId,
			});
			this.sessionState.currentMode = modeId;
			this.emitSessionStateChange();
			return this.getConfigOptions();
		}

		const response = await this.connection.setSessionConfigOption(
			typeof value === 'boolean'
				? {
					sessionId: this.sessionState.sessionId,
					configId,
					type: 'boolean',
					value,
				}
				: {
					sessionId: this.sessionState.sessionId,
					configId,
					value,
				},
		);
		this.sessionState.configOptions = this.mapConfigOptions(response.configOptions);
		console.log('[ACP Adapter] Config option updated from agent response:', this.describeConfigOptions(this.sessionState.configOptions));
		this.emitSessionStateChange();
		return this.getConfigOptions();
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

	async handlePermissionRequest(
		params: acp.RequestPermissionRequest,
	): Promise<acp.RequestPermissionResponse> {
		if (params.options.length === 0) {
			return { outcome: { outcome: 'cancelled' } };
		}

		const toolCall = this.mapPermissionToolCall(params.toolCall);
		const selectedOptionId = await this.requestPermissionSelection(toolCall, params.options);
		if (!selectedOptionId) {
			console.log('[ACP Adapter] Permission request cancelled');
			return { outcome: { outcome: 'cancelled' } };
		}

		console.log('[ACP Adapter] Permission option selected:', selectedOptionId);
		return {
			outcome: {
				outcome: 'selected',
				optionId: selectedOptionId,
			},
		};
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

	handleAvailableCommands(commands: Array<{ name: string; description: string; input?: unknown | null }> = []): void {
		this.sessionState.availableCommands = commands.map((command) => ({
			name: command.name,
			description: command.description,
			input: this.mapAvailableCommandInput(command.input),
		}));
		console.log('[ACP Adapter] Available commands updated:', this.sessionState.availableCommands.map((command) => command.name).join(', ') || '(none)');
		this.emitSessionStateChange();
	}

	handleCurrentModeUpdate(modeId: string | null | undefined): void {
		this.sessionState.currentMode = modeId ?? null;
		console.log('[ACP Adapter] Current mode updated:', this.sessionState.currentMode ?? '(none)');
		this.emitSessionStateChange();
	}

	handleConfigOptionUpdate(configOptions: unknown): void {
		this.sessionState.configOptions = this.mapConfigOptions(configOptions);
		console.log('[ACP Adapter] Config options updated:', this.describeConfigOptions(this.sessionState.configOptions));
		this.emitSessionStateChange();
	}

	handlePlan(entries: PlanEntry[] = []): void {
		this.sessionState.plan = entries.map((entry) => ({
			content: entry.content,
			priority: entry.priority,
			status: entry.status,
		}));
		console.log('[ACP Adapter] Plan updated:', this.sessionState.plan.map((entry) => `${entry.status}:${entry.content}`).join(' | ') || '(none)');
		this.emitSessionStateChange();
	}

	handleContextUsageUpdate(update: unknown): void {
		const parsed = this.parseContextUsage(update);
		if (!parsed) {
			return;
		}

		this.sessionState.contextUsage = parsed;
		console.log(
			'[ACP Adapter] Context usage updated:',
			`${parsed.usedTokens}/${parsed.maxTokens ?? '?'}`,
			parsed.source,
		);
		this.emitSessionStateChange();
	}

	// ── Private Methods ──────────────────────────────────────────────────────

	private async startBridgeProcess(): Promise<void> {
		const { command, args } = this.config;

		if (!command) {
			throw new Error('Command is required');
		}

		console.log('[ACP Adapter] Starting bridge process...');
		console.log('[ACP Adapter] Command:', command, args);

		const process = await this.transport.start(command, args, {
			onStderr: (line) => {
				console.log('[ACP Agent stderr]:', line.trim());
			},
			onError: (error) => {
				console.error('[ACP Adapter] Bridge process error:', error);
			},
			onExit: (code) => {
				if (code !== 0 && code !== null && this.state !== 'disconnected') {
					console.error('[ACP Adapter] Bridge process exited with code:', code);
					this.setState('error');
				}
			},
		});
		console.log('[ACP Adapter] Bridge process started, PID:', process.pid);
	}

	private async createConnection(): Promise<void> {
		const bridgeProcess = this.transport.getBridgeProcess();
		if (!bridgeProcess) {
			throw new Error('Bridge process not properly started');
		}

		console.log('[ACP Adapter] Creating SDK connection...');
		this.connection = this.transport.createConnection(
			bridgeProcess,
			() => this.client,
			() => {
				console.log('[ACP Adapter] Connection aborted/closed');
				this.setState('disconnected');
			},
		);

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
					auth: {
						terminal: false,
					},
					fs: {
						readTextFile: true,
						writeTextFile: true,
					},
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

			this.authMethods = response.authMethods ?? [];
			if (this.authMethods.length > 0) {
				console.log('[ACP Adapter] Authentication methods available:', 
					this.authMethods.map((method) => method.name).join(', '));
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

		const cwd = this.getWorkingDirectory();
		console.log('[ACP Adapter] Working directory:', cwd);

		try {
			const response = await this.connection.newSession({
				cwd: cwd,
				mcpServers: [],
			});

			this.applySessionResponse(response);
			console.log('[ACP Adapter] ✅ Session created!');
			console.log('[ACP Adapter] Session ID:', this.sessionState.sessionId);

		} catch (error) {
			console.error('[ACP Adapter] Create session failed:', error);
			if (await this.tryAuthenticateAndCreateSession(error, cwd)) {
				return;
			}
			throw error;
		}
	}

	private applySessionResponse(response: acp.NewSessionResponse): void {
		this.sessionState.sessionId = response.sessionId;
		this.sessionState.sessionModes = this.mapSessionModes(response.modes?.availableModes);
		this.sessionState.currentMode = response.modes?.currentModeId ?? null;
		console.log('[ACP Adapter] Current mode:', response.modes?.currentModeId);
		console.log('[ACP Adapter] Current model:', response.models?.currentModelId);
		console.log('[ACP Adapter] Available modes:', this.sessionState.sessionModes.map((mode) => mode.id).join(', ') || '(none)');

		const responseWithConfig = response as acp.NewSessionResponse & { configOptions?: unknown };
		if (responseWithConfig.configOptions && Array.isArray(responseWithConfig.configOptions) && responseWithConfig.configOptions.length > 0) {
			this.sessionState.configOptions = this.mapConfigOptions(responseWithConfig.configOptions);
			console.log('[ACP Adapter] Config options received:', this.describeConfigOptions(this.sessionState.configOptions));
		}
		this.emitSessionStateChange();
	}

	private async tryAuthenticateAndCreateSession(error: unknown, cwd: string): Promise<boolean> {
		if (!this.connection || !this.isAuthenticationRequiredError(error)) {
			return false;
		}

		if (this.authMethods.length === 0) {
			throw new Error('Agent requires authentication, but did not advertise any authentication methods.');
		}

		const method = await this.requestAuthenticationMethodSelection();
		if (!method) {
			throw new Error('Authentication cancelled.');
		}

		await this.authenticateWithMethod(method);

		const response = await this.connection.newSession({
			cwd,
			mcpServers: [],
		});
		this.applySessionResponse(response);
		console.log('[ACP Adapter] Session created after authentication:', response.sessionId);
		return true;
	}

	private isAuthenticationRequiredError(error: unknown): boolean {
		const record = error && typeof error === 'object' ? error as Record<string, unknown> : null;
		const code = typeof record?.code === 'number'
			? record.code
			: record?.error && typeof record.error === 'object' && typeof (record.error as Record<string, unknown>).code === 'number'
				? (record.error as Record<string, unknown>).code as number
				: null;
		if (code === -32000) {
			return true;
		}

		const message = typeof record?.message === 'string'
			? record.message
			: record?.error && typeof record.error === 'object' && typeof (record.error as Record<string, unknown>).message === 'string'
				? String((record.error as Record<string, unknown>).message)
				: error instanceof Error
					? error.message
					: String(error ?? '');

		return message.includes('auth_required') || message.toLowerCase().includes('authentication required');
	}

	private async authenticateWithMethod(method: acp.AuthMethod): Promise<void> {
		if (!this.connection) {
			throw new Error('Connection not established');
		}

		const methodType = 'type' in method && typeof method.type === 'string' ? method.type : 'agent';
		if (methodType === 'env_var' || methodType === 'terminal') {
			throw new Error(`Authentication method "${method.name}" (${methodType}) is not supported yet.`);
		}

		console.log('[ACP Adapter] Authenticating with method:', method.id, method.name);
		const response = await this.connection.authenticate({ methodId: method.id });
		console.log('[ACP Adapter] Authentication completed:', method.id, response?._meta ?? '(no meta)');
	}

	private getSupportedAuthMethods(): acp.AuthMethod[] {
		return this.authMethods.filter((method) => {
			const methodType = 'type' in method && typeof method.type === 'string' ? method.type : 'agent';
			return methodType === 'agent';
		});
	}

	private async requestAuthenticationMethodSelection(): Promise<acp.AuthMethod | null> {
		const supportedMethods = this.getSupportedAuthMethods();
		if (supportedMethods.length === 1) {
			return supportedMethods[0];
		}

		if (supportedMethods.length === 0) {
			const unsupportedNames = this.authMethods
				.map((method) => `${method.name} (${('type' in method && typeof method.type === 'string') ? method.type : 'agent'})`)
				.join(', ');
			throw new Error(`Agent only advertised unsupported authentication methods: ${unsupportedNames}`);
		}

		const app = this.config.app;
		if (!app) {
			return null;
		}

		const { Modal, ButtonComponent } = await import('obsidian');

		return new Promise((resolve) => {
			let settled = false;
			const finish = (method: acp.AuthMethod | null): void => {
				if (settled) {
					return;
				}
				settled = true;
				resolve(method);
			};

			class AuthenticationModal extends Modal {
				override onOpen(): void {
					this.titleEl.setText('Authenticate agent');
					this.contentEl.createEl('p', {
						text: 'This agent requires authentication before a session can be created.',
					});

					const unsupportedMethods = (thisAuth.authMethods.filter((method) => !supportedMethods.includes(method)));
					if (unsupportedMethods.length > 0) {
						this.contentEl.createEl('p', {
							text: `Unsupported methods: ${unsupportedMethods.map((method) => method.name).join(', ')}`,
						});
					}

					const buttonRow = this.contentEl.createDiv({ cls: 'agentlink-modal-buttons' });
					buttonRow.style.display = 'flex';
					buttonRow.style.flexWrap = 'wrap';
					buttonRow.style.gap = '0.5em';
					buttonRow.style.marginTop = '1em';
					buttonRow.style.justifyContent = 'flex-end';

					new ButtonComponent(buttonRow)
						.setButtonText('Cancel')
						.onClick(() => {
							finish(null);
							this.close();
						});

					for (const method of supportedMethods) {
						new ButtonComponent(buttonRow)
							.setButtonText(method.name)
							.onClick(() => {
								finish(method);
								this.close();
							});

						if (method.description) {
							this.contentEl.createEl('p', {
								text: `${method.name}: ${method.description}`,
							});
						}
					}
				}

				override onClose(): void {
					finish(null);
				}
			}

			const thisAuth = this;
			new AuthenticationModal(app).open();
		});
	}

	private async establishConnection(): Promise<void> {
		this.setState('connecting');
		console.log('[ACP Adapter] ========================================');
		console.log('[ACP Adapter] Connecting to ACP Agent...');
		console.log('[ACP Adapter] Command:', this.config.command, this.config.args);

		try {
			console.log('[ACP Adapter] Step 1/4: Starting bridge process');
			await this.startBridgeProcess();

			console.log('[ACP Adapter] Step 2/4: Creating SDK connection');
			await this.createConnection();

			console.log('[ACP Adapter] Step 3/4: Initializing ACP protocol');
			await this.initializeProtocol();

			console.log('[ACP Adapter] Step 4/4: Creating session');
			await this.createSession();

			this.setState('connected');
			console.log('[ACP Adapter] ========================================');
			console.log('[ACP Adapter] ✅ Connected successfully!');
			console.log('[ACP Adapter] Session ID:', this.sessionState.sessionId);
		} catch (error) {
			this.setState('error');
			await this.cleanup();
			const message = error instanceof Error ? error.message : String(error);
			console.error('[ACP Adapter] ❌ Connection failed:', message);
			throw new ConnectionError(`Failed to connect to ACP Bridge: ${message}`);
		}
	}

	private async resetSession(): Promise<void> {
		if (!this.connection) {
			throw new Error('Connection not established');
		}

		console.log('[ACP Adapter] Resetting ACP session for a fresh chat');
		this.setState('connecting');
		this.resetSessionState();
		this.emitSessionStateChange();

		try {
			await this.createSession();
			this.setState('connected');
			console.log('[ACP Adapter] Fresh ACP session ready:', this.sessionState.sessionId);
		} catch (error) {
			this.setState('error');
			console.error('[ACP Adapter] Reset session failed:', error);
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

		// We support filesystem methods as a client, so expose matching capabilities.
		capabilities.push('file_read', 'file_write', 'file_edit');

		return capabilities;
	}

	private mapAvailableCommandInput(input: unknown): AvailableCommand['input'] {
		return this.protocolMapper.mapAvailableCommandInput(input);
	}

	private mapPermissionToolCall(toolCall: unknown): { id: string; tool: string; params: Record<string, unknown>; title: string } {
		const toolCallRecord = (toolCall && typeof toolCall === 'object' ? toolCall : {}) as Record<string, unknown>;
		const rawParams = toolCallRecord.arguments ?? toolCallRecord.params;
		let params: Record<string, unknown> = {};

		if (rawParams && typeof rawParams === 'object') {
			params = rawParams as Record<string, unknown>;
		} else if (typeof rawParams === 'string') {
			try {
				params = JSON.parse(rawParams) as Record<string, unknown>;
			} catch {
				params = { raw: rawParams };
			}
		}

		return {
			id: typeof toolCallRecord.toolCallId === 'string'
				? toolCallRecord.toolCallId
				: typeof toolCallRecord.id === 'string'
					? toolCallRecord.id
					: 'permission-request',
			tool: typeof toolCallRecord.toolName === 'string'
				? toolCallRecord.toolName
				: typeof toolCallRecord.tool === 'string'
					? toolCallRecord.tool
					: 'unknown',
			params,
			title: typeof toolCallRecord.title === 'string'
				? toolCallRecord.title
				: typeof toolCallRecord.toolName === 'string'
					? toolCallRecord.toolName
					: 'Permission request',
		};
	}

	private async requestPermissionSelection(
		toolCall: { id: string; tool: string; params: Record<string, unknown>; title: string },
		options: Array<{ optionId: string; name: string; kind: string }>,
	): Promise<string | null> {
		if (this.callbacks.onPermissionRequest) {
			return new Promise((resolve) => {
				this.callbacks.onPermissionRequest?.(toolCall, options, (outcome) => {
					resolve(outcome.approved ? outcome.optionId ?? null : null);
				});
			});
		}

		return this.showPermissionModal(toolCall, options);
	}

	private async showPermissionModal(
		toolCall: { id: string; tool: string; params: Record<string, unknown>; title: string },
		options: Array<{ optionId: string; name: string; kind: string }>,
	): Promise<string | null> {
		const app = this.config.app;
		if (!app) {
			return Promise.resolve(null);
		}

		const { Modal, ButtonComponent } = await import('obsidian');

		return new Promise((resolve) => {
			let settled = false;
			const finish = (selectedOptionId: string | null): void => {
				if (settled) {
					return;
				}
				settled = true;
				resolve(selectedOptionId);
			};

			class PermissionModal extends Modal {
				override onOpen(): void {
					this.titleEl.setText(toolCall.title || 'Permission request');
					this.contentEl.createEl('p', {
						text: `Agent wants permission to run "${toolCall.tool}".`,
					});

					if (Object.keys(toolCall.params).length > 0) {
						this.contentEl.createEl('pre', {
							text: JSON.stringify(toolCall.params, null, 2),
						});
					}

					const buttonRow = this.contentEl.createDiv({ cls: 'agentlink-modal-buttons' });
					buttonRow.style.display = 'flex';
					buttonRow.style.flexWrap = 'wrap';
					buttonRow.style.gap = '0.5em';
					buttonRow.style.marginTop = '1em';
					buttonRow.style.justifyContent = 'flex-end';

					new ButtonComponent(buttonRow)
						.setButtonText('Cancel')
						.onClick(() => {
							finish(null);
							this.close();
						});

					for (const option of options) {
						new ButtonComponent(buttonRow)
							.setButtonText(option.name)
							.onClick(() => {
								finish(option.optionId);
								this.close();
							});
					}
				}

				override onClose(): void {
					finish(null);
				}
			}

			new PermissionModal(app).open();
		});
	}

	private getWorkingDirectory(): string {
		const app = this.config.app;
		const adapter = app?.vault.adapter;

		if (adapter && 'getBasePath' in adapter && typeof adapter.getBasePath === 'function') {
			const basePath = adapter.getBasePath();
			if (basePath) {
				return basePath;
			}
		}

		return process.cwd();
	}

	private buildWorkspaceFileUri(relativePath: string): string {
		return buildVaultWorkspaceFileUri(this.getWorkingDirectory(), relativePath);
	}

	private mapSessionModes(modes: unknown): SessionModeOption[] {
		return this.protocolMapper.mapSessionModes(modes);
	}

	private mapConfigOptions(configOptions: unknown): ConfigOption[] {
		return this.protocolMapper.mapConfigOptions(configOptions);
	}

	private shouldUseModeFallback(configId: string, value: string | boolean): boolean {
		return (
			configId === 'mode' &&
			typeof value === 'string' &&
			this.sessionState.configOptions.length === 0 &&
			this.sessionState.sessionModes.some((mode) => mode.id === value)
		);
	}

	private describeConfigOptions(configOptions: ConfigOption[]): string {
		return this.protocolMapper.describeConfigOptions(configOptions);
	}

	private handlePromptUsage(response: unknown): void {
		const parsed = this.parseContextUsage(response);
		if (!parsed) {
			return;
		}

		this.sessionState.contextUsage = {
			...this.sessionState.contextUsage,
			...parsed,
			maxTokens: parsed.maxTokens ?? this.sessionState.contextUsage?.maxTokens,
			percentage:
				parsed.maxTokens ?? this.sessionState.contextUsage?.maxTokens
					? Math.max(
						0,
						Math.min(
							100,
							Math.round(
								(parsed.usedTokens / ((parsed.maxTokens ?? this.sessionState.contextUsage?.maxTokens) as number)) * 100,
							),
						),
					  )
					: undefined,
		};
		this.emitSessionStateChange();
	}

	private parseContextUsage(input: unknown): ContextUsageState | null {
		return this.protocolMapper.parseContextUsage(input, this.sessionState.contextUsage);
	}

	private setState(state: AgentStatusState): void {
		this.state = state;
		this.emitSessionStateChange();
	}

	private resetSessionState(): void {
		this.sessionState.reset();
	}

	private emitSessionStateChange(): void {
		for (const listener of this.sessionStateListeners) {
			listener();
		}
	}

	private async cleanup(): Promise<void> {
		console.log('[ACP Adapter] Cleaning up...');

		if (this.connection) {
			console.log('[ACP Adapter] Closing connection...');
			this.connection = null;
		}

		console.log('[ACP Adapter] Killing bridge process...');
		this.transport.cleanup();

		this.connectionPromise = null;
		this.serverCapabilities = [];
		this.authMethods = [];
		this.resetSessionState();
		this.currentHandlers = null;
		this.responseBuffer = [];
		this.thinkingBuffer = [];
		this.onThinkingChunk = undefined;
		this.emitSessionStateChange();

		console.log('[ACP Adapter] Cleanup complete');
	}
}

