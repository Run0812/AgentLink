import { pathToFileURL } from 'node:url';
import type { App } from 'obsidian';

const WINDOWS_ABSOLUTE_PATTERN = /^[A-Za-z]:\//;

function normalizeSlashes(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function normalizeRelativePath(path: string): string {
	return normalizeSlashes(path)
		.replace(/^\/+/, '')
		.split('/')
		.filter((segment) => segment.length > 0 && segment !== '.')
		.join('/');
}

function stripWindowsAbsolutePrefix(path: string): string {
	return path.replace(/^\/([A-Za-z]:[\\/])/, '$1');
}

function normalizeAbsolutePath(path: string): string {
	const normalized = normalizeSlashes(stripWindowsAbsolutePrefix(path.trim()));
	if (!normalized) {
		return normalized;
	}

	if (normalized === '/' || /^[A-Za-z]:\/$/.test(normalized)) {
		return normalized;
	}

	return normalized.replace(/\/+$/, '');
}

function isAbsolutePath(path: string): boolean {
	const normalized = normalizeAbsolutePath(path);
	return normalized.startsWith('/') || WINDOWS_ABSOLUTE_PATTERN.test(normalized);
}

function isWindowsAbsolutePath(path: string): boolean {
	return WINDOWS_ABSOLUTE_PATTERN.test(normalizeAbsolutePath(path));
}

function toComparableAbsolutePath(path: string): string {
	const normalized = normalizeAbsolutePath(path);
	return isWindowsAbsolutePath(normalized) ? normalized.toLowerCase() : normalized;
}

function hasTraversal(path: string): boolean {
	return normalizeRelativePath(path)
		.split('/')
		.some((segment) => segment === '..');
}

function getVaultRelativePathFromAbsolute(vaultBasePath: string, absolutePath: string): string | null {
	const normalizedBase = normalizeAbsolutePath(vaultBasePath);
	const normalizedAbsolute = normalizeAbsolutePath(absolutePath);

	if (!normalizedBase || !normalizedAbsolute || !isAbsolutePath(normalizedBase) || !isAbsolutePath(normalizedAbsolute)) {
		return null;
	}

	const comparableBase = toComparableAbsolutePath(normalizedBase);
	const comparableAbsolute = toComparableAbsolutePath(normalizedAbsolute);

	if (comparableAbsolute === comparableBase || !comparableAbsolute.startsWith(`${comparableBase}/`)) {
		return null;
	}

	const relativePath = normalizeRelativePath(normalizedAbsolute.slice(normalizedBase.length + 1));
	if (!relativePath || hasTraversal(relativePath)) {
		return null;
	}

	return relativePath;
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
	const normalizedInput = normalizeAbsolutePath(trimmedPath);

	if (!vaultBasePath) {
		const relativePath = normalizeRelativePath(normalizedInput);
		if (isAbsolutePath(normalizedInput) || !relativePath || hasTraversal(relativePath)) {
			throw new Error(`Path is outside the current vault: ${inputPath}`);
		}
		return relativePath;
	}

	if (isAbsolutePath(normalizedInput)) {
		const relativePath = getVaultRelativePathFromAbsolute(vaultBasePath, normalizedInput);
		if (!relativePath) {
			throw new Error(`Path is outside the current vault: ${inputPath}`);
		}
		return relativePath;
	}

	const relativePath = normalizeRelativePath(normalizedInput);
	if (!relativePath || hasTraversal(relativePath)) {
		throw new Error(`Path is outside the current vault: ${inputPath}`);
	}
	return relativePath;
}

export function buildWorkspaceFileUri(basePath: string, relativePath: string): string {
	const normalizedBasePath = normalizeAbsolutePath(basePath);
	const normalizedRelativePath = normalizeRelativePath(relativePath);

	if (!normalizedBasePath || !isAbsolutePath(normalizedBasePath)) {
		throw new Error(`Workspace base path is not absolute: ${basePath}`);
	}

	if (!normalizedRelativePath || hasTraversal(normalizedRelativePath)) {
		throw new Error(`Workspace relative path is invalid: ${relativePath}`);
	}

	const separator = normalizedBasePath.endsWith('/') ? '' : '/';
	const absolutePath = `${normalizedBasePath}${separator}${normalizedRelativePath}`;
	if (isWindowsAbsolutePath(absolutePath)) {
		const [drive, ...segments] = absolutePath.split('/');
		const encodedSegments = segments
			.filter((segment) => segment.length > 0)
			.map((segment) => encodeURIComponent(segment))
			.join('/');
		return encodedSegments ? `file:///${drive}/${encodedSegments}` : `file:///${drive}`;
	}

	return pathToFileURL(absolutePath).toString();
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
