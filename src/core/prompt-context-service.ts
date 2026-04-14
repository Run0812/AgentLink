import type { VaultHost } from '../host/obsidian/vault-host';
import type { WorkspaceHost } from '../host/obsidian/workspace-host';

export interface PromptContext {
	fileContent?: string;
	selectedText?: string;
}

export class PromptContextService {
	constructor(
		private readonly workspaceHost: WorkspaceHost,
		private readonly vaultHost: VaultHost,
	) {}

	async capture(): Promise<PromptContext> {
		const selectedText = this.workspaceHost.getSelectedText().trim();
		if (selectedText) {
			return { selectedText };
		}

		const activeFile = this.workspaceHost.getActiveFile();
		if (!activeFile) {
			return {};
		}

		try {
			const fileContent = await this.vaultHost.read(activeFile);
			return fileContent ? { fileContent } : {};
		} catch {
			return {};
		}
	}
}
