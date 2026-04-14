import type { AgentAdapter, ChatMessage } from './types';
import type { SessionStore } from '../services/session-store';
import type { SessionManager } from '../services/session-manager';

export interface ChatSessionPresenter {
	clearMessages(): void;
	renderWelcome(): void;
	renderMessage(message: ChatMessage): void;
	updateSessionTitle(title: string): void;
	refreshStatus(): void;
	renderInputStateBar(): void;
	focusComposer(): void;
}

export interface ChatSessionServiceDeps {
	sessionStore: SessionStore;
	sessionManager: SessionManager;
	getAdapter: () => AgentAdapter | null;
	getCurrentSessionId: () => string | null;
	setCurrentSessionId: (sessionId: string | null) => void;
	getActiveBackendId: () => string | undefined;
	presenter: ChatSessionPresenter;
	onWarning: (message: string, error: unknown) => void;
}

export class ChatSessionService {
	constructor(private readonly deps: ChatSessionServiceDeps) {}

	initializeSession(): void {
		const currentSession = this.deps.sessionManager.getCurrentSession();
		if (currentSession && currentSession.messages.length > 0) {
			this.loadSession(currentSession.id);
			return;
		}

		this.createNewSession();
	}

	createNewSession(): void {
		const currentSessionId = this.deps.getCurrentSessionId();
		if (currentSessionId) {
			this.persistCurrentSession('switch-create-session');
			const currentSession = this.deps.sessionManager.getSession(currentSessionId);
			if (currentSession && currentSession.messages.length === 0) {
				void this.prepareAdapterSession({ reset: true });
				this.deps.presenter.focusComposer();
				return;
			}
		}

		const session = this.deps.sessionManager.createSession();
		this.deps.setCurrentSessionId(session.id);
		this.deps.sessionStore.clear();
		this.deps.presenter.clearMessages();
		this.deps.presenter.renderWelcome();
		this.deps.presenter.updateSessionTitle(session.title);
		this.deps.presenter.refreshStatus();
		this.deps.presenter.renderInputStateBar();
		void this.prepareAdapterSession({ reset: true });
		this.deps.presenter.focusComposer();
	}

	loadSession(sessionId: string): void {
		const session = this.deps.sessionManager.getSession(sessionId);
		if (!session) {
			return;
		}

		const currentSessionId = this.deps.getCurrentSessionId();
		if (currentSessionId && currentSessionId !== sessionId) {
			this.persistCurrentSession('switch-load-session');
		}

		this.deps.setCurrentSessionId(sessionId);
		this.deps.sessionManager.setCurrentSession(sessionId);
		this.deps.sessionStore.clear();
		this.deps.presenter.clearMessages();

		for (const msg of session.messages) {
			const restored = this.deps.sessionStore.addMessage(msg.role, msg.content, msg.metadata);
			restored.id = msg.id;
			restored.timestamp = msg.timestamp;
			this.deps.presenter.renderMessage(restored);
		}

		this.deps.presenter.updateSessionTitle(session.title);
		this.deps.presenter.refreshStatus();
		this.deps.presenter.renderInputStateBar();
		void this.prepareAdapterSession();
	}

	async deleteSession(sessionId: string): Promise<void> {
		await this.deps.sessionManager.deleteSession(sessionId);
		if (sessionId === this.deps.getCurrentSessionId()) {
			this.createNewSession();
		}
	}

	async saveCurrentSession(): Promise<void> {
		const currentSessionId = this.deps.getCurrentSessionId();
		if (!currentSessionId) {
			return;
		}

		await this.deps.sessionManager.updateSession(
			currentSessionId,
			this.deps.sessionStore.getMessages(),
			this.deps.getActiveBackendId(),
		);
	}

	persistCurrentSession(reason: string): void {
		void this.saveCurrentSession().catch((error) => {
			this.deps.onWarning(`Chat session persist failed (${reason})`, error);
		});
	}

	async prepareAdapterSession(options?: { reset?: boolean }): Promise<void> {
		const adapter = this.deps.getAdapter();
		if (!adapter) {
			return;
		}

		try {
			if (adapter.prepareSession) {
				await adapter.prepareSession(options);
				return;
			}

			await adapter.connect();
		} catch (error) {
			this.deps.onWarning('Chat session prepare failed', error);
			this.deps.presenter.refreshStatus();
		}
	}
}
