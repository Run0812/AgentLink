/* ────────────────────────────────────────────────────────────────────────
 * Plugin settings — unified configuration for all backend types.
 * 
 * Supports multiple agent backend configurations.
 * ──────────────────────────────────────────────────────────────────────── */

import { AgentBackendConfig, BackendType } from '../core/types';

export interface AgentLinkSettings {
	/** Currently selected backend config ID */
	activeBackendId: string;

	/** List of all configured backends */
	backends: AgentBackendConfig[];

	// ── Global settings ───────────────────────────────────────────────

	/** Request timeout in milliseconds (0 = no timeout). */
	requestTimeoutMs: number;
	/** Automatically reconnect on connection loss. */
	autoReconnect: boolean;
	/** Enable verbose debug logging in the developer console. */
	enableDebugLog: boolean;
	/** System prompt sent to agents. */
	systemPrompt: string;

	// ── Global Tool call settings ─────────────────────────────────────

	/** Automatically confirm read-only operations (read_file, list_dir, search). */
	autoConfirmRead: boolean;
	/** Automatically confirm file modifications (write_file, edit_file). DANGEROUS! */
	autoConfirmEdit: boolean;
	/** Show agent thinking process. */
	showThinking: boolean;
}

/** Create a default Mock backend config */
export function createMockBackendConfig(): AgentBackendConfig {
	return {
		type: 'mock',
		id: 'mock-default',
		name: 'Mock Agent (Test)',
	};
}

/** Create preset Kimi Code backend config */
export function createKimiBackendConfig(): AgentBackendConfig {
	return {
		type: 'acp-bridge',
		id: 'kimi-code',
		name: '🌙 Kimi Code (ACP)',
		bridgeCommand: 'kimi',
		bridgeArgs: 'acp',
		// Note: Kimi CLI uses stdio for ACP, no URL needed
		workspaceRoot: '',
		env: '',
		timeoutMs: 120000,
		autoConfirmTools: false,
	};
}

/** Create a default ACP Bridge backend config */
export function createAcpBridgeBackendConfig(id?: string, name?: string): AgentBackendConfig {
	return {
		type: 'acp-bridge',
		id: id || `acp-${Date.now()}`,
		name: name || 'ACP Bridge',
		bridgeCommand: '',
		bridgeArgs: '',
		// acpServerURL is optional - only needed for HTTP/WebSocket bridges
		workspaceRoot: '',
		env: '',
		timeoutMs: 120000,
		autoConfirmTools: false,
	};
}

export const DEFAULT_SETTINGS: AgentLinkSettings = {
	activeBackendId: 'mock-default',
	backends: [
		createMockBackendConfig(),
		createKimiBackendConfig(),
	],
	requestTimeoutMs: 120000,
	autoReconnect: false,
	enableDebugLog: false,
	systemPrompt: '',
	autoConfirmRead: true,
	autoConfirmEdit: false,
	showThinking: true,
};

/**
 * Parse the "env" setting (multi-line KEY=VALUE) into a Record.
 */
export function parseEnvString(raw: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx > 0) {
			result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
		}
	}
	return result;
}

/**
 * Parse bridge args from string to array.
 */
export function parseBridgeArgs(raw: string): string[] {
	if (!raw.trim()) return [];
	return raw
		.trim()
		.split(/\s+/)
		.filter(Boolean);
}

/**
 * Find a backend config by ID.
 */
export function findBackendConfig(settings: AgentLinkSettings, id: string): AgentBackendConfig | undefined {
	return settings.backends.find(b => b.id === id);
}

/**
 * Get the active backend config.
 */
export function getActiveBackendConfig(settings: AgentLinkSettings): AgentBackendConfig | undefined {
	return findBackendConfig(settings, settings.activeBackendId);
}

/**
 * Get human-readable label for backend type.
 */
export function getBackendTypeLabel(type: BackendType): string {
	switch (type) {
		case 'mock':
			return 'Mock Agent';
		case 'acp-bridge':
			return 'ACP Bridge';
		default:
			return 'Unknown';
	}
}

/**
 * Validate backend config ID (must be unique, alphanumeric with dashes/underscores).
 */
export function isValidBackendId(id: string): boolean {
	return /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 0;
}

/**
 * Generate a unique backend ID.
 */
export function generateBackendId(type: BackendType): string {
	const prefix = type === 'acp-bridge' ? 'acp' : 'backend';
	return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
