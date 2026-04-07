/* ────────────────────────────────────────────────────────────────────────
 * Simple structured logger with a runtime debug toggle.
 * ──────────────────────────────────────────────────────────────────────── */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export class Logger {
	private debugEnabled: boolean;
	private prefix: string;

	constructor(prefix = 'AgentLink', debugEnabled = false) {
		this.prefix = prefix;
		this.debugEnabled = debugEnabled;
	}

	setDebug(enabled: boolean): void {
		this.debugEnabled = enabled;
	}

	isDebug(): boolean {
		return this.debugEnabled;
	}

	debug(...args: unknown[]): void {
		if (this.debugEnabled) {
			this.log('debug', ...args);
		}
	}

	info(...args: unknown[]): void {
		this.log('info', ...args);
	}

	warn(...args: unknown[]): void {
		this.log('warn', ...args);
	}

	error(...args: unknown[]): void {
		this.log('error', ...args);
	}

	private log(level: LogLevel, ...args: unknown[]): void {
		const ts = new Date().toISOString();
		const tag = `[${this.prefix}][${level.toUpperCase()}][${ts}]`;

		switch (level) {
			case 'debug':
				console.debug(tag, ...args);
				break;
			case 'info':
				console.info(tag, ...args);
				break;
			case 'warn':
				console.warn(tag, ...args);
				break;
			case 'error':
				console.error(tag, ...args);
				break;
		}
	}
}

/** Singleton logger instance used throughout the plugin. */
export const logger = new Logger();
