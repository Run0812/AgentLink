import { requestUrl } from 'obsidian';
import { execFile } from 'child_process';
import { AgentConfig } from '../settings';
import { AgentResponse, ConversationContext } from '../types';
import { BaseAgent } from './base';

/**
 * Kimi Code agent (Moonshot AI).
 *
 * Supports two modes:
 *   - http: Calls the Moonshot AI API at https://api.moonshot.cn/v1
 *   - cli:  Spawns the `kimi` CLI tool
 *
 * Get an API key at: https://platform.moonshot.cn/console/api-keys
 */
export class KimiAgent extends BaseAgent {
	constructor(config: AgentConfig) {
		super('Kimi Code', config);
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
			const response = await requestUrl({
				url: `${endpoint}/chat/completions`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.config.apiKey}`,
				},
				body: JSON.stringify({
					model: this.config.model || 'moonshot-v1-8k',
					messages,
				}),
				throw: false,
			});

			if (response.status >= 400) {
				const body = response.json as Record<string, unknown> | null;
				const errMsg = (body?.error as Record<string, string> | undefined)?.message ?? `HTTP ${response.status}`;
				return { success: false, content: '', error: errMsg };
			}

			const data = response.json as {
				choices: Array<{ message: { content: string } }>;
			};
			const content = data?.choices?.[0]?.message?.content ?? '';
			return { success: true, content };
		} catch (err: unknown) {
			return { success: false, content: '', error: String(err) };
		}
	}

	private sendViaCli(prompt: string, context: ConversationContext): Promise<AgentResponse> {
		const fullPrompt = this.buildPromptString(prompt, context);
		const binary = this.config.binaryPath || 'kimi';
		const extraArgs = this.config.extraArgs
			? this.config.extraArgs.trim().split(/\s+/).filter(Boolean)
			: [];

		return new Promise((resolve) => {
			// Use execFile (not exec) so the prompt is passed directly without shell parsing.
			execFile(
				binary,
				[...extraArgs, fullPrompt],
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
