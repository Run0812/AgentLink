import type { AgentLinkSettings } from './settings';

export interface SettingsEffectFlags {
	persist: boolean;
	rebuildAdapter: boolean;
	refreshView: boolean;
	updateHistoryExpiry: boolean;
}

export interface SettingsEffects {
	apply(settings: AgentLinkSettings, flags: SettingsEffectFlags): Promise<void>;
}

export interface SettingsEffectCallbacks {
	persist: (settings: AgentLinkSettings) => Promise<void>;
	rebuildAdapter: () => Promise<void>;
	refreshView: (options: { rebuildAdapter: boolean }) => Promise<void>;
	setDebug: (enabled: boolean) => void;
	updateHistoryExpiry: (days: number) => Promise<void>;
}

export class PluginSettingsEffects implements SettingsEffects {
	private readonly callbacks: SettingsEffectCallbacks;

	constructor(callbacks: SettingsEffectCallbacks) {
		this.callbacks = callbacks;
	}

	async apply(settings: AgentLinkSettings, flags: SettingsEffectFlags): Promise<void> {
		this.callbacks.setDebug(settings.enableDebugLog);

		if (flags.persist) {
			await this.callbacks.persist(settings);
		}

		if (flags.updateHistoryExpiry) {
			await this.callbacks.updateHistoryExpiry(settings.sessionHistoryExpiryDays);
		}

		if (flags.rebuildAdapter) {
			await this.callbacks.rebuildAdapter();
		}

		if (flags.refreshView) {
			await this.callbacks.refreshView({ rebuildAdapter: flags.rebuildAdapter });
		}
	}
}

export function createSettingsEffectFlags(
	overrides?: Partial<SettingsEffectFlags>,
): SettingsEffectFlags {
	return {
		persist: overrides?.persist ?? true,
		rebuildAdapter: overrides?.rebuildAdapter ?? true,
		refreshView: overrides?.refreshView ?? true,
		updateHistoryExpiry: overrides?.updateHistoryExpiry ?? true,
	};
}

