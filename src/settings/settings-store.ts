import type { AgentLinkSettings } from './settings';
import type { AgentBackendConfig } from '../core/types';

export type SettingsPatch = Partial<AgentLinkSettings>;

export interface SettingsStore {
	getSnapshot(): AgentLinkSettings;
	replace(next: AgentLinkSettings): void;
	applyPatch(patch: SettingsPatch): AgentLinkSettings;
}

function cloneBackends(backends: AgentBackendConfig[]): AgentBackendConfig[] {
	return backends.map((backend) => ({ ...backend }));
}

export function cloneSettings(settings: AgentLinkSettings): AgentLinkSettings {
	return {
		...settings,
		backends: cloneBackends(settings.backends),
	};
}

export class InMemorySettingsStore implements SettingsStore {
	private state: AgentLinkSettings;

	constructor(initial: AgentLinkSettings) {
		this.state = cloneSettings(initial);
	}

	getSnapshot(): AgentLinkSettings {
		return cloneSettings(this.state);
	}

	replace(next: AgentLinkSettings): void {
		this.state = cloneSettings(next);
	}

	applyPatch(patch: SettingsPatch): AgentLinkSettings {
		if (Object.keys(patch).length === 0) {
			return this.getSnapshot();
		}

		this.state = {
			...this.state,
			...patch,
			backends: patch.backends ? cloneBackends(patch.backends) : this.state.backends,
		};
		return this.getSnapshot();
	}
}

