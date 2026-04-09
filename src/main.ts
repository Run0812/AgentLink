/* ────────────────────────────────────────────────────────────────────────
 * AgentLink — Obsidian plugin entry point.
 *
 * Wires together: settings, adapter, and the chat view.
 * ──────────────────────────────────────────────────────────────────────── */

import { Notice, Plugin } from 'obsidian';
import { AgentAdapter, AgentBackendConfig } from './core/types';
import { logger } from './core/logger';
import {
	AgentLinkSettings,
	DEFAULT_SETTINGS,
	getActiveBackendConfig,
	findBackendConfig,
	createMockBackendConfig,
	createKimiBackendConfig,
} from './settings/settings';
import { fetchAcpRegistry, saveLocalAcpRegistry } from './settings/registry-utils';
import { AgentLinkSettingTab } from './settings/settings-tab';
import { ChatView, AGENTLINK_VIEW_TYPE } from './ui/chat-view';
import { MockAdapter } from './adapters/mock-adapter';
import { AcpBridgeAdapter, AcpBridgeAdapterConfig } from './adapters/acp-bridge-adapter';
import { SessionManager } from './services/session-manager';

export default class AgentLinkPlugin extends Plugin {
	settings!: AgentLinkSettings;
	private adapter: AgentAdapter | null = null;
	sessionManager!: SessionManager;

	// ── Lifecycle ──────────────────────────────────────────────────────

async onload(): Promise<void> {
		await this.loadSettings();
		
		// Initialize SessionManager
		this.sessionManager = new SessionManager(this);
		await this.sessionManager.initialize();
		
		logger.setDebug(this.settings.enableDebugLog);
		logger.info('AgentLink: loading plugin');
		
		// Sync ACP registry data (just download for local reference, don't auto-add agents)
		if (this.settings.enableAcpRegistrySync) {
			await this.syncRegistryData();
		}
		
		this.buildAdapter();

		// Register the custom sidebar view
		this.registerView(AGENTLINK_VIEW_TYPE, (leaf) => {
			const view = new ChatView(
				leaf, 
				this.settings, 
				() => this.settings, 
				async () => { await this.saveSettings(); },
				this.sessionManager
			);
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
			name: 'Switch to next backend',
			callback: () => this.switchToNextBackend(),
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
		const loaded = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

		// Migration: ensure we always have at least one backend
		if (!this.settings.backends || this.settings.backends.length === 0) {
			this.settings.backends = [createMockBackendConfig()];
			this.settings.activeBackendId = 'mock-default';
		}

		// Migration: migrate old ACP bridge configs to new format
		this.settings.backends = this.settings.backends.map(backend => {
			if (backend.type === 'acp-bridge' && 'bridgeCommand' in backend) {
				// Migrate from old format to new format
				const oldConfig = backend as any;
				return {
					type: 'acp-bridge' as const,
					id: oldConfig.id,
					name: oldConfig.name,
					command: oldConfig.bridgeCommand || '',
					args: oldConfig.bridgeArgs ? oldConfig.bridgeArgs.split(/\s+/).filter(Boolean) : [],
					version: undefined,
					registryAgentId: undefined,
				};
			}
			return backend;
		});

		// Migration: add preset backends if missing
		this.ensurePresetBackends();

		// Ensure active backend exists
		const activeExists = this.settings.backends.some(
			b => b.id === this.settings.activeBackendId
		);
		if (!activeExists && this.settings.backends.length > 0) {
			this.settings.activeBackendId = this.settings.backends[0].id;
		}
	}

	/**
	 * Ensure preset backends (Kimi) exist in the configuration.
	 * Adds them if missing, without overwriting existing user configs.
	 */
	private ensurePresetBackends(): void {
		const presetFactories = [
			{ id: 'kimi', factory: createKimiBackendConfig },
		];

		for (const preset of presetFactories) {
			const exists = this.settings.backends.some(b => b.id === preset.id);
			if (!exists) {
				logger.info(`Adding preset backend: ${preset.id}`);
				this.settings.backends.push(preset.factory());
			}
		}
	}

	/**
	 * Sync ACP registry data from CDN to local storage.
	 * Only downloads the registry for reference, does NOT auto-add agents to settings.
	 */
	private async syncRegistryData(): Promise<void> {
		const now = Date.now();
		const lastSync = this.settings.lastAcpRegistrySync
			? new Date(this.settings.lastAcpRegistrySync).getTime()
			: 0;
		const intervalMs = this.settings.acpRegistrySyncIntervalHours * 3600 * 1000;
		const shouldSync = intervalMs === 0 || now - lastSync > intervalMs;

		if (!shouldSync) {
			return;
		}

		try {
			logger.info('[AgentLink] Syncing ACP registry from CDN...');
			const registry = await fetchAcpRegistry();
			await saveLocalAcpRegistry(this.app, registry);
			this.settings.lastAcpRegistrySync = new Date(now).toISOString();
			await this.saveData(this.settings);
			logger.info(`[AgentLink] Registry synced: ${registry.agents.length} agents available`);
		} catch (err) {
			console.warn('[AgentLink] Failed to fetch ACP registry from CDN:', err);
		}
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

	// ── Backend Management ─────────────────────────────────────────────

	/**
	 * Switch to the next backend in the list.
	 */
	private async switchToNextBackend(): Promise<void> {
		const backends = this.settings.backends;
		if (backends.length <= 1) {
			new Notice('AgentLink: No other backends to switch to.');
			return;
		}

		const currentIndex = backends.findIndex(b => b.id === this.settings.activeBackendId);
		const nextIndex = (currentIndex + 1) % backends.length;
		const nextBackend = backends[nextIndex];

		this.settings.activeBackendId = nextBackend.id;
		await this.saveSettings();

		new Notice(`AgentLink: Switched to ${nextBackend.name}`);
	}

	/**
	 * Switch to a specific backend by ID.
	 */
	async switchToBackend(backendId: string): Promise<void> {
		const backend = findBackendConfig(this.settings, backendId);
		if (!backend) {
			new Notice(`AgentLink: Backend "${backendId}" not found.`);
			return;
		}

		this.settings.activeBackendId = backendId;
		await this.saveSettings();
		new Notice(`AgentLink: Switched to ${backend.name}`);
	}

	// ── Adapter factory ────────────────────────────────────────────────

	private buildAdapter(): void {
		// Disconnect old adapter first
		if (this.adapter) {
			this.adapter.disconnect().catch(() => {});
		}

		const backendConfig = getActiveBackendConfig(this.settings);
		if (!backendConfig) {
			logger.warn('AgentLink: No active backend configured, falling back to mock');
			this.adapter = new MockAdapter();
			return;
		}

		logger.info('AgentLink: building adapter for', backendConfig.type, backendConfig.id);

		switch (backendConfig.type) {
			case 'mock':
				this.adapter = new MockAdapter();
				break;

		case 'acp-bridge': {
			const cfg: AcpBridgeAdapterConfig = {
				...backendConfig,
				app: this.app,
			};
			this.adapter = new AcpBridgeAdapter(cfg);
			break;
		}

		default:
			logger.warn(`AgentLink: unsupported backend type, falling back to mock`);
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
