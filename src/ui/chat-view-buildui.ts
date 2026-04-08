	private buildUI(container: HTMLElement): void {
		// Header with compact two-row layout
		this.headerEl = container.createDiv({ cls: 'agentlink-header' });
		
		// Row 1: AgentLink | Status | Backend | Actions
		const headerRow1 = this.headerEl.createDiv({ cls: 'agentlink-header-row1' });
		headerRow1.style.display = 'flex';
		headerRow1.style.alignItems = 'center';
		headerRow1.style.justifyContent = 'space-between';
		headerRow1.style.padding = '0.5rem 0.75rem';
		headerRow1.style.borderBottom = '1px solid var(--background-modifier-border)';
		
		// Left: AgentLink icon + text
		const leftSection = headerRow1.createDiv();
		leftSection.style.display = 'flex';
		leftSection.style.alignItems = 'center';
		leftSection.style.gap = '0.5rem';
		leftSection.createEl('span', { text: '🤖', cls: 'agentlink-icon' });
		leftSection.createEl('span', { text: 'AgentLink', cls: 'agentlink-brand' });
		
		// Center: Status indicator + Backend name
		const centerSection = headerRow1.createDiv();
		centerSection.style.display = 'flex';
		centerSection.style.alignItems = 'center';
		centerSection.style.gap = '0.5rem';
		
		// Status LED (small dot like HDD indicator)
		this.statusLed = centerSection.createEl('span', { cls: 'agentlink-status-led' });
		this.statusLed.style.width = '8px';
		this.statusLed.style.height = '8px';
		this.statusLed.style.borderRadius = '50%';
		this.statusLed.style.background = 'var(--text-muted)';
		this.statusLed.style.transition = 'all 0.2s ease';
		
		// Backend name
		this.backendLabel = centerSection.createEl('span', { cls: 'agentlink-backend-name' });
		this.backendLabel.style.fontSize = '0.9rem';
		this.backendLabel.style.color = 'var(--text-muted)';
		
		// Right: Action buttons
		const rightSection = headerRow1.createDiv();
		rightSection.style.display = 'flex';
		rightSection.style.alignItems = 'center';
		rightSection.style.gap = '0.25rem';
		
		// History dropdown
		const historyContainer = rightSection.createDiv({ cls: 'agentlink-history-container' });
		historyContainer.style.position = 'relative';
		this.historyBtn = historyContainer.createEl('button', {
			cls: 'agentlink-header-btn',
			attr: { 'aria-label': 'History' },
		});
		this.historyBtn.innerHTML = '📜';
		this.historyBtn.style.padding = '0.35rem 0.5rem';
		this.historyBtn.style.background = 'transparent';
		this.historyBtn.style.border = 'none';
		this.historyBtn.style.cursor = 'pointer';
		this.historyBtn.style.fontSize = '1rem';
		
		const historyDropdown = historyContainer.createDiv({ cls: 'agentlink-history-dropdown' });
		historyDropdown.style.display = 'none';
		
		this.historyBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const isOpen = historyDropdown.style.display !== 'none';
			historyDropdown.style.display = isOpen ? 'none' : 'block';
			if (!isOpen) {
				this.renderHistoryDropdown(historyDropdown);
			}
		});
		
		document.addEventListener('click', () => {
			historyDropdown.style.display = 'none';
		});
		
		// New session button
		this.newSessionBtn = rightSection.createEl('button', {
			cls: 'agentlink-header-btn',
			attr: { 'aria-label': 'New Chat' },
		});
		this.newSessionBtn.innerHTML = '💬';
		this.newSessionBtn.style.padding = '0.35rem 0.5rem';
		this.newSessionBtn.style.background = 'transparent';
		this.newSessionBtn.style.border = 'none';
		this.newSessionBtn.style.cursor = 'pointer';
		this.newSessionBtn.style.fontSize = '1rem';
		this.newSessionBtn.addEventListener('click', () => this.createNewSession());
		
		// Clear button
		this.clearBtn = rightSection.createEl('button', {
			cls: 'agentlink-header-btn',
			attr: { 'aria-label': 'Clear' },
		});
		this.clearBtn.innerHTML = '🗑️';
		this.clearBtn.style.padding = '0.35rem 0.5rem';
		this.clearBtn.style.background = 'transparent';
		this.clearBtn.style.border = 'none';
		this.clearBtn.style.cursor = 'pointer';
		this.clearBtn.style.fontSize = '1rem';
		this.clearBtn.addEventListener('click', () => this.clearConversation());
		
		// Row 2: Session title (editable)
		const headerRow2 = this.headerEl.createDiv({ cls: 'agentlink-header-row2' });
		headerRow2.style.display = 'flex';
		headerRow2.style.alignItems = 'center';
		headerRow2.style.padding = '0.35rem 0.75rem';
		headerRow2.style.borderBottom = '1px solid var(--background-modifier-border)';
		headerRow2.style.background = 'var(--background-secondary)';
		
		this.sessionTitleEl = headerRow2.createEl('span', { 
			cls: 'agentlink-session-title',
			text: 'New Chat',
		});
		this.sessionTitleEl.style.fontSize = '0.9rem';
		this.sessionTitleEl.style.color = 'var(--text-normal)';
		this.sessionTitleEl.style.cursor = 'pointer';
		this.sessionTitleEl.style.flex = '1';
		this.sessionTitleEl.addEventListener('click', () => this.renameCurrentSession());
		
		// Messages area
		this.messagesEl = container.createDiv({ cls: 'agentlink-messages' });
		this.messagesEl.style.flex = '1';
		this.messagesEl.style.overflowY = 'auto';
		this.messagesEl.style.padding = '0.75rem';
		
		// Load existing session or create new
		this.initializeSession();

		// Input area with Send button on right
		const inputArea = container.createDiv({ cls: 'agentlink-input-area' });
		inputArea.style.display = 'flex';
		inputArea.style.gap = '0.5rem';
		inputArea.style.padding = '0.75rem';
		inputArea.style.borderTop = '1px solid var(--background-modifier-border)';
		inputArea.style.background = 'var(--background-secondary)';

		this.inputEl = inputArea.createEl('textarea', {
			cls: 'agentlink-input',
			placeholder: 'Ask your AI agent…',
		});
		this.inputEl.style.flex = '1';
		this.inputEl.style.minHeight = '3rem';
		this.inputEl.style.maxHeight = '8rem';
		this.inputEl.style.resize = 'vertical';
		this.inputEl.style.padding = '0.5rem';
		this.inputEl.style.border = '1px solid var(--background-modifier-border)';
		this.inputEl.style.borderRadius = '4px';
		this.inputEl.style.background = 'var(--background-primary)';
		this.inputEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
				evt.preventDefault();
				this.handleSend();
			}
		});

		// Button column on right
		const btnCol = inputArea.createDiv();
		btnCol.style.display = 'flex';
		btnCol.style.flexDirection = 'column';
		btnCol.style.gap = '0.25rem';

		this.sendBtn = btnCol.createEl('button', {
			cls: 'agentlink-send-btn',
			text: 'Send',
		});
		this.sendBtn.style.padding = '0.5rem 1rem';
		this.sendBtn.style.background = 'var(--interactive-accent)';
		this.sendBtn.style.color = 'var(--text-on-accent)';
		this.sendBtn.style.border = 'none';
		this.sendBtn.style.borderRadius = '4px';
		this.sendBtn.style.cursor = 'pointer';
		this.sendBtn.addEventListener('click', () => this.handleSend());

		this.stopBtn = btnCol.createEl('button', {
			cls: 'agentlink-stop-btn',
			text: 'Stop',
		});
		this.stopBtn.style.padding = '0.5rem 1rem';
		this.stopBtn.style.background = 'var(--background-modifier-error)';
		this.stopBtn.style.color = 'var(--text-on-accent)';
		this.stopBtn.style.border = 'none';
		this.stopBtn.style.borderRadius = '4px';
		this.stopBtn.style.cursor = 'pointer';
		this.stopBtn.style.display = 'none';
		this.stopBtn.addEventListener('click', () => this.handleStop());

		// Add keyframes for status LED blinking
		if (!document.getElementById('agentlink-led-animations')) {
			const style = document.createElement('style');
			style.id = 'agentlink-led-animations';
			style.textContent = `
				@keyframes agentlink-led-blink {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.3; }
				}
			`;
			document.head.appendChild(style);
		}

		this.refreshStatus();
	}
