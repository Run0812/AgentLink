/* ────────────────────────────────────────────────────────────────────────
 * ChatView — the main sidebar panel for interacting with agents.
 *
 * Responsibilities:
 *   - Render message list (user, assistant, system, error, status)
 *   - Text input + send / stop / clear buttons
 *   - Stream assistant chunks in real-time
 *   - Display adapter status
 *   - Wire up to a SessionStore for history
 * ──────────────────────────────────────────────────────────────────────── */

import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import { AgentAdapter, AgentInput, ChatMessage, MessageRole, StreamHandlers, CAPABILITY_LABELS, ToolCall, ToolResult, FileEditMetadata } from '../core/types';
import { CancellationError } from '../core/errors';
import { logger } from '../core/logger';
import { SessionStore } from '../services/session-store';
import { ToolExecutor, ToolExecutorConfig } from '../services/tool-executor';
import { AgentLinkSettings, getBackendTypeLabel, getActiveBackendConfig } from '../settings/settings';

export const AGENTLINK_VIEW_TYPE = 'agentlink-view';

export class ChatView extends ItemView {
	private adapter: AgentAdapter | null = null;
	private session = new SessionStore();
	private settings: AgentLinkSettings;
	private isBusy = false;

	// Maximum number of recent messages to include as conversation context
	private static readonly MAX_CONTEXT_MESSAGES = 20;

	// ── Saved callbacks so we can call plugin methods ──────────────────
	private onSettingsRead: () => AgentLinkSettings;

	// ── Tool Executor ──────────────────────────────────────────────────
	private toolExecutor: ToolExecutor;

	// ── DOM references ─────────────────────────────────────────────────
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private stopBtn!: HTMLButtonElement;
	private clearBtn!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	private backendLabel!: HTMLElement;

	// ── Streaming state ────────────────────────────────────────────────
	private streamingMsgId: string | null = null;
	private streamingEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		settings: AgentLinkSettings,
		onSettingsRead: () => AgentLinkSettings,
	) {
		super(leaf);
		this.settings = settings;
		this.onSettingsRead = onSettingsRead;
		
		// Initialize ToolExecutor with default config
		const toolConfig: ToolExecutorConfig = {
			workspaceRoot: '', // Will be updated when needed
			autoConfirmRead: settings.autoConfirmRead,
			autoConfirmEdit: settings.autoConfirmEdit,
		};
		this.toolExecutor = new ToolExecutor(this.app, toolConfig);
	}

	getViewType(): string {
		return AGENTLINK_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'AgentLink';
	}

	getIcon(): string {
		return 'bot';
	}

	/** Called by the plugin when settings change. */
	setAdapter(adapter: AgentAdapter): void {
		this.adapter = adapter;
		this.refreshStatus();
	}

	refreshSettings(): void {
		this.settings = this.onSettingsRead();
		this.refreshStatus();
		
		// Update ToolExecutor config
		this.toolExecutor.updateConfig({
			autoConfirmRead: this.settings.autoConfirmRead,
			autoConfirmEdit: this.settings.autoConfirmEdit,
		});
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('agentlink-container');
		this.buildUI(container);
	}

	async onClose(): Promise<void> {
		if (this.adapter) {
			try {
				await this.adapter.disconnect();
			} catch {
				// ignore
			}
		}
	}

	// ── Public API for commands ─────────────────────────────────────────

	prefillInput(text: string): void {
		if (this.inputEl) {
			this.inputEl.value = text;
			this.inputEl.focus();
		}
	}

	setIncludeFile(_value: boolean): void {
		// Reserved for future context inclusion UI
	}

	// ── UI construction ────────────────────────────────────────────────

	private buildUI(container: HTMLElement): void {
		// Header
		const header = container.createDiv({ cls: 'agentlink-header' });
		header.createEl('span', { cls: 'agentlink-title', text: 'AgentLink' });

		const controls = header.createDiv({ cls: 'agentlink-header-controls' });

		this.backendLabel = controls.createEl('span', {
			cls: 'agentlink-backend-label',
		});

		this.clearBtn = controls.createEl('button', {
			cls: 'agentlink-clear-btn',
			text: 'Clear',
		});
		this.clearBtn.setAttribute('aria-label', 'Clear conversation');
		this.clearBtn.addEventListener('click', () => this.clearConversation());

		// Messages area
		this.messagesEl = container.createDiv({ cls: 'agentlink-messages' });
		this.renderWelcome();

		// Input area
		const inputArea = container.createDiv({ cls: 'agentlink-input-area' });

		this.inputEl = inputArea.createEl('textarea', {
			cls: 'agentlink-input',
			placeholder: 'Ask your AI agent…',
		});
		this.inputEl.rows = 3;
		this.inputEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
				evt.preventDefault();
				this.handleSend();
			}
		});

		const btnGroup = inputArea.createDiv({ cls: 'agentlink-btn-group' });

		this.sendBtn = btnGroup.createEl('button', {
			cls: 'agentlink-send-btn',
			text: 'Send',
		});
		this.sendBtn.setAttribute('aria-label', 'Send message (Ctrl+Enter)');
		this.sendBtn.addEventListener('click', () => this.handleSend());

		this.stopBtn = btnGroup.createEl('button', {
			cls: 'agentlink-stop-btn',
			text: 'Stop',
		});
		this.stopBtn.setAttribute('aria-label', 'Stop generation');
		this.stopBtn.style.display = 'none';
		this.stopBtn.addEventListener('click', () => this.handleStop());

		// Status bar
		this.statusEl = container.createDiv({ cls: 'agentlink-status' });

		this.refreshStatus();
	}

	// ── Message sending ────────────────────────────────────────────────

	private async handleSend(): Promise<void> {
		const prompt = this.inputEl.value.trim();
		if (!prompt || this.isBusy) return;

		if (!this.adapter) {
			new Notice('AgentLink: No backend adapter configured.');
			return;
		}

		// Add user message
		const userMsg = this.session.addMessage('user', prompt);
		this.renderMessage(userMsg);
		this.inputEl.value = '';

		// Show busy state
		this.setBusy(true);

		// Prepare assistant message placeholder
		const assistantMsg = this.session.addMessage('assistant', '');
		this.streamingMsgId = assistantMsg.id;
		const assistantEl = this.renderMessage(assistantMsg);
		this.streamingEl = assistantEl.querySelector('.agentlink-message-content') as HTMLElement;

		// Gather context
		let fileContent: string | undefined;
		let selectedText: string | undefined;

		const editor = this.app.workspace.activeEditor?.editor;
		if (editor) {
			const sel = editor.getSelection();
			if (sel) selectedText = sel;
		}
		if (!selectedText) {
			const file = this.app.workspace.getActiveFile();
			if (file) {
				try {
					const raw = await this.app.vault.read(file);
					fileContent = raw.slice(0, this.settings.maxContextLength);
				} catch {
					// ignore
				}
			}
		}

		const input: AgentInput = {
			prompt,
			context: { fileContent, selectedText },
			history: this.session.getRecentMessages(ChatView.MAX_CONTEXT_MESSAGES).slice(0, -1), // exclude the just-added placeholder
		};

		let accumulated = '';

		const handlers: StreamHandlers = {
			onChunk: (chunk: string) => {
				accumulated += chunk;
				if (this.streamingEl) {
					this.renderAssistantContent(this.streamingEl, accumulated);
				}
				this.session.updateMessage(assistantMsg.id, accumulated);
				this.scrollToBottom();
			},
			onComplete: (fullText: string) => {
				this.session.updateMessage(assistantMsg.id, fullText);
				if (this.streamingEl) {
					this.renderAssistantContent(this.streamingEl, fullText);
				}
				this.finishStreaming();
			},
			onError: (error: Error) => {
				if (error instanceof CancellationError) {
					// Mark partial response
					const partial = accumulated || '(cancelled)';
					this.session.updateMessage(assistantMsg.id, partial);
					if (this.streamingEl) {
						this.renderAssistantContent(this.streamingEl, partial);
					}
					this.appendStatusMessage('Generation stopped by user.');
				} else {
					// Show error message
					this.session.addMessage('error', error.message);
					this.renderInlineError(error.message);
				}
				this.finishStreaming();
			},
		};

		try {
			await this.adapter.sendMessage(input, handlers);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.session.addMessage('error', msg);
			this.renderInlineError(msg);
			this.finishStreaming();
		}
	}

	private async handleStop(): Promise<void> {
		if (this.adapter) {
			logger.debug('ChatView: user requested stop');
			try {
				await this.adapter.cancel();
			} catch (err) {
				logger.error('ChatView: cancel failed', err);
			}
		}
	}

	private finishStreaming(): void {
		this.streamingMsgId = null;
		this.streamingEl = null;
		this.setBusy(false);
		this.scrollToBottom();
	}

	// ── Rendering helpers ──────────────────────────────────────────────

	private renderWelcome(): void {
		const w = this.messagesEl.createDiv({ cls: 'agentlink-welcome' });
		w.createEl('p', {
			text: 'Welcome to AgentLink! Configure a backend in settings, then start chatting.',
		});
		w.createEl('p', {
			cls: 'agentlink-welcome-hint',
			text: 'Tip: Press Ctrl+Enter to send. Use "mock" backend for testing.',
		});
	}

	private renderMessage(msg: ChatMessage): HTMLElement {
		// Remove welcome on first message
		const welcome = this.messagesEl.querySelector('.agentlink-welcome');
		if (welcome) welcome.remove();

		const el = this.messagesEl.createDiv({
			cls: `agentlink-message agentlink-message-${msg.role}`,
		});
		el.dataset.msgId = msg.id;

		// Header row with role and copy button
		const headerEl = el.createDiv({ cls: 'agentlink-message-header' });
		
		const roleEl = headerEl.createDiv({ cls: 'agentlink-message-role' });
		roleEl.setText(this.roleLabel(msg.role));

		// Add copy button for user and assistant messages
		if (msg.role === 'user' || msg.role === 'assistant') {
			const copyBtn = headerEl.createEl('button', {
				cls: 'agentlink-copy-btn',
				attr: { 'aria-label': 'Copy message', title: 'Copy message' },
			});
			copyBtn.innerHTML = '📋';
			copyBtn.addEventListener('click', () => this.copyMessageContent(msg));
		}

		const contentEl = el.createDiv({ cls: 'agentlink-message-content' });

		if (msg.role === 'assistant') {
			if (msg.content) {
				this.renderAssistantContent(contentEl, msg.content);
			}
		} else if (msg.role === 'error') {
			contentEl.addClass('agentlink-error-content');
			contentEl.setText(msg.content);
		} else if (msg.role === 'status') {
			contentEl.addClass('agentlink-status-content');
			contentEl.setText(msg.content);
		} else if (msg.role === 'tool_call') {
			// Render tool call with special styling
			contentEl.addClass('agentlink-tool-call-content');
			this.renderToolCallContent(contentEl, msg);
		} else if (msg.role === 'file_edit') {
			// Render file edit with special styling
			contentEl.addClass('agentlink-file-edit-content');
			this.renderFileEditContent(contentEl, msg);
		} else {
			contentEl.createEl('p', { text: msg.content });
		}

		this.scrollToBottom();
		return el;
	}

	private async copyMessageContent(msg: ChatMessage): Promise<void> {
		try {
			await navigator.clipboard.writeText(msg.content);
			new Notice('Message copied to clipboard');
		} catch (err) {
			logger.error('Failed to copy message:', err);
			new Notice('Failed to copy message');
		}
	}

	private renderAssistantContent(el: HTMLElement, content: string): void {
		el.empty();
		MarkdownRenderer.render(this.app, content, el, '', this);
	}

	private renderInlineError(message: string): void {
		const el = this.messagesEl.createDiv({ cls: 'agentlink-error' });
		el.createEl('strong', { text: 'Error: ' });
		el.createSpan({ text: message });
		this.scrollToBottom();
	}

	private appendStatusMessage(text: string): void {
		const el = this.messagesEl.createDiv({ cls: 'agentlink-status-msg' });
		el.setText(text);
		this.scrollToBottom();
	}

	private roleLabel(role: MessageRole): string {
		switch (role) {
			case 'user':
				return 'You';
			case 'assistant':
				return this.adapter?.label ?? 'Agent';
			case 'system':
				return 'System';
			case 'error':
				return 'Error';
			case 'status':
				return 'Status';
			case 'tool_call':
				return '🛠️ Tool Call';
			case 'file_edit':
				return '📝 File Edit';
		}
	}

	private clearConversation(): void {
		this.session.clear();
		this.messagesEl.empty();
		this.renderWelcome();
		this.statusEl.setText('');
	}

	private setBusy(busy: boolean): void {
		this.isBusy = busy;
		this.sendBtn.disabled = busy;
		this.sendBtn.style.display = busy ? 'none' : '';
		this.stopBtn.style.display = busy ? '' : 'none';
		this.statusEl.setText(busy ? 'Generating…' : '');
		if (busy) {
			this.statusEl.addClass('agentlink-status-loading');
		} else {
			this.statusEl.removeClass('agentlink-status-loading');
		}
		this.refreshStatus();
	}

	private refreshStatus(): void {
		if (!this.backendLabel) return;

		const activeBackend = getActiveBackendConfig(this.settings);
		const adapterLabel = this.adapter?.label ?? 'None';
		const statusState = this.adapter?.getStatus().state ?? 'disconnected';
		const capabilities = this.adapter?.getCapabilities() ?? [];
		const capsText = capabilities.length > 0
			? ` [${capabilities.map(c => CAPABILITY_LABELS[c]).join(', ')}]`
			: '';

		const backendName = activeBackend?.name ?? 'None';
		const backendType = activeBackend ? getBackendTypeLabel(activeBackend.type) : '';

		this.backendLabel.setText(`${backendName} (${backendType}) - ${statusState}${capsText}`);
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	// ── Tool Call & File Edit Rendering ──────────────────────────────────

	private renderToolCallContent(el: HTMLElement, msg: ChatMessage): void {
		el.empty();

		const header = el.createDiv({ cls: 'agentlink-tool-header' });
		header.createEl('span', { cls: 'agentlink-tool-icon', text: '🛠️' });

		if (msg.metadata && 'toolCallId' in msg.metadata) {
			const meta = msg.metadata;
			header.createEl('span', {
				cls: 'agentlink-tool-name',
				text: `${meta.tool}`,
			});

			// Status badge
			const statusBadge = header.createEl('span', {
				cls: `agentlink-tool-status agentlink-tool-status-${meta.status}`,
				text: meta.status,
			});

			// Parameters
			const paramsEl = el.createDiv({ cls: 'agentlink-tool-params' });
			paramsEl.createEl('code', {
				text: JSON.stringify(meta.params, null, 2),
				cls: 'agentlink-tool-params-code',
			});

			// Result if available
			if (meta.result) {
				const resultEl = el.createDiv({ cls: 'agentlink-tool-result' });
				resultEl.createEl('strong', { text: 'Result:' });
				resultEl.createEl('pre', {
					text: meta.result.content,
					cls: 'agentlink-tool-result-content',
				});
			}

			// Action buttons for pending calls
			if (meta.status === 'pending') {
				const actionsEl = el.createDiv({ cls: 'agentlink-tool-actions' });
				const confirmBtn = actionsEl.createEl('button', {
					text: 'Confirm',
					cls: 'agentlink-btn-confirm',
				});
				const rejectBtn = actionsEl.createEl('button', {
					text: 'Reject',
					cls: 'agentlink-btn-reject',
				});

				confirmBtn.addEventListener('click', () => this.handleToolConfirm(msg.id));
				rejectBtn.addEventListener('click', () => this.handleToolReject(msg.id));
			}
		} else {
			// Fallback for messages without metadata
			el.createEl('p', { text: msg.content });
		}
	}

	private renderFileEditContent(el: HTMLElement, msg: ChatMessage): void {
		el.empty();

		const header = el.createDiv({ cls: 'agentlink-file-edit-header' });
		header.createEl('span', { cls: 'agentlink-file-edit-icon', text: '📝' });

		if (msg.metadata && 'path' in msg.metadata) {
			const meta = msg.metadata;
			header.createEl('span', {
				cls: 'agentlink-file-edit-path',
				text: meta.path,
			});

			// Status badge
			const statusBadge = header.createEl('span', {
				cls: `agentlink-file-edit-status agentlink-file-edit-status-${meta.status}`,
				text: meta.status,
			});

			// Diff view
			const diffEl = el.createDiv({ cls: 'agentlink-file-diff' });

			if (meta.original) {
				const originalEl = diffEl.createDiv({ cls: 'agentlink-diff-original' });
				originalEl.createEl('strong', { text: 'Original:' });
				originalEl.createEl('pre', {
					text: meta.original,
					cls: 'agentlink-diff-code',
				});
			}

			const modifiedEl = diffEl.createDiv({ cls: 'agentlink-diff-modified' });
			modifiedEl.createEl('strong', { text: 'Modified:' });
			modifiedEl.createEl('pre', {
				text: meta.modified,
				cls: 'agentlink-diff-code',
			});

			// Action buttons for pending edits
			if (meta.status === 'pending') {
				const actionsEl = el.createDiv({ cls: 'agentlink-file-edit-actions' });
				const confirmBtn = actionsEl.createEl('button', {
					text: 'Apply Changes',
					cls: 'agentlink-btn-confirm',
				});
				const rejectBtn = actionsEl.createEl('button', {
					text: 'Discard',
					cls: 'agentlink-btn-reject',
				});

				confirmBtn.addEventListener('click', () => this.handleFileEditConfirm(msg.id));
				rejectBtn.addEventListener('click', () => this.handleFileEditReject(msg.id));
			}
		} else {
			// Fallback for messages without metadata
			el.createEl('p', { text: msg.content });
		}
	}

	// ── Tool Call & File Edit Handlers ───────────────────────────────────

	private async handleToolConfirm(msgId: string): Promise<void> {
		logger.debug('ChatView: tool call confirmed', msgId);
		
		const msg = this.session.getMessages().find(m => m.id === msgId);
		if (!msg || !msg.metadata || !('toolCallId' in msg.metadata)) {
			logger.error('ChatView: tool call message not found or invalid', msgId);
			return;
		}

		const meta = msg.metadata;
		const toolCall: ToolCall = {
			id: meta.toolCallId,
			tool: meta.tool,
			params: meta.params,
		};

		// Update UI to show executing state
		this.session.updateMessageMetadata(msgId, { ...meta, status: 'executing' });
		this.rerenderMessage(msgId);

		// Execute the tool
		const result = await this.toolExecutor.execute(toolCall);

		// Update with result
		this.session.updateMessageMetadata(msgId, { ...meta, status: result.success ? 'completed' : 'error', result });
		this.rerenderMessage(msgId);

		// If successful, add the result to the session for context
		if (result.success) {
			this.session.addWorkspaceFile(meta.params.path as string);
		}

		// Send result back to agent for continuation
		await this.sendToolResultToAgent(toolCall, result);
	}

	private async sendToolResultToAgent(toolCall: ToolCall, result: ToolResult): Promise<void> {
		if (!this.adapter) {
			logger.warn('ChatView: no adapter to send tool result');
			return;
		}

		// Check if adapter supports executeTool (for direct tool execution)
		if (this.adapter.executeTool) {
			// Some adapters handle tool execution internally
			// We've already executed it, so we just notify the user
			logger.debug('ChatView: tool result available for agent', toolCall.id);
		}

		// For adapters that expect the tool result in the next message
		// We add a system message with the result that will be included in context
		const resultContent = typeof result.content === 'string' 
			? result.content 
			: JSON.stringify(result.content);
		
		const contextMsg = `Tool "${toolCall.tool}" result:\n${resultContent}`;
		
		// Add as a system message to be included in context
		this.session.addMessage('system', contextMsg);
		
		// Show notification
		new Notice(`Tool ${toolCall.tool} ${result.success ? 'completed' : 'failed'}`);
	}

	private rerenderMessage(msgId: string): void {
		const msgEl = this.messagesEl.querySelector(`[data-msg-id="${msgId}"]`);
		if (!msgEl) return;

		const msg = this.session.getMessages().find(m => m.id === msgId);
		if (!msg) return;

		const contentEl = msgEl.querySelector('.agentlink-message-content') as HTMLElement;
		if (!contentEl) return;

		if (msg.role === 'tool_call') {
			this.renderToolCallContent(contentEl, msg);
		} else if (msg.role === 'file_edit') {
			this.renderFileEditContent(contentEl, msg);
		}
	}

	private async handleToolReject(msgId: string): Promise<void> {
		logger.debug('ChatView: tool call rejected', msgId);
		this.session.updateMessageMetadata(msgId, {
			toolCallId: msgId,
			tool: 'unknown',
			params: {},
			status: 'rejected',
		});
		// Re-render the message
		const msgEl = this.messagesEl.querySelector(`[data-msg-id="${msgId}"]`);
		if (msgEl) {
			const contentEl = msgEl.querySelector('.agentlink-message-content') as HTMLElement;
			const msg = this.session.getMessages().find(m => m.id === msgId);
			if (msg && contentEl) {
				this.renderToolCallContent(contentEl, msg);
			}
		}
	}

	private async handleFileEditConfirm(msgId: string): Promise<void> {
		logger.debug('ChatView: file edit confirmed', msgId);
		
		const msg = this.session.getMessages().find(m => m.id === msgId);
		if (!msg || !msg.metadata || !('path' in msg.metadata)) {
			logger.error('ChatView: file edit message not found or invalid', msgId);
			return;
		}

		const meta = msg.metadata as FileEditMetadata;
		const { path, original, modified } = meta;

		// Update UI to show executing state
		this.session.updateMessageMetadata(msgId, { path, original, modified, status: 'executing' } as FileEditMetadata);
		this.rerenderMessage(msgId);

		// Use write_file tool to apply the changes
		const toolCall: ToolCall = {
			id: `edit_${Date.now()}`,
			tool: 'write_file',
			params: { path, content: modified },
		};

		const result = await this.toolExecutor.execute(toolCall);

		// Update with result
		const newStatus = result.success ? 'confirmed' : 'error';
		this.session.updateMessageMetadata(msgId, { path, original, modified, status: newStatus } as FileEditMetadata);
		this.rerenderMessage(msgId);

		if (result.success) {
			new Notice(`File changes applied to ${path}`);
			
			// Add system message about the edit
			this.session.addMessage('system', `File edited: ${path}`);
		} else {
			new Notice(`Failed to apply changes: ${result.content}`);
		}
	}

	private async handleFileEditReject(msgId: string): Promise<void> {
		logger.debug('ChatView: file edit rejected', msgId);
		
		const msg = this.session.getMessages().find(m => m.id === msgId);
		if (!msg || !msg.metadata || !('path' in msg.metadata)) {
			logger.error('ChatView: file edit message not found or invalid', msgId);
			return;
		}

		const meta = msg.metadata as FileEditMetadata;
		this.session.updateMessageMetadata(msgId, {
			path: meta.path,
			original: meta.original,
			modified: meta.modified,
			status: 'rejected',
		});
		
		// Re-render the message
		const msgEl = this.messagesEl.querySelector(`[data-msg-id="${msgId}"]`);
		if (msgEl) {
			const contentEl = msgEl.querySelector('.agentlink-message-content') as HTMLElement;
			if (contentEl) {
				this.renderFileEditContent(contentEl, msg);
			}
		}
	}
}
