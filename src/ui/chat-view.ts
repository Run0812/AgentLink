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

import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, Modal, ButtonComponent, setIcon } from 'obsidian';
import { AgentAdapter, AgentInput, ChatMessage, MessageRole, StreamHandlers, CAPABILITY_LABELS, ToolCall, ToolResult, FileEditMetadata, generateId, SessionConfigState, ConfigOption, PlanEntry, ContextUsageState } from '../core/types';
import { h, render } from 'preact';
import { ConfigToolbar } from './components/config-toolbar';
import { CancellationError } from '../core/errors';
import { logger } from '../core/logger';
import { SessionStore } from '../services/session-store';
import { ToolExecutor, ToolExecutorConfig } from '../services/tool-executor';
import { AgentLinkSettings, getBackendTypeLabel, getActiveBackendConfig } from '../settings/settings';
import { SessionManager } from '../services/session-manager';
import { ContextService } from '../services/context-service';
import { InputAutocomplete, createSlashCommandSuggestions, createAvailableCommandSuggestions, createFileSuggestions, createFolderSuggestions, createTopicSuggestions, AutocompleteTrigger, buildAgentSlashCommandText } from './components/input-autocomplete';
import { parseBuiltinSlashCommandPrompt } from './slash-command-utils';
import { ToolbarController } from './controllers/toolbar-controller';
import { HeaderSessionController } from './controllers/header-session-controller';
import { MessageListRenderer } from './controllers/message-list-renderer';
import { ComposerController, InlineTokenConfig } from './controllers/composer-controller';
import { ObsidianVaultHost } from '../host/obsidian/vault-host';
import { ObsidianWorkspaceHost } from '../host/obsidian/workspace-host';
import { ObsidianNoticeHost } from '../host/obsidian/notice-host';
import { NodeTerminalHost } from '../host/terminal/node-terminal-host';
import { PromptContextService } from '../core/prompt-context-service';
import { ChatTurnService } from '../core/chat-turn-service';
import { ChatSessionService } from '../core/chat-session-service';

export const AGENTLINK_VIEW_TYPE = 'agentlink-view';

export class ChatView extends ItemView {
	private static readonly TOOLBAR_BUTTON_MIN_WIDTH = '108px';
	private static readonly TOOLBAR_BUTTON_MAX_WIDTH = '156px';
	private static readonly TOOLBAR_DROPDOWN_MIN_WIDTH = '220px';
	private static readonly TOOLBAR_DROPDOWN_MAX_WIDTH = 'min(280px, calc(100vw - 32px))';

	private adapter: AgentAdapter | null = null;
	private session = new SessionStore();
	private settings: AgentLinkSettings;
	private isBusy = false;
	private sessionManager: SessionManager;
	private currentSessionId: string | null = null;
	private contextService: ContextService;
	private vaultHost: ObsidianVaultHost;
	private workspaceHost: ObsidianWorkspaceHost;
	private noticeHost: ObsidianNoticeHost;
	private promptContextService: PromptContextService;
	private toolbarController: ToolbarController;
	private headerSessionController: HeaderSessionController;
	private messageListRenderer: MessageListRenderer;
	private composerController: ComposerController;
	private turnService: ChatTurnService;
	private chatSessionService: ChatSessionService;

	// Maximum number of recent messages to include as conversation context
	private static readonly MAX_CONTEXT_MESSAGES = 20;

	// ── Saved callbacks so we can call plugin methods ──────────────────
	private onSettingsRead: () => AgentLinkSettings;
	private onSettingsSave: () => Promise<void>;

	// ── Tool Executor ──────────────────────────────────────────────────
	private toolExecutor: ToolExecutor;

	// ── DOM references ─────────────────────────────────────────────────
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLDivElement;
	private sendBtn!: HTMLButtonElement;
	private stopBtn!: HTMLButtonElement;
	private clearBtn!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	
	// ── Header DOM references ──────────────────────────────────────────
	private headerEl!: HTMLElement;
	private sessionTitleEl!: HTMLElement;
	private historyBtn!: HTMLButtonElement;
	private newSessionBtn!: HTMLButtonElement;

	// ── Bottom Toolbar DOM references ──────────────────────────────────
	private bottomToolbar!: HTMLElement;
	private statusLed!: HTMLElement;
	private agentSelectorBtn!: HTMLButtonElement; // Agent 选择按钮
	private agentSelectorIconEl!: HTMLElement;
	private agentSelectorLabelEl!: HTMLElement;
	private modelSelectorBtn!: HTMLButtonElement; // 模型选择按钮
	private contextUsageContainer!: HTMLElement;
	private contextUsageButton!: HTMLButtonElement;
	private contextUsageTooltip!: HTMLElement;
	private contextUsageRing!: HTMLElement;
	private quickConfigBtn!: HTMLButtonElement; // 快捷配置按钮

	// ── Input Area ─────────────────────────────────────────────────────
	private inputAreaContainer!: HTMLElement;
	private inputShell!: HTMLElement;
	private inputRow!: HTMLElement;
	private resizeHandle!: HTMLElement;
	private inputMinHeight = 80;
	private inputMaxHeightRatio = 0.5;

	// ── Streaming state ────────────────────────────────────────────────
	private streamingMsgId: string | null = null;
	private streamingEl: HTMLElement | null = null;
	private thinkingMessageIds = new Map<string, string>();

	// ── ACP Session Config ───────────────────────────────────────────────
	private sessionConfig: SessionConfigState = { configOptions: [] };
	private configButtonsContainer!: HTMLElement;
	private planContainer!: HTMLElement;
	private detachSessionStateListener?: () => void;
	private globalDocumentListenerCleanup: Array<() => void> = [];

	// ── Phase 5: Input State & Autocomplete ─────────────────────────────
	private inputStateContainer!: HTMLElement;
	private autocompleteContainer!: HTMLElement;
	private isAutocompleteOpen = false;
	private currentAutocompleteTrigger: AutocompleteTrigger = null;
	private currentAutocompleteQuery = '';

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
		this.vaultHost = new ObsidianVaultHost(this.app);
		this.workspaceHost = new ObsidianWorkspaceHost(this.app);
		this.noticeHost = new ObsidianNoticeHost();
		
		// Initialize ToolExecutor with default config
		const toolConfig: ToolExecutorConfig = {
			workspaceRoot: '', // Will be updated when needed
			autoConfirmRead: settings.autoConfirmRead,
			autoConfirmEdit: settings.autoConfirmEdit,
			terminalShell: settings.terminalShell,
			terminalShellCustomPath: settings.terminalShellCustomPath,
		};
		this.toolExecutor = new ToolExecutor(this.vaultHost, new NodeTerminalHost(), toolConfig);
		this.contextService = new ContextService(this.app.vault);
		this.promptContextService = new PromptContextService(this.workspaceHost, this.vaultHost);

		this.toolbarController = new ToolbarController({
			getSettings: () => this.settings,
			getAdapter: () => this.adapter,
			getModelConfigOption: () => this.getModelConfigOption(),
			applyToolbarDropdownStyle: (container, align, maxHeight) =>
				this.applyToolbarDropdownStyle(container, align, maxHeight),
			applyToolbarDropdownHeaderStyle: (header) => this.applyToolbarDropdownHeaderStyle(header),
			applyToolbarDropdownItemStyle: (item) => this.applyToolbarDropdownItemStyle(item),
			applySingleLineEllipsis: (element, fontSize, color) => this.applySingleLineEllipsis(element, fontSize, color),
			renderBackendIcon: (container, iconValue, fallbackIcon) => this.renderBackendIcon(container, iconValue, fallbackIcon),
			onSwitchBackend: async (backendId) => this.switchBackend(backendId),
			onConfigOptionChange: async (configId, value) => this.handleConfigOptionChange(configId, value),
			onThinkingModeChange: async (mode) => this.handleThinkingModeChange(mode),
		});

		this.headerSessionController = new HeaderSessionController({
			app: this.app,
			sessionManager: this.sessionManager,
			getCurrentSessionId: () => this.currentSessionId,
			loadSession: (sessionId) => this.loadSession(sessionId),
			createNewSession: () => this.createNewSession(),
			deleteSession: async (sessionId) => this.deleteSession(sessionId),
		});

		this.messageListRenderer = new MessageListRenderer({
			app: this.app,
			ownerComponent: this,
			getMessagesEl: () => this.messagesEl,
			getRoleLabel: (role) => this.roleLabel(role),
			onCopyMessage: async (msg) => this.copyMessageContent(msg),
			onToolConfirm: (msgId) => {
				void this.handleToolConfirm(msgId);
			},
			onToolReject: (msgId) => {
				void this.handleToolReject(msgId);
			},
			onFileEditConfirm: (msgId) => {
				void this.handleFileEditConfirm(msgId);
			},
			onFileEditReject: (msgId) => {
				void this.handleFileEditReject(msgId);
			},
			onAfterRender: () => this.scrollToBottom(),
		});

		this.composerController = new ComposerController({
			getInputEl: () => this.inputEl ?? null,
			onAttachmentRemove: (attachmentId) => this.contextService.removeAttachment(attachmentId),
		});

		this.turnService = new ChatTurnService({
			getAdapter: () => this.adapter,
			sessionStore: this.session,
			contextService: this.contextService,
			promptContextService: this.promptContextService,
			toolExecutor: this.toolExecutor,
			noticeHost: this.noticeHost,
			presenter: {
				renderMessage: (message) => {
					this.renderMessage(message);
				},
				updateAssistantMessage: (messageId, content) => {
					this.session.updateMessage(messageId, content);
					const messageEl = this.messagesEl?.querySelector(`[data-msg-id="${messageId}"] .agentlink-message-content`) as HTMLElement | null;
					if (messageEl) {
						this.renderAssistantContent(messageEl, content);
					}
				},
				updateThinkingMessage: (assistantMessageId, content) => {
					const existingThinkingMessageId = this.thinkingMessageIds.get(assistantMessageId);
					let thinkingMessage = existingThinkingMessageId
						? this.session.getMessages().find((message) => message.id === existingThinkingMessageId)
						: undefined;
					if (!thinkingMessage) {
						thinkingMessage = this.session.addMessage('thinking', '');
						this.thinkingMessageIds.set(assistantMessageId, thinkingMessage.id);
						const assistantEl = this.messagesEl?.querySelector(`[data-msg-id="${assistantMessageId}"]`);
						const thinkingEl = this.renderMessage(thinkingMessage);
						if (assistantEl && this.messagesEl.contains(assistantEl)) {
							this.messagesEl.insertBefore(thinkingEl, assistantEl);
						}
					}

					this.session.updateMessage(thinkingMessage.id, content);
					const thinkingMsgEl = this.messagesEl?.querySelector(`[data-msg-id="${thinkingMessage.id}"]`);
					const bodyEl = thinkingMsgEl?.querySelector('.agentlink-thinking-body') as HTMLElement | null;
					if (bodyEl) {
						bodyEl.empty();
						MarkdownRenderer.render(this.app, content, bodyEl, '', this);
					}
				},
				rerenderMessage: (messageId) => this.rerenderMessage(messageId),
				appendStatusMessage: (text) => this.appendStatusMessage(text),
				renderInlineError: (message) => this.renderInlineError(message),
				setBusy: (busy) => this.setBusy(busy),
				finishStreaming: () => this.finishStreaming(),
				scrollToBottom: () => this.scrollToBottom(),
			},
		});

		this.chatSessionService = new ChatSessionService({
			sessionStore: this.session,
			sessionManager: this.sessionManager,
			getAdapter: () => this.adapter,
			getCurrentSessionId: () => this.currentSessionId,
			setCurrentSessionId: (sessionId) => {
				this.currentSessionId = sessionId;
			},
			getActiveBackendId: () => getActiveBackendConfig(this.settings)?.id,
			presenter: {
				clearMessages: () => {
					this.thinkingMessageIds.clear();
					this.messagesEl?.empty();
				},
				renderWelcome: () => this.renderWelcome(),
				renderMessage: (message) => {
					this.renderMessage(message);
				},
				updateSessionTitle: (title) => this.updateSessionTitle(title),
				refreshStatus: () => this.refreshStatus(),
				renderInputStateBar: () => this.renderInputStateBar(),
				focusComposer: () => this.inputEl?.focus(),
			},
			onWarning: (message, error) => {
				logger.error(message, error);
			},
		});
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
		const previousAdapter = this.adapter;
		this.detachSessionStateListener?.();
		this.adapter = adapter;
		this.detachSessionStateListener = adapter.subscribeSessionState?.(() => {
			this.refreshStatus();
			void this.refreshSessionFeatures();
			this.refreshAutocompleteFromInput();
		});
		this.refreshStatus();
		void this.refreshSessionFeatures();
		if (previousAdapter !== adapter) {
			void this.prepareAdapterSession();
		}
	}

	refreshSettings(): void {
		this.settings = this.onSettingsRead();
		this.refreshStatus();
		void this.refreshSessionFeatures();
		
		// Update ToolExecutor config
		this.toolExecutor.updateConfig({
			autoConfirmRead: this.settings.autoConfirmRead,
			autoConfirmEdit: this.settings.autoConfirmEdit,
			terminalShell: this.settings.terminalShell,
			terminalShellCustomPath: this.settings.terminalShellCustomPath,
		});
	}

	async onOpen(): Promise<void> {
		this.clearGlobalDocumentListeners();
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('agentlink-container');
		this.buildUI(container);
		this.refreshStatus();
	}

	/**
	 * Update LED indicator state
	 * Centralized LED state management for consistent visual feedback
	 */
	private updateLedState(state: 'connected' | 'disconnected' | 'connecting' | 'busy' | 'error'): void {
		if (!this.statusLed) return;
		
		const styles = {
			connected: { bg: '#4ade80', animation: 'none', shadow: '0 0 4px #4ade80' },
			disconnected: { bg: '#f87171', animation: 'none', shadow: '0 0 4px #f87171' },
			connecting: { bg: '#fbbf24', animation: 'agentlink-led-blink 0.6s ease-in-out infinite', shadow: '0 0 4px #fbbf24' },
			busy: { bg: '#fbbf24', animation: 'agentlink-led-blink 0.6s ease-in-out infinite', shadow: '0 0 4px #fbbf24' },
			error: { bg: '#ef4444', animation: 'none', shadow: '0 0 4px #ef4444' },
		};
		
		const style = styles[state];
		this.statusLed.style.background = style.bg;
		this.statusLed.style.animation = style.animation;
		this.statusLed.style.boxShadow = style.shadow;
		
		console.log(`[ChatView] LED state changed to: ${state}`);
	}

	async onClose(): Promise<void> {
		this.detachSessionStateListener?.();
		this.detachSessionStateListener = undefined;
		this.clearGlobalDocumentListeners();
		await this.saveCurrentSession().catch((error) => {
			logger.warn('ChatView: failed to persist session on close', error);
		});

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

	private registerDocumentListener<K extends keyof DocumentEventMap>(
		type: K,
		handler: (event: DocumentEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions,
	): void {
		document.addEventListener(type, handler as EventListener, options);
		this.globalDocumentListenerCleanup.push(() => {
			document.removeEventListener(type, handler as EventListener, options);
		});
	}

	private clearGlobalDocumentListeners(): void {
		if (this.globalDocumentListenerCleanup.length === 0) {
			return;
		}

		for (const cleanup of this.globalDocumentListenerCleanup.splice(0)) {
			cleanup();
		}
	}

	// ── Public API for commands ─────────────────────────────────────────

	prefillInput(text: string): void {
		if (this.inputEl) {
			this.setComposerText(text);
			this.focusComposer();
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
		this.headerEl.style.display = 'block';
		this.headerEl.style.padding = '0';
		this.headerEl.style.borderBottom = 'none';
		
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
		this.applyHeaderActionButtonStyle(this.historyBtn, 'Chat history');
		setIcon(this.historyBtn, 'history');
		this.applyHeaderActionButtonStyle(this.historyBtn, 'Chat history');
		setIcon(this.historyBtn, 'history');
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
		this.registerDocumentListener('click', () => {
			historyDropdown.style.display = 'none';
		});
		
		// Clear button
		this.clearBtn = rightSection.createEl('button');
		this.applyHeaderActionButtonStyle(this.clearBtn, 'Clear conversation');
		setIcon(this.clearBtn, 'x');
		this.applyHeaderActionButtonStyle(this.clearBtn, 'Clear conversation');
		setIcon(this.clearBtn, 'x');
		this.clearBtn.addEventListener('mouseenter', () => this.clearBtn.style.opacity = '1');
		this.clearBtn.addEventListener('mouseleave', () => this.clearBtn.style.opacity = '0.7');
		this.clearBtn.addEventListener('click', () => this.clearConversation());
		
		// New Chat button
		const newChatBtn = rightSection.createEl('button');
		this.applyHeaderActionButtonStyle(newChatBtn, 'New chat');
		setIcon(newChatBtn, 'plus');
		this.applyHeaderActionButtonStyle(newChatBtn, 'New chat');
		setIcon(newChatBtn, 'plus');
		newChatBtn.addEventListener('mouseenter', () => newChatBtn.style.opacity = '1');
		newChatBtn.addEventListener('mouseleave', () => newChatBtn.style.opacity = '0.7');
		newChatBtn.addEventListener('click', () => this.createNewSession());

		this.planContainer = container.createDiv({ cls: 'agentlink-session-plan' });
		this.planContainer.style.display = 'none';
		this.planContainer.style.padding = '0.45rem 0.6rem';
		this.planContainer.style.borderBottom = '1px solid var(--background-modifier-border)';
		this.planContainer.style.background = 'var(--background-secondary)';
		
		// Messages area
		this.messagesEl = container.createDiv({ cls: 'agentlink-messages' });
		this.messagesEl.style.flex = '1';
		this.messagesEl.style.overflowY = 'auto';
		this.messagesEl.style.padding = '0.75rem';
		this.initializeSession();

		// Input area container with resize handle
		this.inputAreaContainer = container.createDiv();
		this.inputAreaContainer.style.borderTop = '1px solid var(--background-modifier-border)';
		this.inputAreaContainer.style.background = 'var(--background-secondary)';
		this.inputAreaContainer.style.display = 'flex';
		this.inputAreaContainer.style.flexDirection = 'column';
		this.inputAreaContainer.style.minHeight = `${this.inputMinHeight}px`;
		this.inputAreaContainer.style.position = 'relative';
		this.inputAreaContainer.style.padding = '0.45rem 0.6rem 0.55rem';

		this.inputShell = this.inputAreaContainer.createDiv({ cls: 'agentlink-input-shell' });
		this.inputShell.style.display = 'flex';
		this.inputShell.style.flexDirection = 'column';
		this.inputShell.style.flex = '1';
		this.inputShell.style.minHeight = '72px';
		this.inputShell.style.background = 'var(--background-primary)';
		this.inputShell.style.border = '1px solid var(--background-modifier-border)';
		this.inputShell.style.borderRadius = '10px';
		this.inputShell.style.overflow = 'hidden';
		this.inputShell.style.boxShadow = '0 1px 0 rgba(255, 255, 255, 0.02)';
		this.inputShell.addEventListener('click', (evt) => {
			const target = evt.target;
			if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) {
				return;
			}
			this.inputEl?.focus();
		});

		// Reserved for future inline helper UI. Inline tokens now render directly in the editor flow.
		this.inputStateContainer = this.inputShell.createDiv();
		this.inputStateContainer.style.display = 'none';
		
		// Phase 5: Autocomplete container (absolute positioned, will be placed above input)
		this.autocompleteContainer = this.inputAreaContainer.createDiv();
		this.autocompleteContainer.style.position = 'absolute';
		this.autocompleteContainer.style.left = '0.6rem';
		this.autocompleteContainer.style.right = '0.6rem';
		this.autocompleteContainer.style.bottom = '100%';
		this.autocompleteContainer.style.zIndex = '1000';

		// Input row with textarea
		this.inputRow = this.inputShell.createDiv();
		this.inputRow.style.display = 'flex';
		this.inputRow.style.flexDirection = 'column';
		this.inputRow.style.flex = '1';
		this.inputRow.style.minHeight = '60px';
		this.inputRow.style.position = 'relative';
		this.inputRow.style.padding = '0 0.6rem';

		// Create inline composer editor
		this.inputEl = this.inputRow.createDiv({ cls: 'agentlink-inline-composer' });
		this.inputEl.contentEditable = 'true';
		this.inputEl.setAttribute('role', 'textbox');
		this.inputEl.setAttribute('aria-multiline', 'true');
		this.inputEl.setAttribute('data-placeholder', 'Ask anything. Use @ for files and / for commands.');
		this.inputEl.style.width = '100%';
		this.inputEl.style.height = '100%';
		this.inputEl.style.minHeight = '60px';
		this.inputEl.style.padding = '0.15rem 0 0.55rem';
		this.inputEl.style.border = 'none';
		this.inputEl.style.background = 'transparent';
		this.inputEl.style.fontSize = '0.9rem';
		this.inputEl.style.lineHeight = '1.5';
		this.inputEl.style.outline = 'none';
		this.inputEl.style.whiteSpace = 'pre-wrap';
		this.inputEl.style.wordBreak = 'break-word';
		this.inputEl.addEventListener('click', () => this.refreshPlaceholderState());
		this.inputEl.addEventListener('focus', () => {
			this.refreshPlaceholderState();
			this.captureComposerSelection();
		});
		this.inputEl.addEventListener('blur', () => this.refreshPlaceholderState());
		this.inputEl.addEventListener('keyup', () => this.captureComposerSelection());
		this.inputEl.addEventListener('mouseup', () => this.captureComposerSelection());
		this.inputEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				// When autocomplete is open, let it handle Enter key
				if (this.isAutocompleteOpen) {
					return;
				}
				
				if (evt.shiftKey || evt.ctrlKey || evt.metaKey || evt.altKey) {
					// With modifier: insert newline (default textarea behavior)
					return;
				} else {
					// No modifier: send message
					evt.preventDefault();
					this.handleSend();
				}
			}
		});
		this.refreshPlaceholderState();

		// Resize handle at the top of input area (between messages and input)
		this.resizeHandle = this.inputAreaContainer.createDiv();
		this.resizeHandle.style.position = 'absolute';
		this.resizeHandle.style.top = '-3px';
		this.resizeHandle.style.left = '0';
		this.resizeHandle.style.right = '0';
		this.resizeHandle.style.height = '6px';
		this.resizeHandle.style.cursor = 'row-resize';
		this.resizeHandle.style.zIndex = '10';
		this.resizeHandle.style.background = 'transparent';
		this.setupResizeHandle();

		// Bottom toolbar: Status LED + Agent + Model + Config + Send/Stop
		this.bottomToolbar = this.inputShell.createDiv();
		this.bottomToolbar.style.display = 'flex';
		this.bottomToolbar.style.alignItems = 'center';
		this.bottomToolbar.style.gap = '0.4rem';
		this.bottomToolbar.style.padding = '0.2rem 0.55rem 0.45rem';
		this.bottomToolbar.style.background = 'transparent';
		
		// Status LED (leftmost)
		this.statusLed = this.bottomToolbar.createEl('span');
		this.statusLed.style.width = '7px';
		this.statusLed.style.height = '7px';
		this.statusLed.style.borderRadius = '50%';
		this.statusLed.style.background = '#6b7280';
		this.statusLed.style.transition = 'all 0.15s ease';
		this.statusLed.style.flexShrink = '0';
		this.statusLed.style.boxShadow = '0 0 3px currentColor';
		
		// Agent selector button with dropdown (in bottom toolbar)
		const agentContainer = this.bottomToolbar.createDiv();
		agentContainer.style.position = 'relative';
		this.agentSelectorBtn = agentContainer.createEl('button');
		this.applyToolbarSelectorButtonStyle(this.agentSelectorBtn, 'var(--text-normal)');
		
		this.agentSelectorIconEl = this.agentSelectorBtn.createEl('span');
		this.agentSelectorIconEl.style.width = '14px';
		this.agentSelectorIconEl.style.height = '14px';
		this.agentSelectorIconEl.style.display = 'inline-flex';
		this.agentSelectorIconEl.style.alignItems = 'center';
		this.agentSelectorIconEl.style.justifyContent = 'center';
		this.agentSelectorIconEl.style.flexShrink = '0';

		this.agentSelectorLabelEl = this.agentSelectorBtn.createEl('span');
		this.agentSelectorLabelEl.textContent = 'Agent'; // Will be updated by refreshStatus
		this.agentSelectorLabelEl.style.flex = '1';
		this.applySingleLineEllipsis(this.agentSelectorLabelEl, '0.75rem');
		const agentArrow = this.agentSelectorBtn.createEl('span');
		agentArrow.innerHTML = '▾';
		agentArrow.style.fontSize = '0.6rem';
		agentArrow.style.opacity = '0.6';
		agentArrow.style.flexShrink = '0';
		
		// Agent dropdown (opens upward)
		const agentDropdown = agentContainer.createDiv();
		agentDropdown.style.display = 'none';
		this.agentSelectorBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const isOpen = agentDropdown.style.display !== 'none';
			agentDropdown.style.display = isOpen ? 'none' : 'block';
			if (!isOpen) this.renderAgentDropdown(agentDropdown);
		});
		this.registerDocumentListener('click', () => {
			agentDropdown.style.display = 'none';
		});

		// Model selector button with dropdown
		const modelContainer = this.bottomToolbar.createDiv();
		modelContainer.style.position = 'relative';
		this.modelSelectorBtn = modelContainer.createEl('button');
		this.applyToolbarSelectorButtonStyle(this.modelSelectorBtn, 'var(--text-muted)');
		this.modelSelectorBtn.style.display = 'none';
		
		const modelText = this.modelSelectorBtn.createEl('span', { text: 'Model' });
		modelText.style.flex = '1';
		this.applySingleLineEllipsis(modelText, '0.75rem');
		const modelArrow = this.modelSelectorBtn.createEl('span');
		modelArrow.innerHTML = '▾';
		modelArrow.style.fontSize = '0.6rem';
		modelArrow.style.opacity = '0.6';
		modelArrow.style.flexShrink = '0';
		
		// Model dropdown (opens upward)
		const modelDropdown = modelContainer.createDiv();
		modelDropdown.style.display = 'none';
		this.modelSelectorBtn.addEventListener('click', (e) => {
			if (!this.getModelConfigOption()) {
				return;
			}
			e.stopPropagation();
			const isOpen = modelDropdown.style.display !== 'none';
			modelDropdown.style.display = isOpen ? 'none' : 'block';
			if (!isOpen) this.renderModelDropdown(modelDropdown);
		});
		this.registerDocumentListener('click', () => {
			modelDropdown.style.display = 'none';
		});

		const contextUsageContainer = this.bottomToolbar.createDiv();
		contextUsageContainer.style.position = 'relative';
		contextUsageContainer.style.display = 'none';
		contextUsageContainer.style.alignItems = 'center';
		this.contextUsageContainer = contextUsageContainer;

		this.contextUsageButton = contextUsageContainer.createEl('button');
		this.contextUsageButton.type = 'button';
		this.contextUsageButton.style.width = '22px';
		this.contextUsageButton.style.height = '22px';
		this.contextUsageButton.style.padding = '0';
		this.contextUsageButton.style.border = 'none';
		this.contextUsageButton.style.background = 'transparent';
		this.contextUsageButton.style.cursor = 'default';
		this.contextUsageButton.style.display = 'flex';
		this.contextUsageButton.style.alignItems = 'center';
		this.contextUsageButton.style.justifyContent = 'center';
		this.contextUsageButton.style.borderRadius = '999px';
		this.contextUsageButton.setAttribute('aria-label', 'Context usage');

		this.contextUsageRing = this.contextUsageButton.createDiv();
		this.contextUsageRing.style.width = '16px';
		this.contextUsageRing.style.height = '16px';
		this.contextUsageRing.style.borderRadius = '999px';
		this.contextUsageRing.style.background = 'var(--background-modifier-border)';
		this.contextUsageRing.style.position = 'relative';
		this.contextUsageRing.style.boxSizing = 'border-box';

		const ringInner = this.contextUsageRing.createDiv();
		ringInner.style.position = 'absolute';
		ringInner.style.inset = '3px';
		ringInner.style.borderRadius = '999px';
		ringInner.style.background = 'var(--background-secondary)';
		ringInner.style.border = '1px solid var(--background-modifier-border)';

		this.contextUsageTooltip = contextUsageContainer.createDiv();
		this.contextUsageTooltip.style.display = 'none';
		this.contextUsageTooltip.style.position = 'absolute';
		this.contextUsageTooltip.style.bottom = '100%';
		this.contextUsageTooltip.style.right = '0';
		this.contextUsageTooltip.style.zIndex = '1000';
		this.contextUsageTooltip.style.minWidth = '220px';
		this.contextUsageTooltip.style.maxWidth = '280px';
		this.contextUsageTooltip.style.padding = '0.55rem 0.65rem';
		this.contextUsageTooltip.style.marginBottom = '0.4rem';
		this.contextUsageTooltip.style.background = 'var(--background-primary)';
		this.contextUsageTooltip.style.border = '1px solid var(--background-modifier-border)';
		this.contextUsageTooltip.style.borderRadius = '6px';
		this.contextUsageTooltip.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.18)';

		contextUsageContainer.addEventListener('mouseenter', () => {
			if (this.contextUsageContainer.style.display !== 'none') {
				this.contextUsageTooltip.style.display = 'block';
			}
		});
		contextUsageContainer.addEventListener('mouseleave', () => {
			this.contextUsageTooltip.style.display = 'none';
		});
		this.contextUsageButton.addEventListener('focus', () => {
			if (this.contextUsageContainer.style.display !== 'none') {
				this.contextUsageTooltip.style.display = 'block';
			}
		});
		this.contextUsageButton.addEventListener('blur', () => {
			this.contextUsageTooltip.style.display = 'none';
		});

		// Container for dynamic configOptions
		this.configButtonsContainer = this.bottomToolbar.createDiv();
		this.configButtonsContainer.style.display = 'flex';
		this.configButtonsContainer.style.alignItems = 'center';
		this.configButtonsContainer.style.gap = '0.3rem';
		this.configButtonsContainer.style.flex = '1';
		
		const actionControls = this.bottomToolbar.createDiv();
		actionControls.style.marginLeft = 'auto';
		actionControls.style.display = 'flex';
		actionControls.style.alignItems = 'center';
		actionControls.style.gap = '0.35rem';
		actionControls.appendChild(contextUsageContainer);
		
		// Right: Send/Stop button
		const sendBtnContainer = actionControls.createDiv();
		sendBtnContainer.style.display = 'flex';
		sendBtnContainer.style.alignItems = 'center';
		
		this.sendBtn = sendBtnContainer.createEl('button', { text: 'Send' });
		this.sendBtn.addClass('agentlink-compact-send-btn');
		this.sendBtn.addEventListener('click', () => this.handleSend());

		this.stopBtn = sendBtnContainer.createEl('button', { text: 'Stop' });
		this.stopBtn.addClass('agentlink-compact-stop-btn');
		this.stopBtn.style.display = 'none';
		this.stopBtn.addEventListener('click', () => this.handleStop());

		// Load and render ACP session state from adapter
		void this.refreshSessionFeatures();

		// Phase 5: Setup autocomplete listeners
		this.setupAutocompleteListeners();

		// Add animation styles
		if (!document.getElementById('agentlink-animations')) {
			const style = document.createElement('style');
			style.id = 'agentlink-animations';
			style.textContent = `
				@keyframes agentlink-led-blink {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.3; }
				}

				.agentlink-inline-composer:empty::before {
					content: attr(data-placeholder);
					color: var(--text-muted);
					pointer-events: none;
				}
			`;
			document.head.appendChild(style);
		}

		this.refreshStatus();
	}

	private applyToolbarSelectorButtonStyle(button: HTMLButtonElement, color: string): void {
		button.addClass('agentlink-toolbar-selector-btn');
		button.style.minWidth = ChatView.TOOLBAR_BUTTON_MIN_WIDTH;
		button.style.maxWidth = ChatView.TOOLBAR_BUTTON_MAX_WIDTH;
		button.style.setProperty('--agentlink-toolbar-selector-color', color);
	}

	private applyHeaderActionButtonStyle(button: HTMLButtonElement, ariaLabel: string): void {
		button.addClass('agentlink-header-action-btn');
		button.setAttribute('aria-label', ariaLabel);
		button.setAttribute('data-tooltip-position', 'bottom');
	}

	private renderBackendIcon(container: HTMLElement, iconValue?: string, fallbackIcon: string = 'bot'): void {
		container.empty();
		if (iconValue && this.isImageLikeIcon(iconValue)) {
			const image = container.createEl('img');
			image.src = iconValue;
			image.alt = '';
			image.style.width = '100%';
			image.style.height = '100%';
			image.style.objectFit = 'contain';
			image.style.borderRadius = '3px';
			return;
		}

		if (iconValue) {
			container.setText(iconValue);
			container.style.fontSize = '0.85rem';
			container.style.lineHeight = '1';
			return;
		}

		setIcon(container, fallbackIcon);
	}

	private isImageLikeIcon(iconValue: string): boolean {
		const trimmed = iconValue.trim().toLowerCase();
		return trimmed.startsWith('http://')
			|| trimmed.startsWith('https://')
			|| trimmed.startsWith('data:image/')
			|| trimmed.endsWith('.svg')
			|| trimmed.endsWith('.png')
			|| trimmed.endsWith('.jpg')
			|| trimmed.endsWith('.jpeg')
			|| trimmed.endsWith('.webp');
	}

	private applyToolbarDropdownStyle(
		container: HTMLElement,
		alignment: 'left' | 'right' = 'left',
		maxHeight?: string,
	): void {
		container.addClass('agentlink-toolbar-dropdown');
		container.toggleClass('is-align-left', alignment === 'left');
		container.toggleClass('is-align-right', alignment === 'right');
		container.style.minWidth = ChatView.TOOLBAR_DROPDOWN_MIN_WIDTH;
		container.style.maxWidth = ChatView.TOOLBAR_DROPDOWN_MAX_WIDTH;
		if (maxHeight) {
			container.style.maxHeight = maxHeight;
			container.style.overflowY = 'auto';
		} else {
			container.style.removeProperty('max-height');
			container.style.overflowY = 'visible';
		}
	}

	private applyToolbarDropdownHeaderStyle(header: HTMLElement): void {
		header.addClass('agentlink-toolbar-dropdown-header');
	}

	private applyToolbarDropdownItemStyle(item: HTMLButtonElement): void {
		item.addClass('agentlink-toolbar-dropdown-item');
	}

	private applySingleLineEllipsis(element: HTMLElement, fontSize: string, color?: string): void {
		element.addClass('agentlink-single-line-ellipsis');
		element.style.setProperty('--agentlink-ellipsis-font-size', fontSize);
		if (color) {
			element.style.setProperty('--agentlink-ellipsis-color', color);
		} else {
			element.style.removeProperty('--agentlink-ellipsis-color');
		}
	}

	// ── Resize Handle ────────────────────────────────────────────────────

	private setupResizeHandle(): void {
		let isResizing = false;
		let startY = 0;
		let startHeight = 0;

		this.resizeHandle.addEventListener('mousedown', (e) => {
			isResizing = true;
			startY = e.clientY;
			startHeight = this.inputAreaContainer.offsetHeight;
			document.body.style.cursor = 'row-resize';
			e.preventDefault();
		});

		this.registerDocumentListener('mousemove', (e) => {
			if (!isResizing) return;
			const deltaY = startY - e.clientY;
			const newHeight = Math.max(this.inputMinHeight, startHeight + deltaY);
			const maxHeight = this.containerEl.offsetHeight * this.inputMaxHeightRatio;
			const clampedHeight = Math.min(newHeight, maxHeight);
			this.inputAreaContainer.style.height = `${clampedHeight}px`;
			this.inputAreaContainer.style.flex = 'none';
		});

		this.registerDocumentListener('mouseup', () => {
			if (isResizing) {
				isResizing = false;
				document.body.style.cursor = '';
			}
		});
	}

	// ── Config Options (Dynamic rendering) ───────────────────────────────────

	/** Load configOptions from adapter and render buttons */
	private async refreshSessionFeatures(): Promise<void> {
		await this.loadConfigOptions();
		this.updateModelSelector();
		this.renderContextUsage();
		this.renderPlanPanel();
	}

	/** Load configOptions from adapter and render buttons */
	private async loadConfigOptions(): Promise<void> {
		if (!this.configButtonsContainer) return;

		// Get configOptions from adapter (may be empty if not supported)
		const configOptions = this.adapter?.getConfigOptions?.() ?? [];
		this.sessionConfig = { configOptions };
		const toolbarOptions = configOptions.filter((option) => option.category !== 'model');

		render(
			h(ConfigToolbar, {
				options: toolbarOptions,
				onSelect: async (configId: string, value: string | boolean) => {
					await this.handleConfigOptionChange(configId, value);
				},
			}),
			this.configButtonsContainer,
		);
	}

	private async handleConfigOptionChange(configId: string, value: string | boolean): Promise<void> {
		const target = this.sessionConfig.configOptions.find((o) => o.id === configId);
		if (!target) return;

		try {
			const updated = this.adapter?.setConfigOption
				? await this.adapter.setConfigOption(configId, value)
				: this.sessionConfig.configOptions.map((o) =>
						o.id === configId
							? o.type === 'boolean'
								? { ...o, currentValue: Boolean(value) }
								: { ...o, currentValue: String(value) }
							: o,
				  );

			this.sessionConfig = { configOptions: updated };
			const selectedLabel = target.type === 'select'
				? target.options.find((item) => item.value === value)?.name ?? String(value)
				: value ? 'On' : 'Off';
			new Notice(`${target.name}: ${selectedLabel}`);
			await this.refreshSessionFeatures();
		} catch (error) {
			logger.error('Failed to set config option:', error);
			new Notice(`Failed to set ${target.name}`);
		}
	}

	private getModelConfigOption(): ConfigOption | null {
		const modelOption = this.sessionConfig.configOptions.find(
			(option) => option.category === 'model' && option.type === 'select',
		);
		return modelOption ?? null;
	}

	private updateModelSelector(): void {
		if (!this.modelSelectorBtn) {
			return;
		}

		const modelOption = this.getModelConfigOption();
		const labelEl = this.modelSelectorBtn.querySelector('span') as HTMLElement | null;
		const hasSelectableModels = Boolean(modelOption && modelOption.type === 'select' && modelOption.options.length > 1);

		this.modelSelectorBtn.style.display = hasSelectableModels ? 'flex' : 'none';

		if (!labelEl) {
			return;
		}

		if (!modelOption || modelOption.type !== 'select') {
			labelEl.textContent = 'Model';
			return;
		}

		const current = modelOption.options.find((item) => item.value === modelOption.currentValue);
		labelEl.textContent = current?.name ?? modelOption.name;
	}

	private renderContextUsage(): void {
		if (!this.contextUsageContainer || !this.contextUsageRing || !this.contextUsageTooltip) {
			return;
		}

		const usage = this.adapter?.getContextUsage?.() ?? null;
		if (!usage || usage.maxTokens === undefined || usage.percentage === undefined) {
			this.contextUsageContainer.style.display = 'none';
			this.contextUsageTooltip.style.display = 'none';
			this.contextUsageTooltip.empty();
			this.contextUsageButton.removeAttribute('title');
			return;
		}

		this.contextUsageContainer.style.display = 'flex';
		const percentage = Math.max(0, Math.min(100, usage.percentage));
		this.contextUsageRing.style.background = `conic-gradient(var(--interactive-accent) 0deg ${percentage * 3.6}deg, var(--background-modifier-border) ${percentage * 3.6}deg 360deg)`;
		this.contextUsageButton.title = `${this.formatCompactTokens(usage.usedTokens)} / ${this.formatCompactTokens(usage.maxTokens)} tokens (${percentage}%)`;

		this.contextUsageTooltip.empty();
		this.renderContextUsageTooltip(this.contextUsageTooltip, usage);
	}

	private renderContextUsageTooltip(container: HTMLElement, usage: ContextUsageState): void {
		const header = container.createEl('div', { text: 'Context window' });
		header.style.fontSize = '0.8rem';
		header.style.fontWeight = '600';
		header.style.color = 'var(--text-normal)';
		header.style.marginBottom = '0.2rem';

		const summary = container.createEl('div', {
			text: `${this.formatCompactTokens(usage.usedTokens)} / ${this.formatCompactTokens(usage.maxTokens ?? 0)} tokens · ${usage.percentage ?? 0}%`,
		});
		summary.style.fontSize = '0.72rem';
		summary.style.color = 'var(--text-muted)';
		summary.style.marginBottom = usage.sections?.length ? '0.55rem' : '0';

		if (usage.summary) {
			const note = container.createEl('div', { text: usage.summary });
			note.style.fontSize = '0.72rem';
			note.style.color = 'var(--text-muted)';
			note.style.marginBottom = usage.sections?.length ? '0.5rem' : '0';
		}

		for (const section of usage.sections ?? []) {
			const title = container.createEl('div', { text: section.title });
			title.style.fontSize = '0.72rem';
			title.style.fontWeight = '600';
			title.style.color = 'var(--text-normal)';
			title.style.marginTop = '0.35rem';
			title.style.marginBottom = '0.2rem';

			for (const item of section.items) {
				const row = container.createDiv();
				row.style.display = 'flex';
				row.style.alignItems = 'center';
				row.style.justifyContent = 'space-between';
				row.style.gap = '0.8rem';
				row.style.fontSize = '0.72rem';
				row.style.color = 'var(--text-muted)';

				row.createEl('span', { text: item.label });
				row.createEl('span', { text: this.formatCompactTokens(item.usedTokens) });
			}
		}
	}

	private formatCompactTokens(tokens: number): string {
		if (tokens >= 1_000_000) {
			return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
		}
		if (tokens >= 1_000) {
			return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
		}
		return `${tokens}`;
	}

	private renderPlanPanel(): void {
		if (!this.planContainer) return;

		const plan = this.adapter?.getPlan?.() ?? [];
		this.planContainer.empty();

		if (plan.length === 0) {
			this.planContainer.style.display = 'none';
			return;
		}

		this.planContainer.style.display = 'block';

		const titleRow = this.planContainer.createDiv();
		titleRow.style.display = 'flex';
		titleRow.style.alignItems = 'center';
		titleRow.style.justifyContent = 'space-between';
		titleRow.style.marginBottom = '0.25rem';

		const title = titleRow.createEl('span', { text: 'Plan' });
		title.style.fontSize = '0.72rem';
		title.style.fontWeight = '600';

		const modeLabel = this.adapter?.getCurrentMode?.();
		if (modeLabel) {
			const modeBadge = titleRow.createEl('span', { text: modeLabel });
			modeBadge.style.fontSize = '0.68rem';
			modeBadge.style.color = 'var(--text-muted)';
		}

		for (const entry of plan) {
			this.renderPlanEntry(entry);
		}
	}

	private renderPlanEntry(entry: PlanEntry): void {
		const row = this.planContainer.createDiv();
		row.style.display = 'flex';
		row.style.alignItems = 'flex-start';
		row.style.gap = '0.4rem';
		row.style.padding = '0.15rem 0';

		const marker = row.createEl('span', { text: this.getPlanMarker(entry.status) });
		marker.style.flexShrink = '0';
		marker.style.color = this.getPlanColor(entry.status);

		const content = row.createDiv();
		content.style.minWidth = '0';

		const text = content.createEl('div', { text: entry.content });
		text.style.fontSize = '0.75rem';
		text.style.color = 'var(--text-normal)';

		const meta = content.createEl('div', { text: `${entry.status} · ${entry.priority}` });
		meta.style.fontSize = '0.68rem';
		meta.style.color = 'var(--text-muted)';
	}

	private getPlanMarker(status: PlanEntry['status']): string {
		switch (status) {
			case 'completed':
				return '●';
			case 'in_progress':
				return '◐';
			default:
				return '○';
		}
	}

	private getPlanColor(status: PlanEntry['status']): string {
		switch (status) {
			case 'completed':
				return 'var(--color-green)';
			case 'in_progress':
				return 'var(--color-orange)';
			default:
				return 'var(--text-faint)';
		}
	}

	// ── Message sending ────────────────────────────────────────────────

	private async handleSend(): Promise<void> {
		const originalPrompt = this.getComposerText().trim();
		if (!originalPrompt || this.isBusy) return;

		const builtinCommand = parseBuiltinSlashCommandPrompt(originalPrompt);
		if (builtinCommand) {
			const handled = await this.executeSlashCommand(builtinCommand.commandId, builtinCommand.args);
			if (handled) {
				this.clearComposer();
				return;
			}
		}

		const prompt = originalPrompt;
		if (!prompt || this.isBusy) return;

		this.clearComposer();
		await this.turnService.sendMessage(prompt);
	}

	private async handleStop(): Promise<void> {
		logger.debug('ChatView: user requested stop');
		try {
			await this.turnService.cancelTurn();
		} catch (err) {
			logger.error('ChatView: cancel failed', err);
		}
	}

	private finishStreaming(): void {
		this.streamingMsgId = null;
		this.streamingEl = null;
		this.setBusy(false);
		this.persistCurrentSession('stream-finished');
		this.scrollToBottom();
	}

	// ── Rendering helpers ──────────────────────────────────────────────

	private renderWelcome(): void {
		this.messageListRenderer.renderWelcome();
	}

	private renderMessage(msg: ChatMessage): HTMLElement {
		return this.messageListRenderer.renderMessage(msg);
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
		this.messageListRenderer.renderAssistantContent(el, content);
	}

	private renderInlineError(message: string): void {
		this.messageListRenderer.renderInlineError(message);
	}

	private appendStatusMessage(text: string): void {
		this.messageListRenderer.appendStatusMessage(text);
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
		this.thinkingMessageIds.clear();
		this.messagesEl.empty();
		this.renderWelcome();
		this.statusEl?.setText('');
		this.renderInputStateBar();
		this.persistCurrentSession('clear-conversation');
	}

	private setBusy(busy: boolean): void {
		this.isBusy = busy;
		this.sendBtn.disabled = busy;
		this.sendBtn.style.display = busy ? 'none' : '';
		this.stopBtn.style.display = busy ? '' : 'none';
		
		// Update status LED using centralized method
		if (busy) {
			this.updateLedState('busy');
		} else {
			const adapterState = this.adapter?.getStatus().state ?? 'disconnected';
			this.updateLedState(adapterState === 'busy' ? 'connected' : adapterState);
		}
	}

	private refreshStatus(): void {
		// Update agent selector text to show actual agent name
		if (this.agentSelectorBtn) {
			const activeBackend = getActiveBackendConfig(this.settings);
			if (this.agentSelectorLabelEl) {
				this.agentSelectorLabelEl.textContent = activeBackend?.name ?? 'Agent';
			}
			if (this.agentSelectorIconEl) {
				this.renderBackendIcon(this.agentSelectorIconEl, activeBackend?.icon);
			}
		}

		// Update status LED using centralized method
		const statusState = this.adapter?.getStatus().state ?? 'disconnected';
		this.updateLedState(statusState);
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	// ── Tool Call & File Edit Rendering ──────────────────────────────────

	// Tool call & file edit handlers

	private async handleToolConfirm(msgId: string): Promise<void> {
		await this.turnService.confirmToolCall(msgId);
	}

	private rerenderMessage(msgId: string): void {
		const msg = this.session.getMessages().find(m => m.id === msgId);
		if (!msg) return;

		this.messageListRenderer.rerenderMessage(msg);
	}

	private async handleToolReject(msgId: string): Promise<void> {
		logger.debug('ChatView: tool call rejected', msgId);
		await this.turnService.rejectToolCall(msgId);
	}

	private async handleFileEditConfirm(msgId: string): Promise<void> {
		logger.debug('ChatView: file edit confirmed', msgId);
		await this.turnService.confirmFileEdit(msgId);
	}

	private async handleFileEditReject(msgId: string): Promise<void> {
		logger.debug('ChatView: file edit rejected', msgId);
		this.turnService.rejectFileEdit(msgId);
	}

	// ── Session Management ───────────────────────────────────────────────

	/** Initialize session on open - load existing or create new */
	private initializeSession(): void {
		this.chatSessionService.initializeSession();
	}

	/** Create a new session */
	private createNewSession(): void {
		this.chatSessionService.createNewSession();
	}

	/** Load a session by ID */
	private loadSession(sessionId: string): void {
		this.chatSessionService.loadSession(sessionId);
	}

	private async prepareAdapterSession(options?: { reset?: boolean }): Promise<void> {
		await this.chatSessionService.prepareAdapterSession(options);
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
		this.headerSessionController.openSessionList();
	}

	private async switchBackend(backendId: string): Promise<void> {
		this.settings.activeBackendId = backendId;
		this.updateLedState('connecting');
		await this.onSettingsSave();
		this.refreshStatus();
	}

	private async handleThinkingModeChange(mode: 'none' | 'quick' | 'balanced' | 'deep'): Promise<void> {
		this.settings.thinkingMode = mode;
		await this.onSettingsSave();
	}

	private async deleteSession(sessionId: string): Promise<void> {
		await this.chatSessionService.deleteSession(sessionId);
	}

	/** Render Agent selector dropdown */
	private renderAgentDropdown(container: HTMLElement): void {
		this.toolbarController.renderAgentDropdown(container);
	}

	/** Render Model selector dropdown */
	private renderModelDropdown(container: HTMLElement): void {
		this.toolbarController.renderModelDropdown(container);
	}

	/** Render Thinking intensity dropdown */
	private renderThinkingDropdown(container: HTMLElement, triggerBtn: HTMLButtonElement): void {
		this.toolbarController.renderThinkingDropdown(container, triggerBtn);
	}

	/** Render inline history dropdown */
	private renderHistoryDropdown(container: HTMLElement): void {
		this.headerSessionController.renderHistoryDropdown(container);
	}

	/** Save current session */
	private async saveCurrentSession(): Promise<void> {
		await this.chatSessionService.saveCurrentSession();
	}

	private persistCurrentSession(reason: string): void {
		this.chatSessionService.persistCurrentSession(reason);
	}

	// ── Phase 5: Input State Bar & Autocomplete ─────────────────────────

	private renderInputStateBar(): void {
		this.refreshPlaceholderState();
	}

	private refreshPlaceholderState(): void {
		this.composerController.refreshPlaceholderState();
	}

	private getComposerText(): string {
		return this.composerController.getText();
	}

	private setComposerText(text: string): void {
		this.composerController.setText(text);
	}

	private clearComposer(): void {
		this.composerController.clear();
	}

	private focusComposer(): void {
		this.composerController.focus();
	}

	private captureComposerSelection(): void {
		this.composerController.captureSelection();
	}

	private restoreComposerSelection(): void {
		this.composerController.restoreSelection();
	}

	private getTextBeforeCaret(): string {
		return this.composerController.getTextBeforeCaret();
	}

	private replaceTriggerTextInCurrentNode(triggerChar: string): { trailingText: string } | null {
		return this.composerController.replaceTriggerTextInCurrentNode(triggerChar);
	}

	private insertTextAtCursor(text: string): void {
		this.composerController.insertTextAtCursor(text);
	}

	private insertInlineToken(config: InlineTokenConfig): void {
		this.composerController.insertInlineToken(config);
	}

	private setupAutocompleteListeners(): void {
		if (!this.inputEl) return;

		this.inputEl.addEventListener('input', () => {
			this.captureComposerSelection();
			const textBeforeCursor = this.getTextBeforeCaret();

			// Check for trigger characters
			const lastSlash = textBeforeCursor.lastIndexOf('/');
			const lastAt = textBeforeCursor.lastIndexOf('@');
			const lastHash = textBeforeCursor.lastIndexOf('#');
			const lastSpace = Math.max(
				textBeforeCursor.lastIndexOf(' '),
				textBeforeCursor.lastIndexOf('\n')
			);

			// Determine if we're in a trigger context (find the most recent trigger)
			const triggers = [
				{ char: '/', index: lastSlash, type: 'slash' as const },
				{ char: '@', index: lastAt, type: 'mention' as const },
				{ char: '#', index: lastHash, type: 'topic' as const },
			];
			
			const activeTrigger = triggers
				.filter(t => t.index > lastSpace)
				.sort((a, b) => b.index - a.index)[0];

			if (activeTrigger) {
				this.currentAutocompleteTrigger = activeTrigger.type;
				this.currentAutocompleteQuery = textBeforeCursor.substring(activeTrigger.index + 1);
			} else {
				this.currentAutocompleteTrigger = null;
				this.currentAutocompleteQuery = '';
			}

			if (this.currentAutocompleteTrigger) {
				this.showAutocomplete(this.currentAutocompleteTrigger, this.currentAutocompleteQuery);
			} else {
				this.hideAutocomplete();
			}

			this.refreshPlaceholderState();
		});
	}

	private refreshAutocompleteFromInput(): void {
		if (!this.isAutocompleteOpen || !this.currentAutocompleteTrigger) {
			return;
		}

		this.showAutocomplete(this.currentAutocompleteTrigger, this.currentAutocompleteQuery);
	}

	/** Show autocomplete menu */
	private showAutocomplete(trigger: AutocompleteTrigger, query: string): void {
		if (!this.autocompleteContainer) return;

		this.isAutocompleteOpen = true;
		
		let suggestions: Array<{ id: string; label: string; description?: string; icon?: string; data?: unknown; source?: 'builtin' | 'agent' }> = [];

		if (trigger === 'slash') {
			// Get builtin commands
			const builtinSuggestions = createSlashCommandSuggestions().filter(s =>
				s.label.toLowerCase().includes(query.toLowerCase())
			);
			
			// Get available commands from ACP adapter
			const availableCommands = this.adapter?.getAvailableCommands?.() || [];
			const agentSuggestions = createAvailableCommandSuggestions(availableCommands).filter(s =>
				s.label.toLowerCase().includes(query.toLowerCase())
			);
			
			// Combine: builtin first, then agent
			suggestions = [...builtinSuggestions, ...agentSuggestions];
		} else if (trigger === 'mention') {
			const activeFile = this.app.workspace.getActiveFile();
			const files = this.contextService.searchFiles(query, 10);
			const folders = this.contextService.searchFolders(query, 5);
			suggestions = [
				...createFileSuggestions(files, activeFile),
				...createFolderSuggestions(folders),
			];
		} else if (trigger === 'topic') {
			// Get topics from session history
			const sessionTopics = this.extractSessionTopics();
			suggestions = createTopicSuggestions(sessionTopics, query);
		}

		// Position autocomplete above the input
		const position = {
			x: 0,
			y: 0,
		};

		render(
			h(InputAutocomplete, {
				trigger,
				query,
				position,
				suggestions,
				onSelect: (item) => {
					this.handleAutocompleteSelect(item, trigger);
					this.hideAutocomplete();
				},
				onClose: () => this.hideAutocomplete(),
			}),
			this.autocompleteContainer
		);
	}

	/** Extract topics from session history */
	private extractSessionTopics(): string[] {
		const messages = this.session.getMessages();
		const topics = new Set<string>();
		
		// Add some default topics
		const defaultTopics = [
			'Current Session',
			'Previous Context',
			'Workspace',
			'Recent Files',
		];
		defaultTopics.forEach(t => topics.add(t));
		
		// Extract keywords from user messages
		messages
			.filter(m => m.role === 'user')
			.slice(-5)
			.forEach(m => {
				const words = m.content.split(/\s+/).filter(w => w.length > 4);
				words.slice(0, 3).forEach(w => topics.add(w));
			});
		
		return Array.from(topics).slice(0, 10);
	}

	/** Hide autocomplete menu */
	private hideAutocomplete(): void {
		this.isAutocompleteOpen = false;
		this.currentAutocompleteTrigger = null;
		this.currentAutocompleteQuery = '';
		if (this.autocompleteContainer) {
			render(null, this.autocompleteContainer);
		}
	}

	/** Handle autocomplete item selection */
	private async handleAutocompleteSelect(
		item: { id: string; label: string; description?: string; icon?: string; data?: unknown; source?: 'builtin' | 'agent' },
		trigger: AutocompleteTrigger
	): Promise<void> {
		this.inputEl.focus();
		this.restoreComposerSelection();

		if (trigger === 'slash') {
			this.replaceTriggerTextInCurrentNode('/');
			const commandId = item.id;
			const insertion = item.source === 'agent'
				? (() => {
					const command = item.data as { name: string; description: string; input?: { hint: string } | null } | undefined;
					return command
						? buildAgentSlashCommandText(command)
						: `/${commandId}`;
				})()
				: item.label;
			this.insertInlineToken({
				kind: 'command',
				id: `command-${Date.now()}`,
				label: insertion,
				rawText: insertion,
			});
		} else if (trigger === 'mention') {
			this.replaceTriggerTextInCurrentNode('@');
			const data = item.data as { type: string; file: { path: string; name: string } } | undefined;
			const file = data?.file;
			
			if (file?.path) {
				const attachment = await this.contextService.createFileAttachment(file.path);
				if (attachment) {
					this.insertInlineToken({
						kind: 'attachment',
						id: `attachment-${attachment.id}`,
						label: attachment.name,
						rawText: attachment.name,
						removableId: attachment.id,
					});
				}
			}
		} else if (trigger === 'topic') {
			this.replaceTriggerTextInCurrentNode('#');
			this.insertTextAtCursor(`#${item.label} `);
		}
		this.focusComposer();
		this.refreshPlaceholderState();
	}

	private removeSlashCommandPreview(): void {
		this.composerController.removeSlashCommandPreview();
		this.refreshAutocompleteFromInput();
		this.refreshPlaceholderState();
	}

	/** Handle attach file button click */
	private async handleAttachFile(): Promise<void> {
		// Open file suggester modal
		const files = this.app.vault.getFiles();
		const filePaths = files.map(f => f.path).sort();

		// Simple prompt for now - could use a proper suggester modal
		const selectedPath = await this.promptForFile(filePaths);
		if (selectedPath) {
			const attachment = await this.contextService.createFileAttachment(selectedPath);
			if (attachment) {
				this.insertInlineToken({
					kind: 'attachment',
					id: `attachment-${attachment.id}`,
					label: attachment.name,
					rawText: attachment.name,
					removableId: attachment.id,
				});
			} else {
				new Notice('Failed to attach file');
			}
		}
	}

	/** Prompt user to select a file */
	private promptForFile(files: string[]): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('Attach File');

			const inputContainer = modal.contentEl.createDiv();
			const input = inputContainer.createEl('input', {
				type: 'text',
				placeholder: 'Type to search files...',
				cls: 'agentlink-file-input',
			});
			input.style.width = '100%';
			input.focus();

			const listContainer = modal.contentEl.createDiv({
				cls: 'agentlink-file-list',
			});
			listContainer.style.maxHeight = '300px';
			listContainer.style.overflowY = 'auto';
			listContainer.style.marginTop = '0.5rem';

			const renderList = (filter: string) => {
				listContainer.empty();
				const filtered = files.filter(f =>
					f.toLowerCase().includes(filter.toLowerCase())
				).slice(0, 20);

				for (const file of filtered) {
					const item = listContainer.createEl('button', {
						text: file,
						cls: 'agentlink-file-item',
					});
					item.addClass('agentlink-file-picker-item');
					item.addEventListener('click', () => {
						modal.close();
						resolve(file);
					});
					item.addEventListener('mouseenter', () => {
						item.addClass('is-hover');
					});
					item.addEventListener('mouseleave', () => {
						item.removeClass('is-hover');
					});
				}
			};

			input.addEventListener('input', () => renderList(input.value));
			renderList('');

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

			modal.open();
		});
	}

	/** Handle attach selection button click */
	private handleAttachSelection(): void {
		const editor = this.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice('No active editor');
			return;
		}

		const selection = editor.getSelection();
		if (!selection) {
			new Notice('No text selected');
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		const attachment = this.contextService.createSelectionAttachment(
			selection,
			activeFile?.name
		);

		if (attachment) {
			this.insertInlineToken({
				kind: 'attachment',
				id: `attachment-${attachment.id}`,
				label: attachment.name,
				rawText: attachment.name,
				removableId: attachment.id,
			});
		}
	}

	/** Execute slash command */
	private async executeSlashCommand(commandId: string, args = ''): Promise<boolean> {
		switch (commandId) {
			case 'clear':
				this.clearConversation();
				new Notice('Conversation cleared');
				return true;
				
			case 'help':
				this.showHelpMessage();
				return true;
				
			default:
				console.warn('[ChatView] Unknown slash command:', commandId);
				if (args) {
					console.log('[ChatView] Slash command args:', args);
				}
				return false;
		}
	}

	/** Show help message */
	private showHelpMessage(): void {
		const helpText = `## Available Commands

**Slash Commands:**
- **/clear** - Clear current conversation
- **/help** - Show this help message

**Shortcuts:**
- **Enter** - Send message
- **Shift+Enter** - New line
- **Ctrl+Enter** - New line

**Mentions:**
- **@** - Reference a file or folder
- **#** - Reference a topic

**Tips:**
- Use @ to attach files as context
- Use # to reference previous conversation topics
- Clear conversation anytime with /clear`;

		const msg = this.session.addMessage('assistant', helpText);
		this.renderMessage(msg);
	}

	/** Handle attach current note button click */
	private async handleAttachCurrentNote(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active note');
			return;
		}

		const attachment = await this.contextService.createFileAttachment(activeFile.path);
		if (attachment) {
			this.insertInlineToken({
				kind: 'attachment',
				id: `attachment-${attachment.id}`,
				label: attachment.name,
				rawText: attachment.name,
				removableId: attachment.id,
			});
		} else {
			new Notice('Failed to attach note');
		}
	}
}



