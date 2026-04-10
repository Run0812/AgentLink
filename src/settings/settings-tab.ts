import { App, PluginSettingTab, Setting, Modal, ButtonComponent, Notice, ToggleComponent } from 'obsidian';
import AgentLinkPlugin from '../main';
import { AgentBackendConfig, BackendType, AcpBridgeBackendConfig } from '../core/types';
import { getBackendTypeLabel, isValidBackendId, generateBackendId, createAcpBridgeBackendConfig, mergeAcpRegistryIntoSettings } from './settings';
import { fetchAcpRegistry } from './registry-utils';
import { AcpAgentEditorModal } from './acp-agent-editor';
import { LocalAgentScanModal } from './local-agent-scanner';

export class AgentLinkSettingTab extends PluginSettingTab {
	plugin: AgentLinkPlugin;
	private editingBackendId: string | null = null;

	constructor(app: App, plugin: AgentLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'AgentLink Settings' });

		// Backend Management Section
		this.renderBackendManagement(containerEl);

		// ACP Registry Settings Section
		containerEl.createEl('h3', { text: 'ACP Registry' });
		this.renderRegistrySettings(containerEl);

		// Global Settings Section
		containerEl.createEl('h3', { text: 'Global Settings' });
		this.renderGlobalSettings(containerEl);

		// Tool Call Settings Section
		containerEl.createEl('h3', { text: 'Tool Call Settings' });
		this.renderToolCallSettings(containerEl);
	}

	// ── Backend Management ───────────────────────────────────────────────

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
					await this.plugin.saveSettings();
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
			await this.plugin.saveSettings();
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
			text: `${getBackendTypeLabel(backend.type)}${backend.type === 'acp-bridge' && (backend as AcpBridgeBackendConfig).version ? ` • v${(backend as AcpBridgeBackendConfig).version}` : ''}`,
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
					await this.plugin.saveSettings();
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
							await this.plugin.saveSettings();
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
				await this.plugin.saveSettings();
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
					.onChange(async (value) => {
						backend.name = value || backend.id;
						await this.plugin.saveSettings();
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
					.onChange(async (value) => {
						config.command = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(container)
			.setName('Arguments')
			.setDesc('Command arguments (space-separated).')
			.addText(text => {
				text.setPlaceholder('acp')
					.setValue(config.args.join(' '))
					.onChange(async (value) => {
						config.args = value.trim().split(/\s+/).filter(Boolean);
						await this.plugin.saveSettings();
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
						this.plugin.settings.enableAcpRegistrySync = value;
						await this.plugin.saveSettings();
					});
			});

		// Sync Interval number input
		new Setting(containerEl)
			.setName('Sync Interval (hours)')
			.setDesc('How often to sync from ACP CDN (1-168 hours)')
			.addText(text => {
				text.setPlaceholder('12')
					.setValue(String(this.plugin.settings.acpRegistrySyncIntervalHours))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n >= 1 && n <= 168) {
							this.plugin.settings.acpRegistrySyncIntervalHours = n;
							await this.plugin.saveSettings();
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
								await this.plugin.saveSettings();
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
			.addText((t) =>
				t.setValue(String(this.plugin.settings.requestTimeoutMs)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 0) {
						this.plugin.settings.requestTimeoutMs = n;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName('System Prompt')
			.setDesc('A system-level instruction sent to agents.')
			.addTextArea((ta) => {
				ta.setValue(this.plugin.settings.systemPrompt)
					.setPlaceholder('You are a helpful AI assistant…')
					.onChange(async (v) => {
						this.plugin.settings.systemPrompt = v;
						await this.plugin.saveSettings();
					});
				ta.inputEl.rows = 3;
				ta.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName('Auto-reconnect')
			.setDesc('Automatically reconnect when the backend connection is lost.')
			.addToggle(
				(t) => t.setValue(this.plugin.settings.autoReconnect).onChange(async (v) => {
					this.plugin.settings.autoReconnect = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Enable Debug Log')
			.setDesc('Print verbose debug messages to the developer console.')
			.addToggle(
				(t) => t.setValue(this.plugin.settings.enableDebugLog).onChange(async (v) => {
					this.plugin.settings.enableDebugLog = v;
					await this.plugin.saveSettings();
				})
			);
	}

	// ── Tool Call Settings ───────────────────────────────────────────────

	private renderToolCallSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Auto-confirm Read Operations')
			.setDesc('Automatically confirm read-only operations (read_file, list_dir, search).')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoConfirmRead).onChange(async (v) => {
					this.plugin.settings.autoConfirmRead = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Auto-confirm File Edits')
			.setDesc('⚠️ DANGER: Automatically confirm file modifications without review!')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoConfirmEdit).onChange(async (v) => {
					this.plugin.settings.autoConfirmEdit = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Show Thinking Process')
			.setDesc('Display agent thinking/reasoning process in chat.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.showThinking).onChange(async (v) => {
					this.plugin.settings.showThinking = v;
					await this.plugin.saveSettings();
				})
			);
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
			await this.plugin.saveSettings();
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

				await this.plugin.saveSettings();
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
