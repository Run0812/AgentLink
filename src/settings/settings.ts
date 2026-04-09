/* ────────────────────────────────────────────────────────────────────────
 * Plugin settings — unified configuration for all backend types.
 * 
 * Supports multiple agent backend configurations.
 * ──────────────────────────────────────────────────────────────────────── */

import { App } from 'obsidian';
import { AgentBackendConfig, BackendType } from '../core/types';
import { fetchAcpRegistry, loadLocalAcpRegistry, registryAgentToBackendConfig, saveLocalAcpRegistry, AcpRegistryResponse } from './registry-utils';

export interface AgentLinkSettings {
  /** Currently selected backend config ID */
  activeBackendId: string;

  /** List of all configured backends */
  backends: AgentBackendConfig[];

  // ── Registry settings ──

  /** Whether to enable automatic registry sync from ACP CDN. */
  enableAcpRegistrySync: boolean;
  /** Last successful registry sync timestamp (ISO string). */
  lastAcpRegistrySync: string | null;
  /** Registry auto-sync interval in hours (0 = disabled). */
  acpRegistrySyncIntervalHours: number;

  // ── Global settings ──

  /** Request timeout in milliseconds (0 = no timeout). */
  requestTimeoutMs: number;
  /** Automatically reconnect on connection loss. */
  autoReconnect: boolean;
  /** Enable verbose debug logging in the developer console. */
  enableDebugLog: boolean;
  /** System prompt sent to agents. */
  systemPrompt: string;

  // ── Global Tool call settings ──

  /** Automatically confirm read-only operations (read_file, list_dir, search). */
  autoConfirmRead: boolean;
  /** Automatically confirm file modifications (write_file, edit_file). DANGEROUS! */
  autoConfirmEdit: boolean;
  /** Show agent thinking process. */
  showThinking: boolean;
  /** Thinking intensity mode: none/quick/balanced/deep */
  thinkingMode: 'none' | 'quick' | 'balanced' | 'deep';
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
		id: 'kimi',
		name: '🌙 Kimi Code',
		command: 'kimi',
		args: ['acp'],
		registryAgentId: 'kimi',
	};
}

/** Create a default ACP Bridge backend config */
export function createAcpBridgeBackendConfig(
	id?: string,
	name?: string,
	command?: string,
	args?: string[],
	registryAgentId?: string
): AgentBackendConfig {
	return {
		type: 'acp-bridge',
		id: id || `acp-${Date.now()}`,
		name: name || 'ACP Bridge',
		command: command || '',
		args: args || [],
		registryAgentId,
	};
}

export const DEFAULT_SETTINGS: AgentLinkSettings = {
  activeBackendId: 'mock-default',
  backends: [
    createMockBackendConfig(),
  ],
  // ── Registry settings ────────────────────────────────────────
  enableAcpRegistrySync: true,
  lastAcpRegistrySync: null,
  acpRegistrySyncIntervalHours: 12,

  // ── Global settings ────────────────────────────────────────
  requestTimeoutMs: 120000,
  autoReconnect: false,
  enableDebugLog: false,
  systemPrompt: '',
  autoConfirmRead: true,
  autoConfirmEdit: false,
  showThinking: true,
  thinkingMode: 'balanced',
};

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

/**
 * Merge official ACP registry agents into the user's backend list.
 * - Fetches/loads registry (respecting sync settings)
 * - Converts each agent to a backend config
 * - Preserves existing manually configured backends (by id)
 * - Returns new backends list and updated sync timestamp
 */
export async function mergeAcpRegistryIntoSettings(
  app: App,
  settings: AgentLinkSettings
): Promise<{ backends: AgentBackendConfig[]; lastSync: string | null }> {
  // Determine if we should sync
  const now = Date.now();
  const lastSync = settings.lastAcpRegistrySync
    ? new Date(settings.lastAcpRegistrySync).getTime()
    : 0;
  const intervalMs = settings.acpRegistrySyncIntervalHours * 3600 * 1000;
  const shouldSync =
    settings.enableAcpRegistrySync &&
    (intervalMs === 0 || now - lastSync > intervalMs);

  let registry: AcpRegistryResponse | null = null;
  if (shouldSync) {
    try {
      registry = await fetchAcpRegistry();
      await saveLocalAcpRegistry(app, registry);
    } catch (err) {
      console.warn('[AgentLink] Failed to fetch ACP registry from CDN, falling back to local copy:', err);
      registry = await loadLocalAcpRegistry(app);
    }
  } else {
    registry = await loadLocalAcpRegistry(app);
  }

  // Start with existing backends (preserve manual edits)
  const backendsMap = new Map<string, AgentBackendConfig>();
  for (const be of settings.backends) {
    backendsMap.set(be.id, be);
  }

  // Add/override with registry agents
  if (registry?.agents) {
    for (const agent of registry.agents) {
      try {
        const config = registryAgentToBackendConfig(agent);
        // Only add if not already present (by id) - lets user edit and preserve
        if (!backendsMap.has(config.id)) {
          backendsMap.set(config.id, config);
        }
      } catch (err) {
        console.warn(`[AgentLink] Skipping registry agent ${agent.id}:`, err);
      }
    }
  }

  const backends = Array.from(backendsMap.values());
  const timestamp = shouldSync ? new Date(now).toISOString() : settings.lastAcpRegistrySync;
  return { backends, lastSync: timestamp };
}
