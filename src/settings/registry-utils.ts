import { App } from 'obsidian';
import { AgentBackendConfig } from '../core/types';

export interface AcpRegistryResponse {
  version: string;
  agents: Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    repository?: string;
    website?: string;
    authors?: Array<{ name: string } | string>;
    license?: string;
    icon?: string;
    distribution: {
      binary?: Record<string, { archive: string; cmd: string }>;
      npx?: { package: string; args?: string[]; env?: Record<string, string> };
      uvx?: { package: string; args?: string[] };
    };
  }>;
  extensions?: any[];
}

/**
 * Fetch the latest official ACP registry from CDN.
 * Throws on network or parse failure.
 */
export async function fetchAcpRegistry(): Promise<AcpRegistryResponse> {
  const response = await fetch('https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json');
  if (!response.ok) {
    throw new Error(`Failed to fetch ACP registry: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Load registry from local vault data folder.
 * Returns null if file doesn't exist or is invalid.
 */
export async function loadLocalAcpRegistry(app: App): Promise<AcpRegistryResponse | null> {
  try {
    const vault = app.vault;
    const path = 'data/acp-registry.json';
    const file = vault.getAbstractFileByPath(path);
    if (!file) return null;
    const content = await vault.read(file as any);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save registry to local vault data folder (overwrites).
 */
export async function saveLocalAcpRegistry(app: App, registry: AcpRegistryResponse): Promise<void> {
  const vault = app.vault;
  const path = 'data/acp-registry.json';
  const content = JSON.stringify(registry, null, 2);
  await vault.adapter.write(path, content);
}

/**
 * Convert a registry agent entry into a backend config suitable for ACP Bridge.
 * Only supports binary distributions (npx/uvx would need extra plumbing).
 */
export function registryAgentToBackendConfig(agent: AcpRegistryResponse['agents'][number]): AgentBackendConfig {
  // Prefer binary distribution; fall back to npx if binary missing
  const binaryDist = agent.distribution.binary;
  const npxDist = agent.distribution.npx;
  const uvxDist = agent.distribution.uvx;

  if (!binaryDist && !npxDist && !uvxDist) {
    throw new Error(`Agent ${agent.id} has no supported distribution type`);
  }

  let command: string;
  let argsArray: string[] = [];

  if (binaryDist) {
    // Pick the first available platform (simple heuristic)
    const platformKey = Object.keys(binaryDist)[0];
    const platform = binaryDist[platformKey];
    if (!platform) {
      throw new Error(`Agent ${agent.id} binary distribution missing platform data`);
    }

    const { archive, cmd } = platform;
    if (!archive || !cmd) {
      throw new Error(`Agent ${agent.id} binary distribution missing archive or cmd`);
    }

    // Extract command and args from cmd string or array
    if (Array.isArray(cmd)) {
      command = cmd[0];
      argsArray = (cmd as string[]).slice(1);
    } else {
      const cmdParts = (cmd as string).split(' ');
      command = cmdParts[0];
      argsArray = cmdParts.slice(1);
    }
  } else if (npxDist) {
    command = 'npx';
    argsArray = [npxDist.package, ...(npxDist.args || [])];
  } else if (uvxDist) {
    command = 'uvx';
    argsArray = [uvxDist.package, ...(uvxDist.args || [])];
  } else {
    throw new Error(`Agent ${agent.id} has no supported distribution type`);
  }

  // Derive a unique ID from registry agent id + version to avoid collisions
  const id = `acp-${agent.id}@${agent.version}`;

  return {
    type: 'acp-bridge',
    id,
    name: `${agent.name} (v${agent.version})`,
    bridgeCommand: command,
    bridgeArgs: argsArray.join(' '),
    // Note: archive URL would need to be downloaded and extracted; this config assumes
    // the user has already installed the agent locally and the cmd is in PATH.
    // For a fully automated experience we would need a plugin-side installer.
    workspaceRoot: '',
    env: '',
    timeoutMs: 30000,
    autoConfirmTools: false,
  };
}