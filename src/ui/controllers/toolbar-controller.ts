import { Notice } from 'obsidian';
import { AgentAdapter, ConfigOption } from '../../core/types';
import { AgentLinkSettings, getActiveBackendConfig } from '../../settings/settings';

type ThinkingMode = 'none' | 'quick' | 'balanced' | 'deep';

export interface ToolbarControllerDeps {
	getSettings: () => AgentLinkSettings;
	getAdapter: () => AgentAdapter | null;
	getModelConfigOption: () => ConfigOption | null;
	applyToolbarDropdownStyle: (
		container: HTMLElement,
		align?: 'left' | 'right',
		maxHeight?: string,
	) => void;
	applyToolbarDropdownHeaderStyle: (header: HTMLElement) => void;
	applyToolbarDropdownItemStyle: (item: HTMLButtonElement) => void;
	applySingleLineEllipsis: (element: HTMLElement, fontSize: string, color?: string) => void;
	renderBackendIcon: (container: HTMLElement, iconValue?: string, fallbackIcon?: string) => void;
	onSwitchBackend: (backendId: string) => Promise<void>;
	onConfigOptionChange: (configId: string, value: string | boolean) => Promise<void>;
	onThinkingModeChange: (mode: ThinkingMode) => Promise<void>;
}

export class ToolbarController {
	private deps: ToolbarControllerDeps;

	constructor(deps: ToolbarControllerDeps) {
		this.deps = deps;
	}

	renderAgentDropdown(container: HTMLElement): void {
		const settings = this.deps.getSettings();
		const activeBackend = getActiveBackendConfig(settings);
		const enabledBackends = settings.backends.filter((backend) => backend.enabled !== false);

		container.empty();
		this.deps.applyToolbarDropdownStyle(container);

		const header = container.createEl('div', { text: 'Select Agent' });
		this.deps.applyToolbarDropdownHeaderStyle(header);

		if (enabledBackends.length === 0) {
			const emptyMsg = container.createEl('div', { text: 'No enabled agents. Enable agents in settings.' });
			emptyMsg.style.padding = '0.4rem';
			emptyMsg.style.fontSize = '0.75rem';
			emptyMsg.style.color = 'var(--text-muted)';
			return;
		}

		for (const backend of enabledBackends) {
			const item = container.createEl('button');
			item.type = 'button';
			item.style.width = '100%';
			item.style.display = 'flex';
			item.style.alignItems = 'center';
			item.style.gap = '0.35rem';
			item.style.minHeight = '32px';
			item.style.padding = '0.35rem 0.4rem';
			item.style.marginBottom = '0.1rem';
			item.style.border = 'none';
			item.style.borderRadius = '4px';
			item.style.background = backend.id === activeBackend?.id
				? 'var(--background-modifier-hover)'
				: 'transparent';
			item.style.color = 'var(--text-normal)';
			item.style.textAlign = 'left';
			item.style.cursor = 'pointer';
			this.deps.applyToolbarDropdownItemStyle(item);

			const icon = item.createEl('span');
			icon.style.width = '14px';
			icon.style.height = '14px';
			icon.style.display = 'inline-flex';
			icon.style.alignItems = 'center';
			icon.style.justifyContent = 'center';
			icon.style.flexShrink = '0';
			this.deps.renderBackendIcon(icon, backend.icon);

			const name = item.createEl('span', { text: backend.name });
			name.style.flex = '1';
			this.deps.applySingleLineEllipsis(name, '0.75rem');

			if (backend.id === activeBackend?.id) {
				const check = item.createEl('span');
				check.innerHTML = '✓';
				check.style.color = 'var(--interactive-accent)';
				check.style.fontWeight = 'bold';
				check.style.fontSize = '0.75rem';
				check.style.flexShrink = '0';
			}

			item.addEventListener('click', async () => {
				if (backend.id !== settings.activeBackendId) {
					await this.deps.onSwitchBackend(backend.id);
					new Notice(`Switched to ${backend.name}`);
				}
				container.style.display = 'none';
			});
		}
	}

	renderModelDropdown(container: HTMLElement): void {
		const modelOption = this.deps.getModelConfigOption();
		if (!modelOption || modelOption.type !== 'select' || modelOption.options.length <= 1) {
			container.style.display = 'none';
			return;
		}

		container.empty();
		this.deps.applyToolbarDropdownStyle(container);

		const header = container.createEl('div', { text: 'Model' });
		this.deps.applyToolbarDropdownHeaderStyle(header);

		for (const model of modelOption.options) {
			const item = container.createEl('button');
			item.type = 'button';
			item.style.width = '100%';
			item.style.display = 'flex';
			item.style.flexDirection = 'column';
			item.style.alignItems = 'stretch';
			item.style.gap = '0.12rem';
			item.style.minHeight = '40px';
			item.style.padding = '0.38rem 0.4rem';
			item.style.marginBottom = '0.1rem';
			item.style.border = 'none';
			item.style.borderRadius = '4px';
			item.style.background = model.value === modelOption.currentValue
				? 'var(--background-modifier-hover)'
				: 'transparent';
			item.style.color = 'var(--text-normal)';
			item.style.textAlign = 'left';
			item.style.cursor = 'pointer';
			this.deps.applyToolbarDropdownItemStyle(item);

			const name = item.createEl('div', { text: model.name });
			name.style.fontWeight = '600';
			this.deps.applySingleLineEllipsis(name, '0.75rem');

			const desc = item.createEl('div', { text: model.description ?? '' });
			this.deps.applySingleLineEllipsis(desc, '0.7rem', 'var(--text-muted)');

			item.addEventListener('click', async () => {
				await this.deps.onConfigOptionChange(modelOption.id, model.value);
				container.style.display = 'none';
			});
		}
	}

	renderThinkingDropdown(container: HTMLElement, triggerBtn: HTMLButtonElement): void {
		const settings = this.deps.getSettings();
		const modes: { id: ThinkingMode; name: string; desc: string }[] = [
			{ id: 'none', name: 'None', desc: 'No thinking process' },
			{ id: 'quick', name: 'Quick', desc: 'Fast responses' },
			{ id: 'balanced', name: 'Balanced', desc: 'Default mode' },
			{ id: 'deep', name: 'Deep', desc: 'Deep analysis' },
		];

		container.empty();
		this.deps.applyToolbarDropdownStyle(container, 'right');

		const header = container.createEl('div', { text: 'Thinking' });
		this.deps.applyToolbarDropdownHeaderStyle(header);

		for (const mode of modes) {
			const item = container.createEl('button');
			item.type = 'button';
			item.style.width = '100%';
			item.style.display = 'flex';
			item.style.flexDirection = 'column';
			item.style.alignItems = 'stretch';
			item.style.gap = '0.12rem';
			item.style.minHeight = '40px';
			item.style.padding = '0.38rem 0.4rem';
			item.style.marginBottom = '0.1rem';
			item.style.border = 'none';
			item.style.borderRadius = '4px';
			item.style.background = mode.id === settings.thinkingMode
				? 'var(--background-modifier-hover)'
				: 'transparent';
			item.style.color = 'var(--text-normal)';
			item.style.textAlign = 'left';
			item.style.cursor = 'pointer';
			this.deps.applyToolbarDropdownItemStyle(item);

			const nameRow = item.createEl('div');
			nameRow.style.display = 'flex';
			nameRow.style.alignItems = 'center';
			nameRow.style.gap = '0.3rem';
			nameRow.style.width = '100%';

			const name = nameRow.createEl('span', { text: mode.name });
			name.style.fontWeight = '600';
			name.style.flex = '1';
			this.deps.applySingleLineEllipsis(name, '0.75rem');

			if (mode.id === settings.thinkingMode) {
				const check = nameRow.createEl('span');
				check.innerHTML = '✓';
				check.style.color = 'var(--interactive-accent)';
				check.style.fontWeight = 'bold';
				check.style.fontSize = '0.75rem';
				check.style.flexShrink = '0';
			}

			const desc = item.createEl('div', { text: mode.desc });
			this.deps.applySingleLineEllipsis(desc, '0.7rem', 'var(--text-muted)');

			item.addEventListener('click', async () => {
				await this.deps.onThinkingModeChange(mode.id);
				triggerBtn.innerHTML = `🧠 ${mode.name} ▾`;
				triggerBtn.style.background = mode.id !== 'none' ? 'var(--interactive-accent)' : 'transparent';
				triggerBtn.style.color = mode.id !== 'none' ? 'var(--text-on-accent)' : 'var(--text-muted)';
				container.style.display = 'none';
			});
		}
	}
}
