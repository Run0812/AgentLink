import { CancellationError } from './errors';
import type {
	AgentAdapter,
	AgentInput,
	ChatMessage,
	FileEditMetadata,
	StreamHandlers,
	ToolCall,
	ToolCallMetadata,
	ToolResult,
} from './types';
import type { NoticeHost } from '../host/obsidian/notice-host';
import type { PromptContextService } from './prompt-context-service';
import type { SessionStore } from '../services/session-store';
import type { ContextService } from '../services/context-service';
import type { ToolExecutor } from '../services/tool-executor';

export interface ChatTurnPresenter {
	renderMessage(message: ChatMessage): void;
	updateAssistantMessage(messageId: string, content: string): void;
	updateThinkingMessage(assistantMessageId: string, content: string): void;
	rerenderMessage(messageId: string): void;
	appendStatusMessage(text: string): void;
	renderInlineError(message: string): void;
	setBusy(busy: boolean): void;
	finishStreaming(): void;
	scrollToBottom(): void;
}

export interface ChatTurnServiceDeps {
	getAdapter: () => AgentAdapter | null;
	sessionStore: SessionStore;
	contextService: ContextService;
	promptContextService: PromptContextService;
	toolExecutor: ToolExecutor;
	noticeHost: NoticeHost;
	presenter: ChatTurnPresenter;
}

export class ChatTurnService {
	constructor(private readonly deps: ChatTurnServiceDeps) {}

	async sendMessage(prompt: string): Promise<void> {
		const adapter = this.deps.getAdapter();
		if (!adapter) {
			this.deps.noticeHost.show('AgentLink: No backend adapter configured.');
			return;
		}

		const userMsg = this.deps.sessionStore.addMessage('user', prompt);
		this.deps.presenter.renderMessage(userMsg);
		this.deps.presenter.setBusy(true);

		const assistantMsg = this.deps.sessionStore.addMessage('assistant', '');
		this.deps.presenter.renderMessage(assistantMsg);

		const context = await this.deps.promptContextService.capture();
		const input: AgentInput = {
			prompt,
			attachments: this.deps.contextService.listAttachments(),
			context,
			history: this.deps.sessionStore.getRecentMessages(20).slice(0, -1),
		};

		let accumulated = '';
		let accumulatedThinking = '';

		const handlers: StreamHandlers = {
			onChunk: (chunk: string) => {
				accumulated += chunk;
				this.deps.sessionStore.updateMessage(assistantMsg.id, accumulated);
				this.deps.presenter.updateAssistantMessage(assistantMsg.id, accumulated);
				this.deps.presenter.scrollToBottom();
			},
			onComplete: (fullText: string) => {
				this.deps.sessionStore.updateMessage(assistantMsg.id, fullText);
				this.deps.presenter.updateAssistantMessage(assistantMsg.id, fullText);
				this.deps.presenter.finishStreaming();
			},
			onError: (error: Error) => {
				if (error instanceof CancellationError) {
					const partial = accumulated || '(cancelled)';
					this.deps.sessionStore.updateMessage(assistantMsg.id, partial);
					this.deps.presenter.updateAssistantMessage(assistantMsg.id, partial);
					this.deps.presenter.appendStatusMessage('Generation stopped by user.');
				} else {
					this.deps.sessionStore.addMessage('error', error.message);
					this.deps.presenter.renderInlineError(error.message);
				}
				this.deps.presenter.finishStreaming();
			},
		};

		try {
			await adapter.sendMessage(input, handlers, {
				onThinkingChunk: (text: string) => {
					accumulatedThinking += text;
					this.deps.presenter.updateThinkingMessage(assistantMsg.id, accumulatedThinking);
					this.deps.presenter.scrollToBottom();
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.deps.sessionStore.addMessage('error', message);
			this.deps.presenter.renderInlineError(message);
			this.deps.presenter.finishStreaming();
		}
	}

	async cancelTurn(): Promise<void> {
		const adapter = this.deps.getAdapter();
		if (adapter) {
			await adapter.cancel();
		}
	}

	async confirmToolCall(messageId: string): Promise<void> {
		const message = this.findMessage(messageId);
		if (!message || !message.metadata || !('toolCallId' in message.metadata)) {
			return;
		}

		const metadata = message.metadata as ToolCallMetadata;
		const toolCall: ToolCall = {
			id: metadata.toolCallId,
			tool: metadata.tool,
			params: metadata.params,
		};

		this.deps.sessionStore.updateMessageMetadata(messageId, { ...metadata, status: 'executing' });
		this.deps.presenter.rerenderMessage(messageId);

		const result = await this.deps.toolExecutor.execute(toolCall);
		this.deps.sessionStore.updateMessageMetadata(messageId, {
			...metadata,
			status: result.success ? 'completed' : 'error',
			result,
		});
		this.deps.presenter.rerenderMessage(messageId);

		if (result.success && typeof metadata.params.path === 'string') {
			this.deps.sessionStore.addWorkspaceFile(metadata.params.path);
		}

		await this.sendToolResultToAgent(toolCall, result);
	}

	async rejectToolCall(messageId: string): Promise<void> {
		const message = this.findMessage(messageId);
		if (!message || !message.metadata || !('toolCallId' in message.metadata)) {
			return;
		}

		const metadata = message.metadata as ToolCallMetadata;
		this.deps.sessionStore.updateMessageMetadata(messageId, { ...metadata, status: 'rejected' });
		this.deps.presenter.rerenderMessage(messageId);
	}

	async confirmFileEdit(messageId: string): Promise<void> {
		const message = this.findMessage(messageId);
		if (!message || !message.metadata || !('path' in message.metadata)) {
			return;
		}

		const metadata = message.metadata as FileEditMetadata;
		this.deps.sessionStore.updateMessageMetadata(messageId, { ...metadata, status: 'executing' });
		this.deps.presenter.rerenderMessage(messageId);

		const result = await this.deps.toolExecutor.execute({
			id: `edit_${Date.now()}`,
			tool: 'write_file',
			params: { path: metadata.path, content: metadata.modified },
		});

		this.deps.sessionStore.updateMessageMetadata(messageId, {
			...metadata,
			status: result.success ? 'confirmed' : 'error',
		});
		this.deps.presenter.rerenderMessage(messageId);

		if (result.success) {
			this.deps.noticeHost.show(`File changes applied to ${metadata.path}`);
			this.deps.sessionStore.addMessage('system', `File edited: ${metadata.path}`);
		} else {
			this.deps.noticeHost.show(`Failed to apply changes: ${result.content}`);
		}
	}

	rejectFileEdit(messageId: string): void {
		const message = this.findMessage(messageId);
		if (!message || !message.metadata || !('path' in message.metadata)) {
			return;
		}

		const metadata = message.metadata as FileEditMetadata;
		this.deps.sessionStore.updateMessageMetadata(messageId, { ...metadata, status: 'rejected' });
		this.deps.presenter.rerenderMessage(messageId);
	}

	private findMessage(messageId: string): ChatMessage | undefined {
		return this.deps.sessionStore.getMessages().find((message) => message.id === messageId);
	}

	private async sendToolResultToAgent(toolCall: ToolCall, result: ToolResult): Promise<void> {
		const resultContent = typeof result.content === 'string'
			? result.content
			: JSON.stringify(result.content);

		this.deps.sessionStore.addMessage('system', `Tool "${toolCall.tool}" result:\n${resultContent}`);
		this.deps.noticeHost.show(`Tool ${toolCall.tool} ${result.success ? 'completed' : 'failed'}`);
	}
}
