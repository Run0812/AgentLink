import { Notice, Plugin } from 'obsidian';
import { AgentLinkSettings, DEFAULT_SETTINGS } from './settings';
import { AgentType } from './types';
import { BaseAgent } from './agents/base';
import { ClaudeAgent } from './agents/claude';
import { KimiAgent } from './agents/kimi';
import { CodexAgent } from './agents/codex';
import { OpenCodeAgent } from './agents/opencode';
import { AgentLinkView, AGENTLINK_VIEW_TYPE } from './views/AgentLinkView';
import { AgentLinkSettingTab } from './views/SettingsTab';

export default class AgentLinkPlugin extends Plugin {
	settings!: AgentLinkSettings;
	private agents: Map<AgentType, BaseAgent> = new Map();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.buildAgents();

		// Register the sidebar view
		this.registerView(
			AGENTLINK_VIEW_TYPE,
			(leaf) => new AgentLinkView(leaf, this.settings, this.agents)
		);

		// Ribbon icon to open the panel
		this.addRibbonIcon('bot', 'Open AgentLink', () => {
			this.activateView();
		});

		// Settings tab
		this.addSettingTab(new AgentLinkSettingTab(this.app, this));

		// Commands
		this.addCommand({
			id: 'open-agentlink-panel',
			name: 'Open AgentLink panel',
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: 'send-selection-to-agent',
			name: 'Send selected text to active agent',
			editorCallback: async (editor) => {
				const selection = editor.getSelection();
				if (!selection) {
					new Notice('AgentLink: No text selected.');
					return;
				}
				await this.activateView();
				// Small delay to ensure view is ready
				setTimeout(() => {
					const view = this.getAgentLinkView();
					if (view) {
						view.prefillInput(selection);
					}
				}, 100);
			},
		});

		this.addCommand({
			id: 'send-file-to-agent',
			name: 'Send current file to active agent',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (checking) return true;
				this.activateView().then(() => {
					const view = this.getAgentLinkView();
					if (view) view.setIncludeFile(true);
				});
				return true;
			},
		});

		this.addCommand({
			id: 'switch-agent',
			name: 'Switch active agent',
			callback: () => {
				const agents: AgentType[] = ['claude', 'kimi', 'codex', 'opencode'];
				const current = this.settings.activeAgent;
				const idx = agents.indexOf(current);
				const next = agents[(idx + 1) % agents.length];
				this.settings.activeAgent = next;
				this.saveSettings();
				const labels: Record<AgentType, string> = {
					claude: 'Claude Code',
					kimi: 'Kimi Code',
					codex: 'Codex',
					opencode: 'OpenCode',
				};
				new Notice(`AgentLink: Switched to ${labels[next]}`);
				// Update view if open
				const view = this.getAgentLinkView();
				if (view) view.updateSettings(this.settings);
			},
		});
	}

	async onunload(): Promise<void> {
		this.app.workspace.detachLeavesOfType(AGENTLINK_VIEW_TYPE);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Ensure all agent configs exist (in case new agents were added)
		for (const agentType of ['claude', 'kimi', 'codex', 'opencode'] as AgentType[]) {
			if (!this.settings.agents[agentType]) {
				this.settings.agents[agentType] = DEFAULT_SETTINGS.agents[agentType];
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.buildAgents();
		// Refresh open view
		const view = this.getAgentLinkView();
		if (view) view.updateSettings(this.settings);
	}

	getAgent(type: AgentType): BaseAgent | undefined {
		return this.agents.get(type);
	}

	private buildAgents(): void {
		this.agents.clear();
		this.agents.set('claude', new ClaudeAgent(this.settings.agents.claude));
		this.agents.set('kimi', new KimiAgent(this.settings.agents.kimi));
		this.agents.set('codex', new CodexAgent(this.settings.agents.codex));
		this.agents.set('opencode', new OpenCodeAgent(this.settings.agents.opencode));
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(AGENTLINK_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: AGENTLINK_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	private getAgentLinkView(): AgentLinkView | null {
		const leaves = this.app.workspace.getLeavesOfType(AGENTLINK_VIEW_TYPE);
		if (leaves.length === 0) return null;
		const view = leaves[0].view;
		return view instanceof AgentLinkView ? view : null;
	}
}
