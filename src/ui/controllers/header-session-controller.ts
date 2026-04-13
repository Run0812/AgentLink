import { App, ButtonComponent, Modal, Notice } from 'obsidian';
import { SessionManager, SessionMetadata } from '../../services/session-manager';

export interface HeaderSessionControllerDeps {
	app: App;
	sessionManager: SessionManager;
	getCurrentSessionId: () => string | null;
	loadSession: (sessionId: string) => void;
	createNewSession: () => void;
	deleteSession: (sessionId: string) => Promise<void>;
}

export class HeaderSessionController {
	private deps: HeaderSessionControllerDeps;

	constructor(deps: HeaderSessionControllerDeps) {
		this.deps = deps;
	}

	openSessionList(): void {
		const modal = new Modal(this.deps.app);
		modal.titleEl.setText('Chat History');
		modal.contentEl.addClass('agentlink-session-list-modal');

		const sessions = this.deps.sessionManager.getAllSessions();

		if (sessions.length === 0) {
			modal.contentEl.createEl('p', {
				text: 'No chat history yet.',
				cls: 'setting-item-description',
			});
		} else {
			const listContainer = modal.contentEl.createDiv({ cls: 'agentlink-session-list' });
			for (const session of sessions) {
				this.renderSessionListItem(listContainer, session, modal);
			}
		}

		const footer = modal.contentEl.createDiv({ cls: 'agentlink-modal-footer' });
		footer.style.marginTop = '1em';
		footer.style.display = 'flex';
		footer.style.justifyContent = 'space-between';

		new ButtonComponent(footer)
			.setButtonText('New Chat')
			.setCta()
			.onClick(() => {
				this.deps.createNewSession();
				modal.close();
			});

		modal.open();
	}

	renderHistoryDropdown(container: HTMLElement): void {
		const sessions = this.deps.sessionManager.getAllSessions();
		const currentSessionId = this.deps.getCurrentSessionId();

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
		container.style.padding = '0.4rem';
		container.style.background = 'var(--background-primary)';
		container.style.border = '1px solid var(--background-modifier-border)';
		container.style.borderRadius = '8px';
		container.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.18)';

		const header = container.createEl('div', { text: 'Chat History' });
		header.style.fontSize = '0.75rem';
		header.style.color = 'var(--text-muted)';
		header.style.padding = '0.3rem 0.5rem';
		header.style.marginBottom = '0.25rem';
		header.style.borderBottom = '1px solid var(--background-modifier-border)';

		if (sessions.length === 0) {
			const empty = container.createEl('div', { text: 'No history' });
			empty.style.padding = '0.6rem 0.5rem';
			empty.style.color = 'var(--text-muted)';
			empty.style.fontSize = '0.75rem';
			return;
		}

		for (const session of sessions) {
			const item = container.createDiv();
			item.style.display = 'flex';
			item.style.alignItems = 'center';
			item.style.gap = '0.45rem';
			item.style.padding = '0.42rem 0.5rem';
			item.style.borderRadius = '6px';
			item.style.border = `1px solid ${session.id === currentSessionId ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}`;
			item.style.background = session.id === currentSessionId
				? 'var(--background-modifier-hover)'
				: 'transparent';
			item.style.marginBottom = '0.25rem';
			item.style.cursor = 'pointer';

			const info = item.createDiv();
			info.style.flex = '1';
			info.style.minWidth = '0';

			const title = info.createEl('div', { text: session.title });
			title.style.fontSize = '0.75rem';
			title.style.fontWeight = '600';
			title.style.whiteSpace = 'nowrap';
			title.style.overflow = 'hidden';
			title.style.textOverflow = 'ellipsis';

			const date = new Date(session.updatedAt).toLocaleString();
			const meta = info.createEl('div', {
				text: `${date} - ${session.messageCount} messages`,
			});
			meta.style.fontSize = '0.68rem';
			meta.style.color = 'var(--text-muted)';
			meta.style.whiteSpace = 'nowrap';
			meta.style.overflow = 'hidden';
			meta.style.textOverflow = 'ellipsis';

			item.addEventListener('click', () => {
				this.deps.loadSession(session.id);
				container.style.display = 'none';
			});

			const deleteBtn = item.createEl('button');
			deleteBtn.type = 'button';
			deleteBtn.style.padding = '0.2rem 0.4rem';
			deleteBtn.style.border = 'none';
			deleteBtn.style.borderRadius = '4px';
			deleteBtn.style.cursor = 'pointer';
			deleteBtn.style.fontSize = '0.68rem';
			deleteBtn.style.flexShrink = '0';

			let deleteArmed = false;
			let deleteArmedTimer: ReturnType<typeof setTimeout> | null = null;
			const setDeleteState = (armed: boolean): void => {
				deleteArmed = armed;
				if (armed) {
					deleteBtn.textContent = 'Confirm';
					deleteBtn.style.opacity = '1';
					deleteBtn.style.background = 'var(--background-modifier-error)';
					deleteBtn.style.color = 'var(--text-on-accent)';
					return;
				}

				deleteBtn.textContent = 'Delete';
				deleteBtn.style.opacity = '0.65';
				deleteBtn.style.background = 'transparent';
				deleteBtn.style.color = 'var(--text-muted)';
			};

			setDeleteState(false);

			deleteBtn.addEventListener('click', async (event) => {
				event.preventDefault();
				event.stopPropagation();

				if (!deleteArmed) {
					setDeleteState(true);
					if (deleteArmedTimer !== null) {
						clearTimeout(deleteArmedTimer);
					}
					deleteArmedTimer = setTimeout(() => {
						deleteArmedTimer = null;
						setDeleteState(false);
					}, 2500);
					return;
				}

				if (deleteArmedTimer !== null) {
					clearTimeout(deleteArmedTimer);
					deleteArmedTimer = null;
				}

				await this.deps.deleteSession(session.id);
				this.renderHistoryDropdown(container);
				new Notice('Session deleted');
			});
		}
	}

	private renderSessionListItem(
		container: HTMLElement,
		session: SessionMetadata,
		modal: Modal,
	): void {
		const currentSessionId = this.deps.getCurrentSessionId();
		const item = container.createDiv({
			cls: `agentlink-session-item ${session.id === currentSessionId ? 'is-active' : ''}`,
		});

		const info = item.createDiv({ cls: 'agentlink-session-item-info' });
		info.createEl('div', {
			text: session.title,
			cls: 'agentlink-session-item-title',
		});

		const date = new Date(session.updatedAt).toLocaleString();
		info.createEl('div', {
			text: `${date} - ${session.messageCount} messages`,
			cls: 'agentlink-session-item-meta',
		});

		const actions = item.createDiv({ cls: 'agentlink-session-item-actions' });

		new ButtonComponent(actions)
			.setButtonText(session.id === currentSessionId ? 'Current' : 'Load')
			.setDisabled(session.id === currentSessionId)
			.onClick(() => {
				this.deps.loadSession(session.id);
				modal.close();
			});

		const deleteBtn = new ButtonComponent(actions)
			.setButtonText('Delete')
			.setWarning();
		let deleteArmed = false;
		let deleteArmedTimer: ReturnType<typeof setTimeout> | null = null;
		const setDeleteState = (armed: boolean): void => {
			deleteArmed = armed;
			deleteBtn.setButtonText(armed ? 'Confirm' : 'Delete');
		};

		deleteBtn.onClick(async () => {
			if (!deleteArmed) {
				setDeleteState(true);
				if (deleteArmedTimer !== null) {
					clearTimeout(deleteArmedTimer);
				}
				deleteArmedTimer = setTimeout(() => {
					deleteArmedTimer = null;
					setDeleteState(false);
				}, 2500);
				return;
			}

			if (deleteArmedTimer !== null) {
				clearTimeout(deleteArmedTimer);
				deleteArmedTimer = null;
			}

			await this.deps.deleteSession(session.id);
			item.remove();
			new Notice('Session deleted');
		});
	}
}
