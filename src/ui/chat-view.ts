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

import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, Modal, ButtonComponent } from 'obsidian';
import { AgentAdapter, AgentInput, ChatMessage, MessageRole, StreamHandlers, CAPABILITY_LABELS, ToolCall, ToolResult, FileEditMetadata, generateId } from '../core/types';
import { CancellationError } from '../core/errors';
import { logger } from '../core/logger';
import { SessionStore } from '../services/session-store';
import { ToolExecutor, ToolExecutorConfig } from '../services/tool-executor';
import { AgentLinkSettings, getBackendTypeLabel, getActiveBackendConfig } from '../settings/settings';
import { SessionManager, SessionMetadata } from '../services/session-manager';

export const AGENTLINK_VIEW_TYPE = 'agentlink-view';

export class ChatView extends ItemView {
	private adapter: AgentAdapter | null = null;
	private session = new SessionStore();
	private settings: AgentLinkSettings;
	private isBusy = false;
	private sessionManager: SessionManager;
	private currentSessionId: string | null = null;

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
	
	// ── Header DOM references ──────────────────────────────────────────
	private headerEl!: HTMLElement;
	private sessionTitleEl!: HTMLElement;
	private historyBtn!: HTMLButtonElement;
	private newSessionBtn!: HTMLButtonElement;
	private statusLed!: HTMLElement;

	// ── Streaming state ────────────────────────────────────────────────
	private streamingMsgId: string | null = null;
	private streamingEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		settings: AgentLinkSettings,
		onSettingsRead: () => AgentLinkSettings,
		sessionManager: SessionManager,
	) {
		super(leaf);
		this.settings = settings;
		this.onSettingsRead = onSettingsRead;
		this.sessionManager = sessionManager;
		
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
		// Header with compact two-row layout (inspired by Terminal.app)
		this.headerEl = container.createDiv({ cls: 'agentlink-header' });
		
		// Row 1: AgentLink | Status LED + Backend | Actions
		const headerRow1 = this.headerEl.createDiv({ cls: 'agentlink-header-row1' });
		headerRow1.style.display = 'flex';
		headerRow1.style.alignItems = 'center';
		headerRow1.style.justifyContent = 'space-between';
		headerRow1.style.padding = '0.4rem 0.6rem';
		headerRow1.style.borderBottom = '1px solid var(--background-modifier-border)';
		
		// Left: AgentLink brand
		const leftSection = headerRow1.createDiv();
		leftSection.style.display = 'flex';
		leftSection.style.alignItems = 'center';
		leftSection.style.gap = '0.4rem';
		leftSection.createEl('span', { text: '🤖' });
		leftSection.createEl('span', { text: 'AgentLink', cls: 'agentlink-brand' });
		
		// Center: Status LED + Backend name
		const centerSection = headerRow1.createDiv();
		centerSection.style.display = 'flex';
		centerSection.style.alignItems = 'center';
		centerSection.style.gap = '0.4rem';
		
		// Status LED (HDD indicator style)
		this.statusLed = centerSection.createEl('span');
		this.statusLed.style.width = '7px';
		this.statusLed.style.height = '7px';
		this.statusLed.style.borderRadius = '50%';
		this.statusLed.style.background = '#6b7280';
		this.statusLed.style.transition = 'all 0.15s ease';
		
		// Backend name
		this.backendLabel = centerSection.createEl('span');
		this.backendLabel.style.fontSize = '0.85rem';
		this.backendLabel.style.color = 'var(--text-muted)';
		
		// Right: Action buttons (minimal)
		const rightSection = headerRow1.createDiv();
		rightSection.style.display = 'flex';
		rightSection.style.alignItems = 'center';
		rightSection.style.gap = '0.1rem';
		
		// History dropdown button
		const historyContainer = rightSection.createDiv();
		historyContainer.style.position = 'relative';
		this.historyBtn = historyContainer.createEl('button');
		this.historyBtn.innerHTML = '📜';
		this.historyBtn.style.padding = '0.3rem 0.4rem';
		this.historyBtn.style.background = 'transparent';
		this.historyBtn.style.border = 'none';
		this.historyBtn.style.cursor = 'pointer';
		this.historyBtn.style.fontSize = '0.95rem';
		this.historyBtn.style.opacity = '0.7';
		this.historyBtn.addEventListener('mouseenter', () => this.historyBtn.style.opacity = '1');
		this.historyBtn.addEventListener('mouseleave', () => this.historyBtn.style.opacity = '0.7');
		
		const historyDropdown = historyContainer.createDiv();
		historyDropdown.style.display = 'none';
		this.historyBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const isOpen = historyDropdown.style.display !== 'none';
			historyDropdown.style.display = isOpen ? 'none' : 'block';
			if (!isOpen) this.renderHistoryDropdown(historyDropdown);
		});
		document.addEventListener('click', () => historyDropdown.style.display = 'none');
		
		// New chat button
		this.newSessionBtn = rightSection.createEl('button');
		this.newSessionBtn.innerHTML = '💬';
		this.newSessionBtn.style.padding = '0.3rem 0.4rem';
		this.newSessionBtn.style.background = 'transparent';
		this.newSessionBtn.style.border = 'none';
		this.newSessionBtn.style.cursor = 'pointer';
		this.newSessionBtn.style.fontSize = '0.95rem';
		this.newSessionBtn.style.opacity = '0.7';
		this.newSessionBtn.addEventListener('mouseenter', () => this.newSessionBtn.style.opacity = '1');
		this.newSessionBtn.addEventListener('mouseleave', () => this.newSessionBtn.style.opacity = '0.7');
		this.newSessionBtn.addEventListener('click', () => this.createNewSession());
		
		// Clear button
		this.clearBtn = rightSection.createEl('button');
		this.clearBtn.innerHTML = '🗑️';
		this.clearBtn.style.padding = '0.3rem 0.4rem';
		this.clearBtn.style.background = 'transparent';
		this.clearBtn.style.border = 'none';
		this.clearBtn.style.cursor = 'pointer';
		this.clearBtn.style.fontSize = '0.95rem';
		this.clearBtn.style.opacity = '0.7';
		this.clearBtn.addEventListener('mouseenter', () => this.clearBtn.style.opacity = '1');
		this.clearBtn.addEventListener('mouseleave', () => this.clearBtn.style.opacity = '0.7');
		this.clearBtn.addEventListener('click', () => this.clearConversation());
		
		// Row 2: Session title (editable, secondary)
		const headerRow2 = this.headerEl.createDiv();
		headerRow2.style.padding = '0.25rem 0.6rem';
		headerRow2.style.background = 'var(--background-secondary)';
		headerRow2.style.borderBottom = '1px solid var(--background-modifier-border)';
		
		this.sessionTitleEl = headerRow2.createEl('span', { text: 'New Chat' });
		this.sessionTitleEl.style.fontSize = '0.8rem';
		this.sessionTitleEl.style.color = 'var(--text-muted)';
		this.sessionTitleEl.style.cursor = 'pointer';
		this.sessionTitleEl.addEventListener('click', () => this.renameCurrentSession());
		
		// Messages area
		this.messagesEl = container.createDiv({ cls: 'agentlink-messages' });
		this.initializeSession();

		// Input area with buttons on right side
		const inputArea = container.createDiv();
		inputArea.style.display = 'flex';
		inputArea.style.gap = '0.5rem';
		inputArea.style.padding = '0.6rem';
		inputArea.style.borderTop = '1px solid var(--background-modifier-border)';

		this.inputEl = inputArea.createEl('textarea', { placeholder: 'Ask your AI agent…' });
		this.inputEl.style.flex = '1';
		this.inputEl.style.height = '2.8rem';
		this.inputEl.style.minHeight = '2.8rem';
		this.inputEl.style.resize = 'none';
		this.inputEl.style.padding = '0.5rem 0.6rem';
		this.inputEl.style.border = '1px solid var(--background-modifier-border)';
		this.inputEl.style.borderRadius = '6px';
		this.inputEl.style.background = 'var(--background-primary)';
		this.inputEl.style.fontSize = '0.9rem';
		this.inputEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
				evt.preventDefault();
				this.handleSend();
			}
		});

		const btnCol = inputArea.createDiv();
		btnCol.style.display = 'flex';
		btnCol.style.flexDirection = 'column';
		btnCol.style.gap = '0.25rem';

		this.sendBtn = btnCol.createEl('button', { text: 'Send' });
		this.sendBtn.style.padding = '0 0.9rem';
		this.sendBtn.style.height = '1.4rem';
		this.sendBtn.style.background = 'var(--interactive-accent)';
		this.sendBtn.style.color = 'var(--text-on-accent)';
		this.sendBtn.style.border = 'none';
		this.sendBtn.style.borderRadius = '4px';
		this.sendBtn.style.cursor = 'pointer';
		this.sendBtn.style.fontSize = '0.75rem';
		this.sendBtn.addEventListener('click', () => this.handleSend());

		this.stopBtn = btnCol.createEl('button', { text: 'Stop' });
		this.stopBtn.style.padding = '0 0.9rem';
		this.stopBtn.style.height = '1.4rem';
		this.stopBtn.style.background = 'var(--background-modifier-error)';
		this.stopBtn.style.color = 'var(--text-on-accent)';
		this.stopBtn.style.border = 'none';
		this.stopBtn.style.borderRadius = '4px';
		this.stopBtn.style.cursor = 'pointer';
		this.stopBtn.style.fontSize = '0.75rem';
		this.stopBtn.style.display = 'none';
		this.stopBtn.addEventListener('click', () => this.handleStop());

		// Add animation styles
		if (!document.getElementById('agentlink-animations')) {
			const style = document.createElement('style');
			style.id = 'agentlink-animations';
			style.textContent = `
				@keyframes agentlink-led-blink {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.3; }
				}
			`;
			document.head.appendChild(style);
		}

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
				fileContent = await this.app.vault.read(file);
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
		let accumulatedThinking = '';
		let thinkingMsgId: string | null = null;
		let thinkingEl: HTMLElement | null = null;
		let isThinkingVisible = false;

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

		// Options with onThinkingChunk callback
		const options = {
			onThinkingChunk: (text: string) => {
				accumulatedThinking += text;
				
				// Create thinking message on first chunk
				if (!thinkingMsgId) {
					const thinkingMsg = this.session.addMessage('thinking', '');
					thinkingMsgId = thinkingMsg.id;
					// Insert thinking message BEFORE assistant message
					const assistantEl = this.messagesEl.querySelector(`[data-msg-id="${assistantMsg.id}"]`);
					if (assistantEl) {
						const thinkingEl = this.renderMessage(thinkingMsg);
						this.messagesEl.insertBefore(thinkingEl, assistantEl);
					}
					isThinkingVisible = true;
				}
				
				// Update thinking message content with Markdown rendering
				if (thinkingMsgId) {
					this.session.updateMessage(thinkingMsgId, accumulatedThinking);
					const thinkingMsgEl = this.messagesEl.querySelector(`[data-msg-id="${thinkingMsgId}"]`);
					if (thinkingMsgEl) {
						const contentEl = thinkingMsgEl.querySelector('.agentlink-message-content') as HTMLElement;
						if (contentEl) {
							const bodyEl = contentEl.querySelector('.agentlink-thinking-body') as HTMLElement;
							if (bodyEl) {
								bodyEl.empty();
								// Use MarkdownRenderer for thinking content
								MarkdownRenderer.render(this.app, accumulatedThinking, bodyEl, '', this);
							}
						}
					}
				}
				this.scrollToBottom();
			},
		};

		try {
			await this.adapter.sendMessage(input, handlers, options);
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
		} else if (msg.role === 'thinking') {
			// Render thinking content with collapsible styling
			contentEl.addClass('agentlink-thinking-content');
			
			// Create header with toggle
			const header = contentEl.createDiv({ cls: 'agentlink-thinking-header' });
			const title = header.createDiv({ cls: 'agentlink-thinking-title' });
			title.createSpan({ cls: 'agentlink-thinking-icon', text: '💭' });
			title.createSpan({ text: 'Thinking' });
			
			// Show time if available (stored in metadata or calculate from timestamp)
			header.createSpan({ cls: 'agentlink-thinking-time', text: 'Thought process' });
			
			const toggle = header.createSpan({ cls: 'agentlink-thinking-toggle', text: '▼' });
			
			// Create body with content - use MarkdownRenderer
			const body = contentEl.createDiv({ cls: 'agentlink-thinking-body' });
			// Use MarkdownRenderer for thinking content
			MarkdownRenderer.render(this.app, msg.content, body, '', this);
			
			// Collapse/expand functionality
			header.addEventListener('click', () => {
				const isCollapsed = contentEl.hasClass('agentlink-thinking-collapsed');
				contentEl.toggleClass('agentlink-thinking-collapsed', !isCollapsed);
				toggle.setText(isCollapsed ? '▼' : '▶');
			});
			
			// Start collapsed if content is long
			if (msg.content.length > 300) {
				contentEl.addClass('agentlink-thinking-collapsed');
				toggle.setText('▶');
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
			case 'thinking':
				return '💭 Thinking';
			default:
				return 'Unknown';
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
		
		// Update status LED to yellow blinking when generating
		if (this.statusLed) {
			if (busy) {
				this.statusLed.style.background = '#fbbf24';
				this.statusLed.style.animation = 'agentlink-led-blink 0.6s ease-in-out infinite';
				this.statusLed.style.boxShadow = '0 0 4px #fbbf24';
			} else {
				// Reset to connection state
				this.refreshStatus();
			}
		}
	}

	private refreshStatus(): void {
		if (!this.backendLabel || !this.statusLed) return;

		const activeBackend = getActiveBackendConfig(this.settings);
		const statusState = this.adapter?.getStatus().state ?? 'disconnected';
		const backendName = activeBackend?.name ?? 'None';

		this.backendLabel.setText(backendName);
		
		// Update LED color based on connection state
		if (statusState === 'connected') {
			this.statusLed.style.background = '#4ade80';
			this.statusLed.style.animation = 'none';
			this.statusLed.style.boxShadow = '0 0 3px #4ade80';
		} else if (statusState === 'disconnected') {
			this.statusLed.style.background = '#f87171';
			this.statusLed.style.animation = 'none';
			this.statusLed.style.boxShadow = '0 0 3px #f87171';
		} else {
			this.statusLed.style.background = '#6b7280';
			this.statusLed.style.animation = 'none';
			this.statusLed.style.boxShadow = 'none';
		}
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

	// ── Session Management ───────────────────────────────────────────────

	/** Initialize session on open - load existing or create new */
	private initializeSession(): void {
		// Try to get current session from manager
		const currentSession = this.sessionManager.getCurrentSession();
		if (currentSession && currentSession.messages.length > 0) {
			this.loadSession(currentSession.id);
		} else {
			// Create new session
			this.createNewSession();
		}
	}

	/** Create a new session */
	private createNewSession(): void {
		// Prevent creating duplicate empty sessions
		if (this.currentSessionId) {
			const currentSession = this.sessionManager.getSession(this.currentSessionId);
			if (currentSession && currentSession.messages.length === 0) {
				// Current session is already empty, just focus it
				this.inputEl?.focus();
				return;
			}
		}
		
		const session = this.sessionManager.createSession();
		this.currentSessionId = session.id;
		this.session.clear();
		this.messagesEl.empty();
		this.renderWelcome();
		this.updateSessionTitle(session.title);
		this.refreshStatus();
		this.inputEl?.focus();
	}

	/** Load a session by ID */
	private loadSession(sessionId: string): void {
		const session = this.sessionManager.getSession(sessionId);
		if (!session) return;

		this.currentSessionId = sessionId;
		this.sessionManager.setCurrentSession(sessionId);
		this.session.clear();
		this.messagesEl.empty();

		// Load messages
		for (const msg of session.messages) {
			this.session.addMessage(msg.role, msg.content, msg.metadata);
			this.renderMessage(msg);
		}

		this.updateSessionTitle(session.title);
		this.refreshStatus();
	}

	/** Update the session title in UI */
	private updateSessionTitle(title: string): void {
		if (this.sessionTitleEl) {
			this.sessionTitleEl.setText(title);
		}
	}

	/** Rename current session */
	private async renameCurrentSession(): Promise<void> {
		if (!this.currentSessionId) return;

		const currentTitle = this.sessionTitleEl.getText();
		const newTitle = await this.promptForTitle(currentTitle);
		
		if (newTitle && newTitle !== currentTitle) {
			await this.sessionManager.renameSession(this.currentSessionId, newTitle);
			this.updateSessionTitle(newTitle);
			new Notice('Session renamed');
		}
	}

	/** Prompt user for session title */
	private promptForTitle(currentTitle: string): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('Rename Session');
			
			const inputContainer = modal.contentEl.createDiv();
			const input = inputContainer.createEl('input', {
				type: 'text',
				value: currentTitle,
				cls: 'agentlink-rename-input',
			});
			input.style.width = '100%';
			input.focus();
			input.select();
			
			const btnContainer = modal.contentEl.createDiv({ cls: 'agentlink-modal-buttons' });
			btnContainer.style.display = 'flex';
			btnContainer.style.gap = '0.5em';
			btnContainer.style.marginTop = '1em';
			btnContainer.style.justifyContent = 'flex-end';
			
			new ButtonComponent(btnContainer)
				.setButtonText('Cancel')
				.onClick(() => {
					modal.close();
					resolve(null);
				});
			
			new ButtonComponent(btnContainer)
				.setButtonText('Save')
				.setCta()
				.onClick(() => {
					const result = input.value.trim();
					modal.close();
					resolve(result);
				});
			
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					const result = input.value.trim();
					modal.close();
					resolve(result);
				} else if (e.key === 'Escape') {
					modal.close();
					resolve(null);
				}
			});
			
			modal.open();
		});
	}

	/** Open session list modal */
	private openSessionList(): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText('Chat History');
		modal.contentEl.addClass('agentlink-session-list-modal');
		
		const sessions = this.sessionManager.getAllSessions();
		
		if (sessions.length === 0) {
			modal.contentEl.createEl('p', { 
				text: 'No chat history yet.',
				cls: 'agentlink-empty-state'
			});
		} else {
			const listContainer = modal.contentEl.createDiv({ cls: 'agentlink-session-list' });
			
			for (const session of sessions) {
				this.renderSessionListItem(listContainer, session, modal);
			}
		}
		
		// Add "New Chat" button at bottom
		const footer = modal.contentEl.createDiv({ cls: 'agentlink-modal-footer' });
		footer.style.marginTop = '1em';
		footer.style.paddingTop = '1em';
		footer.style.borderTop = '1px solid var(--background-modifier-border)';
		
		new ButtonComponent(footer)
			.setButtonText('+ New Chat')
			.setCta()
			.onClick(() => {
				modal.close();
				this.createNewSession();
			});
		
		modal.open();
	}

	/** Render inline history dropdown */
	private renderHistoryDropdown(container: HTMLElement): void {
		const sessions = this.sessionManager.getAllSessions();

		container.empty();
		container.style.display = 'block';
		container.style.position = 'absolute';
		container.style.top = '100%';
		container.style.right = '0';
		container.style.zIndex = '1000';
		container.style.minWidth = '280px';
		container.style.maxWidth = '360px';
		container.style.maxHeight = '320px';
		container.style.overflowY = 'auto';
		container.style.padding = '0.5rem';
		container.style.background = 'var(--background-primary)';
		container.style.border = '1px solid var(--background-modifier-border)';
		container.style.borderRadius = '8px';
		container.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.18)';

		// New Chat button
		const newChatBtn = container.createEl('button', { text: '+ New Chat' });
		newChatBtn.style.width = '100%';
		newChatBtn.style.display = 'block';
		newChatBtn.style.padding = '0.6rem 0.75rem';
		newChatBtn.style.marginBottom = '0.5rem';
		newChatBtn.style.border = 'none';
		newChatBtn.style.borderRadius = '6px';
		newChatBtn.style.background = 'var(--interactive-accent)';
		newChatBtn.style.color = 'var(--text-on-accent)';
		newChatBtn.style.textAlign = 'left';
		newChatBtn.style.cursor = 'pointer';
		newChatBtn.style.fontWeight = '600';
		newChatBtn.addEventListener('click', () => {
			container.style.display = 'none';
			this.createNewSession();
		});

		if (sessions.length === 0) {
			const empty = container.createEl('div', { text: 'No history' });
			empty.style.padding = '0.75rem';
			empty.style.color = 'var(--text-muted)';
			empty.style.fontSize = '0.9rem';
			return;
		}

		// Session list
		for (const session of sessions) {
			const item = container.createEl('button');
			item.type = 'button';
			item.style.width = '100%';
			item.style.display = 'block';
			item.style.padding = '0.65rem 0.75rem';
			item.style.marginBottom = '0.35rem';
			item.style.border = '1px solid var(--background-modifier-border)';
			item.style.borderRadius = '6px';
			item.style.background = session.id === this.currentSessionId
				? 'var(--background-modifier-hover)'
				: 'transparent';
			item.style.color = 'var(--text-normal)';
			item.style.textAlign = 'left';
			item.style.cursor = 'pointer';

			const title = item.createEl('div', { text: session.title });
			title.style.fontWeight = '600';
			title.style.marginBottom = '0.15rem';

			const date = new Date(session.updatedAt).toLocaleString();
			const meta = item.createEl('div', {
				text: `${date} • ${session.messageCount} messages`,
			});
			meta.style.fontSize = '0.85rem';
			meta.style.color = 'var(--text-muted)';

			item.addEventListener('click', () => {
				this.loadSession(session.id);
				container.style.display = 'none';
			});
		}
	}

	/** Render a session list item */
	private renderSessionListItem(
		container: HTMLElement, 
		session: SessionMetadata, 
		modal: Modal
	): void {
		const item = container.createDiv({ 
			cls: `agentlink-session-item ${session.id === this.currentSessionId ? 'is-active' : ''}`
		});
		
		// Title and meta
		const info = item.createDiv({ cls: 'agentlink-session-item-info' });
		info.createEl('div', { 
			text: session.title,
			cls: 'agentlink-session-item-title'
		});
		
		const date = new Date(session.updatedAt).toLocaleString();
		info.createEl('div', { 
			text: `${date} • ${session.messageCount} messages`,
			cls: 'agentlink-session-item-meta'
		});
		
		// Actions
		const actions = item.createDiv({ cls: 'agentlink-session-item-actions' });
		
		// Load button
		new ButtonComponent(actions)
			.setButtonText(session.id === this.currentSessionId ? 'Current' : 'Load')
			.setDisabled(session.id === this.currentSessionId)
			.onClick(() => {
				modal.close();
				this.loadSession(session.id);
				new Notice('Session loaded');
			});
		
		// Delete button
		new ButtonComponent(actions)
			.setButtonText('Delete')
			.setWarning()
			.onClick(async () => {
				const confirmed = await this.confirmDelete(session.title);
				if (confirmed) {
					await this.sessionManager.deleteSession(session.id);
					if (session.id === this.currentSessionId) {
						this.createNewSession();
					}
					modal.close();
					new Notice('Session deleted');
					// Reopen modal to refresh list
					this.openSessionList();
				}
			});
	}

	/** Confirm deletion */
	private confirmDelete(title: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('Delete Session');
			
			modal.contentEl.createEl('p', {
				text: `Are you sure you want to delete "${title}"? This cannot be undone.`
			});
			
			const btnContainer = modal.contentEl.createDiv({ cls: 'agentlink-modal-buttons' });
			btnContainer.style.display = 'flex';
			btnContainer.style.gap = '0.5em';
			btnContainer.style.marginTop = '1em';
			btnContainer.style.justifyContent = 'flex-end';
			
			new ButtonComponent(btnContainer)
				.setButtonText('Cancel')
				.onClick(() => {
					modal.close();
					resolve(false);
				});
			
			new ButtonComponent(btnContainer)
				.setButtonText('Delete')
				.setWarning()
				.onClick(() => {
					modal.close();
					resolve(true);
				});
			
			modal.open();
		});
	}

	/** Save current session */
	private async saveCurrentSession(): Promise<void> {
		if (this.currentSessionId) {
			const backend = getActiveBackendConfig(this.settings);
			await this.sessionManager.updateSession(
				this.currentSessionId,
				this.session.getMessages(),
				backend?.id
			);
		}
	}
}
