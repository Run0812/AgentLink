/* ────────────────────────────────────────────────────────────────────────
 * Plugin settings — unified configuration for all backend types.
 * ──────────────────────────────────────────────────────────────────────── */

import { BackendType } from '../core/types';

export interface AgentLinkSettings {
	/** Which backend adapter to use. */
	backendType: BackendType;

	// ── CLI settings ──────────────────────────────────────────────────

	/** CLI command to execute (e.g. "claude", "python"). */
	command: string;
	/** Arguments passed to the CLI command. */
	args: string;
	/** Working directory for the CLI process. */
	cwd: string;
	/** Environment variables as "KEY=VALUE" per line. */
	env: string;

	// ── HTTP settings ─────────────────────────────────────────────────

	/** Base URL of the local HTTP agent (e.g. "http://127.0.0.1:11434/v1"). */
	baseURL: string;
	/** Optional API key for authenticated endpoints. */
	apiKey: string;
	/** Model identifier. */
	model: string;

	// ── Shared settings ───────────────────────────────────────────────

	/** Request timeout in milliseconds (0 = no timeout). */
	requestTimeoutMs: number;
	/** Automatically reconnect on connection loss. */
	autoReconnect: boolean;
	/** Enable verbose debug logging in the developer console. */
	enableDebugLog: boolean;
	/** System prompt sent to HTTP-based agents. */
	systemPrompt: string;
	/** Max characters of file content included as context. */
	maxContextLength: number;
}

export const DEFAULT_SETTINGS: AgentLinkSettings = {
	backendType: 'mock',
	command: '',
	args: '',
	cwd: '',
	env: '',
	baseURL: 'http://127.0.0.1:11434/v1',
	apiKey: '',
	model: '',
	requestTimeoutMs: 120000,
	autoReconnect: false,
	enableDebugLog: false,
	systemPrompt: '',
	maxContextLength: 8000,
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
 * Parse the "args" setting (space-separated) into an array.
 */
export function parseArgsString(raw: string): string[] {
	return raw
		.trim()
		.split(/\s+/)
		.filter(Boolean);
}
