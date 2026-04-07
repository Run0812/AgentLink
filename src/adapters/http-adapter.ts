/* ────────────────────────────────────────────────────────────────────────
 * HttpAdapter — connect to a local HTTP AI agent (e.g. Ollama, LM Studio).
 *
 * Sends a POST to the configured baseURL and reads the response as a
 * text stream (SSE or chunked JSON).  Supports cancellation via
 * AbortController and configurable timeouts.
 * ──────────────────────────────────────────────────────────────────────── */

import { AgentAdapter, AgentInput, AgentStatus, AgentStatusState, StreamHandlers } from '../core/types';
import { CancellationError, ConnectionError, HttpError, TimeoutError } from '../core/errors';
import { logger } from '../core/logger';
import { parseSSEChunk } from '../services/stream-parser';

export interface HttpAdapterConfig {
	baseURL: string;
	apiKey: string;
	model: string;
	timeoutMs: number;
	headers: Record<string, string>;
}

export class HttpAdapter implements AgentAdapter {
	readonly id = 'http';
	readonly label = 'Local HTTP Agent';

	private config: HttpAdapterConfig;
	private state: AgentStatusState = 'disconnected';
	private abortController: AbortController | null = null;
	private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

	constructor(config: HttpAdapterConfig) {
		this.config = config;
	}

	updateConfig(config: HttpAdapterConfig): void {
		this.config = config;
	}

	async connect(): Promise<void> {
		this.state = 'connecting';
		logger.debug('HttpAdapter: checking connectivity…');

		try {
			// Quick GET probe to see if the server is reachable
			const probeController = new AbortController();
			const probeTimeout = setTimeout(() => probeController.abort(), 5000);
			const resp = await fetch(this.config.baseURL, {
				method: 'GET',
				signal: probeController.signal,
			});
			clearTimeout(probeTimeout);
			// Any non-5xx means the server is alive
			if (resp.status >= 500) {
				throw new ConnectionError(`Server returned ${resp.status}`);
			}
			this.state = 'connected';
			logger.info('HttpAdapter: connected to', this.config.baseURL);
		} catch (err) {
			this.state = 'error';
			if (err instanceof ConnectionError) throw err;
			throw new ConnectionError(
				`Cannot reach ${this.config.baseURL}: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	async disconnect(): Promise<void> {
		await this.cancel();
		this.state = 'disconnected';
		logger.info('HttpAdapter: disconnected');
	}

	async sendMessage(input: AgentInput, handlers: StreamHandlers): Promise<void> {
		if (this.state === 'disconnected' || this.state === 'error') {
			try {
				await this.connect();
			} catch (err) {
				handlers.onError(err instanceof Error ? err : new Error(String(err)));
				return;
			}
		}

		this.state = 'busy';
		this.abortController = new AbortController();

		// Build request body (OpenAI-compatible chat completions)
		const messages: Array<{ role: string; content: string }> = [];
		if (input.history) {
			for (const m of input.history) {
				if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
					messages.push({ role: m.role, content: m.content });
				}
			}
		}

		let userContent = input.prompt;
		if (input.context?.selectedText) {
			userContent = `Selected text:\n\`\`\`\n${input.context.selectedText}\n\`\`\`\n\n${input.prompt}`;
		} else if (input.context?.fileContent) {
			userContent = `File content:\n\`\`\`\n${input.context.fileContent}\n\`\`\`\n\n${input.prompt}`;
		}
		messages.push({ role: 'user', content: userContent });

		const body: Record<string, unknown> = {
			messages,
			stream: true,
		};
		if (this.config.model) {
			body.model = this.config.model;
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...this.config.headers,
		};
		if (this.config.apiKey) {
			headers['Authorization'] = `Bearer ${this.config.apiKey}`;
		}

		const url = `${this.config.baseURL.replace(/\/$/, '')}/chat/completions`;

		// Set up timeout
		if (this.config.timeoutMs > 0) {
			this.timeoutHandle = setTimeout(() => {
				logger.warn('HttpAdapter: timeout reached, aborting');
				this.abortController?.abort();
			}, this.config.timeoutMs);
		}

		try {
			logger.debug('HttpAdapter: POST', url);
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: this.abortController.signal,
			});

			if (!response.ok) {
				const text = await response.text().catch(() => '');
				throw new HttpError(response.status, text || response.statusText);
			}

			// Read the streaming body
			const reader = response.body?.getReader();
			if (!reader) {
				// Non-streaming fallback: read entire body
				const text = await response.text();
				handlers.onChunk(text);
				handlers.onComplete(text);
				this.state = 'connected';
				return;
			}

			const decoder = new TextDecoder();
			let accumulated = '';
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// Parse SSE lines
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const content = parseSSEChunk(line);
					if (content !== null) {
						accumulated += content;
						handlers.onChunk(content);
					}
				}
			}

			// Process any remaining buffer
			if (buffer.trim()) {
				const content = parseSSEChunk(buffer);
				if (content !== null) {
					accumulated += content;
					handlers.onChunk(content);
				}
			}

			this.state = 'connected';
			handlers.onComplete(accumulated);
		} catch (err) {
			this.state = 'connected';
			if (this.abortController?.signal.aborted) {
				handlers.onError(new CancellationError());
			} else if (err instanceof HttpError || err instanceof ConnectionError) {
				handlers.onError(err);
			} else {
				handlers.onError(
					new ConnectionError(err instanceof Error ? err.message : String(err))
				);
			}
		} finally {
			this.clearTimeout();
			this.abortController = null;
		}
	}

	async cancel(): Promise<void> {
		logger.debug('HttpAdapter: cancel requested');
		this.clearTimeout();
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	getStatus(): AgentStatus {
		return { state: this.state };
	}

	// ── Helpers ────────────────────────────────────────────────────────

	private clearTimeout(): void {
		if (this.timeoutHandle !== null) {
			clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}
	}
}
