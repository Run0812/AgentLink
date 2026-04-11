import { resolve, relative, isAbsolute } from 'node:path';
import type { App } from 'obsidian';

function normalizeRelativePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
}

function stripWindowsAbsolutePrefix(path: string): string {
	return path.replace(/^\/([A-Za-z]:[\\/])/, '$1');
}

function hasTraversal(path: string): boolean {
	return normalizeRelativePath(path)
		.split('/')
		.some((segment) => segment === '..');
}

export function getVaultBasePath(app?: App): string | null {
	const adapter = app?.vault.adapter as { getBasePath?: () => string } | undefined;
	if (adapter && typeof adapter.getBasePath === 'function') {
		const basePath = adapter.getBasePath();
		if (basePath) {
			return basePath;
		}
	}

	return null;
}

export function resolveVaultRelativePath(app: App | undefined, inputPath: string): string {
	const trimmedPath = inputPath.trim();
	if (!trimmedPath) {
		throw new Error('Path is required');
	}

	const vaultBasePath = getVaultBasePath(app);
	const normalizedInput = stripWindowsAbsolutePrefix(trimmedPath);

	if (!vaultBasePath) {
		const relativePath = normalizeRelativePath(normalizedInput);
		if (!relativePath || hasTraversal(relativePath)) {
			throw new Error(`Path is outside the current vault: ${inputPath}`);
		}
		return relativePath;
	}

	const absolutePath = isAbsolute(normalizedInput)
		? resolve(normalizedInput)
		: resolve(vaultBasePath, normalizedInput);
	const relativePath = relative(resolve(vaultBasePath), absolutePath);

	if (!relativePath || relativePath === '.' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
		throw new Error(`Path is outside the current vault: ${inputPath}`);
	}

	return normalizeRelativePath(relativePath);
}

export async function ensureVaultParentFolders(app: App, vaultPath: string): Promise<void> {
	const segments = normalizeRelativePath(vaultPath).split('/');
	if (segments.length <= 1) {
		return;
	}

	let currentPath = '';
	for (const segment of segments.slice(0, -1)) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		const existing = app.vault.getAbstractFileByPath(currentPath) as { children?: unknown[] } | null;
		if (existing) {
			if (!('children' in existing)) {
				throw new Error(`Path segment is not a folder: ${currentPath}`);
			}
			continue;
		}

		await app.vault.createFolder(currentPath);
	}
}

export function sliceFileContent(content: string, line?: number, limit?: number): string {
	if (!line && !limit) {
		return content;
	}

	const lines = content.split(/\r?\n/);
	const start = Math.max((line ?? 1) - 1, 0);
	const end = limit ? start + Math.max(limit, 0) : undefined;
	return lines.slice(start, end).join('\n');
}
