import { App, PluginSettingTab, Setting } from 'obsidian';
import AgentLinkPlugin from '../main';
import { AgentType } from '../types';

const AGENT_LABELS: Record<AgentType, string> = {
	claude: 'Claude Code',
	kimi: 'Kimi Code',
	codex: 'Codex',
	opencode: 'OpenCode',
};

const AGENT_DOCS: Record<AgentType, string> = {
	claude: 'Install from https://claude.ai/code — uses the `claude -p` CLI.',
	kimi: 'Get an API key from https://platform.moonshot.cn/console/api-keys',
	codex: 'Get an API key from https://platform.openai.com/api-keys or point to a local Ollama endpoint.',
	opencode: 'Install from https://opencode.ai — supports both CLI and local HTTP server mode.',
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

		// ── General settings ────────────────────────────────────────────────
		containerEl.createEl('h2', { text: 'AgentLink Settings' });

		new Setting(containerEl)
			.setName('Default agent')
			.setDesc('The agent that is pre-selected when opening the AgentLink panel.')
			.addDropdown((dd) => {
				for (const [value, label] of Object.entries(AGENT_LABELS) as [AgentType, string][]) {
					dd.addOption(value, label);
				}
				dd.setValue(this.plugin.settings.activeAgent);
				dd.onChange(async (value) => {
					this.plugin.settings.activeAgent = value as AgentType;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('System prompt')
			.setDesc('A system-level instruction sent to HTTP-based agents to shape their behavior.')
			.addTextArea((ta) => {
				ta.setValue(this.plugin.settings.systemPrompt)
					.setPlaceholder('You are a helpful AI assistant…')
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					});
				ta.inputEl.rows = 3;
				ta.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName('Max context length (characters)')
			.setDesc('Maximum characters of file content included as context.')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.maxContextLength))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxContextLength = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// ── Per-agent settings ──────────────────────────────────────────────
		for (const agentType of ['claude', 'kimi', 'codex', 'opencode'] as AgentType[]) {
			this.renderAgentSection(containerEl, agentType);
		}
	}

	private renderAgentSection(containerEl: HTMLElement, agentType: AgentType): void {
		const config = this.plugin.settings.agents[agentType];
		const label = AGENT_LABELS[agentType];

		containerEl.createEl('h3', { text: label });
		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: AGENT_DOCS[agentType],
		});

		new Setting(containerEl)
			.setName('Connection mode')
			.setDesc('CLI: spawn the binary directly. HTTP: call a REST API.')
			.addDropdown((dd) => {
				dd.addOption('cli', 'CLI (command line)');
				dd.addOption('http', 'HTTP (REST API)');
				dd.setValue(config.mode);
				dd.onChange(async (value) => {
					config.mode = value as 'cli' | 'http';
					await this.plugin.saveSettings();
					// Refresh to show/hide relevant fields
					this.display();
				});
			});

		if (config.mode === 'cli') {
			new Setting(containerEl)
				.setName('Binary path')
				.setDesc('Path to the CLI executable. Use just the command name if it is on your PATH.')
				.addText((text) =>
					text
						.setPlaceholder(agentType)
						.setValue(config.binaryPath)
						.onChange(async (value) => {
							config.binaryPath = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName('Extra CLI arguments')
				.setDesc('Optional additional flags passed to the binary.')
				.addText((text) =>
					text
						.setValue(config.extraArgs)
						.onChange(async (value) => {
							config.extraArgs = value;
							await this.plugin.saveSettings();
						})
				);
		}

		if (config.mode === 'http') {
			new Setting(containerEl)
				.setName('API endpoint')
				.setDesc('Base URL of the API (without trailing slash).')
				.addText((text) =>
					text
						.setValue(config.endpoint)
						.onChange(async (value) => {
							config.endpoint = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName('API key')
				.setDesc('Your API key. Stored in Obsidian local data — never synced to cloud.')
				.addText((text) => {
					text
						.setValue(config.apiKey)
						.onChange(async (value) => {
							config.apiKey = value;
							await this.plugin.saveSettings();
						});
					text.inputEl.type = 'password';
				});

			new Setting(containerEl)
				.setName('Model')
				.setDesc('Model identifier to use for this agent.')
				.addText((text) =>
					text
						.setValue(config.model)
						.onChange(async (value) => {
							config.model = value;
							await this.plugin.saveSettings();
						})
				);
		}
	}
}
