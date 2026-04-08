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
import { AgentAdapter, AgentInput, ChatMessage, MessageRole, StreamHandlers, CAPABILITY_LABELS, ToolCall, ToolResult, FileEditMetadata, generateId, SessionConfigState, ConfigOption, ConfigOptionValue } from '../core/types';
import { h, render } from 'preact';
import { ConfigToolbar } from './components/config-toolbar';
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
	private onSettingsSave: () => Promise<void>;

	// ── Tool Executor ──────────────────────────────────────────────────
	private toolExecutor: ToolExecutor;

	// ── DOM references ─────────────────────────────────────────────────
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private stopBtn!: HTMLButtonElement;
	private clearBtn!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	
	// ── Header DOM references ──────────────────────────────────────────
	private headerEl!: HTMLElement;
	private sessionTitleEl!: HTMLElement;
	private historyBtn!: HTMLButtonElement;
	private newSessionBtn!: HTMLButtonElement;
	private statusLed!: HTMLElement;
	private agentSelectorBtn!: HTMLButtonElement; // Agent 选择按钮
	private modelSelectorBtn!: HTMLButtonElement; // 模型选择按钮
	private quickConfigBtn!: HTMLButtonElement; // 快捷配置按钮

	// ── Streaming state ────────────────────────────────────────────────
	private streamingMsgId: string | null = null;
	private streamingEl: HTMLElement | null = null;

	// ── ACP Session Config ───────────────────────────────────────────────
	private sessionConfig: SessionConfigState = { configOptions: [] };
	private configButtonsContainer!: HTMLElement;

	constructor(
		leaf: WorkspaceLeaf,
		settings: AgentLinkSettings,
		onSettingsRead: () => AgentLinkSettings,
		onSettingsSave: () => Promise<void>,
		sessionManager: SessionManager,
	) {
		super(leaf);
		this.settings = settings;
		this.onSettingsRead = onSettingsRead;
		this.onSettingsSave = onSettingsSave;
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
		void this.loadConfigOptions();
	}

	refreshSettings(): void {
		this.settings = this.onSettingsRead();
		this.refreshStatus();
		void this.loadConfigOptions();
		
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
		if (this.configButtonsContainer) {
			render(null, this.configButtonsContainer);
		}

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
		this.headerEl = container.createDiv({ cls: 'agentlink-header' });
		this.headerEl.style.width = '100%';
		
		// Row 1: Session title (left) | Actions (right)
		const headerRow1 = this.headerEl.createDiv({ cls: 'agentlink-header-row1' });
		headerRow1.style.display = 'flex';
		headerRow1.style.alignItems = 'center';
		headerRow1.style.justifyContent = 'space-between';
		headerRow1.style.width = '100%';
		headerRow1.style.padding = '0.4rem 0.6rem';
		headerRow1.style.borderBottom = '1px solid var(--background-modifier-border)';
		
		// Left: Session title (as subtitle)
		const leftSection = headerRow1.createDiv();
		leftSection.style.flex = '1';
		this.sessionTitleEl = leftSection.createEl('span', { text: 'New Chat' });
		this.sessionTitleEl.style.fontSize = '0.85rem';
		this.sessionTitleEl.style.color = 'var(--text-muted)';
		this.sessionTitleEl.style.cursor = 'pointer';
		this.sessionTitleEl.addEventListener('click', () => this.renameCurrentSession());
		
		// Right: Action buttons
		const rightSection = headerRow1.createDiv();
		rightSection.style.display = 'flex';
		rightSection.style.alignItems = 'center';
		rightSection.style.gap = '0.1rem';
		rightSection.style.flexShrink = '0'; // Prevent shrinking
		
		// History dropdown button
		const historyContainer = rightSection.createDiv();
		historyContainer.style.position = 'relative';
		this.historyBtn = historyContainer.createEl('button');
		this.historyBtn.innerHTML = '🕐';
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
		
		// Clear button
		this.clearBtn = rightSection.createEl('button');
		this.clearBtn.innerHTML = '✕';
		this.clearBtn.style.padding = '0.3rem 0.4rem';
		this.clearBtn.style.background = 'transparent';
		this.clearBtn.style.border = 'none';
		this.clearBtn.style.cursor = 'pointer';
		this.clearBtn.style.fontSize = '0.95rem';
		this.clearBtn.style.opacity = '0.7';
		this.clearBtn.addEventListener('mouseenter', () => this.clearBtn.style.opacity = '1');
		this.clearBtn.addEventListener('mouseleave', () => this.clearBtn.style.opacity = '0.7');
		this.clearBtn.addEventListener('click', () => this.clearConversation());
		
		// New Chat button
		const newChatBtn = rightSection.createEl('button');
		newChatBtn.innerHTML = '＋';
		newChatBtn.style.padding = '0.3rem 0.4rem';
		newChatBtn.style.background = 'transparent';
		newChatBtn.style.border = 'none';
		newChatBtn.style.cursor = 'pointer';
		newChatBtn.style.fontSize = '0.95rem';
		newChatBtn.style.opacity = '0.7';
		newChatBtn.addEventListener('mouseenter', () => newChatBtn.style.opacity = '1');
		newChatBtn.addEventListener('mouseleave', () => newChatBtn.style.opacity = '0.7');
		newChatBtn.addEventListener('click', () => this.createNewSession());
		
		// Messages area
		this.messagesEl = container.createDiv({ cls: 'agentlink-messages' });
		this.messagesEl.style.flex = '1';
		this.messagesEl.style.overflowY = 'auto';
		this.messagesEl.style.padding = '0.75rem';
		this.initializeSession();

		// Input area container
		const inputContainer = container.createDiv();
		inputContainer.style.borderTop = '1px solid var(--background-modifier-border)';
		inputContainer.style.background = 'var(--background-secondary)';
		
		// Agent selector row (above input box)
		const agentSelectorRow = inputContainer.createDiv();
		agentSelectorRow.style.display = 'flex';
		agentSelectorRow.style.alignItems = 'center';
		agentSelectorRow.style.gap = '0.4rem';
		agentSelectorRow.style.padding = '0.4rem 0.6rem 0.2rem';
		
		// Agent selector button with dropdown (shows actual agent name)
		const agentContainer = agentSelectorRow.createDiv();
		agentContainer.style.position = 'relative';
		this.agentSelectorBtn = agentContainer.createEl('button');
		this.agentSelectorBtn.style.display = 'flex';
		this.agentSelectorBtn.style.alignItems = 'center';
		this.agentSelectorBtn.style.gap = '0.3rem';
		this.agentSelectorBtn.style.padding = '0.3rem 0.5rem';
		this.agentSelectorBtn.style.background = 'var(--background-secondary)';
		this.agentSelectorBtn.style.border = '1px solid var(--background-modifier-border)';
		this.agentSelectorBtn.style.borderRadius = '4px';
		this.agentSelectorBtn.style.cursor = 'pointer';
		this.agentSelectorBtn.style.fontSize = '0.85rem';
		this.agentSelectorBtn.style.color = 'var(--text-normal)';
		this.agentSelectorBtn.style.whiteSpace = 'nowrap';
		
		const agentIcon = this.agentSelectorBtn.createEl('span');
		agentIcon.innerHTML = '🤖';
		agentIcon.style.fontSize = '0.9rem';
		const agentText = this.agentSelectorBtn.createEl('span');
		agentText.textContent = 'Agent'; // Will be updated by refreshStatus
		agentText.style.maxWidth = '150px';
		agentText.style.overflow = 'hidden';
		agentText.style.textOverflow = 'ellipsis';
		agentText.style.whiteSpace = 'nowrap';
		const agentArrow = this.agentSelectorBtn.createEl('span');
		agentArrow.innerHTML = '▾';
		agentArrow.style.fontSize = '0.7rem';
		agentArrow.style.opacity = '0.6';
		
		// Agent dropdown
		const agentDropdown = agentContainer.createDiv();
		agentDropdown.style.display = 'none';
		this.agentSelectorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const isOpen = agentDropdown.style.display !== 'none';
			agentDropdown.style.display = isOpen ? 'none' : 'block';
			if (!isOpen) this.renderAgentDropdown(agentDropdown);
		});
		document.addEventListener('click', () => agentDropdown.style.display = 'none');
		
		// Status LED (next to agent selector, NOT in header)
		this.statusLed = agentSelectorRow.createEl('span');
		this.statusLed.style.width = '8px';
		this.statusLed.style.height = '8px';
		this.statusLed.style.borderRadius = '50%';
		this.statusLed.style.background = '#6b7280';
		this.statusLed.style.transition = 'all 0.15s ease';
		this.statusLed.style.flexShrink = '0';
		
		// Input row with resizable textarea
		const inputRow = inputContainer.createDiv();
		inputRow.style.display = 'flex';
		inputRow.style.gap = '0.5rem';
		inputRow.style.padding = '0.6rem';
		inputRow.style.borderBottom = '1px solid var(--background-modifier-border)';

		// Create a wrapper for the textarea to handle resizing
		const textareaWrapper = inputRow.createDiv();
		textareaWrapper.style.flex = '1';
		textareaWrapper.style.display = 'flex';
		textareaWrapper.style.flexDirection = 'column';
		textareaWrapper.style.minHeight = '2.8rem';
		textareaWrapper.style.position = 'relative';

		this.inputEl = textareaWrapper.createEl('textarea', { placeholder: 'Ask your AI agent…' });
		this.inputEl.style.width = '100%';
		this.inputEl.style.height = '2.8rem';
		this.inputEl.style.minHeight = '2.8rem';
		this.inputEl.style.maxHeight = '300px';
		this.inputEl.style.resize = 'vertical';
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

		// Bottom toolbar: Dynamic configOptions + Send/Stop button
		const bottomToolbar = inputContainer.createDiv();
		bottomToolbar.style.display = 'flex';
		bottomToolbar.style.alignItems = 'center';
		bottomToolbar.style.justifyContent = 'space-between';
		bottomToolbar.style.padding = '0.4rem 0.6rem';
		bottomToolbar.style.gap = '0.5rem';
		
		// Container for dynamic configOptions
		this.configButtonsContainer = bottomToolbar.createDiv();
		this.configButtonsContainer.style.display = 'flex';
		this.configButtonsContainer.style.alignItems = 'center';
		this.configButtonsContainer.style.gap = '0.3rem';
		
		// Right: Send/Stop button
		const sendBtnContainer = bottomToolbar.createDiv();
		sendBtnContainer.style.marginLeft = 'auto';
		
		this.sendBtn = sendBtnContainer.createEl('button', { text: 'Send' });
		this.sendBtn.style.padding = '0.3rem 1.2rem';
		this.sendBtn.style.height = '1.8rem';
		this.sendBtn.style.background = 'var(--interactive-accent)';
		this.sendBtn.style.color = 'var(--text-on-accent)';
		this.sendBtn.style.border = 'none';
		this.sendBtn.style.borderRadius = '4px';
		this.sendBtn.style.cursor = 'pointer';
		this.sendBtn.style.fontSize = '0.8rem';
		this.sendBtn.addEventListener('click', () => this.handleSend());

		this.stopBtn = sendBtnContainer.createEl('button', { text: 'Stop' });
		this.stopBtn.style.padding = '0.3rem 1.2rem';
		this.stopBtn.style.height = '1.8rem';
		this.stopBtn.style.background = 'var(--background-modifier-error)';
		this.stopBtn.style.color = 'var(--text-on-accent)';
		this.stopBtn.style.border = 'none';
		this.stopBtn.style.borderRadius = '4px';
		this.stopBtn.style.cursor = 'pointer';
		this.stopBtn.style.fontSize = '0.8rem';
		this.stopBtn.style.display = 'none';
		this.stopBtn.addEventListener('click', () => this.handleStop());

		// Load and render configOptions from adapter
		this.loadConfigOptions();

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

	// ── Config Options (Dynamic rendering) ───────────────────────────────────

	/** Load configOptions from adapter and render buttons */
	private async loadConfigOptions(): Promise<void> {
		if (!this.configButtonsContainer) return;

		// Get configOptions from adapter (may be empty if not supported)
		const configOptions = this.adapter?.getConfigOptions?.() ?? [];
		this.sessionConfig = { configOptions };

		render(
			h(ConfigToolbar, {
				options: configOptions,
				onSelect: async (configId: string, value: string) => {
					await this.handleConfigOptionChange(configId, value);
				},
			}),
			this.configButtonsContainer,
		);
	}

	private async handleConfigOptionChange(configId: string, value: string): Promise<void> {
		const target = this.sessionConfig.configOptions.find((o) => o.id === configId);
		if (!target) return;

		const selected = target.options.find((v) => v.value === value);
		if (!selected) return;

		try {
			const updated = this.adapter?.setConfigOption
				? await this.adapter.setConfigOption(configId, value)
				: this.sessionConfig.configOptions.map((o) =>
						o.id === configId ? { ...o, currentValue: value } : o,
				  );

			this.sessionConfig = { configOptions: updated };
			new Notice(`${target.name}: ${selected.name}`);
			await this.loadConfigOptions();
		} catch (error) {
			logger.error('Failed to set config option:', error);
			new Notice(`Failed to set ${target.name}`);
		}
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
				// Show backend name (e.g., "Kimi Code") instead of adapter label ("ACP Bridge")
				const backend = getActiveBackendConfig(this.settings);
				return backend?.name ?? this.adapter?.label ?? 'Agent';
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
		// Update agent selector text to show actual agent name
		if (this.agentSelectorBtn) {
			const activeBackend = getActiveBackendConfig(this.settings);
			const agentText = this.agentSelectorBtn.querySelector('span:nth-child(2)') as HTMLElement;
			if (agentText && activeBackend) {
				agentText.textContent = activeBackend.name;
			}
		}

		// Update status LED
		if (this.statusLed) {
			const statusState = this.adapter?.getStatus().state ?? 'disconnected';
			
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

	/** Render Agent selector dropdown */
	private renderAgentDropdown(container: HTMLElement): void {
		const backends = this.settings.backends;
		const activeBackend = getActiveBackendConfig(this.settings);

		container.empty();
		container.style.display = 'block';
		container.style.position = 'absolute';
		container.style.top = '100%';
		container.style.left = '0';
		container.style.zIndex = '1000';
		container.style.minWidth = '200px';
		container.style.maxWidth = '280px';
		container.style.maxHeight = '300px';
		container.style.overflowY = 'auto';
		container.style.padding = '0.4rem';
		container.style.background = 'var(--background-primary)';
		container.style.border = '1px solid var(--background-modifier-border)';
		container.style.borderRadius = '6px';
		container.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';

		const header = container.createEl('div', { text: 'Select Agent' });
		header.style.fontSize = '0.75rem';
		header.style.color = 'var(--text-muted)';
		header.style.padding = '0.3rem 0.5rem';
		header.style.marginBottom = '0.3rem';
		header.style.borderBottom = '1px solid var(--background-modifier-border)';

		for (const backend of backends) {
			const item = container.createEl('button');
			item.type = 'button';
			item.style.width = '100%';
			item.style.display = 'flex';
			item.style.alignItems = 'center';
			item.style.gap = '0.4rem';
			item.style.padding = '0.5rem';
			item.style.marginBottom = '0.2rem';
			item.style.border = 'none';
			item.style.borderRadius = '4px';
			item.style.background = backend.id === activeBackend?.id
				? 'var(--background-modifier-hover)'
				: 'transparent';
			item.style.color = 'var(--text-normal)';
			item.style.textAlign = 'left';
			item.style.cursor = 'pointer';

			const icon = item.createEl('span');
			icon.innerHTML = backend.type === 'mock' ? '🧪' : '🤖';
			icon.style.fontSize = '0.9rem';

			const name = item.createEl('span', { text: backend.name });
			name.style.flex = '1';
			name.style.fontSize = '0.85rem';

			if (backend.id === activeBackend?.id) {
				const check = item.createEl('span');
				check.innerHTML = '✓';
				check.style.color = 'var(--interactive-accent)';
				check.style.fontWeight = 'bold';
			}

			item.addEventListener('click', async () => {
				if (backend.id !== this.settings.activeBackendId) {
					this.settings.activeBackendId = backend.id;
					await this.onSettingsSave();
					this.refreshStatus();
					new Notice(`Switched to ${backend.name}`);
				}
				container.style.display = 'none';
			});
		}
	}

	/** Render Model selector dropdown */
	private renderModelDropdown(container: HTMLElement): void {
		container.empty();
		container.style.display = 'block';
		container.style.position = 'absolute';
		container.style.bottom = '100%';
		container.style.left = '0';
		container.style.zIndex = '1000';
		container.style.minWidth = '180px';
		container.style.maxWidth = '260px';
		container.style.padding = '0.4rem';
		container.style.background = 'var(--background-primary)';
		container.style.border = '1px solid var(--background-modifier-border)';
		container.style.borderRadius = '6px';
		container.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
		container.style.marginBottom = '0.3rem';

		const header = container.createEl('div', { text: 'Model' });
		header.style.fontSize = '0.75rem';
		header.style.color = 'var(--text-muted)';
		header.style.padding = '0.3rem 0.5rem';
		header.style.marginBottom = '0.3rem';
		header.style.borderBottom = '1px solid var(--background-modifier-border)';

		const models = [
			{ id: 'default', name: 'Default', desc: 'Use backend default' },
			{ id: 'fast', name: 'Fast', desc: 'Quicker responses' },
			{ id: 'quality', name: 'Quality', desc: 'Better responses' },
		];

		for (const model of models) {
			const item = container.createEl('button');
			item.type = 'button';
			item.style.width = '100%';
			item.style.display = 'block';
			item.style.padding = '0.5rem';
			item.style.marginBottom = '0.2rem';
			item.style.border = 'none';
			item.style.borderRadius = '4px';
			item.style.background = 'transparent';
			item.style.color = 'var(--text-normal)';
			item.style.textAlign = 'left';
			item.style.cursor = 'pointer';

			const name = item.createEl('div', { text: model.name });
			name.style.fontSize = '0.85rem';
			name.style.fontWeight = '600';

			const desc = item.createEl('div', { text: model.desc });
			desc.style.fontSize = '0.75rem';
			desc.style.color = 'var(--text-muted)';

			item.addEventListener('click', () => {
				const btnText = this.modelSelectorBtn.querySelector('span:nth-child(2)');
				if (btnText) btnText.textContent = model.name;
				container.style.display = 'none';
				new Notice(`Model: ${model.name}`);
			});
		}

		const configureItem = container.createEl('button');
		configureItem.type = 'button';
		configureItem.style.width = '100%';
		configureItem.style.display = 'block';
		configureItem.style.padding = '0.5rem';
		configureItem.style.marginTop = '0.3rem';
		configureItem.style.border = 'none';
		configureItem.style.borderTop = '1px solid var(--background-modifier-border)';
		configureItem.style.borderRadius = '0';
		configureItem.style.background = 'transparent';
		configureItem.style.color = 'var(--text-muted)';
		configureItem.style.textAlign = 'left';
		configureItem.style.cursor = 'pointer';
		configureItem.style.fontSize = '0.8rem';
		configureItem.textContent = 'Configure...';
		configureItem.addEventListener('click', () => {
			container.style.display = 'none';
			// @ts-ignore
			this.app.setting.open();
			// @ts-ignore
			this.app.setting.openTabById('agentlink');
		});
	}

	/** Render Thinking intensity dropdown */
	private renderThinkingDropdown(container: HTMLElement, triggerBtn: HTMLButtonElement): void {
		const modes: { id: 'none' | 'quick' | 'balanced' | 'deep'; name: string; desc: string }[] = [
			{ id: 'none', name: 'None', desc: 'No thinking process' },
			{ id: 'quick', name: 'Quick', desc: 'Fast responses' },
			{ id: 'balanced', name: 'Balanced', desc: 'Default mode' },
			{ id: 'deep', name: 'Deep', desc: 'Deep analysis' },
		];

		container.empty();
		container.style.display = 'block';
		container.style.position = 'absolute';
		container.style.bottom = '100%';
		container.style.right = '0';
		container.style.zIndex = '1000';
		container.style.minWidth = '160px';
		container.style.padding = '0.4rem';
		container.style.background = 'var(--background-primary)';
		container.style.border = '1px solid var(--background-modifier-border)';
		container.style.borderRadius = '6px';
		container.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
		container.style.marginBottom = '0.3rem';

		const header = container.createEl('div', { text: 'Thinking' });
		header.style.fontSize = '0.75rem';
		header.style.color = 'var(--text-muted)';
		header.style.padding = '0.3rem 0.5rem';
		header.style.marginBottom = '0.3rem';
		header.style.borderBottom = '1px solid var(--background-modifier-border)';

		for (const mode of modes) {
			const item = container.createEl('button');
			item.type = 'button';
			item.style.width = '100%';
			item.style.display = 'flex';
			item.style.flexDirection = 'column';
			item.style.padding = '0.5rem';
			item.style.marginBottom = '0.2rem';
			item.style.border = 'none';
			item.style.borderRadius = '4px';
			item.style.background = mode.id === this.settings.thinkingMode
				? 'var(--background-modifier-hover)'
				: 'transparent';
			item.style.color = 'var(--text-normal)';
			item.style.textAlign = 'left';
			item.style.cursor = 'pointer';

			const nameRow = item.createEl('div');
			nameRow.style.display = 'flex';
			nameRow.style.alignItems = 'center';
			nameRow.style.gap = '0.4rem';

			const name = nameRow.createEl('span', { text: mode.name });
			name.style.fontSize = '0.85rem';
			name.style.fontWeight = '600';

			if (mode.id === this.settings.thinkingMode) {
				const check = nameRow.createEl('span');
				check.innerHTML = '✓';
				check.style.color = 'var(--interactive-accent)';
				check.style.fontWeight = 'bold';
			}

			const desc = item.createEl('div', { text: mode.desc });
			desc.style.fontSize = '0.75rem';
			desc.style.color = 'var(--text-muted)';

			item.addEventListener('click', async () => {
				this.settings.thinkingMode = mode.id;
				await this.onSettingsSave();
				// Update button appearance
				triggerBtn.innerHTML = `💭 ${mode.name} ▾`;
				triggerBtn.style.background = mode.id !== 'none' ? 'var(--interactive-accent)' : 'transparent';
				triggerBtn.style.color = mode.id !== 'none' ? 'var(--text-on-accent)' : 'var(--text-muted)';
				container.style.display = 'none';
			});
		}
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

		// Header
		const header = container.createEl('div', { text: 'Chat History' });
		header.style.fontSize = '0.75rem';
		header.style.color = 'var(--text-muted)';
		header.style.padding = '0.3rem 0.5rem';
		header.style.marginBottom = '0.3rem';
		header.style.borderBottom = '1px solid var(--background-modifier-border)';

		if (sessions.length === 0) {
			const empty = container.createEl('div', { text: 'No history' });
			empty.style.padding = '0.75rem';
			empty.style.color = 'var(--text-muted)';
			empty.style.fontSize = '0.9rem';
			return;
		}

		// Session list with delete buttons
		for (const session of sessions) {
			const item = container.createDiv();
			item.style.display = 'flex';
			item.style.alignItems = 'center';
			item.style.gap = '0.4rem';
			item.style.padding = '0.5rem';
			item.style.marginBottom = '0.35rem';
			item.style.border = `1px solid ${session.id === this.currentSessionId ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}`;
			item.style.borderRadius = '6px';
			item.style.background = session.id === this.currentSessionId
				? 'var(--background-modifier-hover)'
				: 'transparent';
			item.style.cursor = 'pointer';

			// Click to load (on the info part)
			const info = item.createDiv();
			info.style.flex = '1';
			info.style.minWidth = '0'; // Allow truncation
			
			const title = info.createEl('div', { text: session.title });
			title.style.fontWeight = '600';
			title.style.fontSize = '0.9rem';
			title.style.marginBottom = '0.15rem';
			title.style.whiteSpace = 'nowrap';
			title.style.overflow = 'hidden';
			title.style.textOverflow = 'ellipsis';

			const date = new Date(session.updatedAt).toLocaleString();
			const meta = info.createEl('div', {
				text: `${date} • ${session.messageCount} messages`,
			});
			meta.style.fontSize = '0.8rem';
			meta.style.color = 'var(--text-muted)';

			info.addEventListener('click', () => {
				this.loadSession(session.id);
				container.style.display = 'none';
			});

			// Delete button
			const deleteBtn = item.createEl('button');
			deleteBtn.innerHTML = '✕';
			deleteBtn.style.padding = '0.2rem 0.4rem';
			deleteBtn.style.background = 'transparent';
			deleteBtn.style.border = 'none';
			deleteBtn.style.borderRadius = '4px';
			deleteBtn.style.cursor = 'pointer';
			deleteBtn.style.fontSize = '0.85rem';
			deleteBtn.style.color = 'var(--text-muted)';
			deleteBtn.style.opacity = '0.6';
			deleteBtn.addEventListener('mouseenter', () => {
				deleteBtn.style.opacity = '1';
				deleteBtn.style.background = 'var(--background-modifier-error)';
				deleteBtn.style.color = 'var(--text-on-accent)';
			});
			deleteBtn.addEventListener('mouseleave', () => {
				deleteBtn.style.opacity = '0.6';
				deleteBtn.style.background = 'transparent';
				deleteBtn.style.color = 'var(--text-muted)';
			});
			deleteBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const confirmed = await this.confirmDelete(session.title);
				if (confirmed) {
					await this.sessionManager.deleteSession(session.id);
					if (session.id === this.currentSessionId) {
						this.createNewSession();
					}
					// Refresh dropdown
					this.renderHistoryDropdown(container);
					new Notice('Session deleted');
				}
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
