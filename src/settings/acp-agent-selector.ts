import { App, Modal, Notice, Setting, ButtonComponent, DropdownComponent } from 'obsidian';
import type AgentLinkPlugin from '../main';
import { AgentBackendConfig } from '../core/types';
import { 
  fetchAcpRegistry, 
  loadLocalAcpRegistry, 
  saveLocalAcpRegistry,
  parseRegistryForLaunch,
  AgentLaunchConfig,
  AcpRegistryAgent,
} from './registry-utils';
import { createAcpBridgeBackendConfig } from './settings';
import { scanLocalAgents, LocalAgentScanModal } from './local-agent-scanner';

/**
 * Modal for selecting and adding an ACP agent
 * Provides: Registry sync, dropdown selection, auto-scan, manual configuration
 */
export class SelectAcpAgentModal extends Modal {
  private plugin: AgentLinkPlugin;
  private onSelect: (config: AgentBackendConfig) => void;
  private agents: AcpRegistryAgent[] = [];
  private selectedAgent: AcpRegistryAgent | null = null;
  private launchConfig: AgentLaunchConfig | null = null;

  constructor(app: App, plugin: AgentLinkPlugin, onSelect: (config: AgentBackendConfig) => void) {
    super(app);
    this.plugin = plugin;
    this.onSelect = onSelect;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Add ACP Agent' });
    
    const desc = contentEl.createEl('p', { 
      text: 'Choose an agent from the ACP Registry or configure manually.',
      cls: 'setting-item-description'
    });
    desc.style.marginBottom = '1.5em';

    // Load registry
    await this.loadRegistry();

    // If no registry, show sync prompt
    if (this.agents.length === 0) {
      this.renderSyncPrompt(contentEl);
      return;
    }

    // Auto-scan button
    const scanContainer = contentEl.createDiv();
    scanContainer.style.padding = '1em';
    scanContainer.style.backgroundColor = 'var(--background-secondary)';
    scanContainer.style.borderRadius = '4px';
    scanContainer.style.marginBottom = '1.5em';
    
    const scanRow = scanContainer.createDiv();
    scanRow.style.display = 'flex';
    scanRow.style.justifyContent = 'space-between';
    scanRow.style.alignItems = 'center';
    
    const scanText = scanRow.createDiv();
    scanText.createEl('strong', { text: '🔍 Auto-Discover' });
    scanText.createEl('div', { 
      text: 'Scan your system for installed agents',
      cls: 'setting-item-description'
    });
    
    new ButtonComponent(scanRow)
      .setButtonText('Scan Now')
      .setCta()
      .onClick(() => {
        new LocalAgentScanModal(this.app, this.plugin.settings.backends, async (config) => {
          this.onSelect(config);
          return Promise.resolve();
        }).open();
        this.close();
      });

    // Agent selection dropdown
    new Setting(contentEl)
      .setName('Select Agent')
      .setDesc('Choose an agent from the ACP Registry')
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown.addOption('', '-- Select an agent --');
        
        // Group agents by installation status
        const installed: AcpRegistryAgent[] = [];
        const available: AcpRegistryAgent[] = [];
        
        for (const agent of this.agents) {
          const launchConfig = parseRegistryForLaunch({ version: '', agents: [agent] })[0];
          if (launchConfig) {
            // For now, show all as available (we'll detect on selection)
            available.push(agent);
          }
        }
        
        if (available.length > 0) {
          dropdown.addOption('__header_available__', 'Available Agents:');
          for (const agent of available) {
            dropdown.addOption(agent.id, `  ${agent.name} (v${agent.version})`);
          }
        }
        
        dropdown.onChange(async (value) => {
          if (value && !value.startsWith('__header__')) {
            this.selectedAgent = this.agents.find(a => a.id === value) || null;
            if (this.selectedAgent) {
              this.launchConfig = parseRegistryForLaunch({ 
                version: '', 
                agents: [this.selectedAgent] 
              })[0] || null;
              this.renderAgentDetails(contentEl);
            }
          }
        });
      });

    // Details container
    this.detailsContainer = contentEl.createDiv();
    this.detailsContainer.style.marginTop = '1em';

    // Buttons
    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '0.5em';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.marginTop = '1.5em';
    buttonContainer.style.borderTop = '1px solid var(--background-modifier-border)';
    buttonContainer.style.paddingTop = '1em';

    // Manual config button
    new ButtonComponent(buttonContainer)
      .setButtonText('Manual Configuration')
      .onClick(() => {
        const config = createAcpBridgeBackendConfig();
        this.onSelect(config);
        this.close();
      });

    // Sync button
    new ButtonComponent(buttonContainer)
      .setButtonText('Sync Registry')
      .onClick(async () => {
        await this.syncRegistry();
      });

    // Cancel button
    new ButtonComponent(buttonContainer)
      .setButtonText('Cancel')
      .onClick(() => this.close());

    // Add button (initially disabled)
    this.addButton = new ButtonComponent(buttonContainer)
      .setButtonText('Add Agent')
      .setCta()
      .setDisabled(true)
      .onClick(() => {
        if (this.launchConfig) {
          const config = launchConfigToBackendConfig(this.launchConfig);
          this.onSelect(config);
          this.close();
        }
      });
  }

	private detailsContainer: HTMLElement | null = null;
	private addButton: ButtonComponent | null = null;

  private async loadRegistry(): Promise<void> {
    try {
      const registry = await loadLocalAcpRegistry(this.app);
      if (registry?.agents) {
        this.agents = registry.agents;
      }
    } catch {
      this.agents = [];
    }
  }

  private renderSyncPrompt(container: HTMLElement): void {
    const promptBox = container.createDiv();
    promptBox.style.padding = '2em';
    promptBox.style.textAlign = 'center';
    promptBox.style.backgroundColor = 'var(--background-secondary)';
    promptBox.style.borderRadius = '4px';
    promptBox.style.marginBottom = '1em';
    
    promptBox.createEl('div', { 
      text: '📦 No Registry Data',
      cls: 'setting-item-name'
    }).style.marginBottom = '0.5em';
    
    promptBox.createEl('div', { 
      text: 'Sync with the ACP Registry to see available agents.',
      cls: 'setting-item-description'
    }).style.marginBottom = '1.5em';
    
    const btnContainer = promptBox.createDiv();
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '0.5em';
    btnContainer.style.justifyContent = 'center';
    
    new ButtonComponent(btnContainer)
      .setButtonText('🌐 Sync from CDN')
      .setCta()
      .onClick(async () => {
        await this.syncRegistry();
      });
    
    new ButtonComponent(btnContainer)
      .setButtonText('Manual Config')
      .onClick(() => {
        const config = createAcpBridgeBackendConfig();
        this.onSelect(config);
        this.close();
      });
    
    new ButtonComponent(btnContainer)
      .setButtonText('Cancel')
      .onClick(() => this.close());
  }

  private async syncRegistry(): Promise<void> {
    try {
      new Notice('🌐 Syncing ACP Registry...');
      const registry = await fetchAcpRegistry();
      await saveLocalAcpRegistry(this.app, registry);
      new Notice(`✅ Synced ${registry.agents.length} agents`);
      
      // Reload modal
      this.agents = registry.agents;
      this.onOpen();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`❌ Sync failed: ${msg}`);
    }
  }

  private renderAgentDetails(container: HTMLElement): void {
    if (!this.detailsContainer) return;
    this.detailsContainer.empty();
    
    if (!this.selectedAgent || !this.launchConfig) return;

    const agent = this.selectedAgent;
    const config = this.launchConfig;

    // Agent info card
    const card = this.detailsContainer.createDiv();
    card.style.padding = '1em';
    card.style.backgroundColor = 'var(--background-secondary)';
    card.style.borderRadius = '4px';
    card.style.marginTop = '1em';

    // Header
    const header = card.createDiv();
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '0.5em';
    header.style.marginBottom = '0.5em';

    const icon = header.createEl('span');
    icon.style.width = '20px';
    icon.style.height = '20px';
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    if (agent.icon?.startsWith('http://') || agent.icon?.startsWith('https://') || agent.icon?.startsWith('data:image/')) {
      const image = icon.createEl('img');
      image.src = agent.icon;
      image.alt = '';
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.objectFit = 'contain';
    } else {
      icon.textContent = agent.icon || (config.distribution === 'npx' ? '⌘' : config.distribution === 'uvx' ? '◈' : '○');
    }

    header.createEl('strong', { text: agent.name });
    
    const versionBadge = header.createEl('span', { 
      text: `v${agent.version}`,
      cls: 'setting-item-description'
    });
    versionBadge.style.fontSize = '0.8em';
    versionBadge.style.backgroundColor = 'var(--background-modifier-hover)';
    versionBadge.style.padding = '0.1em 0.4em';
    versionBadge.style.borderRadius = '3px';

    // Description
    if (agent.description) {
      const desc = card.createEl('div', { 
        text: agent.description,
        cls: 'setting-item-description'
      });
      desc.style.marginBottom = '0.5em';
    }

    // Command preview
    const cmdBox = card.createDiv();
    cmdBox.style.marginTop = '0.5em';
    cmdBox.style.padding = '0.5em';
    cmdBox.style.backgroundColor = 'var(--background-primary)';
    cmdBox.style.borderRadius = '3px';
    cmdBox.style.fontFamily = 'monospace';
    cmdBox.style.fontSize = '0.9em';
    cmdBox.textContent = `$ ${config.command} ${config.args.join(' ')}`;

    // Links
    if (agent.repository || agent.website) {
      const links = card.createDiv();
      links.style.marginTop = '0.5em';
      links.style.display = 'flex';
      links.style.gap = '1em';
      
      if (agent.repository) {
        links.createEl('a', { text: 'Repository', href: agent.repository });
      }
      if (agent.website) {
        links.createEl('a', { text: 'Website', href: agent.website });
      }
    }

		// Enable add button
		if (this.addButton) {
			this.addButton.setDisabled(false);
			this.addButton.setButtonText(`Add ${agent.name}`);
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Convert launch config to backend config
 */
function launchConfigToBackendConfig(launchConfig: AgentLaunchConfig): AgentBackendConfig {
  return {
    type: 'acp-bridge',
    id: launchConfig.agentId,
    name: launchConfig.name,
    command: launchConfig.command,
    args: launchConfig.args,
    version: launchConfig.registryVersion,
    icon: launchConfig.icon,
    registryAgentId: launchConfig.agentId,
  };
}

/**
 * @deprecated Use SelectAcpAgentModal instead
 */
export function registryAgentToBackendConfig(agent: AcpRegistryAgent, customName?: string): AgentBackendConfig {
  const launchConfig = parseRegistryForLaunch({ version: '', agents: [agent] })[0];
  if (!launchConfig) {
    throw new Error(`Agent ${agent.id} has no supported distribution for current platform`);
  }
  return launchConfigToBackendConfig(launchConfig);
}
