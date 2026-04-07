import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import { AgentType, Message } from '../types';
import { AgentLinkSettings } from '../settings';
import { BaseAgent } from '../agents/base';

export const AGENTLINK_VIEW_TYPE = 'agentlink-view';

export class AgentLinkView extends ItemView {
	private settings: AgentLinkSettings;
	private agents: Map<AgentType, BaseAgent>;
	private conversation: Message[] = [];

	// DOM elements
	private agentSelect!: HTMLSelectElement;
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private clearBtn!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	private includeFileCheckbox!: HTMLInputElement;
	private includeSelectionCheckbox!: HTMLInputElement;

	constructor(
		leaf: WorkspaceLeaf,
		settings: AgentLinkSettings,
		agents: Map<AgentType, BaseAgent>
	) {
		super(leaf);
		this.settings = settings;
		this.agents = agents;
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

	updateSettings(settings: AgentLinkSettings): void {
		this.settings = settings;
		this.refreshAgentSelect();
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('agentlink-container');
		this.buildUI(container);
	}

	async onClose(): Promise<void> {
		// nothing to clean up
	}

	private buildUI(container: HTMLElement): void {
		// ── Header ─────────────────────────────────────────────────────────
		const header = container.createDiv({ cls: 'agentlink-header' });
		header.createEl('span', { cls: 'agentlink-title', text: 'AgentLink' });

		const headerControls = header.createDiv({ cls: 'agentlink-header-controls' });

		this.agentSelect = headerControls.createEl('select', { cls: 'agentlink-agent-select' });
		this.refreshAgentSelect();
		this.agentSelect.addEventListener('change', () => {
			const value = this.agentSelect.value as AgentType;
			this.settings.activeAgent = value;
		});

		this.clearBtn = headerControls.createEl('button', {
			cls: 'agentlink-clear-btn',
			text: 'Clear',
		});
		this.clearBtn.setAttribute('aria-label', 'Clear conversation');
		this.clearBtn.addEventListener('click', () => this.clearConversation());

		// ── Messages area ───────────────────────────────────────────────────
		this.messagesEl = container.createDiv({ cls: 'agentlink-messages' });
		this.renderWelcome();

		// ── Context controls ────────────────────────────────────────────────
		const contextEl = container.createDiv({ cls: 'agentlink-context' });

		const fileLabel = contextEl.createEl('label', { cls: 'agentlink-context-label' });
		this.includeFileCheckbox = fileLabel.createEl('input', { type: 'checkbox' });
		this.includeFileCheckbox.checked = this.settings.includeFileContext;
		fileLabel.createSpan({ text: ' Include active file' });

		const selLabel = contextEl.createEl('label', { cls: 'agentlink-context-label' });
		this.includeSelectionCheckbox = selLabel.createEl('input', { type: 'checkbox' });
		selLabel.createSpan({ text: ' Include selection' });

		// ── Input area ──────────────────────────────────────────────────────
		const inputArea = container.createDiv({ cls: 'agentlink-input-area' });

		this.inputEl = inputArea.createEl('textarea', {
			cls: 'agentlink-input',
			placeholder: 'Ask your AI agent…',
		});
		this.inputEl.rows = 3;

		this.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
			// Ctrl/Cmd + Enter to send
			if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
				evt.preventDefault();
				this.handleSend();
			}
		});

		this.sendBtn = inputArea.createEl('button', {
			cls: 'agentlink-send-btn',
			text: 'Send',
		});
		this.sendBtn.setAttribute('aria-label', 'Send message (Ctrl+Enter)');
		this.sendBtn.addEventListener('click', () => this.handleSend());

		// ── Status bar ──────────────────────────────────────────────────────
		this.statusEl = container.createDiv({ cls: 'agentlink-status' });
	}

	private refreshAgentSelect(): void {
		if (!this.agentSelect) return;
		this.agentSelect.empty();

		const agentLabels: Record<AgentType, string> = {
			claude: 'Claude Code',
			kimi: 'Kimi Code',
			codex: 'Codex',
			opencode: 'OpenCode',
		};

		for (const [key, label] of Object.entries(agentLabels) as [AgentType, string][]) {
			const opt = this.agentSelect.createEl('option', { value: key, text: label });
			if (key === this.settings.activeAgent) {
				opt.selected = true;
			}
		}
	}

	private renderWelcome(): void {
		const welcome = this.messagesEl.createDiv({ cls: 'agentlink-welcome' });
		welcome.createEl('p', {
			text: 'Welcome to AgentLink! Select an agent above and start chatting.',
		});
		welcome.createEl('p', {
			cls: 'agentlink-welcome-hint',
			text: 'Tip: Use Ctrl+Enter to send. Enable checkboxes to include file or selection context.',
		});
	}

	private async handleSend(): Promise<void> {
		const prompt = this.inputEl.value.trim();
		if (!prompt) return;

		const agentType = (this.agentSelect?.value ?? this.settings.activeAgent) as AgentType;
		const agent = this.agents.get(agentType);

		if (!agent) {
			new Notice(`AgentLink: Agent "${agentType}" is not available.`);
			return;
		}

		// Gather optional context
		let fileContent: string | undefined;
		let selectedText: string | undefined;

		if (this.includeSelectionCheckbox?.checked) {
			const editor = this.app.workspace.activeEditor?.editor;
			if (editor) {
				const sel = editor.getSelection();
				if (sel) selectedText = sel;
			}
		}

		if (this.includeFileCheckbox?.checked && !selectedText) {
			const file = this.app.workspace.getActiveFile();
			if (file) {
				try {
					const raw = await this.app.vault.read(file);
					// Trim to maxContextLength
					fileContent = raw.slice(0, this.settings.maxContextLength);
				} catch {
					// ignore read errors
				}
			}
		}

		// Append user message to conversation
		const userMsg: Message = { role: 'user', content: prompt, timestamp: Date.now() };
		this.conversation.push(userMsg);
		this.renderMessage(userMsg);

		this.inputEl.value = '';
		this.setLoading(true);

		try {
			const response = await agent.send(prompt, {
				// Pass prior messages as context (exclude the just-added user msg since
				// agent.send() already receives it as the `prompt` argument, and
				// buildMessages() appends it at the end to avoid duplication).
				messages: this.conversation.slice(0, -1),
				fileContent,
				selectedText,
			});

			if (response.success) {
				const assistantMsg: Message = {
					role: 'assistant',
					content: response.content,
					timestamp: Date.now(),
				};
				this.conversation.push(assistantMsg);
				this.renderMessage(assistantMsg);
			} else {
				this.showError(response.error ?? 'Unknown error');
			}
		} catch (err: unknown) {
			this.showError(String(err));
		} finally {
			this.setLoading(false);
		}

		// Scroll to bottom
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private renderMessage(msg: Message): void {
		// Remove welcome message on first real message
		const welcome = this.messagesEl.querySelector('.agentlink-welcome');
		if (welcome) welcome.remove();

		const msgEl = this.messagesEl.createDiv({
			cls: `agentlink-message agentlink-message-${msg.role}`,
		});

		const roleBadge = msgEl.createDiv({ cls: 'agentlink-message-role' });
		roleBadge.setText(msg.role === 'user' ? 'You' : this.getAgentLabel());

		const contentEl = msgEl.createDiv({ cls: 'agentlink-message-content' });

		if (msg.role === 'assistant') {
			// Render markdown for assistant responses
			MarkdownRenderer.render(this.app, msg.content, contentEl, '', this);
		} else {
			contentEl.createEl('p', { text: msg.content });
		}
	}

	private getAgentLabel(): string {
		const labels: Record<AgentType, string> = {
			claude: 'Claude Code',
			kimi: 'Kimi Code',
			codex: 'Codex',
			opencode: 'OpenCode',
		};
		return labels[this.settings.activeAgent] ?? 'Agent';
	}

	/** Pre-fill the input textarea with text (e.g., from a selection). */
	prefillInput(text: string): void {
		if (this.inputEl) {
			this.inputEl.value = text;
			this.inputEl.focus();
		}
	}

	/** Programmatically toggle the 'include file' checkbox. */
	setIncludeFile(value: boolean): void {
		if (this.includeFileCheckbox) {
			this.includeFileCheckbox.checked = value;
		}
	}

	private clearConversation(): void {
		this.conversation = [];
		this.messagesEl.empty();
		this.renderWelcome();
		this.statusEl.setText('');
	}

	private setLoading(loading: boolean): void {
		this.sendBtn.disabled = loading;
		this.sendBtn.setText(loading ? '…' : 'Send');
		this.statusEl.setText(loading ? 'Thinking…' : '');
		if (loading) {
			this.statusEl.addClass('agentlink-status-loading');
		} else {
			this.statusEl.removeClass('agentlink-status-loading');
		}
	}

	private showError(message: string): void {
		const errEl = this.messagesEl.createDiv({ cls: 'agentlink-error' });
		errEl.createEl('strong', { text: 'Error: ' });
		errEl.createSpan({ text: message });
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}
}
