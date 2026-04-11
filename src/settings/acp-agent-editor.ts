import { App, Modal, Setting, ButtonComponent, Notice } from 'obsidian';
import { AgentBackendConfig, AcpBridgeBackendConfig } from '../core/types';

/**
 * Modal for editing a single ACP Agent configuration
 * Used both for adding new agents and editing existing ones
 */
export class AcpAgentEditorModal extends Modal {
  private config: AcpBridgeBackendConfig;
  private isNew: boolean;
  private onSave: (config: AgentBackendConfig) => Promise<void>;

  constructor(
    app: App,
    config: AcpBridgeBackendConfig,
    isNew: boolean,
    onSave: (config: AgentBackendConfig) => Promise<void>
  ) {
    super(app);
    this.config = { ...config }; // Clone to avoid modifying original until save
    this.isNew = isNew;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const title = this.isNew ? `Add Agent: ${this.config.name}` : `Edit Agent: ${this.config.name}`;
    contentEl.createEl('h2', { text: title });

    // Agent info card
    this.renderAgentInfo(contentEl);

    // Configuration form
    contentEl.createEl('h3', { text: 'Configuration' });
    
    new Setting(contentEl)
      .setName('Display Name')
      .setDesc('Name shown in the backend list')
      .addText(text => {
        text.setValue(this.config.name)
          .onChange(value => {
            this.config.name = value;
          });
      });

    new Setting(contentEl)
      .setName('Command')
      .setDesc('Command to start the agent (or full path if not in PATH)')
      .addText(text => {
        text.setValue(this.config.command)
          .onChange(value => {
            this.config.command = value;
          });
      });

    new Setting(contentEl)
      .setName('Arguments')
      .setDesc('Command arguments (space-separated)')
      .addText(text => {
        text.setValue(this.config.args.join(' '))
          .onChange(value => {
            this.config.args = value.trim().split(/\s+/).filter(Boolean);
          });
      });

    // Version info (read-only if detected)
    if (this.config.version) {
      new Setting(contentEl)
        .setName('Detected Version')
        .setDesc('Auto-detected from installed agent')
        .addText(text => {
          text.setValue(this.config.version || '')
            .setDisabled(true);
        });
    }

    // Registry info (read-only)
    if (this.config.registryAgentId) {
      new Setting(contentEl)
        .setName('Registry ID')
        .setDesc('ACP Registry agent identifier')
        .addText(text => {
          text.setValue(this.config.registryAgentId || '')
            .setDisabled(true);
        });
    }

    // Action buttons
    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '0.5em';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.marginTop = '1.5em';
    buttonContainer.style.borderTop = '1px solid var(--background-modifier-border)';
    buttonContainer.style.paddingTop = '1em';

    new ButtonComponent(buttonContainer)
      .setButtonText('Cancel')
      .onClick(() => this.close());

    new ButtonComponent(buttonContainer)
      .setButtonText(this.isNew ? 'Add Agent' : 'Save Changes')
      .setCta()
      .onClick(async () => {
        try {
          await this.onSave(this.config);
          new Notice(this.isNew ? `✅ Added ${this.config.name}` : `✅ Updated ${this.config.name}`);
          this.close();
        } catch (error) {
          new Notice(`❌ Failed to save: ${error}`);
        }
      });
  }

  private renderAgentInfo(container: HTMLElement): void {
    const infoCard = container.createDiv();
    infoCard.style.padding = '1em';
    infoCard.style.backgroundColor = 'var(--background-secondary)';
    infoCard.style.borderRadius = '4px';
    infoCard.style.marginBottom = '1em';

    const icon = infoCard.createEl('div');
    icon.style.fontSize = '2em';
    icon.style.marginBottom = '0.25em';
    const iconValue = this.getAgentIcon();
    if (iconValue.startsWith('http://') || iconValue.startsWith('https://') || iconValue.startsWith('data:image/')) {
      const image = icon.createEl('img');
      image.src = iconValue;
      image.alt = '';
      image.style.width = '32px';
      image.style.height = '32px';
      image.style.objectFit = 'contain';
    } else {
      icon.textContent = iconValue;
    }

    infoCard.createEl('strong', { text: this.config.name });
    
    if (this.config.version) {
      const versionBadge = infoCard.createEl('span', { 
        text: ` v${this.config.version}`,
        cls: 'setting-item-description'
      });
      versionBadge.style.marginLeft = '0.5em';
    }

    const cmdDisplay = infoCard.createEl('code', { 
      text: `$ ${this.config.command} ${this.config.args.join(' ')}` 
    });
    cmdDisplay.style.display = 'block';
    cmdDisplay.style.marginTop = '0.5em';
    cmdDisplay.style.fontSize = '0.9em';
    cmdDisplay.style.backgroundColor = 'var(--background-primary)';
    cmdDisplay.style.padding = '0.25em 0.5em';
    cmdDisplay.style.borderRadius = '3px';
  }

  private getAgentIcon(): string {
    if (this.config.icon) {
      return this.config.icon;
    }

    // Simple heuristic based on registry ID or command
    const id = this.config.registryAgentId || this.config.id;
    if (id?.includes('kimi')) return '🌙';
    if (id?.includes('claude')) return '🟣';
    if (id?.includes('gpt') || id?.includes('openai')) return '🟢';
    if (id?.includes('gemini')) return '🔷';
    if (this.config.command?.includes('npx')) return '📦';
    if (this.config.command?.includes('uvx')) return '🐍';
    return '🔧';
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
