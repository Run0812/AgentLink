import type { Plugin } from 'obsidian';

export const SETTINGS_STORAGE_KEY = 'agentlink-settings';
export const SESSIONS_STORAGE_KEY = 'agentlink-sessions';

type PluginData = Record<string, unknown>;

const writeQueue = new WeakMap<Plugin, Promise<void>>();

function normalizePluginData(raw: unknown): PluginData {
	return raw && typeof raw === 'object' ? { ...(raw as PluginData) } : {};
}

async function withPluginDataLock<T>(plugin: Plugin, task: () => Promise<T>): Promise<T> {
	const previous = writeQueue.get(plugin) ?? Promise.resolve();
	let release!: () => void;
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	const tail = previous.then(() => current, () => current);

	writeQueue.set(plugin, tail);
	await previous.catch(() => undefined);

	try {
		return await task();
	} finally {
		release();
		if (writeQueue.get(plugin) === tail) {
			writeQueue.delete(plugin);
		}
	}
}

export async function loadStoredSettings(plugin: Plugin): Promise<PluginData> {
	const data = normalizePluginData(await plugin.loadData());
	const namespacedSettings = data[SETTINGS_STORAGE_KEY];
	if (namespacedSettings && typeof namespacedSettings === 'object' && !Array.isArray(namespacedSettings)) {
		return namespacedSettings as PluginData;
	}

	// Backward compatibility: old versions stored settings at root.
	const legacySettings = { ...data };
	delete legacySettings[SESSIONS_STORAGE_KEY];
	delete legacySettings[SETTINGS_STORAGE_KEY];
	return legacySettings;
}

export async function saveStoredSettings(plugin: Plugin, settings: PluginData): Promise<void> {
	await withPluginDataLock(plugin, async () => {
		const data = normalizePluginData(await plugin.loadData());
		data[SETTINGS_STORAGE_KEY] = settings;
		await plugin.saveData(data);
	});
}

export async function loadStoredSessions<T>(plugin: Plugin): Promise<Record<string, T>> {
	const data = normalizePluginData(await plugin.loadData());
	const sessions = data[SESSIONS_STORAGE_KEY];
	if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) {
		return {};
	}

	return sessions as Record<string, T>;
}

export async function saveStoredSessions<T>(plugin: Plugin, sessions: Record<string, T>): Promise<void> {
	await withPluginDataLock(plugin, async () => {
		const data = normalizePluginData(await plugin.loadData());
		data[SESSIONS_STORAGE_KEY] = sessions;
		await plugin.saveData(data);
	});
}
