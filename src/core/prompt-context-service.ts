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

		// Do not implicitly attach active file content.
		// Context file inclusion must come from explicit @ attachments only.
		return {};
	}
}
