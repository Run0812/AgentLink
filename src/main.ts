/* ────────────────────────────────────────────────────────────────────────
 * AgentLink — Obsidian plugin entry point.
 *
 * Wires together: settings, adapter, and the chat view.
 * ──────────────────────────────────────────────────────────────────────── */

import { Notice, Plugin } from 'obsidian';
import { AgentAdapter, BackendType } from './core/types';
import { logger } from './core/logger';
import { AgentLinkSettings, DEFAULT_SETTINGS, parseArgsString, parseEnvString } from './settings/settings';
import { AgentLinkSettingTab } from './settings/settings-tab';
import { ChatView, AGENTLINK_VIEW_TYPE } from './ui/chat-view';
import { MockAdapter } from './adapters/mock-adapter';
import { CliAdapter, CliAdapterConfig } from './adapters/cli-adapter';
import { HttpAdapter, HttpAdapterConfig } from './adapters/http-adapter';

export default class AgentLinkPlugin extends Plugin {
	settings!: AgentLinkSettings;
	private adapter: AgentAdapter | null = null;

	// ── Lifecycle ──────────────────────────────────────────────────────

	async onload(): Promise<void> {
		await this.loadSettings();
		logger.setDebug(this.settings.enableDebugLog);
		logger.info('AgentLink: loading plugin');

		this.buildAdapter();

		// Register the custom sidebar view
		this.registerView(AGENTLINK_VIEW_TYPE, (leaf) => {
			const view = new ChatView(leaf, this.settings, () => this.settings);
			if (this.adapter) view.setAdapter(this.adapter);
			return view;
		});

		// Ribbon icon
		this.addRibbonIcon('bot', 'Open Local Agent Chat', () => {
			this.activateView();
		});

		// Settings tab
		this.addSettingTab(new AgentLinkSettingTab(this.app, this));

		// Commands
		this.addCommand({
			id: 'open-local-agent-chat',
			name: 'Open Local Agent Chat',
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: 'send-selection-to-agent',
			name: 'Send selected text to agent',
			editorCallback: async (editor) => {
				const selection = editor.getSelection();
				if (!selection) {
					new Notice('AgentLink: No text selected.');
					return;
				}
				await this.activateView();
				setTimeout(() => {
					const view = this.getChatView();
					if (view) view.prefillInput(selection);
				}, 100);
			},
		});

		this.addCommand({
			id: 'switch-backend',
			name: 'Switch backend type',
			callback: () => {
				const types: BackendType[] = ['mock', 'cli', 'http'];
				const idx = types.indexOf(this.settings.backendType);
				const next = types[(idx + 1) % types.length];
				this.settings.backendType = next;
				this.saveSettings();
				new Notice(`AgentLink: Switched to ${next}`);
			},
		});

		logger.info('AgentLink: plugin loaded');
	}

	async onunload(): Promise<void> {
		logger.info('AgentLink: unloading plugin');
		if (this.adapter) {
			try {
				await this.adapter.disconnect();
			} catch {
				// best-effort
			}
		}
		this.app.workspace.detachLeavesOfType(AGENTLINK_VIEW_TYPE);
	}

	// ── Settings ───────────────────────────────────────────────────────

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		logger.setDebug(this.settings.enableDebugLog);
		await this.saveData(this.settings);
		this.buildAdapter();
		// Refresh the open view
		const view = this.getChatView();
		if (view) {
			view.setAdapter(this.adapter!);
			view.refreshSettings();
		}
	}

	// ── Adapter factory ────────────────────────────────────────────────

	private buildAdapter(): void {
		// Disconnect old adapter first
		if (this.adapter) {
			this.adapter.disconnect().catch(() => {});
		}

		const bt = this.settings.backendType;
		logger.info('AgentLink: building adapter for', bt);

		switch (bt) {
			case 'mock':
				this.adapter = new MockAdapter();
				break;

			case 'cli': {
				const cfg: CliAdapterConfig = {
					command: this.settings.command,
					args: parseArgsString(this.settings.args),
					cwd: this.settings.cwd,
					env: parseEnvString(this.settings.env),
					timeoutMs: this.settings.requestTimeoutMs,
				};
				this.adapter = new CliAdapter(cfg);
				break;
			}

			case 'http': {
				const cfg: HttpAdapterConfig = {
					baseURL: this.settings.baseURL,
					apiKey: this.settings.apiKey,
					model: this.settings.model,
					timeoutMs: this.settings.requestTimeoutMs,
					headers: {},
				};
				this.adapter = new HttpAdapter(cfg);
				break;
			}

			default:
				logger.warn(`AgentLink: unsupported backend type "${bt}", falling back to mock`);
				this.adapter = new MockAdapter();
				break;
		}
	}

	// ── View helpers ───────────────────────────────────────────────────

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(AGENTLINK_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: AGENTLINK_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	private getChatView(): ChatView | null {
		const leaves = this.app.workspace.getLeavesOfType(AGENTLINK_VIEW_TYPE);
		if (leaves.length === 0) return null;
		const view = leaves[0].view;
		return view instanceof ChatView ? view : null;
	}
}
