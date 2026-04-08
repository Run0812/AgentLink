import { App, PluginSettingTab, Setting, Modal, ButtonComponent, Notice } from 'obsidian';
import AgentLinkPlugin from '../main';
import { AgentBackendConfig, BackendType, AcpBridgeBackendConfig, EmbeddedWebBackendConfig } from '../core/types';
import { getBackendTypeLabel, isValidBackendId, generateBackendId, createAcpBridgeBackendConfig, createEmbeddedWebBackendConfig, createMockBackendConfig } from './settings';

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

		// Preset info box
		const hasPresets = this.plugin.settings.backends.some(b => 
			b.id === 'kimi-code' || b.id === 'opencode-web'
		);
		
		if (hasPresets) {
			const presetInfo = containerEl.createDiv({ cls: 'agentlink-preset-info' });
			presetInfo.style.backgroundColor = 'var(--background-secondary)';
			presetInfo.style.padding = '1em';
			presetInfo.style.borderRadius = '6px';
			presetInfo.style.marginBottom = '1em';
			presetInfo.style.fontSize = '0.9em';
			
			presetInfo.createEl('div', { 
				text: '🔧 内置预设配置',
				cls: 'setting-item-name'
			}).style.marginBottom = '0.5em';
			
			const presetList = presetInfo.createEl('ul');
			presetList.style.margin = '0';
			presetList.style.paddingLeft = '1.2em';
			
			if (this.plugin.settings.backends.some(b => b.id === 'kimi-code')) {
				const kimiItem = presetList.createEl('li');
				kimiItem.innerHTML = '<strong>🌙 Kimi Code (ACP)</strong> - 需要安装 kimi-cli: <code>pip install kimi-cli</code>，然后运行 <code>kimi login</code> 登录';
			}
			
			if (this.plugin.settings.backends.some(b => b.id === 'opencode-web')) {
				const opencodeItem = presetList.createEl('li');
				opencodeItem.innerHTML = '<strong>🔷 OpenCode Web</strong> - 需要安装 opencode: 参考 <a href="https://opencode.ai/docs/zh-cn/installation.html">官方文档</a>，然后运行 <code>opencode --web --port 3000</code>';
			}
		}

		// Active backend selector
		new Setting(containerEl)
			.setName('Active Backend')
			.setDesc('Select which backend to use for chatting.')
			.addDropdown((dd) => {
				this.plugin.settings.backends.forEach(backend => {
					dd.addOption(backend.id, `${backend.name} (${getBackendTypeLabel(backend.type)})`);
				});
				dd.setValue(this.plugin.settings.activeBackendId);
				dd.onChange(async (value) => {
					this.plugin.settings.activeBackendId = value;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		// Backend list
		const backendList = containerEl.createDiv({ cls: 'agentlink-backend-list' });
		backendList.style.marginTop = '1em';
		backendList.style.marginBottom = '1em';

		this.plugin.settings.backends.forEach(backend => {
			this.renderBackendItem(backendList, backend);
		});

		// Add new backend buttons
		const addBtnContainer = containerEl.createDiv();
		addBtnContainer.style.display = 'flex';
		addBtnContainer.style.gap = '0.5em';
		addBtnContainer.style.marginTop = '1em';

		// Add ACP Bridge button
		new ButtonComponent(addBtnContainer)
			.setButtonText('+ ACP Bridge')
			.setCta()
			.onClick(() => {
				this.openAddBackendModal('acp-bridge');
			});

		// Add Embedded Web button
		new ButtonComponent(addBtnContainer)
			.setButtonText('+ Embedded Web')
			.onClick(() => {
				this.openAddBackendModal('embedded-web');
			});

		// Add Mock button (if not exists)
		const hasMock = this.plugin.settings.backends.some(b => b.type === 'mock');
		if (!hasMock) {
			new ButtonComponent(addBtnContainer)
				.setButtonText('+ Mock')
				.onClick(async () => {
					const mockConfig = createMockBackendConfig();
					this.plugin.settings.backends.push(mockConfig);
					await this.plugin.saveSettings();
					this.display();
				});
		}

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
		item.style.padding = '0.5em';
		item.style.border = '1px solid var(--background-modifier-border)';
		item.style.borderRadius = '4px';
		item.style.marginBottom = '0.5em';
		item.style.backgroundColor = backend.id === this.plugin.settings.activeBackendId
			? 'var(--background-modifier-success-hover)'
			: 'transparent';

		// Info
		const info = item.createDiv();
		info.style.flex = '1';
		info.createEl('strong', { text: backend.name });
		info.createEl('span', {
			text: ` (${getBackendTypeLabel(backend.type)})`,
			cls: 'setting-item-description'
		});

		// Actions
		const actions = item.createDiv();
		actions.style.display = 'flex';
		actions.style.gap = '0.5em';

		// Edit button
		new ButtonComponent(actions)
			.setButtonText('Edit')
			.onClick(() => {
				this.editingBackendId = backend.id;
				this.display();
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
		} else if (backend.type === 'embedded-web') {
			this.renderEmbeddedWebSettings(editorContainer, backend as EmbeddedWebBackendConfig);
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
			.setName('Bridge Command')
			.setDesc('Command to start the ACP Bridge (leave empty if already running).')
			.addText(text => {
				text.setPlaceholder('acp-bridge')
					.setValue(config.bridgeCommand)
					.onChange(async (value) => {
						config.bridgeCommand = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(container)
			.setName('Bridge Arguments')
			.setDesc('Space-separated arguments for the bridge command.')
			.addText(text => {
				text.setPlaceholder('--port 8080')
					.setValue(config.bridgeArgs)
					.onChange(async (value) => {
						config.bridgeArgs = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(container)
			.setName('ACP Server URL (Optional)')
			.setDesc('Only for HTTP/WebSocket-based ACP bridges. Most implementations (like Kimi CLI) use stdio and don\'t need this.')
			.addText(text => {
				text.setPlaceholder('http://localhost:8080 (optional)')
					.setValue(config.acpServerURL || '')
					.onChange(async (value) => {
						config.acpServerURL = value || undefined;
						await this.plugin.saveSettings();
					});
			});

		new Setting(container)
			.setName('Workspace Root')
			.setDesc('Agent workspace directory (leave empty for vault root).')
			.addText(text => {
				text.setPlaceholder('/path/to/workspace')
					.setValue(config.workspaceRoot)
					.onChange(async (value) => {
						config.workspaceRoot = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(container)
			.setName('Environment Variables')
			.setDesc('One KEY=VALUE per line. Lines starting with # are ignored.')
			.addTextArea(text => {
				text.setPlaceholder('ANTHROPIC_API_KEY=sk-…')
					.setValue(config.env)
					.onChange(async (value) => {
						config.env = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 4;
				text.inputEl.style.width = '100%';
				text.inputEl.style.fontFamily = 'monospace';
			});

		new Setting(container)
			.setName('Request Timeout (ms)')
			.setDesc('Maximum time to wait for a response.')
			.addText(text => {
				text.setValue(String(config.timeoutMs))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							config.timeoutMs = n;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(container)
			.setName('Auto-confirm Tools')
			.setDesc('⚠️ DANGER: Automatically confirm all tool calls without review!')
			.addToggle(toggle => {
				toggle.setValue(config.autoConfirmTools)
					.onChange(async (value) => {
						config.autoConfirmTools = value;
						await this.plugin.saveSettings();
					});
			});
	}

	private renderEmbeddedWebSettings(container: HTMLElement, config: EmbeddedWebBackendConfig): void {
		container.createEl('h4', { text: 'Embedded Web Configuration' });

		new Setting(container)
			.setName('Web URL')
			.setDesc('URL of the local Agent Web UI.')
			.addText(text => {
				text.setPlaceholder('http://localhost:3000')
					.setValue(config.webURL)
					.onChange(async (value) => {
						config.webURL = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(container)
			.setName('Request Timeout (ms)')
			.setDesc('Maximum time to wait for a response.')
			.addText(text => {
				text.setValue(String(config.timeoutMs))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							config.timeoutMs = n;
							await this.plugin.saveSettings();
						}
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
			.setName('Max Context Length (characters)')
			.setDesc('Maximum characters of file content included as context.')
			.addText((t) =>
				t.setValue(String(this.plugin.settings.maxContextLength)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.maxContextLength = n;
						await this.plugin.saveSettings();
					}
				})
			);

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
			} else if (type === 'embedded-web') {
				newBackend = createEmbeddedWebBackendConfig(id, name);
			} else {
				newBackend = createMockBackendConfig();
				newBackend.id = id;
				newBackend.name = name;
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
