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
import { AgentAdapter, AgentInput, ChatMessage, MessageRole, StreamHandlers } from '../core/types';
import { CancellationError } from '../core/errors';
import { logger } from '../core/logger';
import { SessionStore } from '../services/session-store';
import { AgentLinkSettings } from '../settings/settings';

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

		const roleEl = el.createDiv({ cls: 'agentlink-message-role' });
		roleEl.setText(this.roleLabel(msg.role));

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
		} else {
			contentEl.createEl('p', { text: msg.content });
		}

		this.scrollToBottom();
		return el;
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
		const adapterLabel = this.adapter?.label ?? 'None';
		const statusState = this.adapter?.getStatus().state ?? 'disconnected';
		this.backendLabel.setText(`${adapterLabel} (${statusState})`);
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}
}
