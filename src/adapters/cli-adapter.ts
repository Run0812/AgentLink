/* ────────────────────────────────────────────────────────────────────────
 * CliAdapter — run a local CLI agent as a child process.
 *
 * Spawns the configured command with `child_process.spawn`, streams
 * stdout chunk-by-chunk to the UI, and captures stderr as errors.
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn, ChildProcess } from 'child_process';
import { AgentAdapter, AgentInput, AgentStatus, AgentStatusState, StreamHandlers } from '../core/types';
import { CancellationError, CommandNotFoundError, ProcessExitError, TimeoutError } from '../core/errors';
import { logger } from '../core/logger';
import { ProcessManager } from '../services/process-manager';

export interface CliAdapterConfig {
	command: string;
	args: string[];
	cwd: string;
	env: Record<string, string>;
	timeoutMs: number;
}

export class CliAdapter implements AgentAdapter {
	readonly id = 'cli';
	readonly label = 'Local CLI Agent';

	private config: CliAdapterConfig;
	private state: AgentStatusState = 'disconnected';
	private child: ChildProcess | null = null;
	private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
	private processManager = new ProcessManager();

	constructor(config: CliAdapterConfig) {
		this.config = config;
	}

	updateConfig(config: CliAdapterConfig): void {
		this.config = config;
	}

	async connect(): Promise<void> {
		this.state = 'connected';
		logger.info('CliAdapter: ready (process will be spawned per message)');
	}

	async disconnect(): Promise<void> {
		await this.cancel();
		this.state = 'disconnected';
		logger.info('CliAdapter: disconnected');
	}

	async sendMessage(input: AgentInput, handlers: StreamHandlers): Promise<void> {
		if (this.state === 'disconnected') {
			await this.connect();
		}

		this.state = 'busy';
		logger.debug('CliAdapter: sendMessage', input.prompt);

		const { command, args, cwd, env, timeoutMs } = this.config;

		return new Promise<void>((resolve) => {
			let accumulated = '';
			let stderrBuf = '';
			let settled = false;

			const finish = (err?: Error) => {
				if (settled) return;
				settled = true;
				this.clearTimeout();
				this.child = null;
				this.state = 'connected';
				if (err) {
					handlers.onError(err);
				} else {
					handlers.onComplete(accumulated);
				}
				resolve();
			};

			try {
				// Spawn the child process. The prompt is written to stdin.
				this.child = spawn(command, [...args], {
					cwd: cwd || undefined,
					env: { ...process.env, ...env },
					stdio: ['pipe', 'pipe', 'pipe'],
				});
				this.processManager.track(this.child);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes('ENOENT')) {
					finish(new CommandNotFoundError(command));
				} else {
					finish(err instanceof Error ? err : new Error(msg));
				}
				return;
			}

			// Set up timeout
			if (timeoutMs > 0) {
				this.timeoutHandle = setTimeout(() => {
					logger.warn('CliAdapter: timeout reached, killing process');
					this.killChild();
					finish(new TimeoutError(timeoutMs));
				}, timeoutMs);
			}

			const child = this.child;

			child.stdout?.on('data', (data: Buffer) => {
				const chunk = data.toString('utf-8');
				accumulated += chunk;
				handlers.onChunk(chunk);
			});

			child.stderr?.on('data', (data: Buffer) => {
				stderrBuf += data.toString('utf-8');
				logger.debug('CliAdapter stderr:', stderrBuf);
			});

			child.on('error', (err: NodeJS.ErrnoException) => {
				if (err.code === 'ENOENT') {
					finish(new CommandNotFoundError(command));
				} else {
					finish(err);
				}
			});

			child.on('close', (code) => {
				if (code === 0 || code === null) {
					finish();
				} else {
					finish(new ProcessExitError(code, stderrBuf));
				}
			});

			// Write the prompt to stdin, then close stdin to signal EOF
			if (child.stdin) {
				child.stdin.write(input.prompt + '\n');
				child.stdin.end();
			}
		});
	}

	async cancel(): Promise<void> {
		logger.debug('CliAdapter: cancel requested');
		this.clearTimeout();
		this.killChild();
	}

	getStatus(): AgentStatus {
		return { state: this.state };
	}

	// ── Helpers ────────────────────────────────────────────────────────

	private killChild(): void {
		if (this.child?.pid !== undefined) {
			this.processManager.kill(this.child.pid);
		}
		this.child = null;
	}

	private clearTimeout(): void {
		if (this.timeoutHandle !== null) {
			clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}
	}
}
