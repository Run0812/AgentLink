import { App, Component, MarkdownRenderer, setIcon } from 'obsidian';
import { ChatMessage, MessageRole } from '../../core/types';

export interface MessageListRendererDeps {
	app: App;
	ownerComponent: Component;
	getMessagesEl: () => HTMLElement;
	getRoleLabel: (role: MessageRole) => string;
	onCopyMessage: (msg: ChatMessage) => void | Promise<void>;
	onToolConfirm: (msgId: string) => void;
	onToolReject: (msgId: string) => void;
	onFileEditConfirm: (msgId: string) => void;
	onFileEditReject: (msgId: string) => void;
	onAfterRender: () => void;
}

export class MessageListRenderer {
	private deps: MessageListRendererDeps;

	constructor(deps: MessageListRendererDeps) {
		this.deps = deps;
	}

	renderWelcome(): void {
		const messagesEl = this.deps.getMessagesEl();
		const welcomeEl = messagesEl.createDiv({ cls: 'agentlink-welcome' });
		welcomeEl.createEl('p', {
			text: 'Welcome to AgentLink! Configure a backend in settings, then start chatting.',
		});
		welcomeEl.createEl('p', {
			cls: 'agentlink-welcome-hint',
			text: 'Tip: Press Ctrl+Enter to send. Use "mock" backend for testing.',
		});
	}

	renderMessage(msg: ChatMessage): HTMLElement {
		const messagesEl = this.deps.getMessagesEl();
		const welcome = messagesEl.querySelector('.agentlink-welcome');
		if (welcome) {
			welcome.remove();
		}

		const messageEl = messagesEl.createDiv({
			cls: `agentlink-message agentlink-message-${msg.role}`,
		});
		messageEl.dataset.msgId = msg.id;

		const headerEl = messageEl.createDiv({ cls: 'agentlink-message-header' });
		const roleEl = headerEl.createDiv({ cls: 'agentlink-message-role' });
		roleEl.setText(this.deps.getRoleLabel(msg.role));

		if (msg.role === 'user' || msg.role === 'assistant') {
			const copyBtn = headerEl.createEl('button', {
				cls: 'agentlink-copy-btn',
				attr: { 'aria-label': 'Copy message', title: 'Copy message' },
			});
			setIcon(copyBtn, 'copy');
			copyBtn.addEventListener('click', () => {
				void this.deps.onCopyMessage(msg);
			});
		}

		const contentEl = messageEl.createDiv({ cls: 'agentlink-message-content' });
		if (msg.role === 'assistant') {
			if (msg.content) {
				this.renderAssistantContent(contentEl, msg.content);
			}
		} else if (msg.role === 'thinking') {
			this.renderThinkingContent(contentEl, msg.content);
		} else if (msg.role === 'error') {
			contentEl.addClass('agentlink-error-content');
			contentEl.setText(msg.content);
		} else if (msg.role === 'status') {
			contentEl.addClass('agentlink-status-content');
			contentEl.setText(msg.content);
		} else if (msg.role === 'tool_call') {
			contentEl.addClass('agentlink-tool-call-content');
			this.renderToolCallContent(contentEl, msg);
		} else if (msg.role === 'file_edit') {
			contentEl.addClass('agentlink-file-edit-content');
			this.renderFileEditContent(contentEl, msg);
		} else {
			contentEl.createEl('p', { text: msg.content });
		}

		this.deps.onAfterRender();
		return messageEl;
	}

	renderAssistantContent(container: HTMLElement, content: string): void {
		container.empty();
		MarkdownRenderer.render(this.deps.app, content, container, '', this.deps.ownerComponent);
	}

	renderInlineError(message: string): void {
		const messagesEl = this.deps.getMessagesEl();
		const errorEl = messagesEl.createDiv({ cls: 'agentlink-error' });
		errorEl.createEl('strong', { text: 'Error: ' });
		errorEl.createSpan({ text: message });
		this.deps.onAfterRender();
	}

	appendStatusMessage(text: string): void {
		const messagesEl = this.deps.getMessagesEl();
		const statusEl = messagesEl.createDiv({ cls: 'agentlink-status-msg' });
		statusEl.setText(text);
		this.deps.onAfterRender();
	}

	rerenderMessage(msg: ChatMessage): void {
		const messagesEl = this.deps.getMessagesEl();
		const messageEl = messagesEl.querySelector(`[data-msg-id="${msg.id}"]`);
		if (!messageEl) {
			return;
		}

		const contentEl = messageEl.querySelector('.agentlink-message-content');
		if (!(contentEl instanceof HTMLElement)) {
			return;
		}

		if (msg.role === 'tool_call') {
			this.renderToolCallContent(contentEl, msg);
		} else if (msg.role === 'file_edit') {
			this.renderFileEditContent(contentEl, msg);
		}

		this.deps.onAfterRender();
	}

	private renderThinkingContent(container: HTMLElement, content: string): void {
		container.addClass('agentlink-thinking-content');

		const header = container.createDiv({ cls: 'agentlink-thinking-header' });
		const title = header.createDiv({ cls: 'agentlink-thinking-title' });
		title.createSpan({ cls: 'agentlink-thinking-icon', text: '??' });
		title.createSpan({ text: 'Thinking' });
		header.createSpan({ cls: 'agentlink-thinking-time', text: 'Thought process' });
		const toggle = header.createSpan({ cls: 'agentlink-thinking-toggle', text: '▼' });

		const body = container.createDiv({ cls: 'agentlink-thinking-body' });
		MarkdownRenderer.render(this.deps.app, content, body, '', this.deps.ownerComponent);

		header.addEventListener('click', () => {
			const isCollapsed = container.hasClass('agentlink-thinking-collapsed');
			container.toggleClass('agentlink-thinking-collapsed', !isCollapsed);
			toggle.setText(isCollapsed ? '▼' : '?');
		});

		if (content.length > 300) {
			container.addClass('agentlink-thinking-collapsed');
			toggle.setText('?');
		}
	}

	private renderToolCallContent(container: HTMLElement, msg: ChatMessage): void {
		container.empty();

		const header = container.createDiv({ cls: 'agentlink-tool-header' });
		header.createEl('span', { cls: 'agentlink-tool-icon', text: '???' });

		if (!msg.metadata || !('toolCallId' in msg.metadata)) {
			container.createEl('p', { text: msg.content });
			return;
		}

		const meta = msg.metadata;
		header.createEl('span', {
			cls: 'agentlink-tool-name',
			text: `${meta.tool}`,
		});

		header.createEl('span', {
			cls: `agentlink-tool-status agentlink-tool-status-${meta.status}`,
			text: meta.status,
		});

		const paramsEl = container.createDiv({ cls: 'agentlink-tool-params' });
		paramsEl.createEl('code', {
			text: JSON.stringify(meta.params, null, 2),
			cls: 'agentlink-tool-params-code',
		});

		if (meta.result) {
			const resultEl = container.createDiv({ cls: 'agentlink-tool-result' });
			resultEl.createEl('strong', { text: 'Result:' });
			resultEl.createEl('pre', {
				text: meta.result.content,
				cls: 'agentlink-tool-result-content',
			});
		}

		if (meta.status === 'pending') {
			const actionsEl = container.createDiv({ cls: 'agentlink-tool-actions' });
			const confirmBtn = actionsEl.createEl('button', {
				text: 'Confirm',
				cls: 'agentlink-btn-confirm',
			});
			const rejectBtn = actionsEl.createEl('button', {
				text: 'Reject',
				cls: 'agentlink-btn-reject',
			});

			confirmBtn.addEventListener('click', () => this.deps.onToolConfirm(msg.id));
			rejectBtn.addEventListener('click', () => this.deps.onToolReject(msg.id));
		}
	}

	private renderFileEditContent(container: HTMLElement, msg: ChatMessage): void {
		container.empty();

		const header = container.createDiv({ cls: 'agentlink-file-edit-header' });
		header.createEl('span', { cls: 'agentlink-file-edit-icon', text: '??' });

		if (!msg.metadata || !('path' in msg.metadata)) {
			container.createEl('p', { text: msg.content });
			return;
		}

		const meta = msg.metadata;
		header.createEl('span', {
			cls: 'agentlink-file-edit-path',
			text: meta.path,
		});

		header.createEl('span', {
			cls: `agentlink-file-edit-status agentlink-file-edit-status-${meta.status}`,
			text: meta.status,
		});

		const diffEl = container.createDiv({ cls: 'agentlink-file-diff' });
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

		if (meta.status === 'pending') {
			const actionsEl = container.createDiv({ cls: 'agentlink-file-edit-actions' });
			const confirmBtn = actionsEl.createEl('button', {
				text: 'Apply Changes',
				cls: 'agentlink-btn-confirm',
			});
			const rejectBtn = actionsEl.createEl('button', {
				text: 'Discard',
				cls: 'agentlink-btn-reject',
			});

			confirmBtn.addEventListener('click', () => this.deps.onFileEditConfirm(msg.id));
			rejectBtn.addEventListener('click', () => this.deps.onFileEditReject(msg.id));
		}
	}
}
