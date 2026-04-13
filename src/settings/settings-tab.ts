import { App, PluginSettingTab, Setting, Modal, ButtonComponent, Notice } from 'obsidian';
import AgentLinkPlugin from '../main';
import { AgentBackendConfig, BackendType, AcpBridgeBackendConfig } from '../core/types';
import { AgentLinkSettings, getBackendTypeLabel, generateBackendId, createAcpBridgeBackendConfig, mergeAcpRegistryIntoSettings, TerminalShellOption } from './settings';
import { fetchAcpRegistry } from './registry-utils';
import { AcpAgentEditorModal } from './acp-agent-editor';
import { LocalAgentScanModal } from './local-agent-scanner';
import { SettingsPatch } from './settings-store';

export class AgentLinkSettingTab extends PluginSettingTab {
	plugin: AgentLinkPlugin;
	private editingBackendId: string | null = null;
	private delayedSaveHandle: ReturnType<typeof setTimeout> | null = null;
	private activeTab: 'agent' | 'agent-advanced' | 'history' | 'acp-subscription' = 'agent';
	private selectedHistorySessionIds = new Set<string>();
	private pendingSingleDeleteSessionId: string | null = null;
	private pendingBulkDelete = false;
	private pendingClearHistory = false;
	private pendingSettingsPatch: SettingsPatch = {};
	private pendingPatchRebuild = false;

	constructor(app: App, plugin: AgentLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private buildCurrentSettingsPatch(): SettingsPatch {
		return {
			...this.plugin.settings,
			backends: this.plugin.settings.backends.map((backend) => ({ ...backend })),
		};
	}

	private async applyCurrentSettings(options?: {
		rebuildAdapter?: boolean;
		persist?: boolean;
		refreshView?: boolean;
		updateHistoryExpiry?: boolean;
	}): Promise<void> {
		await this.plugin.applySettingsPatch(this.buildCurrentSettingsPatch(), options);
	}

	private async applySettingsPatch(
		patch: SettingsPatch,
		options?: {
			rebuildAdapter?: boolean;
			persist?: boolean;
			refreshView?: boolean;
			updateHistoryExpiry?: boolean;
		},
	): Promise<void> {
		await this.plugin.applySettingsPatch(patch, options);
	}

	private async setSetting<K extends keyof AgentLinkSettings>(
		key: K,
		value: AgentLinkSettings[K],
		options?: {
			rebuildAdapter?: boolean;
			persist?: boolean;
			refreshView?: boolean;
			updateHistoryExpiry?: boolean;
		},
	): Promise<void> {
		await this.applySettingsPatch({ [key]: value } as SettingsPatch, options);
	}

	private scheduleSettingsPatch(
		patch: SettingsPatch,
		options?: { rebuildAdapter?: boolean },
		delayMs = 250,
	): void {
		this.pendingSettingsPatch = { ...this.pendingSettingsPatch, ...patch };
		this.pendingPatchRebuild = this.pendingPatchRebuild || (options?.rebuildAdapter ?? false);

		if (this.delayedSaveHandle !== null) {
			clearTimeout(this.delayedSaveHandle);
		}

		this.delayedSaveHandle = setTimeout(() => {
			const pendingPatch = this.pendingSettingsPatch;
			const rebuild = this.pendingPatchRebuild;
			this.pendingSettingsPatch = {};
			this.pendingPatchRebuild = false;
			this.delayedSaveHandle = null;

			void this.applySettingsPatch(pendingPatch, { rebuildAdapter: rebuild }).catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`Failed to save settings: ${message}`);
			});
		}, delayMs);
	}

	private scheduleSettingsSave(options?: { rebuildAdapter?: boolean }, delayMs = 250): void {
		if (this.delayedSaveHandle !== null) {
			clearTimeout(this.delayedSaveHandle);
		}

		this.delayedSaveHandle = setTimeout(() => {
			this.delayedSaveHandle = null;
			void this.applyCurrentSettings(options).catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`Failed to save settings: ${message}`);
			});
		}, delayMs);
	}

	private parsePositiveInteger(value: string): number | null {
		const parsed = Number.parseInt(value, 10);
		if (Number.isNaN(parsed) || parsed < 0) {
			return null;
		}
		return parsed;
	}

	private createSettingsTabButton(
		container: HTMLElement,
		label: string,
		tab: 'agent' | 'agent-advanced' | 'history' | 'acp-subscription'
	): HTMLButtonElement {
		const button = container.createEl('button', { text: label });
		const isActive = this.activeTab === tab;
		button.style.border = '1px solid var(--background-modifier-border)';
		button.style.background = isActive ? 'var(--interactive-accent)' : 'var(--background-secondary)';
		button.style.color = isActive ? 'var(--text-on-accent)' : 'var(--text-normal)';
		button.style.borderRadius = '6px';
		button.style.padding = '0.3em 0.8em';
		button.style.cursor = 'pointer';
		button.style.fontSize = '0.85em';
		button.style.fontWeight = isActive ? '600' : '500';
		button.addEventListener('click', () => {
			if (this.activeTab === tab) {
				return;
			}
			this.activeTab = tab;
			this.pendingBulkDelete = false;
			this.pendingClearHistory = false;
			this.pendingSingleDeleteSessionId = null;
			this.display();
		});
		return button;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'AgentLink Settings' });

		const tabBar = containerEl.createDiv();
		tabBar.style.display = 'flex';
		tabBar.style.flexWrap = 'wrap';
		tabBar.style.gap = '0.5em';
		tabBar.style.marginBottom = '1em';
		tabBar.style.paddingBottom = '0.75em';
		tabBar.style.borderBottom = '1px solid var(--background-modifier-border)';
		this.createSettingsTabButton(tabBar, 'Agent', 'agent');
		this.createSettingsTabButton(tabBar, 'Agent advanced', 'agent-advanced');
		this.createSettingsTabButton(tabBar, 'History', 'history');
		this.createSettingsTabButton(tabBar, 'ACP subscription', 'acp-subscription');

		const contentEl = containerEl.createDiv();
		switch (this.activeTab) {
			case 'agent':
				this.renderAgentTab(contentEl);
				return;
			case 'agent-advanced':
				this.renderAgentAdvancedTab(contentEl);
				return;
			case 'history':
				this.renderConversationHistoryTab(contentEl);
				return;
			case 'acp-subscription':
				this.renderAcpSubscriptionTab(contentEl);
				return;
			default:
				this.renderAgentTab(contentEl);
		}
	}

	private renderAgentTab(containerEl: HTMLElement): void {
		this.renderBackendManagement(containerEl);
		containerEl.createEl('h3', { text: 'Agent options' });
		this.renderGlobalSettings(containerEl);
	}

	private renderAgentAdvancedTab(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Agent advanced' });
		this.renderAgentAdvancedSettings(containerEl);
		containerEl.createEl('h3', { text: 'Tool safety' });
		this.renderToolCallSettings(containerEl);
	}

	private renderAcpSubscriptionTab(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'ACP subscription' });
		this.renderRegistrySettings(containerEl);
	}

	// 岸岸 Backend Management 岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸岸
	private renderBackendManagement(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Agent Backends' });

		// Backend list
		const backendList = containerEl.createDiv({ cls: 'agentlink-backend-list' });
		backendList.style.marginTop = '1em';
		backendList.style.marginBottom = '1em';

		// Get enabled backends first, then disabled
		const sortedBackends = [...this.plugin.settings.backends].sort((a, b) => {
			const aEnabled = a.enabled !== false ? 1 : 0;
			const bEnabled = b.enabled !== false ? 1 : 0;
			if (aEnabled !== bEnabled) return bEnabled - aEnabled;
			return a.name.localeCompare(b.name);
		});

		sortedBackends.forEach(backend => {
			this.renderBackendItem(backendList, backend);
		});

		// Add new backend buttons
		const addBtnContainer = containerEl.createDiv();
		addBtnContainer.style.display = 'flex';
		addBtnContainer.style.gap = '0.5em';
		addBtnContainer.style.marginTop = '1em';

		// Scan Local Agents button
		new ButtonComponent(addBtnContainer)
			.setButtonText('🔍 Scan Local')
			.setTooltip('Scan for locally installed ACP agents')
			.onClick(() => {
				new LocalAgentScanModal(this.app, this.plugin.settings.backends, async (agent) => {
					this.plugin.settings.backends.push(agent);
					this.plugin.settings.activeBackendId = agent.id;
					await this.applyCurrentSettings();
					this.display();
					new Notice(`Added ${agent.name}`);
				}).open();
			});

		// Add ACP Bridge button
		new ButtonComponent(addBtnContainer)
			.setButtonText('+ ACP Bridge')
			.setCta()
			.onClick(() => {
				this.openAddBackendModal('acp-bridge');
			});

		// Import/Export buttons
		const importExportContainer = containerEl.createDiv();
		importExportContainer.style.display = 'flex';
		importExportContainer.style.gap = '0.5em';
		importExportContainer.style.marginTop = '0.5em';
		importExportContainer.style.borderTop = '1px solid var(--background-modifier-border)';
		importExportContainer.style.paddingTop = '1em';

		new ButtonComponent(importExportContainer)
			.setButtonText('📥 Import Config')
			.setTooltip('Import backends from JSON file')
			.onClick(() => {
				this.importConfig();
			});

		new ButtonComponent(importExportContainer)
			.setButtonText('📤 Export Config')
			.setTooltip('Export all backends to JSON file')
			.onClick(() => {
				this.exportConfig();
			});

		// Edit section (if editing)
		if (this.editingBackendId) {
			const backend = this.plugin.settings.backends.find(b => b.id === this.editingBackendId);
			if (backend) {
				containerEl.createEl('h4', { text: `Edit Backend: ${backend.name}` });
				this.renderBackendEditor(containerEl, backend);
			}
		}
	}

	private renderBackendItem(container: HTMLElement, backend: AgentBackendConfig): void {
		const item = container.createDiv({ cls: 'agentlink-backend-item' });
		item.style.display = 'flex';
		item.style.alignItems = 'center';
		item.style.padding = '0.75em';
		item.style.border = '1px solid var(--background-modifier-border)';
		item.style.borderRadius = '4px';
		item.style.marginBottom = '0.5em';
		
		// Determine background color based on state
		const isActive = backend.id === this.plugin.settings.activeBackendId;
		const isEnabled = backend.enabled !== false;
		
		if (isActive) {
			// Current active backend - green background
			item.style.backgroundColor = 'var(--background-modifier-success-hover)';
		} else if (!isEnabled) {
			// Disabled backend - muted background
			item.style.backgroundColor = 'var(--background-secondary)';
			item.style.opacity = '0.6';
		} else {
			// Enabled but not active - transparent
			item.style.backgroundColor = 'transparent';
		}

		// Enabled checkbox
		const checkboxContainer = item.createDiv();
		checkboxContainer.style.marginRight = '0.75em';
		const checkbox = checkboxContainer.createEl('input');
		checkbox.type = 'checkbox';
		checkbox.checked = isEnabled;
		checkbox.style.cursor = 'pointer';
		checkbox.addEventListener('change', async () => {
			backend.enabled = checkbox.checked;
			await this.applyCurrentSettings();
			this.display();
		});

		// Info
		const info = item.createDiv();
		info.style.flex = '1';
		info.style.minWidth = '0';
		
		const nameRow = info.createDiv();
		nameRow.style.display = 'flex';
		nameRow.style.alignItems = 'center';
		nameRow.style.gap = '0.5em';
		
		nameRow.createEl('strong', { 
			text: backend.name,
			cls: isEnabled ? '' : 'setting-item-description'
		});
		
		// Active indicator
		if (isActive) {
			const activeBadge = nameRow.createEl('span', {
				text: '(Active)',
				cls: 'setting-item-description'
			});
			activeBadge.style.color = 'var(--text-success)';
			activeBadge.style.fontWeight = 'bold';
		}
		
		if (!isEnabled) {
			nameRow.createEl('span', {
				text: '(Disabled)',
				cls: 'setting-item-description'
			});
		}
		
		const typeText = info.createEl('div', {
			text: `${getBackendTypeLabel(backend.type)}${backend.type === 'acp-bridge' && (backend as AcpBridgeBackendConfig).version ? ` v${(backend as AcpBridgeBackendConfig).version}` : ''}`,
			cls: 'setting-item-description'
		});
		typeText.style.fontSize = '0.85em';
		typeText.style.marginTop = '0.2em';

		// Actions
		const actions = item.createDiv();
		actions.style.display = 'flex';
		actions.style.gap = '0.5em';
		actions.style.flexShrink = '0';

		// Use button (only show if enabled and not active)
		if (isEnabled && !isActive) {
			new ButtonComponent(actions)
				.setButtonText('Use')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.activeBackendId = backend.id;
					await this.applyCurrentSettings();
					this.display();
					new Notice(`Switched to ${backend.name}`);
				});
		}

		// Edit button - open unified editor modal
		new ButtonComponent(actions)
			.setButtonText('Edit')
			.onClick(() => {
				if (backend.type === 'acp-bridge') {
					new AcpAgentEditorModal(this.app, backend as AcpBridgeBackendConfig, false, async (updatedConfig) => {
						// Update the backend in settings
						const index = this.plugin.settings.backends.findIndex(b => b.id === updatedConfig.id);
						if (index !== -1) {
							this.plugin.settings.backends[index] = updatedConfig;
							await this.applyCurrentSettings();
							this.display();
						}
					}).open();
				} else {
					// For mock backends, use inline editor
					this.editingBackendId = backend.id;
					this.display();
				}
			});

		// Delete button (don't allow deleting last backend or active backend)
		const canDelete = this.plugin.settings.backends.length > 1 &&
			backend.id !== this.plugin.settings.activeBackendId;

		new ButtonComponent(actions)
			.setButtonText('Delete')
			.setDisabled(!canDelete)
			.setWarning()
			.onClick(async () => {
				if (!canDelete) return;
				this.plugin.settings.backends = this.plugin.settings.backends.filter(b => b.id !== backend.id);
				await this.applyCurrentSettings();
				this.display();
			});
	}

	private renderBackendEditor(container: HTMLElement, backend: AgentBackendConfig): void {
		const editorContainer = container.createDiv();
		editorContainer.style.padding = '1em';
		editorContainer.style.border = '1px solid var(--background-modifier-border)';
		editorContainer.style.borderRadius = '4px';
		editorContainer.style.backgroundColor = 'var(--background-secondary)';

		// Common fields for all types
		new Setting(editorContainer)
			.setName('Backend Name')
			.setDesc('Display name for this backend.')
			.addText(text => {
				text.setValue(backend.name)
					.onChange((value) => {
						backend.name = value || backend.id;
						this.scheduleSettingsSave({ rebuildAdapter: false });
					});
			});

		new Setting(editorContainer)
			.setName('Backend ID')
			.setDesc('Unique identifier (cannot be changed).')
			.addText(text => {
				text.setValue(backend.id)
					.setDisabled(true);
			});

		// Type-specific fields
		if (backend.type === 'acp-bridge') {
			this.renderAcpBridgeSettings(editorContainer, backend as AcpBridgeBackendConfig);
		}

		// Close button
		new Setting(editorContainer)
			.addButton(btn => btn
				.setButtonText('Done')
				.setCta()
				.onClick(() => {
					this.editingBackendId = null;
					this.display();
				}));
	}

	private renderAcpBridgeSettings(container: HTMLElement, config: AcpBridgeBackendConfig): void {
		container.createEl('h4', { text: 'ACP Bridge Configuration' });

		new Setting(container)
			.setName('Command')
			.setDesc('Command to start the agent (or full path if not in PATH).')
			.addText(text => {
				text.setPlaceholder('kimi')
					.setValue(config.command)
					.onChange((value) => {
						config.command = value;
						this.scheduleSettingsSave({ rebuildAdapter: true });
					});
			});

		new Setting(container)
			.setName('Arguments')
			.setDesc('Command arguments (space-separated).')
			.addText(text => {
				text.setPlaceholder('acp')
					.setValue(config.args.join(' '))
					.onChange((value) => {
						config.args = value.trim().split(/\s+/).filter(Boolean);
						this.scheduleSettingsSave({ rebuildAdapter: true });
					});
			});

		if (config.version) {
			new Setting(container)
				.setName('Detected Version')
				.setDesc('Auto-detected from installed agent.')
				.addText(text => {
					text.setValue(config.version || '')
						.setDisabled(true);
				});
		}

		if (config.registryAgentId) {
			new Setting(container)
				.setName('Registry ID')
				.setDesc('ACP Registry agent identifier.')
				.addText(text => {
					text.setValue(config.registryAgentId || '')
						.setDisabled(true);
				});
		}
	}

	// ── ACP Registry Settings ────────────────────────────────────────────

	private renderRegistrySettings(containerEl: HTMLElement): void {
		// Enable ACP Registry Sync toggle
		new Setting(containerEl)
			.setName('Enable ACP Registry Sync')
			.setDesc('Automatically sync ACP agents from CDN')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.enableAcpRegistrySync)
					.onChange(async (value) => {
						await this.setSetting('enableAcpRegistrySync', value, { rebuildAdapter: false });
					});
			});

		// Sync Interval number input
		new Setting(containerEl)
			.setName('Sync Interval (hours)')
			.setDesc('How often to sync from ACP CDN (1-168 hours)')
			.addText(text => {
				text.setPlaceholder('12')
					.setValue(String(this.plugin.settings.acpRegistrySyncIntervalHours))
					.onChange((value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n >= 1 && n <= 168) {
							this.scheduleSettingsPatch({ acpRegistrySyncIntervalHours: n }, { rebuildAdapter: false });
						}
					});
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.inputEl.max = '168';
			});

		// Show last sync time if available
		if (this.plugin.settings.lastAcpRegistrySync) {
			const lastSync = new Date(this.plugin.settings.lastAcpRegistrySync);
			new Setting(containerEl)
				.setName('Last Sync')
				.setDesc(`Last successful sync: ${lastSync.toLocaleString()}`)
				.setDisabled(true);
		}

		// Sync Now button
		new Setting(containerEl)
			.setName('Manual Sync')
			.setDesc('Force sync ACP registry from CDN now')
			.addButton(button => {
				button.setButtonText('Sync Now')
					.onClick(async () => {
						button.setDisabled(true);
						button.setButtonText('Syncing...');
						try {
							const result = await fetchAcpRegistry();
							if (result) {
								const { backends, lastSync } = await mergeAcpRegistryIntoSettings(this.app, this.plugin.settings);
								this.plugin.settings.backends = backends;
								this.plugin.settings.lastAcpRegistrySync = lastSync;
								await this.applyCurrentSettings();
								new Notice(`Synced ${result.agents?.length || 0} ACP agents from registry`);
								this.display();
							}
						} catch (error) {
							const message = error instanceof Error ? error.message : String(error);
							new Notice(`Sync failed: ${message}`);
						} finally {
							button.setDisabled(false);
							button.setButtonText('Sync Now');
						}
					});
			});

		// Add Custom ACP Agent button
		new Setting(containerEl)
			.setName('Custom Agent')
			.setDesc('Add a custom ACP agent configuration')
			.addButton(button => {
				button.setButtonText('Add Custom ACP Agent')
					.onClick(() => {
						this.openAddBackendModal('acp-bridge');
					});
			});
	}

	// ── Global Settings ──────────────────────────────────────────────────

	private renderGlobalSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Request Timeout (ms)')
			.setDesc('Default timeout for all backends. 0 = no timeout.')
			.addText((text) => {
				text.setValue(String(this.plugin.settings.requestTimeoutMs));
				text.inputEl.type = 'number';
				text.inputEl.min = '0';
				text.onChange((value) => {
					const parsed = this.parsePositiveInteger(value);
					if (parsed === null) {
						return;
					}
					this.scheduleSettingsPatch({ requestTimeoutMs: parsed }, { rebuildAdapter: false });
				});
			});

		new Setting(containerEl)
			.setName('Auto-reconnect')
			.setDesc('Automatically reconnect when the backend connection is lost.')
			.addToggle(
				(t) => t.setValue(this.plugin.settings.autoReconnect).onChange(async (v) => {
					await this.setSetting('autoReconnect', v, { rebuildAdapter: false });
				})
			);

		new Setting(containerEl)
			.setName('Terminal shell')
			.setDesc('Shell used by terminal tool calls. Use "Custom executable/path" for a manual shell path.')
			.addDropdown((dropdown) => {
				dropdown.addOption('auto', 'Auto (recommended)');
				dropdown.addOption('pwsh', 'PowerShell 7 (pwsh)');
				dropdown.addOption('powershell', 'Windows PowerShell');
				dropdown.addOption('cmd', 'Command Prompt (cmd)');
				dropdown.addOption('bash', 'Bash');
				dropdown.addOption('zsh', 'Zsh');
				dropdown.addOption('sh', 'POSIX sh');
				dropdown.addOption('custom', 'Custom executable/path');
				dropdown.setValue(this.plugin.settings.terminalShell);
				dropdown.onChange(async (value) => {
					await this.setSetting('terminalShell', value as TerminalShellOption, { rebuildAdapter: false });
				});
			});
	}

	private renderAgentAdvancedSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('System Prompt')
			.setDesc('A system-level instruction sent to agents.')
			.addTextArea((ta) => {
				ta.setValue(this.plugin.settings.systemPrompt)
					.setPlaceholder('You are a helpful AI assistant.')
					.onChange((v) => {
						this.scheduleSettingsPatch({ systemPrompt: v }, { rebuildAdapter: false });
					});
				ta.inputEl.rows = 3;
				ta.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName('Enable Debug Log')
			.setDesc('Print verbose debug messages to the developer console.')
			.addToggle(
				(t) => t.setValue(this.plugin.settings.enableDebugLog).onChange(async (v) => {
					await this.setSetting('enableDebugLog', v, { rebuildAdapter: false });
				})
			);

		new Setting(containerEl)
			.setName('ACP connection cache TTL (minutes)')
			.setDesc('Keep inactive ACP agents connected for this many minutes after switching. Set to 0 to disable caching.')
			.addText((text) => {
				text.setValue(String(this.plugin.settings.acpConnectionCacheTtlMinutes));
				text.inputEl.type = 'number';
				text.inputEl.min = '0';
				text.onChange((value) => {
					const parsed = this.parsePositiveInteger(value);
					if (parsed === null) {
						return;
					}
					this.scheduleSettingsPatch({ acpConnectionCacheTtlMinutes: parsed }, { rebuildAdapter: false });
				});
			});

		if (this.plugin.settings.terminalShell === 'custom') {
			new Setting(containerEl)
				.setName('Custom terminal shell path')
				.setDesc('Absolute path or executable name to run the terminal tool.')
				.addText((text) => {
					text.setPlaceholder(process.platform === 'win32' ? 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' : '/bin/bash');
					text.setValue(this.plugin.settings.terminalShellCustomPath);
					text.onChange((value) => {
						this.scheduleSettingsPatch({ terminalShellCustomPath: value }, { rebuildAdapter: false });
					});
				});
		} else {
			new Setting(containerEl)
				.setName('Custom terminal shell path')
				.setDesc('Set terminal shell to "Custom executable/path" on Agent tab to edit this field.')
				.setDisabled(true);
		}
	}

	private renderToolCallSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Auto-confirm Read Operations')
			.setDesc('Automatically confirm read-only operations (read_file, list_dir, search).')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoConfirmRead).onChange(async (v) => {
					await this.setSetting('autoConfirmRead', v, { rebuildAdapter: false });
				})
			);

		new Setting(containerEl)
			.setName('Auto-confirm File Edits')
			.setDesc('DANGER: Automatically confirm file modifications without review!')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoConfirmEdit).onChange(async (v) => {
					await this.setSetting('autoConfirmEdit', v, { rebuildAdapter: false });
				})
			);

		new Setting(containerEl)
			.setName('Show Thinking Process')
			.setDesc('Display agent thinking/reasoning process in chat.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.showThinking).onChange(async (v) => {
					await this.setSetting('showThinking', v, { rebuildAdapter: false });
				})
			);
	}

	private renderConversationHistoryTab(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Conversation history' });

		new Setting(containerEl)
			.setName('Session history expiry (days)')
			.setDesc('Automatically remove chat history older than this many days. Set to 0 to disable expiration.')
			.addText((text) => {
				text.setPlaceholder('30');
				text.setValue(String(this.plugin.settings.sessionHistoryExpiryDays));
				text.inputEl.type = 'number';
				text.inputEl.min = '0';
				text.onChange((value) => {
					const parsed = this.parsePositiveInteger(value);
					if (parsed === null) {
						return;
					}
					this.scheduleSettingsPatch({ sessionHistoryExpiryDays: parsed }, { rebuildAdapter: false });
				});
			});

		new Setting(containerEl)
			.setName('Remove expired sessions now')
			.setDesc('Run expiration cleanup immediately with the current expiry rule.')
			.addButton((button) => {
				button.setButtonText('Run cleanup');
				button.onClick(async () => {
					const removed = await this.plugin.sessionManager.removeExpiredSessions();
					new Notice(removed > 0 ? `Removed ${removed} expired sessions.` : 'No expired sessions found.');
					this.selectedHistorySessionIds.clear();
					this.pendingSingleDeleteSessionId = null;
					this.pendingBulkDelete = false;
					this.pendingClearHistory = false;
					this.display();
				});
			});

		const sessions = this.plugin.sessionManager.getAllSessions();
		const currentSessionId = this.plugin.sessionManager.getCurrentSessionId();
		const validSessionIds = new Set(sessions.map((session) => session.id));
		for (const selectedId of [...this.selectedHistorySessionIds]) {
			if (!validSessionIds.has(selectedId)) {
				this.selectedHistorySessionIds.delete(selectedId);
			}
		}

		const selectableSessions = sessions.filter((session) => session.id !== currentSessionId);
		const allSelected = selectableSessions.length > 0
			&& selectableSessions.every((session) => this.selectedHistorySessionIds.has(session.id));
		const selectedCount = this.selectedHistorySessionIds.size;

		const actionsRow = containerEl.createDiv();
		actionsRow.style.display = 'flex';
		actionsRow.style.flexWrap = 'wrap';
		actionsRow.style.gap = '0.5em';
		actionsRow.style.marginTop = '0.8em';
		actionsRow.style.marginBottom = '0.8em';

		new ButtonComponent(actionsRow)
			.setButtonText(allSelected ? 'Unselect all' : 'Select all')
			.setDisabled(selectableSessions.length === 0)
			.onClick(() => {
				if (allSelected) {
					this.selectedHistorySessionIds.clear();
				} else {
					for (const session of selectableSessions) {
						this.selectedHistorySessionIds.add(session.id);
					}
				}
				this.pendingBulkDelete = false;
				this.display();
			});

		new ButtonComponent(actionsRow)
			.setButtonText(this.pendingBulkDelete ? `Click again to delete (${selectedCount})` : `Delete selected (${selectedCount})`)
			.setWarning()
			.setDisabled(selectedCount === 0)
			.onClick(async () => {
				if (selectedCount === 0) {
					return;
				}
				if (!this.pendingBulkDelete) {
					this.pendingBulkDelete = true;
					this.pendingClearHistory = false;
					this.pendingSingleDeleteSessionId = null;
					this.display();
					return;
				}
				const result = await this.plugin.sessionManager.deleteSessions([...this.selectedHistorySessionIds]);
				this.selectedHistorySessionIds.clear();
				this.pendingBulkDelete = false;
				this.pendingSingleDeleteSessionId = null;
				this.display();
				const skippedMsg = result.skippedCurrent > 0 ? ` (${result.skippedCurrent} current session skipped)` : '';
				new Notice(`Deleted ${result.deleted} sessions${skippedMsg}.`);
			});

		new ButtonComponent(actionsRow)
			.setButtonText(this.pendingClearHistory ? 'Click again to clear history' : 'Clear all history')
			.setWarning()
			.setDisabled(sessions.length === 0)
			.onClick(async () => {
				if (!this.pendingClearHistory) {
					this.pendingClearHistory = true;
					this.pendingBulkDelete = false;
					this.pendingSingleDeleteSessionId = null;
					this.display();
					return;
				}
				const removed = await this.plugin.sessionManager.clearAllSessions({ keepCurrent: true });
				this.selectedHistorySessionIds.clear();
				this.pendingClearHistory = false;
				this.pendingBulkDelete = false;
				this.pendingSingleDeleteSessionId = null;
				this.display();
				new Notice(removed > 0 ? `Cleared ${removed} saved sessions.` : 'No saved sessions to clear.');
			});

		const helper = containerEl.createEl('div', {
			text: 'Current session is preserved to avoid interrupting an active chat.',
			cls: 'setting-item-description',
		});
		helper.style.marginBottom = '0.5em';

		if (sessions.length === 0) {
			containerEl.createEl('p', { text: 'No conversation history yet.', cls: 'setting-item-description' });
			return;
		}

		const list = containerEl.createDiv();
		list.style.display = 'flex';
		list.style.flexDirection = 'column';
		list.style.gap = '0.5em';

		for (const session of sessions) {
			const row = list.createDiv();
			row.style.display = 'grid';
			row.style.gridTemplateColumns = 'auto 1fr auto';
			row.style.gap = '0.6em';
			row.style.alignItems = 'start';
			row.style.padding = '0.55em 0.65em';
			row.style.border = '1px solid var(--background-modifier-border)';
			row.style.borderRadius = '8px';
			row.style.background = 'var(--background-secondary)';

			const isCurrent = session.id === currentSessionId;

			const checkbox = row.createEl('input');
			checkbox.type = 'checkbox';
			checkbox.style.marginTop = '0.25em';
			checkbox.checked = this.selectedHistorySessionIds.has(session.id);
			checkbox.disabled = isCurrent;
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedHistorySessionIds.add(session.id);
				} else {
					this.selectedHistorySessionIds.delete(session.id);
				}
				this.pendingBulkDelete = false;
				this.display();
			});

			const info = row.createDiv();
			const title = info.createEl('div', { text: session.title });
			title.style.fontWeight = '600';
			title.style.marginBottom = '0.15em';
			const updated = new Date(session.updatedAt).toLocaleString();
			info.createEl('div', {
				text: `${updated} · ${session.messageCount} messages${isCurrent ? ' · current session' : ''}`,
				cls: 'setting-item-description',
			});

			const preview = this.buildSessionPreview(session.id);
			if (preview) {
				const previewEl = info.createEl('div', { text: preview, cls: 'setting-item-description' });
				previewEl.style.marginTop = '0.25em';
				previewEl.style.lineHeight = '1.4';
			}

			const rowActions = row.createDiv();
			rowActions.style.display = 'flex';
			rowActions.style.gap = '0.4em';

			new ButtonComponent(rowActions)
				.setButtonText(
					this.pendingSingleDeleteSessionId === session.id
						? 'Confirm delete'
						: 'Delete'
				)
				.setWarning()
				.setDisabled(isCurrent)
				.onClick(async () => {
					if (isCurrent) {
						return;
					}
					if (this.pendingSingleDeleteSessionId !== session.id) {
						this.pendingSingleDeleteSessionId = session.id;
						this.pendingBulkDelete = false;
						this.pendingClearHistory = false;
						this.display();
						return;
					}
					this.pendingSingleDeleteSessionId = null;
					this.selectedHistorySessionIds.delete(session.id);
					await this.plugin.sessionManager.deleteSession(session.id);
					this.display();
					new Notice('Session deleted.');
				});
		}
	}

	private buildSessionPreview(sessionId: string): string {
		const session = this.plugin.sessionManager.getSession(sessionId);
		if (!session || session.messages.length === 0) {
			return '';
		}
		const firstUserMessage = session.messages.find((message) => message.role === 'user') ?? session.messages[0];
		const content = firstUserMessage.content.replace(/\s+/g, ' ').trim();
		if (!content) {
			return '';
		}
		return content.length > 120 ? `${content.slice(0, 117)}...` : content;
	}

	// ── Modal for Adding Backends ────────────────────────────────────────

	private openAddBackendModal(type: BackendType): void {
		new AddBackendModal(this.app, type, async (name: string) => {
			const id = generateBackendId(type);
			let newBackend: AgentBackendConfig;

			if (type === 'acp-bridge') {
				newBackend = createAcpBridgeBackendConfig(id, name);
			} else {
				throw new Error(`Unsupported backend type: ${type}`);
			}

			this.plugin.settings.backends.push(newBackend);
			// Auto-switch to new backend
			this.plugin.settings.activeBackendId = id;
			await this.applyCurrentSettings();
			this.display();
		}).open();
	}

	// ── Import/Export ──────────────────────────────────────────────────────

	private async importConfig(): Promise<void> {
		// Create hidden file input
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.style.display = 'none';
		document.body.appendChild(input);

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) {
				document.body.removeChild(input);
				return;
			}

			try {
				const text = await file.text();
				const imported = JSON.parse(text);

				// Validate imported data
				if (!Array.isArray(imported)) {
					new Notice('Invalid config format: expected an array of backends');
					document.body.removeChild(input);
					return;
				}

				// Validate each backend
				for (const backend of imported) {
					if (!backend.id || !backend.type || !backend.name) {
						new Notice(`Invalid backend config: missing required fields`);
						document.body.removeChild(input);
						return;
					}
				}

				// Merge with existing: skip duplicates by ID
				let addedCount = 0;
				let skippedCount = 0;
				for (const backend of imported) {
					const exists = this.plugin.settings.backends.some(b => b.id === backend.id);
					if (exists) {
						skippedCount++;
					} else {
						this.plugin.settings.backends.push(backend);
						addedCount++;
					}
				}

				await this.applyCurrentSettings();
				this.display();
				new Notice(`Imported ${addedCount} backends (${skippedCount} skipped as duplicates)`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`Import failed: ${message}`);
			} finally {
				document.body.removeChild(input);
			}
		};

		input.click();
	}

	private exportConfig(): void {
		const data = this.plugin.settings.backends;
		const json = JSON.stringify(data, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		// Create download link
		const a = document.createElement('a');
		a.href = url;
		a.download = `agentlink-config-${new Date().toISOString().split('T')[0]}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		new Notice(`Exported ${data.length} backends to JSON`);
	}
}

// ── Add Backend Modal ──────────────────────────────────────────────────

class AddBackendModal extends Modal {
	private type: BackendType;
	private onConfirm: (name: string) => void;
	private name: string = '';

	constructor(app: App, type: BackendType, onConfirm: (name: string) => void) {
		super(app);
		this.type = type;
		this.onConfirm = onConfirm;
		// Set default name
		this.name = `New ${getBackendTypeLabel(type)}`;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: `Add ${getBackendTypeLabel(this.type)}` });

		new Setting(contentEl)
			.setName('Backend Name')
			.setDesc('A display name for this backend configuration.')
			.addText(text => {
				text.setValue(this.name)
					.onChange(value => {
						this.name = value;
					});
				text.inputEl.focus();
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => this.close()))
			.addButton(btn => btn
				.setButtonText('Add')
				.setCta()
				.onClick(() => {
					if (this.name.trim()) {
						this.onConfirm(this.name.trim());
						this.close();
					}
				}));
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

