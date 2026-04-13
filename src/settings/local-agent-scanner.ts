import { App, Modal, Notice, ButtonComponent } from 'obsidian';
import { AgentBackendConfig } from '../core/types';
import { 
  loadLocalAcpRegistry, 
  parseRegistryForLaunch,
  launchConfigToBackendConfig,
  AgentLaunchConfig,
  fetchAcpRegistry,
  saveLocalAcpRegistry,
} from './registry-utils';
import { AcpAgentEditorModal } from './acp-agent-editor';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile) as (
  file: string,
  args?: string[],
  options?: { timeout?: number; windowsHide?: boolean }
) => Promise<{ stdout: string; stderr: string }>;
const path = require('path');
const fs = require('fs');

/**
 * Detected agent info with installation path
 */
export interface DetectedAgentInfo extends AgentLaunchConfig {
  /** Full path to the executable */
  installPath: string;
  /** Whether this is a globally installed package */
  isGlobal: boolean;
}

/**
 * Get command full path
 */
async function getCommandPath(command: string): Promise<string | null> {
  try {
    const commandName = command.trim().split(/\s+/)[0];
    if (!commandName) {
      return null;
    }

    const platform = process.platform;
    const checkCmd = platform === 'win32' ? 'where' : 'which';
    
    const { stdout } = await execFileAsync(checkCmd, [commandName], {
      timeout: 5000,
      windowsHide: true,
    });
    
    // Take first line (in case where returns multiple paths)
    return stdout.trim().split('\n')[0].trim();
  } catch {
    return null;
  }
}

/**
 * Check if an npx package is locally available (already installed)
 * WITHOUT triggering a download
 */
async function checkNpxPackageLocal(packageName: string): Promise<{ installed: boolean; path?: string; version?: string }> {
  try {
    // Get npm global prefix
    const { stdout: prefixStdout } = await execFileAsync('npm', ['config', 'get', 'prefix'], {
      timeout: 5000,
      windowsHide: true,
    });
    
    const npmPrefix = prefixStdout.trim();
    
    // Possible locations for global packages
    const possiblePaths = [
      // npm global (Unix/Mac)
      path.join(npmPrefix, 'lib', 'node_modules', packageName),
      // npm global (Windows)
      path.join(npmPrefix, 'node_modules', packageName),
    ];
    
    // Check if package exists in any of these locations
    for (const pkgPath of possiblePaths) {
      if (fs.existsSync(pkgPath)) {
        // Package exists locally, try to get version from package.json
        const pkgJsonPath = path.join(pkgPath, 'package.json');
        if (fs.existsSync(pkgJsonPath)) {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          return { 
            installed: true, 
            path: pkgPath,
            version: pkgJson.version 
          };
        }
        return { installed: true, path: pkgPath };
      }
    }
    
    // Also check if command exists in PATH (user might have installed it globally with npm install -g)
    const commandPath = await getCommandPath(packageName.split('/').pop()?.split('@')[0] || '');
    if (commandPath) {
      return { installed: true, path: commandPath };
    }
    
    return { installed: false };
  } catch {
    return { installed: false };
  }
}

/**
 * Check if a uvx package is locally available
 */
async function checkUvxPackageLocal(packageName: string): Promise<{ installed: boolean; path?: string; version?: string }> {
  try {
    // uvx typically caches packages in ~/.cache/uv
    const os = require('os');
    const cacheDir = path.join(os.homedir(), '.cache', 'uv');
    
    // Check uv cache
    if (fs.existsSync(cacheDir)) {
      // Look for the package in cache
      const entries = fs.readdirSync(cacheDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.includes(packageName.split('@')[0])) {
          return { installed: true, path: path.join(cacheDir, entry.name) };
        }
      }
    }
    
    // Check if command exists in PATH
    const commandPath = await getCommandPath(packageName.split('@')[0]);
    if (commandPath) {
      return { installed: true, path: commandPath };
    }
    
    return { installed: false };
  } catch {
    return { installed: false };
  }
}

/**
 * Verify if a binary command is actually available and get its path
 */
async function verifyBinary(command: string): Promise<{ installed: boolean; path?: string; version?: string }> {
  const commandName = command.trim().split(/\s+/)[0];
  const commandPath = await getCommandPath(commandName);
  if (!commandPath) {
    return { installed: false };
  }
  
  // Try to get version
  try {
    const versionFlags = ['--version', '-v', '-V', 'version'];
    for (const flag of versionFlags) {
      try {
        const { stdout } = await execFileAsync(commandName, [flag], {
          timeout: 5000,
          windowsHide: true,
        });
        const versionMatch = stdout.match(/(\d+\.\d+\.\d+[^\s]*)/);
        if (versionMatch) {
          return { installed: true, path: commandPath, version: versionMatch[1] };
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore version detection errors
  }
  
  return { installed: true, path: commandPath };
}

/**
 * Scan for locally installed ACP agents
 * Properly verifies npx/uvx packages are actually available (locally installed)
 */
export async function scanLocalAgents(app: App): Promise<{ 
  detected: DetectedAgentInfo[]; 
  notInstalled: AgentLaunchConfig[]; 
  error?: string 
}> {
  try {
    const registry = await loadLocalAcpRegistry(app);
    if (!registry) {
      const errorMsg = 'No registry data found. Please sync ACP Registry first.';
      console.error('[LocalScan]', errorMsg);
      return { detected: [], notInstalled: [], error: errorMsg };
    }

    const launchConfigs = parseRegistryForLaunch(registry);
    console.log(`[LocalScan] Parsed ${launchConfigs.length} agents from registry`);
    
    const detected: DetectedAgentInfo[] = [];
    const notInstalled: AgentLaunchConfig[] = [];

    for (const config of launchConfigs) {
      console.log(`[LocalScan] Checking ${config.name} (${config.distribution})...`);
      
      let verification: { installed: boolean; path?: string; version?: string };
      
      if (config.distribution === 'npx' && config.package) {
        // Check if npx package is locally installed (don't trigger download)
        verification = await checkNpxPackageLocal(config.package);
      } else if (config.distribution === 'uvx' && config.package) {
        // Check if uvx package is locally available
        verification = await checkUvxPackageLocal(config.package);
      } else {
        // Binary - just check if command exists
        verification = await verifyBinary(config.command);
      }
      
      if (verification.installed && verification.path) {
        console.log(`[LocalScan] ✓ ${config.name} found at: ${verification.path}`);
        if (verification.version) {
          config.registryVersion = verification.version;
        }
        
        detected.push({
          ...config,
          installPath: verification.path,
          isGlobal: !verification.path.includes('node_modules') && !verification.path.includes('.local'),
        });
      } else {
        console.log(`[LocalScan] ✗ ${config.name} not installed`);
        notInstalled.push(config);
      }
    }

    console.log(`[LocalScan] Result: ${detected.length} detected, ${notInstalled.length} not installed`);
    return { detected, notInstalled };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[LocalScan] Error:', errorMsg);
    return { detected: [], notInstalled: [], error: errorMsg };
  }
}

/**
 * Convert launch config to backend config with detected version
 */
export function agentLaunchConfigToBackend(config: DetectedAgentInfo): AgentBackendConfig {
  const backendConfig = launchConfigToBackendConfig(config);
  
  // Add detected version if available (only for ACP bridge configs)
  if (config.registryVersion && backendConfig.type === 'acp-bridge') {
    backendConfig.version = config.registryVersion;
  }
  
  return backendConfig;
}

/**
 * Modal for scanning and adding local ACP agents
 */
export class LocalAgentScanModal extends Modal {
  private detected: DetectedAgentInfo[] = [];
  private notInstalled: AgentLaunchConfig[] = [];
  private onAdd: (config: AgentBackendConfig) => Promise<void>;
  private addedIds = new Set<string>();
  private existingBackendIds: Set<string>;

  constructor(
    app: App,
    existingBackends: AgentBackendConfig[],
    onAdd: (config: AgentBackendConfig) => Promise<void>
  ) {
    super(app);
    this.onAdd = onAdd;
    this.existingBackendIds = new Set(existingBackends.map(b => b.id));
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '🔍 Auto-Discover ACP Agents' });

    const desc = contentEl.createEl('p', { 
      text: 'Scanning your system for installed ACP-compatible agents...',
      cls: 'setting-item-description'
    });
    desc.style.marginBottom = '1.5em';

    // Scanning status
    const statusEl = contentEl.createEl('div', {
      text: 'Scanning...',
      cls: 'setting-item-description'
    });
    statusEl.style.textAlign = 'center';
    statusEl.style.padding = '2em';

    // Container for results
    const container = contentEl.createDiv();
    container.style.display = 'none';

    try {
      const result = await scanLocalAgents(this.app);
      this.detected = result.detected;
      this.notInstalled = result.notInstalled;
      
      statusEl.style.display = 'none';
      container.style.display = 'block';
      
      if (result.error) {
        this.renderError(container, result.error);
      } else {
        this.renderResults(container);
      }
    } catch (error) {
      statusEl.textContent = `❌ Error: ${error}`;
      statusEl.style.color = 'var(--text-error)';
    }
  }

  private renderError(container: HTMLElement, error: string): void {
    const errorBox = container.createEl('div');
    errorBox.style.padding = '1.5em';
    errorBox.style.backgroundColor = 'var(--background-modifier-error)';
    errorBox.style.borderRadius = '4px';
    errorBox.style.marginBottom = '1em';
    
    const errorTitle = errorBox.createEl('div', { text: '⚠️ Registry Not Found' });
    errorTitle.style.fontWeight = 'bold';
    errorTitle.style.marginBottom = '0.5em';
    
    const errorDesc = errorBox.createEl('div', { 
      text: error,
      cls: 'setting-item-description'
    });
    errorDesc.style.whiteSpace = 'pre-line';
    
    // Add Sync Registry button
    const btnContainer = container.createDiv();
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '0.5em';
    btnContainer.style.marginTop = '1em';
    
    const syncBtn = container.createEl('button', { text: '🌐 Sync Registry from CDN' });
    syncBtn.classList.add('mod-cta');
    syncBtn.addEventListener('click', async () => {
      syncBtn.textContent = 'Syncing...';
      syncBtn.disabled = true;
      try {
        const registry = await fetchAcpRegistry();
        await saveLocalAcpRegistry(this.app, registry);
        new Notice(`✅ Synced ${registry.agents.length} agents from ACP Registry`);
        // Re-scan
        container.empty();
        await this.onOpen();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        new Notice(`❌ Sync failed: ${msg}`);
        syncBtn.textContent = '🌐 Sync Registry from CDN';
        syncBtn.disabled = false;
      }
    });
    
    const closeBtn = btnContainer.createEl('button', { text: 'Close' });
    closeBtn.addEventListener('click', () => this.close());
  }

  private renderResults(container: HTMLElement): void {
    // Auto-add all button if detected agents exist
    if (this.detected.length > 0) {
      const autoAddContainer = container.createDiv();
      autoAddContainer.style.display = 'flex';
      autoAddContainer.style.justifyContent = 'space-between';
      autoAddContainer.style.alignItems = 'center';
      autoAddContainer.style.marginBottom = '1em';
      autoAddContainer.style.padding = '1em';
      autoAddContainer.style.backgroundColor = 'var(--background-modifier-success-hover)';
      autoAddContainer.style.borderRadius = '4px';
      
      const autoAddText = autoAddContainer.createEl('div');
      autoAddText.createEl('strong', { text: `Found ${this.detected.length} installed agent(s)` });
      autoAddText.createEl('div', { 
        text: 'Click to add all detected agents automatically.',
        cls: 'setting-item-description'
      });
      
      const autoAddBtn = autoAddContainer.createEl('button', { text: 'Add All' });
      autoAddBtn.classList.add('mod-cta');
      autoAddBtn.addEventListener('click', async () => {
        autoAddBtn.disabled = true;
        autoAddBtn.textContent = 'Adding...';
        
        let added = 0;
        for (const agent of this.detected) {
          if (!this.addedIds.has(agent.agentId)) {
            try {
              const config = agentLaunchConfigToBackend(agent);
              await this.onAdd(config);
              this.addedIds.add(agent.agentId);
              added++;
            } catch (error) {
              console.error(`Failed to add ${agent.name}:`, error);
            }
          }
        }
        
        new Notice(`✅ Added ${added} agent(s)`);
        this.close();
      });
    }

    // Detected agents list
    if (this.detected.length > 0) {
      container.createEl('h3', { text: '✅ Detected Agents' });
      
      const detectedList = container.createDiv();
      detectedList.style.marginBottom = '1.5em';
      
      for (const agent of this.detected) {
        this.renderDetectedItem(detectedList, agent);
      }
    } else {
      const noAgentsBox = container.createEl('div');
      noAgentsBox.style.padding = '2em';
      noAgentsBox.style.textAlign = 'center';
      noAgentsBox.style.backgroundColor = 'var(--background-secondary)';
      noAgentsBox.style.borderRadius = '4px';
      noAgentsBox.style.marginBottom = '1em';
      
      noAgentsBox.createEl('div', { 
        text: '🔍 No ACP agents detected',
        cls: 'setting-item-description'
      });
      noAgentsBox.createEl('div', { 
        text: 'Install an agent from the list below to get started.',
        cls: 'setting-item-description'
      });
    }

    // Not installed agents (collapsible)
    if (this.notInstalled.length > 0) {
      const notInstalledHeader = container.createEl('h3', { 
        text: `📦 Available to Install (${this.notInstalled.length}) ▶` 
      });
      notInstalledHeader.style.cursor = 'pointer';
      notInstalledHeader.style.color = 'var(--text-muted)';
      notInstalledHeader.style.marginTop = '1em';
      
      const notInstalledList = container.createDiv();
      notInstalledList.style.display = 'none';
      notInstalledList.style.opacity = '0.7';
      
      notInstalledHeader.addEventListener('click', () => {
        const isHidden = notInstalledList.style.display === 'none';
        notInstalledList.style.display = isHidden ? 'block' : 'none';
        notInstalledHeader.textContent = isHidden 
          ? `📦 Available to Install (${this.notInstalled.length}) ▼`
          : `📦 Available to Install (${this.notInstalled.length}) ▶`;
      });
      
      for (const agent of this.notInstalled) {
        this.renderNotInstalledItem(notInstalledList, agent);
      }
    }

    // Close button
    const btnContainer = container.createDiv();
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '0.5em';
    btnContainer.style.justifyContent = 'flex-end';
    btnContainer.style.marginTop = '1.5em';
    btnContainer.style.borderTop = '1px solid var(--background-modifier-border)';
    btnContainer.style.paddingTop = '1em';

    new ButtonComponent(btnContainer)
      .setButtonText('Close')
      .onClick(() => this.close());
  }

  private renderDetectedItem(container: HTMLElement, agent: DetectedAgentInfo): void {
    // Check if already in user config OR already added in this session
    const isInConfig = this.existingBackendIds.has(agent.agentId);
    const isAdded = this.addedIds.has(agent.agentId);
    const alreadyExists = isInConfig || isAdded;
    
    const item = container.createDiv();
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '0.75em';
    item.style.padding = '0.75em';
    item.style.marginBottom = '0.5em';
    item.style.border = '1px solid var(--background-modifier-border)';
    item.style.borderRadius = '4px';
    item.style.backgroundColor = alreadyExists 
      ? 'var(--background-modifier-success-hover)' 
      : 'var(--background-primary)';
    item.style.opacity = alreadyExists ? '0.7' : '1';

    // Icon based on distribution type
    const icon = item.createEl('span');
    icon.style.fontSize = '1.5em';
    icon.textContent = agent.distribution === 'npx' ? '📦' : 
                      agent.distribution === 'uvx' ? '🐍' : '🔧';

    // Info container
    const info = item.createDiv();
    info.style.flex = '1';
    info.style.minWidth = '0'; // Enable text truncation

    // Row 1: Agent name + version
    const nameRow = info.createDiv();
    nameRow.style.display = 'flex';
    nameRow.style.alignItems = 'center';
    nameRow.style.gap = '0.5em';
    nameRow.style.marginBottom = '0.25em';
    
    const nameEl = nameRow.createEl('strong', { text: agent.name });
    nameEl.style.fontSize = '1.1em';
    
    // Version badge
    if (agent.registryVersion) {
      const versionBadge = nameRow.createEl('span', { 
        text: `v${agent.registryVersion}`,
        cls: 'setting-item-description'
      });
      versionBadge.style.fontSize = '0.85em';
      versionBadge.style.backgroundColor = 'var(--interactive-accent)';
      versionBadge.style.color = 'var(--text-on-accent)';
      versionBadge.style.padding = '0.1em 0.4em';
      versionBadge.style.borderRadius = '3px';
    }

    // Row 2: Installation path
    const pathRow = info.createDiv();
    pathRow.style.display = 'flex';
    pathRow.style.alignItems = 'center';
    pathRow.style.gap = '0.5em';
    
    const pathLabel = pathRow.createEl('span', { 
      text: agent.isGlobal ? '🌐' : '📁',
      cls: 'setting-item-description'
    });
    pathLabel.style.fontSize = '0.9em';
    
    const pathText = pathRow.createEl('code', { 
      text: agent.installPath 
    });
    pathText.style.fontSize = '0.8em';
    pathText.style.backgroundColor = 'var(--background-secondary)';
    pathText.style.padding = '0.15em 0.4em';
    pathText.style.borderRadius = '3px';
    pathText.style.color = 'var(--text-muted)';
    pathText.style.maxWidth = '300px';
    pathText.style.overflow = 'hidden';
    pathText.style.textOverflow = 'ellipsis';
    pathText.style.whiteSpace = 'nowrap';
    pathText.title = agent.installPath; // Show full path on hover

    // Add button or status
    if (alreadyExists) {
      const statusText = isInConfig ? '✓ In Config' : '✓ Added';
      const addedBadge = item.createEl('span', { text: statusText });
      addedBadge.style.color = 'var(--text-success)';
      addedBadge.style.fontWeight = 'bold';
    } else {
      const addBtn = item.createEl('button', { text: 'Add' });
      addBtn.classList.add('mod-cta');
      addBtn.style.flexShrink = '0';
      addBtn.addEventListener('click', () => {
        // Open editor modal instead of directly adding
        const config = agentLaunchConfigToBackend(agent);
        new AcpAgentEditorModal(this.app, config as any, true, async (savedConfig) => {
          await this.onAdd(savedConfig);
          this.addedIds.add(agent.agentId);
          
          // Update UI
          item.style.backgroundColor = 'var(--background-modifier-success-hover)';
          item.style.opacity = '0.7';
          addBtn.remove();
          const addedBadge = item.createEl('span', { text: '✓ Added' });
          addedBadge.style.color = 'var(--text-success)';
          addedBadge.style.fontWeight = 'bold';
          
          new Notice(`✅ Added ${savedConfig.name}`);
        }).open();
      });
    }
  }

  private renderNotInstalledItem(container: HTMLElement, agent: AgentLaunchConfig): void {
    const item = container.createDiv();
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '0.75em';
    item.style.padding = '0.5em 0.75em';
    item.style.marginBottom = '0.5em';
    item.style.border = '1px dashed var(--background-modifier-border)';
    item.style.borderRadius = '4px';

    const icon = item.createEl('span');
    icon.textContent = agent.distribution === 'npx' ? '📦' : 
                      agent.distribution === 'uvx' ? '🐍' : '🔧';
    icon.style.opacity = '0.5';

    const info = item.createDiv();
    info.style.flex = '1';
    info.style.opacity = '0.7';

    info.createEl('div', { text: agent.name });
    
    const installHint = info.createEl('div', { 
      text: `Install: ${agent.installHint}`,
      cls: 'setting-item-description'
    });
    installHint.style.fontSize = '0.8em';
    
    if (agent.repository) {
      const repoLink = item.createEl('a', { text: 'GitHub', href: agent.repository });
      repoLink.style.fontSize = '0.8em';
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Add all detected agents at once
 */
export async function addAllDetectedAgents(
  app: App,
  onAdd: (config: AgentBackendConfig) => Promise<void>
): Promise<{ added: number; errors: string[] }> {
  const result = { added: 0, errors: [] as string[] };
  const existingIds = new Set<string>();
  
  const { detected } = await scanLocalAgents(app);
  
  for (const agent of detected) {
    if (existingIds.has(agent.agentId)) {
      continue;
    }
    
    try {
      const config = agentLaunchConfigToBackend(agent);
      await onAdd(config);
      existingIds.add(agent.agentId);
      result.added++;
    } catch (error) {
      result.errors.push(`${agent.name}: ${error}`);
    }
  }
  
  return result;
}
