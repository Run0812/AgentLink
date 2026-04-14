/* ────────────────────────────────────────────────────────────────────────
 * ToolExecutor — execute tool calls requested by agents.
 *
 * Phase 2 implementation: handles file operations, terminal commands, etc.
 * All write operations require user confirmation (unless auto-confirm enabled).
 * ──────────────────────────────────────────────────────────────────────── */

import type { TFile } from 'obsidian';

// Simple normalizePath implementation for when obsidian is not available
function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');
}
import { ToolCall, ToolResult, ToolType, TOOL_METADATA } from '../core/types';
import { logger } from '../core/logger';
import type { VaultHost } from '../host/obsidian/vault-host';
import type { TerminalHost } from '../host/terminal/node-terminal-host';

export interface ToolExecutorConfig {
	/** Vault root as workspace */
	workspaceRoot: string;
	/** Auto-confirm read-only operations */
	autoConfirmRead: boolean;
	/** Auto-confirm file edits (DANGEROUS) */
	autoConfirmEdit: boolean;
	/** Terminal shell selection (auto picks sensible platform defaults). */
	terminalShell: 'auto' | 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'zsh' | 'sh' | 'custom';
	/** Custom shell executable/path when terminalShell is custom. */
	terminalShellCustomPath: string;
}

interface TerminalShellRuntime {
	executable: string;
	argsPrefix: string[];
	label: string;
}

/**
 * ToolExecutor handles the execution of agent-requested tool calls.
 *
 * Responsibilities:
 *   - Validate tool calls
 *   - Check permissions (readonly vs write vs dangerous)
 *   - Execute tools against the Obsidian vault
 *   - Return structured results
 */
export class ToolExecutor {
	private config: ToolExecutorConfig;

	constructor(
		private readonly vaultHost: VaultHost,
		private readonly terminalHost: TerminalHost,
		config: ToolExecutorConfig,
	) {
		this.config = config;
	}

	updateConfig(config: Partial<ToolExecutorConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Check if a tool call can be auto-confirmed based on settings.
	 */
	canAutoConfirm(tool: ToolType): boolean {
		const meta = TOOL_METADATA[tool];
		if (!meta) return false;

		switch (meta.permission) {
			case 'readonly':
				return this.config.autoConfirmRead;
			case 'write':
			case 'dangerous':
				return this.config.autoConfirmEdit;
			default:
				return false;
		}
	}

	/**
	 * Execute a tool call and return the result.
	 * Phase 2 TODO: implement full functionality
	 */
	async execute(call: ToolCall): Promise<ToolResult> {
		logger.debug('ToolExecutor: executing', call.tool, call.params);

		const { tool, params } = call;

		try {
			switch (tool as ToolType) {
				case 'read_file':
					return await this.executeReadFile(params);
				case 'list_dir':
					return await this.executeListDir(params);
				case 'search':
					return await this.executeSearch(params);
				case 'write_file':
					return await this.executeWriteFile(params);
				case 'edit_file':
					return await this.executeEditFile(params);
				case 'terminal':
					return await this.executeTerminal(params);
				default:
					return {
						success: false,
						content: `Unknown tool: ${tool}`,
						metadata: { availableTools: Object.keys(TOOL_METADATA) },
					};
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('ToolExecutor: execution failed', tool, message);
			return {
				success: false,
				content: `Execution failed: ${message}`,
				metadata: { error: message },
			};
		}
	}

	// ── Read-only Tools ──────────────────────────────────────────────────

	private async executeReadFile(params: Record<string, unknown>): Promise<ToolResult> {
		const path = params.path as string;
		if (!path) {
			return { success: false, content: 'Missing required parameter: path' };
		}

		const normalizedPath = normalizePath(path);
		const file = this.vaultHost.getAbstractFileByPath(normalizedPath);

		if (!file) {
			return { success: false, content: `File not found: ${path}` };
		}

		// Check if it's a file by checking for extension (TFile has extension property)
		if (!('extension' in file)) {
			return { success: false, content: `Path is not a file: ${path}` };
		}

		const content = await this.vaultHost.read(file as TFile);
		return {
			success: true,
			content,
			metadata: { path: normalizedPath, size: content.length },
		};
	}

	private async executeListDir(params: Record<string, unknown>): Promise<ToolResult> {
		const path = (params.path as string) || '.';
		const normalizedPath = normalizePath(path);
		const folder = this.vaultHost.getAbstractFileByPath(normalizedPath);

		if (!folder) {
			return { success: false, content: `Directory not found: ${path}` };
		}

		// Check if it's a folder by checking for children (TFolder has children property)
		const folderWithChildren = folder as unknown as { children?: Array<{ name: string; extension?: string }> };
		if (!folderWithChildren.children) {
			return { success: false, content: `Path is not a directory: ${path}` };
		}

		const entries = folderWithChildren.children.map(child => ({
			name: child.name,
			type: child.extension !== undefined ? 'file' : 'directory',
		}));

		return {
			success: true,
			content: JSON.stringify({ path: normalizedPath, entries }, null, 2),
			metadata: { path: normalizedPath, count: entries.length },
		};
	}

	private async executeSearch(params: Record<string, unknown>): Promise<ToolResult> {
		const query = params.query as string;
		if (!query) {
			return { success: false, content: 'Missing required parameter: query' };
		}

		// TODO: Implement full-text search across vault
		// For now, return a mock result
		return {
			success: true,
			content: JSON.stringify([
				{ path: 'example.md', line: 1, content: `Found match for "${query}"` },
			]),
			metadata: { query, results: 1 },
		};
	}

	// ── Write Tools ──────────────────────────────────────────────────────

	private async executeWriteFile(params: Record<string, unknown>): Promise<ToolResult> {
		const path = params.path as string;
		const content = params.content as string;

		if (!path) {
			return { success: false, content: 'Missing required parameter: path' };
		}

		const normalizedPath = normalizePath(path);

		// Check if file exists
		const existing = this.vaultHost.getAbstractFileByPath(normalizedPath);
		if (existing) {
			return {
				success: false,
				content: `File already exists: ${path}. Use edit_file to modify.`,
			};
		}

		// Create the file
		await this.vaultHost.create(normalizedPath, content || '');

		return {
			success: true,
			content: `File created: ${normalizedPath}`,
			metadata: { path: normalizedPath, size: (content || '').length },
		};
	}

	private async executeEditFile(params: Record<string, unknown>): Promise<ToolResult> {
		const path = params.path as string;
		const oldString = params.oldString as string | undefined;
		const newString = params.newString as string | undefined;
		const content = params.content as string | undefined;

		if (!path) {
			return { success: false, content: 'Missing required parameter: path' };
		}

		const normalizedPath = normalizePath(path);
		const file = this.vaultHost.getAbstractFileByPath(normalizedPath);

		if (!file) {
			return { success: false, content: `File not found: ${path}` };
		}

		if (!('extension' in file)) {
			return { success: false, content: `Path is not a file: ${path}` };
		}

		try {
			const currentContent = await this.vaultHost.read(file as TFile);

			// Method 1: Search and replace (preferred for precise edits)
			if (oldString !== undefined && newString !== undefined) {
				if (!currentContent.includes(oldString)) {
					return {
						success: false,
						content: `Could not find the text to replace in ${path}. The file may have changed.`,
						metadata: { path: normalizedPath },
					};
				}

				const updatedContent = currentContent.replace(oldString, newString);
				await this.vaultHost.modify(file as TFile, updatedContent);

				return {
					success: true,
					content: `File edited successfully: ${normalizedPath}`,
					metadata: { 
						path: normalizedPath, 
						method: 'search_replace',
						oldLength: oldString.length,
						newLength: newString.length,
					},
				};
			}

			// Method 2: Full content replacement (if content parameter provided)
			if (content !== undefined) {
				await this.vaultHost.modify(file as TFile, content);
				return {
					success: true,
					content: `File updated successfully: ${normalizedPath}`,
					metadata: { 
						path: normalizedPath, 
						method: 'full_replace',
						size: content.length,
					},
				};
			}

			return {
				success: false,
				content: 'Missing edit parameters. Provide either (oldString + newString) or content.',
				metadata: { path: normalizedPath },
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				content: `Failed to edit file: ${message}`,
				metadata: { path: normalizedPath, error: message },
			};
		}
	}

	// ── Dangerous Tools ──────────────────────────────────────────────────

	private async executeTerminal(params: Record<string, unknown>): Promise<ToolResult> {
		const command = params.command as string;
		const cwd = params.cwd as string | undefined;
		const timeout = params.timeout as number | undefined;

		if (!command) {
			return { success: false, content: 'Missing required parameter: command' };
		}

		// Security: Only allow specific safe commands
		// This is a basic implementation - in production, you might want more sophisticated filtering
		const dangerousCommands = ['rm -rf /', 'rm -rf /*', 'mkfs', 'dd if=/dev/zero', '>:', '>/'];
		const lowerCmd = command.toLowerCase();
		for (const dangerous of dangerousCommands) {
			if (lowerCmd.includes(dangerous)) {
				return {
					success: false,
					content: `Command rejected for security reasons: contains dangerous pattern "${dangerous}"`,
					metadata: { command },
				};
			}
		}

		const workingDir = cwd || this.config.workspaceRoot;
		const timeoutMs = timeout || 30000; // Default 30s timeout
		const shellCandidates = this.resolveTerminalShellCandidates();

		return this.runCommandWithShellFallback({
			command,
			workingDir,
			timeoutMs,
			shellCandidates,
		});
	}

	private async runCommandWithShellFallback(input: {
		command: string;
		workingDir: string;
		timeoutMs: number;
		shellCandidates: TerminalShellRuntime[];
	}): Promise<ToolResult> {
		const { command, workingDir, timeoutMs, shellCandidates } = input;
		let attempt = 0;
		let lastSpawnError: string | null = null;

		for (const shell of shellCandidates) {
			attempt++;
			const result = await this.runTerminalCommandAttempt({
				command,
				workingDir,
				timeoutMs,
				shell,
			});

			const errorCode = result.metadata?.errorCode;
			if (result.success || errorCode !== 'ENOENT') {
				return {
					...result,
					metadata: {
						...result.metadata,
						shell: shell.label,
						shellExecutable: shell.executable,
						attempt,
					},
				};
			}

			const metadataError = typeof result.metadata?.error === 'string'
				? result.metadata.error
				: result.content;
			lastSpawnError = metadataError;
		}

		return {
			success: false,
			content: `Failed to execute command: no available shell candidate (${lastSpawnError ?? 'unknown error'})`,
			metadata: {
				command,
				error: lastSpawnError ?? 'No shell candidate available',
				attempts: shellCandidates.map((candidate) => candidate.label),
			},
		};
	}

	private async runTerminalCommandAttempt(input: {
		command: string;
		workingDir: string;
		timeoutMs: number;
		shell: TerminalShellRuntime;
	}): Promise<ToolResult> {
		const { command, workingDir, timeoutMs, shell } = input;

		const result = await this.terminalHost.execute(
			shell.executable,
			[...shell.argsPrefix, command],
			{ cwd: workingDir, timeout: timeoutMs },
		);

		return {
			success: result.success,
			content: result.content,
			metadata: {
				command,
				...result.metadata,
			},
		};
	}

	private resolveTerminalShellCandidates(): TerminalShellRuntime[] {
		const mode = this.config.terminalShell;
		if (mode === 'custom') {
			const customPath = this.config.terminalShellCustomPath.trim();
			if (!customPath) {
				return this.getAutoShellCandidates();
			}
			return [this.resolveShellRuntime(customPath)];
		}

		if (mode !== 'auto') {
			return [this.resolveShellRuntime(mode)];
		}

		return this.getAutoShellCandidates();
	}

	private getAutoShellCandidates(): TerminalShellRuntime[] {
		const candidates: string[] = [];
		if (process.platform === 'win32') {
			candidates.push('pwsh', 'powershell');
			if (process.env.ComSpec && process.env.ComSpec.trim()) {
				candidates.push(process.env.ComSpec.trim());
			}
			candidates.push('cmd');
		} else {
			if (process.env.SHELL && process.env.SHELL.trim()) {
				candidates.push(process.env.SHELL.trim());
			}
			candidates.push('bash', 'zsh', 'sh');
		}

		const seen = new Set<string>();
		const runtimes: TerminalShellRuntime[] = [];
		for (const candidate of candidates) {
			const key = candidate.toLowerCase();
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			runtimes.push(this.resolveShellRuntime(candidate));
		}

		return runtimes;
	}

	private resolveShellRuntime(shellNameOrPath: string): TerminalShellRuntime {
		const normalized = shellNameOrPath.trim();
		const lower = normalized.toLowerCase();
		const executableName = lower.replace(/^.*[\\/]/, '');

		if (executableName === 'cmd' || executableName === 'cmd.exe') {
			return {
				executable: normalized,
				argsPrefix: ['/d', '/s', '/c'],
				label: 'cmd',
			};
		}

		if (
			executableName === 'pwsh'
			|| executableName === 'pwsh.exe'
			|| executableName === 'powershell'
			|| executableName === 'powershell.exe'
		) {
			return {
				executable: normalized,
				argsPrefix: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'],
				label: executableName.includes('pwsh') ? 'pwsh' : 'powershell',
			};
		}

		return {
			executable: normalized,
			argsPrefix: ['-lc'],
			label: executableName || normalized,
		};
	}
}
