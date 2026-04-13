import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ensureVaultParentFolders, resolveVaultRelativePath, sliceFileContent } from '../../src/services/vault-paths';

function createMockApp(basePath?: string) {
	const entries = new Map<string, { children?: unknown[] }>();
	const createFolder = vi.fn(async (path: string) => {
		entries.set(path, { children: [] });
	});

	const app = {
		vault: {
			adapter: {
				getBasePath: () => basePath,
			},
			getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
			createFolder,
		},
	};

	return { app: app as never, createFolder, entries };
}

describe('vault-paths', () => {
	it('maps absolute ACP paths inside the vault to vault-relative paths', () => {
		const vaultBasePath = resolve(tmpdir(), 'agentlink-test-vault');
		const absoluteFilePath = resolve(vaultBasePath, 'notes', 'review.md');
		const slashAbsoluteFilePath = absoluteFilePath.replace(/\\/g, '/');
		const { app } = createMockApp(vaultBasePath);

		expect(resolveVaultRelativePath(app, absoluteFilePath)).toBe('notes/review.md');
		expect(resolveVaultRelativePath(app, slashAbsoluteFilePath)).toBe('notes/review.md');
		expect(resolveVaultRelativePath(app, 'notes/review.md')).toBe('notes/review.md');
	});

	it('rejects paths outside the current vault', () => {
		const vaultBasePath = resolve(tmpdir(), 'agentlink-test-vault');
		const outsideFilePath = resolve(tmpdir(), 'agentlink-test-other-vault', 'review.md');
		const { app } = createMockApp(vaultBasePath);

		expect(() => resolveVaultRelativePath(app, outsideFilePath)).toThrow('outside the current vault');
		expect(() => resolveVaultRelativePath(app, '../review.md')).toThrow('outside the current vault');
	});

	it('creates missing parent folders before a write', async () => {
		const vaultBasePath = resolve(tmpdir(), 'agentlink-test-vault');
		const { app, createFolder, entries } = createMockApp(vaultBasePath);
		entries.set('notes', { children: [] });

		await ensureVaultParentFolders(app, 'notes/reviews/review.md');

		expect(createFolder).toHaveBeenCalledTimes(1);
		expect(createFolder).toHaveBeenCalledWith('notes/reviews');
	});

	it('slices file content by line and limit', () => {
		const content = 'line1\nline2\nline3\nline4';

		expect(sliceFileContent(content, 2, 2)).toBe('line2\nline3');
		expect(sliceFileContent(content, 3)).toBe('line3\nline4');
		expect(sliceFileContent(content)).toBe(content);
	});
});
