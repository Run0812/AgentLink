/* ────────────────────────────────────────────────────────────────────────
 * Custom error types for AgentLink
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Base error class for all AgentLink errors.
 * Subclass this for specific categories.
 */
export class AgentLinkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AgentLinkError';
	}
}

/** Thrown when an adapter fails to connect. */
export class ConnectionError extends AgentLinkError {
	constructor(message: string) {
		super(message);
		this.name = 'ConnectionError';
	}
}

/** Thrown when the configured command / binary is not found. */
export class CommandNotFoundError extends AgentLinkError {
	constructor(command: string) {
		super(`Command not found: "${command}". Check the binary path in settings.`);
		this.name = 'CommandNotFoundError';
	}
}

/** Thrown when a request times out. */
export class TimeoutError extends AgentLinkError {
	constructor(ms: number) {
		super(`Request timed out after ${ms} ms.`);
		this.name = 'TimeoutError';
	}
}

/** Thrown when the user cancels a running request. */
export class CancellationError extends AgentLinkError {
	constructor() {
		super('Request was cancelled by the user.');
		this.name = 'CancellationError';
	}
}

/** Thrown when an HTTP response indicates an error. */
export class HttpError extends AgentLinkError {
	public readonly statusCode: number;

	constructor(statusCode: number, message: string) {
		super(`HTTP ${statusCode}: ${message}`);
		this.name = 'HttpError';
		this.statusCode = statusCode;
	}
}

/** Thrown when the spawned process exits with a non-zero code. */
export class ProcessExitError extends AgentLinkError {
	public readonly exitCode: number | null;

	constructor(exitCode: number | null, stderr: string) {
		super(`Process exited with code ${exitCode}${stderr ? ': ' + stderr : ''}`);
		this.name = 'ProcessExitError';
		this.exitCode = exitCode;
	}
}
