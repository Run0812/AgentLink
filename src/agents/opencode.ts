import { requestUrl } from 'obsidian';
import { execFile } from 'child_process';
import { AgentConfig } from '../settings';
import { AgentResponse, ConversationContext } from '../types';
import { BaseAgent } from './base';

/**
 * OpenCode agent.
 *
 * Supports two modes:
 *   - http: Calls a locally-running OpenCode server (default: http://localhost:3000)
 *   - cli:  Spawns the `opencode` CLI tool
 *
 * OpenCode: https://opencode.ai
 */
export class OpenCodeAgent extends BaseAgent {
	constructor(config: AgentConfig) {
		super('OpenCode', config);
	}

	async send(prompt: string, context: ConversationContext = { messages: [] }): Promise<AgentResponse> {
		const validationError = this.validate();
		if (validationError) {
			return { success: false, content: '', error: validationError };
		}

		if (this.config.mode === 'cli') {
			return this.sendViaCli(prompt, context);
		}
		return this.sendViaHttp(prompt, context);
	}

	private async sendViaHttp(prompt: string, context: ConversationContext): Promise<AgentResponse> {
		const messages = this.buildMessages(prompt, context);
		const endpoint = this.config.endpoint.replace(/\/$/, '');

		try {
			// OpenCode server uses an OpenAI-compatible chat completions API
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
			};
			if (this.config.apiKey) {
				headers['Authorization'] = `Bearer ${this.config.apiKey}`;
			}

			const body: Record<string, unknown> = { messages };
			if (this.config.model) {
				body['model'] = this.config.model;
			}

			const response = await requestUrl({
				url: `${endpoint}/chat/completions`,
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				throw: false,
			});

			if (response.status >= 400) {
				const bodyData = response.json as Record<string, unknown> | null;
				const errMsg = (bodyData?.error as Record<string, string> | undefined)?.message ?? `HTTP ${response.status}`;
				return { success: false, content: '', error: errMsg };
			}

			const data = response.json as {
				choices?: Array<{ message: { content: string } }>;
				response?: string;
				content?: string;
			};

			// Support multiple response formats
			const content =
				data?.choices?.[0]?.message?.content ??
				data?.response ??
				data?.content ??
				'';
			return { success: true, content };
		} catch (err: unknown) {
			return { success: false, content: '', error: String(err) };
		}
	}

	private sendViaCli(prompt: string, context: ConversationContext): Promise<AgentResponse> {
		const fullPrompt = this.buildPromptString(prompt, context);
		const binary = this.config.binaryPath || 'opencode';
		const extraArgs = this.config.extraArgs
			? this.config.extraArgs.trim().split(/\s+/).filter(Boolean)
			: [];

		return new Promise((resolve) => {
			// Use execFile (not exec) so the prompt is passed directly without shell parsing.
			execFile(
				binary,
				[...extraArgs, 'run', '--print', fullPrompt],
				{ timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
				(error, stdout, stderr) => {
					if (error) {
						resolve({ success: false, content: '', error: stderr || error.message });
						return;
					}
					resolve({ success: true, content: stdout.trim() });
				}
			);
		});
	}
}
