import { spawn, ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { ProcessManager } from '../../services/process-manager';

export class AcpTransport {
	private processManager = new ProcessManager();
	private bridgeProcess: ChildProcess | null = null;

	async start(
		command: string,
		args: string[] | undefined,
		handlers: {
			onStderr?: (line: string) => void;
			onError?: (error: Error) => void;
			onExit?: (code: number | null) => void;
		},
	): Promise<ChildProcess> {
		if (!command) {
			throw new Error('Command is required');
		}

		return new Promise((resolve, reject) => {
			try {
				const process = spawn(command, args || [], {
					stdio: ['pipe', 'pipe', 'pipe'],
				});
				this.bridgeProcess = process;
				this.processManager.track(process);

				process.stderr?.on('data', (data: Buffer) => {
					handlers.onStderr?.(data.toString());
				});

				process.on('error', (error) => {
					handlers.onError?.(error);
					reject(new Error(`Failed to start bridge process: ${error.message}`));
				});

				process.on('exit', (code) => {
					handlers.onExit?.(code);
				});

				setTimeout(() => {
					if (this.bridgeProcess) {
						resolve(this.bridgeProcess);
					}
				}, 1000);
			} catch (error) {
				reject(error);
			}
		});
	}

	createConnection(process: ChildProcess, createClient: () => acp.Client, onAbort: () => void): acp.ClientSideConnection {
		if (!process.stdin || !process.stdout) {
			throw new Error('Bridge process not properly started');
		}

		const input = Writable.toWeb(process.stdin) as WritableStream<Uint8Array>;
		const output = Readable.toWeb(process.stdout) as ReadableStream<Uint8Array>;
		const stream = acp.ndJsonStream(input, output);
		const connection = new acp.ClientSideConnection(createClient, stream);
		connection.signal.addEventListener('abort', onAbort);
		return connection;
	}

	getBridgeProcess(): ChildProcess | null {
		return this.bridgeProcess;
	}

	cleanup(): void {
		this.processManager.killAll();
		this.bridgeProcess = null;
	}
}
