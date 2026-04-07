/* ────────────────────────────────────────────────────────────────────────
 * ProcessManager — helper for managing child processes safely.
 *
 * Used by CliAdapter but kept separate so it can be unit-tested and
 * reused by future adapters (e.g. AcpBridgeAdapter).
 * ──────────────────────────────────────────────────────────────────────── */

import { ChildProcess } from 'child_process';
import { logger } from '../core/logger';

export class ProcessManager {
	private processes: Map<number, ChildProcess> = new Map();

	/** Track a spawned process so it can be cleaned up later. */
	track(child: ChildProcess): void {
		if (child.pid !== undefined) {
			this.processes.set(child.pid, child);
			child.on('exit', () => {
				if (child.pid !== undefined) {
					this.processes.delete(child.pid);
				}
			});
		}
	}

	/** Kill a specific process by PID. Sends SIGTERM first, then SIGKILL after 2 s grace period. */
	kill(pid: number): void {
		const child = this.processes.get(pid);
		if (child && !child.killed) {
			logger.debug('ProcessManager: killing PID', pid);
			child.kill('SIGTERM');
			// Allow 2 seconds for graceful shutdown before force-killing
			setTimeout(() => {
				try {
					process.kill(pid, 0);
					process.kill(pid, 'SIGKILL');
				} catch {
					// already dead
				}
			}, 2000);
		}
		this.processes.delete(pid);
	}

	/** Kill all tracked processes. */
	killAll(): void {
		for (const [pid] of this.processes) {
			this.kill(pid);
		}
	}

	/** Return the number of tracked (presumably alive) processes. */
	get count(): number {
		return this.processes.size;
	}
}
