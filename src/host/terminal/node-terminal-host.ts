import { spawn } from 'child_process';

export interface TerminalHostResult {
	success: boolean;
	content: string;
	metadata?: Record<string, unknown>;
}

export interface TerminalHost {
	execute(
		executable: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<TerminalHostResult>;
}

export class NodeTerminalHost implements TerminalHost {
	execute(
		executable: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<TerminalHostResult> {
		return new Promise((resolve) => {
			const child = spawn(executable, args, {
				cwd: options?.cwd,
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true,
			});

			let stdout = '';
			let stderr = '';
			let finished = false;

			const finalize = (result: TerminalHostResult): void => {
				if (finished) {
					return;
				}
				finished = true;
				resolve(result);
			};

			const timer = options?.timeout
				? setTimeout(() => {
					try {
						child.kill();
					} catch {
						// ignore
					}
					finalize({
						success: false,
						content: `Command timed out after ${options.timeout}ms`,
						metadata: { timedOut: true },
					});
				}, options.timeout)
				: null;

			child.stdout?.on('data', (data: Buffer | string) => {
				stdout += data.toString();
			});

			child.stderr?.on('data', (data: Buffer | string) => {
				stderr += data.toString();
			});

			child.on('error', (error) => {
				if (timer) {
					clearTimeout(timer);
				}
				finalize({
					success: false,
					content: `Failed to start command: ${error.message}`,
					metadata: { error: error.message },
				});
			});

			child.on('close', (code) => {
				if (timer) {
					clearTimeout(timer);
				}
				const content = stdout || stderr || `Command exited with code ${code ?? 'unknown'}`;
				finalize({
					success: code === 0,
					content,
					metadata: {
						exitCode: code,
						stderr: stderr || undefined,
					},
				});
			});
		});
	}
}
