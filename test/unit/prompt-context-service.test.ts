import { describe, expect, it } from 'vitest';
import { PromptContextService } from '../../src/core/prompt-context-service';
import type { VaultHost } from '../../src/host/obsidian/vault-host';
import type { WorkspaceHost } from '../../src/host/obsidian/workspace-host';

describe('PromptContextService', () => {
	it('prefers editor selection over file content', async () => {
		const workspaceHost: WorkspaceHost = {
			getActiveFile: () => ({ path: 'note.md' } as never),
			getActiveEditor: () => null,
			getSelectedText: () => 'selected',
		};
		const vaultHost: VaultHost = {
			getAbstractFileByPath: () => null,
			read: () => Promise.resolve('file body'),
			create: () => Promise.resolve({} as never),
			modify: () => Promise.resolve(),
			createFolder: () => Promise.resolve(),
			getFiles: () => [],
			getAllLoadedFiles: () => [],
		};

		const service = new PromptContextService(workspaceHost, vaultHost);
		await expect(service.capture()).resolves.toEqual({ selectedText: 'selected' });
	});

	it('falls back to the active file content', async () => {
		const file = { path: 'note.md' } as never;
		const workspaceHost: WorkspaceHost = {
			getActiveFile: () => file,
			getActiveEditor: () => null,
			getSelectedText: () => '',
		};
		const vaultHost: VaultHost = {
			getAbstractFileByPath: () => null,
			read: async (target) => (target === file ? '# note' : ''),
			create: () => Promise.resolve({} as never),
			modify: () => Promise.resolve(),
			createFolder: () => Promise.resolve(),
			getFiles: () => [],
			getAllLoadedFiles: () => [],
		};

		const service = new PromptContextService(workspaceHost, vaultHost);
		await expect(service.capture()).resolves.toEqual({ fileContent: '# note' });
	});
});
