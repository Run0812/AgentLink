/* ────────────────────────────────────────────────────────────────────────
 * Settings tab — the Obsidian settings UI for AgentLink.
 * ──────────────────────────────────────────────────────────────────────── */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type AgentLinkPlugin from '../main';
import { BackendType } from '../core/types';

const BACKEND_OPTIONS: Record<BackendType, string> = {
	mock: 'Mock Agent (for testing)',
	cli: 'Local CLI',
	http: 'Local HTTP',
	'acp-bridge': 'ACP Bridge (reserved)',
	'embedded-web': 'Embedded Web (reserved)',
};

export class AgentLinkSettingTab extends PluginSettingTab {
	private plugin: AgentLinkPlugin;

	constructor(app: App, plugin: AgentLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Backend type ────────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'AgentLink Settings' });

		new Setting(containerEl)
			.setName('Backend type')
			.setDesc('Select which adapter to use for connecting to your AI agent.')
			.addDropdown((dd) => {
				for (const [value, label] of Object.entries(BACKEND_OPTIONS)) {
					dd.addOption(value, label);
				}
				dd.setValue(this.plugin.settings.backendType);
				dd.onChange(async (value) => {
					this.plugin.settings.backendType = value as BackendType;
					await this.plugin.saveSettings();
					this.display(); // re-render to show/hide relevant fields
				});
			});

		const bt = this.plugin.settings.backendType;

		// ── CLI settings ────────────────────────────────────────────────
		if (bt === 'cli') {
			containerEl.createEl('h3', { text: 'CLI Configuration' });

			new Setting(containerEl)
				.setName('Command')
				.setDesc('CLI executable name or path (e.g. "claude", "/usr/local/bin/python").')
				.addText((t) =>
					t
						.setPlaceholder('claude')
						.setValue(this.plugin.settings.command)
						.onChange(async (v) => {
							this.plugin.settings.command = v;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName('Arguments')
				.setDesc('Space-separated arguments passed to the command.')
				.addText((t) =>
					t
						.setPlaceholder('-p')
						.setValue(this.plugin.settings.args)
						.onChange(async (v) => {
							this.plugin.settings.args = v;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName('Working directory')
				.setDesc('Working directory for the spawned process (leave empty for default).')
				.addText((t) =>
					t
						.setValue(this.plugin.settings.cwd)
						.onChange(async (v) => {
							this.plugin.settings.cwd = v;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName('Environment variables')
				.setDesc('One KEY=VALUE per line. Lines starting with # are ignored.')
				.addTextArea((ta) => {
					ta.setValue(this.plugin.settings.env)
						.setPlaceholder('ANTHROPIC_API_KEY=sk-…')
						.onChange(async (v) => {
							this.plugin.settings.env = v;
							await this.plugin.saveSettings();
						});
					ta.inputEl.rows = 4;
					ta.inputEl.style.width = '100%';
					ta.inputEl.style.fontFamily = 'monospace';
				});
		}

		// ── HTTP settings ───────────────────────────────────────────────
		if (bt === 'http') {
			containerEl.createEl('h3', { text: 'HTTP Configuration' });

			new Setting(containerEl)
				.setName('Base URL')
				.setDesc('Base URL of the local HTTP server (e.g. "http://127.0.0.1:11434/v1").')
				.addText((t) =>
					t
						.setValue(this.plugin.settings.baseURL)
						.onChange(async (v) => {
							this.plugin.settings.baseURL = v;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName('API key')
				.setDesc('API key for authenticated endpoints (stored locally, never synced).')
				.addText((t) => {
					t.setValue(this.plugin.settings.apiKey).onChange(async (v) => {
						this.plugin.settings.apiKey = v;
						await this.plugin.saveSettings();
					});
					t.inputEl.type = 'password';
				});

			new Setting(containerEl)
				.setName('Model')
				.setDesc('Model identifier to pass in requests.')
				.addText((t) =>
					t
						.setValue(this.plugin.settings.model)
						.onChange(async (v) => {
							this.plugin.settings.model = v;
							await this.plugin.saveSettings();
						})
				);
		}

		// ── Shared settings ─────────────────────────────────────────────
		containerEl.createEl('h3', { text: 'General' });

		new Setting(containerEl)
			.setName('Request timeout (ms)')
			.setDesc('Maximum time to wait for a response. 0 = no timeout.')
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.requestTimeoutMs))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!isNaN(n) && n >= 0) {
							this.plugin.settings.requestTimeoutMs = n;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName('System prompt')
			.setDesc('A system-level instruction sent to the agent.')
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
			.setName('Max context length (characters)')
			.setDesc('Maximum characters of file content included as context.')
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.maxContextLength))
					.onChange(async (v) => {
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
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoReconnect).onChange(async (v) => {
					this.plugin.settings.autoReconnect = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Enable debug log')
			.setDesc('Print verbose debug messages to the developer console.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.enableDebugLog).onChange(async (v) => {
					this.plugin.settings.enableDebugLog = v;
					await this.plugin.saveSettings();
				})
			);
	}
}
