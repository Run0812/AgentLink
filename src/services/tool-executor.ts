/* ────────────────────────────────────────────────────────────────────────
 * ToolExecutor — execute tool calls requested by agents.
 *
 * Phase 2 implementation: handles file operations, terminal commands, etc.
 * All write operations require user confirmation (unless auto-confirm enabled).
 * ──────────────────────────────────────────────────────────────────────── */

// Note: Obsidian types are imported for type checking only.
// The actual implementation uses the App interface from obsidian.
import type { App, TFile, TFolder } from 'obsidian';
import { spawn } from 'child_process';

// Simple normalizePath implementation for when obsidian is not available
function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');
}
import { ToolCall, ToolResult, ToolType, TOOL_METADATA } from '../core/types';
import { logger } from '../core/logger';

export interface ToolExecutorConfig {
	/** Vault root as workspace */
	workspaceRoot: string;
	/** Auto-confirm read-only operations */
	autoConfirmRead: boolean;
	/** Auto-confirm file edits (DANGEROUS) */
	autoConfirmEdit: boolean;
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
	private app: App;
	private config: ToolExecutorConfig;

	constructor(app: App, config: ToolExecutorConfig) {
		this.app = app;
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
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (!file) {
			return { success: false, content: `File not found: ${path}` };
		}

		// Check if it's a file by checking for extension (TFile has extension property)
		if (!('extension' in file)) {
			return { success: false, content: `Path is not a file: ${path}` };
		}

		const content = await this.app.vault.read(file as TFile);
		return {
			success: true,
			content,
			metadata: { path: normalizedPath, size: content.length },
		};
	}

	private async executeListDir(params: Record<string, unknown>): Promise<ToolResult> {
		const path = (params.path as string) || '.';
		const normalizedPath = normalizePath(path);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

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
		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (existing) {
			return {
				success: false,
				content: `File already exists: ${path}. Use edit_file to modify.`,
			};
		}

		// Create the file
		await this.app.vault.create(normalizedPath, content || '');

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
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (!file) {
			return { success: false, content: `File not found: ${path}` };
		}

		if (!('extension' in file)) {
			return { success: false, content: `Path is not a file: ${path}` };
		}

		try {
			const currentContent = await this.app.vault.read(file as TFile);

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
				await this.app.vault.modify(file as TFile, updatedContent);

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
				await this.app.vault.modify(file as TFile, content);
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

		return new Promise((resolve) => {
			const child = spawn(command, {
				cwd: workingDir,
				env: process.env,
				shell: process.platform === 'win32'
					? (process.env.ComSpec || 'cmd.exe')
					: (process.env.SHELL || '/bin/sh'),
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';
			let killed = false;

			// Set timeout
			const timeoutId = setTimeout(() => {
				killed = true;
				child.kill('SIGTERM');
				resolve({
					success: false,
					content: `Command timed out after ${timeoutMs}ms`,
					metadata: { command, timeout: timeoutMs, stdout, stderr },
				});
			}, timeoutMs);

			child.stdout?.on('data', (data: Buffer) => {
				stdout += data.toString();
			});

			child.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			child.on('close', (code) => {
				clearTimeout(timeoutId);
				if (killed) return;

				const output = stdout + (stderr ? `\n[stderr]:\n${stderr}` : '');
				resolve({
					success: code === 0,
					content: output || '(no output)',
					metadata: { 
						command, 
						exitCode: code, 
						stdout: stdout.slice(0, 10000), // Limit size
						stderr: stderr.slice(0, 10000),
					},
				});
			});

			child.on('error', (error) => {
				clearTimeout(timeoutId);
				if (killed) return;

				resolve({
					success: false,
					content: `Failed to execute command: ${error.message}`,
					metadata: { command, error: error.message },
				});
			});
		});
	}
}
