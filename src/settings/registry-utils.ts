import { App } from 'obsidian';
import { AgentBackendConfig } from '../core/types';

export interface AcpRegistryAgent {
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
    binary?: Record<string, { 
      archive: string; 
      cmd: string | string[];
      args?: string[];
    }>;
    npx?: { 
      package: string; 
      args?: string[]; 
      env?: Record<string, string>;
    };
    uvx?: { 
      package: string; 
      args?: string[];
    };
  };
}

export interface AcpRegistryResponse {
  version: string;
  agents: AcpRegistryAgent[];
  extensions?: any[];
}

/**
 * Parsed launch configuration for an agent
 */
export interface AgentLaunchConfig {
  /** Agent ID from registry */
  agentId: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Version from registry */
  registryVersion: string;
  /** Command to execute (e.g., 'kimi', 'npx', 'uvx') */
  command: string;
  /** Arguments for the command */
  args: string[];
  /** Distribution type */
  distribution: 'binary' | 'npx' | 'uvx';
  /** Package name (for npx/uvx) */
  package?: string;
  /** Environment variables required */
  env: Record<string, string>;
  /** Installation hint for the user */
  installHint: string;
  /** Repository URL */
  repository?: string;
  /** Website URL */
  website?: string;
}

/**
 * Get the current platform identifier
 */
export function getCurrentPlatform(): string {
  const platform = process.platform;
  const arch = process.arch;
  
  const platformMap: Record<string, string> = {
    'darwin': 'darwin',
    'linux': 'linux',
    'win32': 'windows',
  };
  
  const archMap: Record<string, string> = {
    'arm64': 'aarch64',
    'x64': 'x86_64',
  };
  
  const os = platformMap[platform] || 'linux';
  const cpu = archMap[arch] || 'x86_64';
  
  return `${os}-${cpu}`;
}

/**
 * Parse registry agent into launch configuration for current platform
 */
export function parseAgentLaunchConfig(agent: AcpRegistryAgent): AgentLaunchConfig | null {
  const platform = getCurrentPlatform();
  const dist = agent.distribution;
  
  // Priority: binary for current platform > npx > uvx
  
  // 1. Check binary distribution for current platform
  if (dist.binary?.[platform]) {
    const platformDist = dist.binary[platform];
    const cmdParts = Array.isArray(platformDist.cmd) 
      ? platformDist.cmd 
      : platformDist.cmd.split(' ');
    
    // Extract command from registry (e.g., "./kimi" -> "kimi")
    // Registry uses relative paths for archive extraction, but users install globally
    let command = cmdParts[0];
    if (command.startsWith('./')) {
      command = command.slice(2); // Remove "./"
    }
    if (command.endsWith('.exe')) {
      command = command.slice(0, -4); // Remove ".exe" for Windows
    }
    
    return {
      agentId: agent.id,
      name: agent.name,
      description: agent.description,
      registryVersion: agent.version,
      command: command,
      args: [...cmdParts.slice(1), ...(platformDist.args || [])],
      distribution: 'binary',
      env: {},
      installHint: `Download from ${agent.repository || agent.website || 'official website'}`,
      repository: agent.repository,
      website: agent.website,
    };
  }
  
  // 2. Check npx distribution
  if (dist.npx) {
    return {
      agentId: agent.id,
      name: agent.name,
      description: agent.description,
      registryVersion: agent.version,
      command: 'npx',
      args: [dist.npx.package, ...(dist.npx.args || [])],
      distribution: 'npx',
      package: dist.npx.package,
      env: dist.npx.env || {},
      installHint: `npm install -g ${dist.npx.package.split('@')[0]}`,
      repository: agent.repository,
      website: agent.website,
    };
  }
  
  // 3. Check uvx distribution
  if (dist.uvx) {
    return {
      agentId: agent.id,
      name: agent.name,
      description: agent.description,
      registryVersion: agent.version,
      command: 'uvx',
      args: [dist.uvx.package, ...(dist.uvx.args || [])],
      distribution: 'uvx',
      package: dist.uvx.package,
      env: {},
      installHint: `pip install ${dist.uvx.package.split('@')[0]}`,
      repository: agent.repository,
      website: agent.website,
    };
  }
  
  // No supported distribution for this platform
  return null;
}

/**
 * Parse all agents from registry into launch configs
 */
export function parseRegistryForLaunch(registry: AcpRegistryResponse): AgentLaunchConfig[] {
  const configs: AgentLaunchConfig[] = [];

  for (const agent of registry.agents) {
    const config = parseAgentLaunchConfig(agent);
    if (config) {
      configs.push(config);
    }
  }

  return configs;
}

/**
 * Convert launch config to backend config
 */
export function launchConfigToBackendConfig(config: AgentLaunchConfig): AgentBackendConfig {
  return {
    type: 'acp-bridge',
    id: config.agentId,
    name: config.name,
    command: config.command,
    args: config.args,
    registryAgentId: config.agentId,
  };
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
 * Save registry to local vault data folder (overwrites).
 * Creates directory if needed.
 */
export async function saveLocalAcpRegistry(app: App, registry: AcpRegistryResponse): Promise<void> {
  try {
    const vault = app.vault;
    const dir = 'data';
    const path = `${dir}/acp-registry.json`;
    const content = JSON.stringify(registry, null, 2);
    
    // Ensure data directory exists
    const dirExists = await vault.adapter.exists(dir);
    if (!dirExists) {
      await vault.adapter.mkdir(dir);
      console.log('[Registry] Created data directory');
    }
    
    // Write file
    await vault.adapter.write(path, content);
    console.log(`[Registry] Saved to ${path}`);
    
    // Verify file was written
    const fileExists = await vault.adapter.exists(path);
    if (!fileExists) {
      throw new Error('File write verification failed');
    }
  } catch (error) {
    console.error('[Registry] Failed to save:', error);
    throw new Error(`Failed to save registry: ${error}`);
  }
}

/**
 * Load registry from local vault data folder.
 * Returns null if file doesn't exist or is invalid.
 */
export async function loadLocalAcpRegistry(app: App): Promise<AcpRegistryResponse | null> {
  try {
    const vault = app.vault;
    const path = 'data/acp-registry.json';
    
    // Check if file exists using adapter (more reliable than getAbstractFileByPath)
    const fileExists = await vault.adapter.exists(path);
    if (!fileExists) {
      console.log(`[Registry] File not found: ${path}`);
      return null;
    }
    
    // Read file content
    const content = await vault.adapter.read(path);
    const data = JSON.parse(content);
    
    // Basic validation
    if (!data || !Array.isArray(data.agents)) {
      console.error('[Registry] Invalid registry format');
      return null;
    }
    
    console.log(`[Registry] Loaded ${data.agents.length} agents`);
    return data as AcpRegistryResponse;
  } catch (error) {
    console.error('[Registry] Failed to load:', error);
    return null;
  }
}

/**
 * Get a specific agent from registry by ID
 */
export function getAgentFromRegistry(registry: AcpRegistryResponse, agentId: string): AcpRegistryAgent | null {
  return registry.agents.find(a => a.id === agentId) || null;
}

/**
 * Find agent in registry by command name (heuristic matching)
 */
export function findAgentByCommand(registry: AcpRegistryResponse, command: string): AcpRegistryAgent | null {
  const cmdBase = command.split(' ')[0].toLowerCase();
  
  // Try exact match first
  let agent = registry.agents.find(a => a.id.toLowerCase() === cmdBase);
  if (agent) return agent;
  
  // Try matching against name
  agent = registry.agents.find(a => a.name.toLowerCase().includes(cmdBase));
  if (agent) return agent;
  
  // Try matching against command in distribution
  agent = registry.agents.find(a => {
    const launchConfig = parseAgentLaunchConfig(a);
    return launchConfig?.command.toLowerCase() === cmdBase;
  });
  
  return agent || null;
}

/**
 * @deprecated Use parseAgentLaunchConfig instead
 */
export function registryAgentToBackendConfig(agent: AcpRegistryAgent): AgentBackendConfig {
  const launchConfig = parseAgentLaunchConfig(agent);
  if (!launchConfig) {
    throw new Error(`Agent ${agent.id} has no supported distribution for current platform`);
  }
  return launchConfigToBackendConfig(launchConfig);
}
